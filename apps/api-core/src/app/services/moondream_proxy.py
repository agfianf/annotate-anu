"""Service for proxying requests to Moondream API."""

import base64
import time
from typing import Literal

import httpx

from app.helpers.logger import logger

MOONDREAM_CLOUD_URL = "https://api.moondream.ai/v1"
DEFAULT_TIMEOUT = 120.0  # 2 minutes


class MoondreamDetectResult:
    """Detection result from Moondream."""

    def __init__(self, objects: list[dict]):
        self.objects = objects

    def to_dict(self) -> dict:
        return {"objects": self.objects}


class MoondreamSegmentResult:
    """Segmentation result from Moondream."""

    def __init__(self, path: str, bbox: dict):
        self.path = path
        self.bbox = bbox

    def to_dict(self) -> dict:
        return {"path": self.path, "bbox": self.bbox}


class MoondreamPointResult:
    """Point detection result from Moondream."""

    def __init__(self, points: list[dict]):
        self.points = points

    def to_dict(self) -> dict:
        return {"points": self.points}


class MoondreamQueryResult:
    """Query result from Moondream."""

    def __init__(self, answer: str):
        self.answer = answer

    def to_dict(self) -> dict:
        return {"answer": self.answer}


class MoondreamCaptionResult:
    """Caption result from Moondream."""

    def __init__(self, caption: str):
        self.caption = caption

    def to_dict(self) -> dict:
        return {"caption": self.caption}


class MoondreamProxyService:
    """Proxy requests to Moondream Cloud or self-hosted instances.

    This service handles all Moondream API calls including:
    - detect: Zero-shot object detection
    - segment: Object segmentation (SVG path)
    - query: Visual question answering
    - caption: Image captioning
    - point: Object center point detection
    """

    def __init__(self, timeout: float = DEFAULT_TIMEOUT):
        """Initialize with timeout.

        Parameters
        ----------
        timeout : float
            Request timeout in seconds
        """
        self.timeout = timeout

    async def _request(
        self,
        endpoint: str,
        base_url: str,
        api_key: str | None,
        body: dict,
    ) -> dict:
        """Make a request to Moondream API.

        Parameters
        ----------
        endpoint : str
            API endpoint (e.g., '/detect')
        base_url : str
            Base URL for the API
        api_key : str | None
            API key for authentication
        body : dict
            Request body

        Returns
        -------
        dict
            API response data
        """
        url = f"{base_url.rstrip('/')}{endpoint}"

        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["X-Moondream-Auth"] = api_key

        logger.info(f"Proxying request to Moondream: {url}")
        start_time = time.time()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()

        elapsed_ms = (time.time() - start_time) * 1000
        logger.info(f"Moondream request completed in {elapsed_ms:.0f}ms")

        return response.json()

    def _image_to_data_uri(
        self, image_bytes: bytes, content_type: str = "image/jpeg"
    ) -> str:
        """Convert image bytes to base64 data URI.

        Parameters
        ----------
        image_bytes : bytes
            Raw image bytes
        content_type : str
            MIME type of the image

        Returns
        -------
        str
            Base64 data URI
        """
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        return f"data:{content_type};base64,{b64}"

    async def detect(
        self,
        image_bytes: bytes,
        image_content_type: str,
        object_name: str,
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> MoondreamDetectResult:
        """Detect objects in an image.

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_content_type : str
            MIME type of the image
        object_name : str
            Name of the object to detect (e.g., 'person', 'car')
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        MoondreamDetectResult
            Detection result with bounding boxes
        """
        image_data_uri = self._image_to_data_uri(image_bytes, image_content_type)

        result = await self._request(
            "/detect",
            base_url,
            api_key,
            {"image_url": image_data_uri, "object": object_name},
        )

        return MoondreamDetectResult(objects=result.get("objects", []))

    async def segment(
        self,
        image_bytes: bytes,
        image_content_type: str,
        object_name: str,
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> MoondreamSegmentResult:
        """Segment an object in an image.

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_content_type : str
            MIME type of the image
        object_name : str
            Name of the object to segment
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        MoondreamSegmentResult
            Segmentation result with SVG path
        """
        image_data_uri = self._image_to_data_uri(image_bytes, image_content_type)

        result = await self._request(
            "/segment",
            base_url,
            api_key,
            {"image_url": image_data_uri, "object": object_name},
        )

        return MoondreamSegmentResult(
            path=result.get("path", ""),
            bbox=result.get("bbox", {}),
        )

    async def query(
        self,
        image_bytes: bytes,
        image_content_type: str,
        question: str,
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> MoondreamQueryResult:
        """Query the image with a question (VQA).

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_content_type : str
            MIME type of the image
        question : str
            Question to ask about the image
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        MoondreamQueryResult
            Query result with answer
        """
        image_data_uri = self._image_to_data_uri(image_bytes, image_content_type)

        result = await self._request(
            "/query",
            base_url,
            api_key,
            {"image_url": image_data_uri, "question": question},
        )

        return MoondreamQueryResult(answer=result.get("answer", ""))

    async def caption(
        self,
        image_bytes: bytes,
        image_content_type: str,
        length: Literal["short", "long"] = "short",
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> MoondreamCaptionResult:
        """Generate a caption for the image.

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_content_type : str
            MIME type of the image
        length : str
            Caption length ('short' or 'long')
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        MoondreamCaptionResult
            Caption result
        """
        image_data_uri = self._image_to_data_uri(image_bytes, image_content_type)

        result = await self._request(
            "/caption",
            base_url,
            api_key,
            {"image_url": image_data_uri, "length": length},
        )

        return MoondreamCaptionResult(caption=result.get("caption", ""))

    async def point(
        self,
        image_bytes: bytes,
        image_content_type: str,
        object_name: str,
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> MoondreamPointResult:
        """Get center points for objects in an image.

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_content_type : str
            MIME type of the image
        object_name : str
            Name of the object to locate
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        MoondreamPointResult
            Point result with coordinates
        """
        image_data_uri = self._image_to_data_uri(image_bytes, image_content_type)

        result = await self._request(
            "/point",
            base_url,
            api_key,
            {"image_url": image_data_uri, "object": object_name},
        )

        return MoondreamPointResult(points=result.get("points", []))

    async def auto_tag(
        self,
        image_bytes: bytes,
        image_content_type: str,
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> list[str]:
        """Auto-tag an image by extracting objects and features.

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_content_type : str
            MIME type of the image
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        list[str]
            List of tags
        """
        result = await self.query(
            image_bytes,
            image_content_type,
            "List all visible objects, features, and characteristics of this image. "
            "Return the result as a JSON array of strings.",
            base_url,
            api_key,
        )

        import json

        try:
            parsed = json.loads(result.answer)
            if isinstance(parsed, list):
                return [str(item) for item in parsed]
            return result.answer.split(",")
        except json.JSONDecodeError:
            # Fallback: split by common delimiters
            cleaned = result.answer.replace("[", "").replace("]", "").replace('"', "").replace("'", "")
            return [s.strip() for s in cleaned.split(",") if s.strip()]

    async def ocr(
        self,
        image_bytes: bytes,
        image_content_type: str,
        mode: Literal["all", "reading", "table"] = "all",
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> str:
        """Extract text from an image (OCR).

        Parameters
        ----------
        image_bytes : bytes
            Image file bytes
        image_content_type : str
            MIME type of the image
        mode : str
            OCR mode: 'all', 'reading' (natural reading order), 'table'
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        str
            Extracted text
        """
        prompts = {
            "all": "Transcribe all text visible in this image.",
            "reading": "Transcribe the text in natural reading order.",
            "table": "Transcribe the table content, preserving structure.",
        }

        result = await self.query(
            image_bytes,
            image_content_type,
            prompts[mode],
            base_url,
            api_key,
        )

        return result.answer

    async def test_connection(
        self,
        base_url: str = MOONDREAM_CLOUD_URL,
        api_key: str | None = None,
    ) -> dict:
        """Test connection to Moondream API.

        Parameters
        ----------
        base_url : str
            Moondream API base URL
        api_key : str | None
            API key for authentication

        Returns
        -------
        dict
            Connection status with success, message, and latency
        """
        start_time = time.time()

        # Create a tiny test image (1x1 transparent PNG)
        test_image_base64 = (
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAA"
            "DUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )

        try:
            url = f"{base_url.rstrip('/')}/query"
            headers = {"Content-Type": "application/json"}
            if api_key:
                headers["X-Moondream-Auth"] = api_key

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    json={"image_url": test_image_base64, "question": "What do you see?"},
                    headers=headers,
                )

            latency_ms = (time.time() - start_time) * 1000

            if response.status_code == 200:
                return {
                    "success": True,
                    "message": "Connection successful",
                    "model_info": "moondream-2b",
                    "latency_ms": latency_ms,
                }

            return {
                "success": False,
                "message": f"API error ({response.status_code}): {response.text}",
                "latency_ms": latency_ms,
            }

        except Exception as e:
            return {
                "success": False,
                "message": str(e),
                "latency_ms": (time.time() - start_time) * 1000,
            }
