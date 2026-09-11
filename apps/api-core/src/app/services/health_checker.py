"""Health check service for external models."""

import time

import httpx

from app.config import settings
from app.helpers.logger import logger
from app.schemas.models.response import ExternalHealthResponse


class HealthChecker:
    """Service for checking health of external models."""

    def __init__(self):
        """Initialize health checker."""
        self.timeout = settings.HEALTH_CHECK_TIMEOUT
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

    async def check_health(
        self,
        endpoint_url: str,
        auth_token: str | None = None,
        health_path: str = "/health",
    ) -> tuple[bool, str, float | None]:
        """Check health of external model endpoint.

        Parameters
        ----------
        endpoint_url : str
            Base URL of the model
        auth_token : str | None
            Bearer token for authentication
        health_path : str
            Path to the health check endpoint (default: "/health")

        Returns
        -------
        tuple[bool, str, float | None]
            (is_healthy, status_message, response_time_ms)
        """
        # Internal URLs are always healthy (mock classifiers, etc.)
        if endpoint_url.startswith("internal://"):
            return True, "Internal model (always healthy)", 0.0

        health_url = f"{endpoint_url.rstrip('/')}{health_path}"
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        start_time = time.time()

        try:
            client = self._get_client()
            response = await client.get(health_url, headers=headers)
            response_time_ms = (time.time() - start_time) * 1000

            if response.status_code == 200:
                try:
                    data = response.json()
                    # Try standard format first: {"status": "healthy", ...}
                    health_response = ExternalHealthResponse(**data)
                    status_msg = f"Healthy: {health_response.status}"
                    return True, status_msg, response_time_ms
                except Exception:
                    # Accept alternative formats like {"success": true}
                    try:
                        data = response.json()
                        if isinstance(data, dict) and data.get("success"):
                            return True, "Healthy (success=true)", response_time_ms
                    except Exception:
                        pass
                    return True, "Healthy (non-standard response)", response_time_ms
            else:
                return False, f"HTTP {response.status_code}", response_time_ms

        except httpx.TimeoutException:
            return False, f"Timeout after {self.timeout}s", None
        except httpx.NetworkError as e:
            return False, f"Network error: {str(e)}", None
        except Exception as e:
            return False, f"Error: {str(e)}", None

    async def fetch_capabilities(
        self, endpoint_url: str, auth_token: str | None = None
    ) -> dict | None:
        """Fetch capabilities from external model.

        Parameters
        ----------
        endpoint_url : str
            Base URL of the model
        auth_token : str | None
            Bearer token for authentication

        Returns
        -------
        dict | None
            Capabilities dict or None if failed
        """
        capabilities_url = f"{endpoint_url.rstrip('/')}/capabilities"
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        try:
            client = self._get_client()
            response = await client.get(capabilities_url, headers=headers)

            if response.status_code == 200:
                data = response.json()
                # Extract capabilities from response
                if "capabilities" in data:
                    return data["capabilities"]
                return data
            else:
                logger.warning(f"Failed to fetch capabilities: HTTP {response.status_code}")
                return None

        except Exception as e:
            logger.warning(f"Error fetching capabilities: {e}")
            return None
