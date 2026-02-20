"""Simple logging configuration."""

import logging
import sys

from app.config import settings


def configure_logger() -> logging.Logger:
    """Configure and return standard logger.

    Returns
    -------
    logging.Logger
        Configured logger instance
    """
    # Configure logging
    logging.basicConfig(
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.LOG_LEVEL.upper()),
    )

    return logging.getLogger("sam3-api")


logger = configure_logger()
