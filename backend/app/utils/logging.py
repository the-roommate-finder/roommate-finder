from __future__ import annotations

import logging
import sys
from typing import Any

import structlog
from structlog.types import EventDict, Processor

from app.core.config import settings

# Fields that must NEVER appear in logs
_SENSITIVE_FIELDS: frozenset[str] = frozenset(
    {
        "password",
        "hashed_password",
        "otp",
        "token",
        "access_token",
        "refresh_token",
        "secret_key",
        "api_key",
        "credential",
        "authorization",
    }
)


def _strip_sensitive(
    logger: Any, method: str, event_dict: EventDict
) -> EventDict:
    """Remove any sensitive keys from the log event dict."""
    for key in list(event_dict.keys()):
        if key.lower() in _SENSITIVE_FIELDS:
            event_dict[key] = "[REDACTED]"
    return event_dict


def _add_severity(
    logger: Any, method: str, event_dict: EventDict
) -> EventDict:
    """Map structlog level names to severity for GCP / Datadog."""
    level = method.upper()
    event_dict["severity"] = level
    return event_dict


def configure_logging() -> None:
    """
    Call once on application startup.
    Configures both structlog and the standard library logging bridge.
    """
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        _strip_sensitive,
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_production:
        # JSON output for log aggregators
        renderer: Processor = structlog.processors.JSONRenderer()
        shared_processors.append(_add_severity)
    else:
        # Human-readable colored output for local development
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if settings.is_development else logging.INFO
        ),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(
        logging.DEBUG if settings.is_development else logging.INFO
    )

    # Quiet noisy libraries in production
    for lib in ("uvicorn.access", "sqlalchemy.engine", "boto3", "botocore"):
        logging.getLogger(lib).setLevel(
            logging.WARNING if settings.is_production else logging.INFO
        )
