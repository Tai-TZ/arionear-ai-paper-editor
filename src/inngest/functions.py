from __future__ import annotations

import inngest

from src.inngest.client import inngest_client


@inngest_client.create_function(
    fn_id="chat_stage_trace",
    trigger=inngest.TriggerEvent(event="ario/chat.stage"),
)
async def chat_stage_trace(ctx: inngest.Context) -> dict:
    data = ctx.event.data or {}
    ctx.logger.info(
        "chat stage=%s total_ms=%s stage_ms=%s task=%s provider=%s model=%s",
        data.get("stage"),
        data.get("total_ms"),
        data.get("stage_ms"),
        data.get("task"),
        data.get("provider"),
        data.get("model"),
    )
    return {"logged": True, "stage": data.get("stage")}


@inngest_client.create_function(
    fn_id="chat_run_completed",
    trigger=inngest.TriggerEvent(event="ario/chat.completed"),
)
async def chat_run_completed(ctx: inngest.Context) -> dict:
    data = ctx.event.data or {}
    ctx.logger.info(
        "chat completed run_id=%s total_ms=%s task=%s success=%s",
        data.get("run_id"),
        data.get("total_ms"),
        data.get("task"),
        data.get("success"),
    )
    return {"logged": True}


@inngest_client.create_function(
    fn_id="chat_run_failed",
    trigger=inngest.TriggerEvent(event="ario/chat.failed"),
)
async def chat_run_failed(ctx: inngest.Context) -> dict:
    data = ctx.event.data or {}
    ctx.logger.warning(
        "chat failed run_id=%s total_ms=%s error=%s",
        data.get("run_id"),
        data.get("total_ms"),
        data.get("error"),
    )
    return {"logged": True}


INNGEST_FUNCTIONS = [
    chat_stage_trace,
    chat_run_completed,
    chat_run_failed,
]
