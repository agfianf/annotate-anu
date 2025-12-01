"""Health check service for external models."""

import time
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.helpers.logger import logger
from app.schemas.models.response import ExternalHealthResponse


class HealthChecker:
    """Service for checking health of external models."""

    def __init__(self):
        """Initialize health checker."""
        self.timeout = settings.HEALTH_CHECK_TIMEOUT

    async def check_health(
        self,
        endpoint_url: str,
        auth_token: str | None = None
    ) -> tuple[bool, str, float | None]:
        """Check health of external model endpoint.

        Parameters
        ----------
        endpoint_url : str
            Base URL of the model
        auth_token : str | None
            Bearer token for authentication

        Returns
        -------
        tuple[bool, str, float | None]
            (is_healthy, status_message, response_time_ms)
        """
        health_url = f"{endpoint_url.rstrip('/')}/health"
        headers = {}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        start_time = time.time()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(health_url, headers=headers)
                response_time_ms = (time.time() - start_time) * 1000

                if response.status_code == 200:
                    try:
                        data = response.json()
                        health_response = ExternalHealthResponse(**data)
                        status_msg = f"Healthy: {health_response.status}"
                        return True, status_msg, response_time_ms
                    except Exception as e:
                        logger.warning(f"Invalid health response format: {e}")
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
        self,
        endpoint_url: str,
        auth_token: str | None = None
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
            async with httpx.AsyncClient(timeout=self.timeout) as client:
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
