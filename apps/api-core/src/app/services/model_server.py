"""Service for proxying requests to the local model server.

The model server has no authentication of its own and is not published on the host,
so every browser-facing call reaches it through api-core over the compose network.
"""

from urllib.parse import quote

import httpx
from fastapi import HTTPException, UploadFile

from app.config import settings
from app.helpers.logger import logger

DEFAULT_TIMEOUT = 30.0
# An upload is hundreds of megabytes and the server loads the weights before replying
UPLOAD_TIMEOUT = 900.0
# Mirrors MAX_UPLOAD_MB on the model server, so an oversized body is refused here instead
# of being streamed across the network and rejected on arrival.
MAX_UPLOAD_BYTES = 500 * 1024 * 1024

# The upstream turns a name straight into a file path, so path separators and dot segments
# must never reach the proxied URL. Everything else is left alone on purpose: a name is
# just the uploaded filename minus ".pt", so it routinely carries spaces, parentheses and
# other characters, and the upstream's own model_path() is what confines it to MODELS_DIR.
_UNSAFE_NAME_CHARS = ("/", "\\", "\x00")


class ModelServerService:
    """Forward model-management calls to the model server.

    Only the endpoints the UI needs are exposed: health, listing, upload, info and
    delete. Inference stays a container-to-container call made through the BYOM
    registry, so it is deliberately absent here.
    """

    def __init__(self, base_url: str | None = None, timeout: float = DEFAULT_TIMEOUT):
        """Initialize with the model server URL.

        Parameters
        ----------
        base_url : str | None
            Model server base URL. Defaults to the configured MODEL_SERVER_URL.
        timeout : float
            Request timeout in seconds for everything but uploads
        """
        self.base_url = (base_url or settings.MODEL_SERVER_URL).rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Return the shared HTTP client, creating it on first use.

        One long-lived client keeps a connection pool across requests instead of paying
        a TCP (and TLS) handshake on every call.
        """
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=5.0),
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            )
        return self._client

    async def aclose(self) -> None:
        """Close the shared HTTP client and its pooled connections."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def validate_name(name: str) -> str:
        """Reject model names that would escape the upstream's model directory.

        Only path separators, dot segments and NUL are refused. A stricter character set
        would lock the owner out of any model whose uploaded filename contained a space or
        a parenthesis — the upload endpoint does not filter those, so listing would show a
        model that info and delete then answer 400 for.

        Parameters
        ----------
        name : str
            Model name from the request path

        Returns
        -------
        str
            The name, percent-encoded for use as a single URL path segment

        Raises
        ------
        HTTPException
            400 if the name is empty, a dot segment, or contains a path separator
        """
        if not name or name in (".", "..") or any(c in name for c in _UNSAFE_NAME_CHARS):
            raise HTTPException(status_code=400, detail="Invalid model name")
        return quote(name, safe="")

    async def health(self) -> dict:
        """Return the model server's health payload."""
        return await self._request("GET", "/health")

    async def list_models(self) -> dict:
        """List the .pt weights available on the model server."""
        return await self._request("GET", "/models")

    async def upload_model(self, file: UploadFile) -> dict:
        """Upload a .pt weight file to the model server.

        Parameters
        ----------
        file : UploadFile
            Weight file from the client request

        Returns
        -------
        dict
            Upload result: name, size, task, classes and endpoint path

        Raises
        ------
        HTTPException
            413 if the body is larger than the upstream would accept anyway
        """
        if file.size is not None and file.size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024}MB",
            )

        # Hand httpx the spooled file object rather than bytes so the weights are
        # streamed upstream instead of buffered a second time in this process.
        files = {
            "file": (
                file.filename,
                file.file,
                file.content_type or "application/octet-stream",
            )
        }
        return await self._request("POST", "/models/upload", timeout=UPLOAD_TIMEOUT, files=files)

    async def model_info(self, name: str) -> dict:
        """Return task and class names for one model."""
        return await self._request("GET", f"/models/{self.validate_name(name)}/info")

    async def delete_model(self, name: str) -> dict:
        """Delete one model's weights from the model server."""
        return await self._request("DELETE", f"/models/{self.validate_name(name)}")

    async def _request(
        self, method: str, path: str, timeout: float | None = None, **kwargs
    ) -> dict:
        """Send one request upstream and normalize its failures.

        Parameters
        ----------
        method : str
            HTTP method
        path : str
            Path on the model server, including the leading slash
        timeout : float | None
            Override for the default timeout
        **kwargs
            Extra arguments passed to httpx (files, params, ...)

        Returns
        -------
        dict
            Decoded JSON body

        Raises
        ------
        HTTPException
            502 if the model server is unreachable or answers with a non-JSON body,
            otherwise the upstream status code and detail
        """
        url = f"{self.base_url}{path}"
        try:
            client = self._get_client()
            response = await client.request(
                method, url, timeout=httpx.Timeout(timeout or self.timeout, connect=5.0), **kwargs
            )
        except httpx.HTTPError as exc:
            logger.error(f"Model server request failed ({method} {url}): {exc}")
            raise HTTPException(status_code=502, detail="Model server is not reachable") from exc

        if response.status_code >= 400:
            raise HTTPException(
                status_code=response.status_code, detail=self._error_detail(response)
            )

        try:
            return response.json()
        except ValueError as exc:
            logger.error(f"Model server returned a non-JSON body ({method} {url})")
            raise HTTPException(
                status_code=502, detail="Model server returned an invalid response"
            ) from exc

    @staticmethod
    def _error_detail(response: httpx.Response) -> str:
        """Pull FastAPI's `detail` out of an upstream error, falling back to the raw body."""
        try:
            body = response.json()
        except ValueError:
            return response.text or f"Model server error {response.status_code}"
        if isinstance(body, dict) and "detail" in body:
            return str(body["detail"])
        return f"Model server error {response.status_code}"
