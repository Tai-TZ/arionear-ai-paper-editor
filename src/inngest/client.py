from __future__ import annotations

import logging

import inngest

from src.config import get_settings

_settings = get_settings()

inngest_client = inngest.Inngest(
    app_id=_settings.inngest_app_id,
    logger=logging.getLogger("uvicorn"),
    is_production=not _settings.inngest_dev,
    event_key=_settings.inngest_event_key or None,
)
