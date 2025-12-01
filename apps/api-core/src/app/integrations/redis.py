"""Redis client integration for caching."""

import json

import redis

from app.config import settings
from app.helpers.logger import logger


class RedisClient:
    """Redis client for caching operations."""

    def __init__(self, redis_url: str | None = None):
        """Initialize Redis client.

        Parameters
        ----------
        redis_url : str | None
            Redis connection URL (defaults to settings)
        """
        url = redis_url or "redis://localhost:6379/0"
        try:
            self.client = redis.from_url(url, decode_responses=True)
            self.client.ping()
            logger.info(f"Redis connected: {url}")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Caching disabled.")
            self.client = None

    def get_data(self, key: str) -> dict | None:
        """Get data from Redis cache.

        Parameters
        ----------
        key : str
            Cache key

        Returns
        -------
        dict | None
            Cached data or None if not found
        """
        if not self.client:
            return None

        try:
            data = self.client.get(key)
            return json.loads(data) if data else None
        except Exception as e:
            logger.warning(f"Redis GET error for key '{key}': {e}")
            return None

    def set_data(self, key: str, value: str | dict, expire_sec: int = 900):
        """Set data in Redis cache.

        Parameters
        ----------
        key : str
            Cache key
        value : str | dict
            Data to cache (dict will be JSON-encoded)
        expire_sec : int
            Expiration time in seconds (default 15 minutes)

        Returns
        -------
        bool
            True if successful
        """
        if not self.client:
            return False

        try:
            data = value if isinstance(value, str) else json.dumps(value)
            self.client.setex(key, expire_sec, data)
            return True
        except Exception as e:
            logger.warning(f"Redis SET error for key '{key}': {e}")
            return False

    def delete_data(self, key: str):
        """Delete data from Redis cache.

        Parameters
        ----------
        key : str
            Cache key

        Returns
        -------
        bool
            True if deleted
        """
        if not self.client:
            return False

        try:
            self.client.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Redis DELETE error for key '{key}': {e}")
            return False

    def delete_pattern(self, pattern: str):
        """Delete all keys matching pattern.

        Parameters
        ----------
        pattern : str
            Key pattern (e.g., "model:*")

        Returns
        -------
        int
            Number of keys deleted
        """
        if not self.client:
            return 0

        try:
            keys = self.client.keys(pattern)
            if keys:
                return self.client.delete(*keys)
            return 0
        except Exception as e:
            logger.warning(f"Redis DELETE_PATTERN error for pattern '{pattern}': {e}")
            return 0
