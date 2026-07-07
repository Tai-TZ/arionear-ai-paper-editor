from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Iterator
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult

from src.services.llm_auth_errors import (
    format_provider_test_failure,
    is_google_project_denied,
    is_provider_key_error_exc,
)
from src.services.provider_key_store import get_provider_api_keys


class FailoverChatModel(BaseChatModel):
    """Wraps provider LLM calls — retries with backup API keys on auth/quota errors."""

    provider: str
    model_name: str
    temperature: float
    thinking: bool | None = None

    def __init__(
        self,
        *,
        provider: str,
        model_name: str,
        temperature: float,
        build_llm: Callable[[str], BaseChatModel],
        thinking: bool | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(
            provider=provider,
            model_name=model_name,
            temperature=temperature,
            thinking=thinking,
            **kwargs,
        )
        self._build_llm = build_llm

    @property
    def _llm_type(self) -> str:
        return "failover-chat"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model_name": self.model_name,
            "temperature": self.temperature,
        }

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        keys = get_provider_api_keys(self.provider)
        if not keys:
            raise ValueError(f"No API key configured for provider '{self.provider}'.")
        last_exc: Exception | None = None
        for index, api_key in enumerate(keys):
            try:
                llm = self._build_llm(api_key)
                return llm._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
            except Exception as exc:
                if is_provider_key_error_exc(exc) and index < len(keys) - 1:
                    last_exc = exc
                    continue
                raise
        raise last_exc or ValueError(f"All API keys failed for provider '{self.provider}'.")

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        keys = get_provider_api_keys(self.provider)
        if not keys:
            raise ValueError(f"No API key configured for provider '{self.provider}'.")
        last_exc: Exception | None = None
        for index, api_key in enumerate(keys):
            try:
                llm = self._build_llm(api_key)
                return await llm._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
            except Exception as exc:
                if is_provider_key_error_exc(exc) and index < len(keys) - 1:
                    last_exc = exc
                    continue
                raise
        raise last_exc or ValueError(f"All API keys failed for provider '{self.provider}'.")

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        keys = get_provider_api_keys(self.provider)
        if not keys:
            raise ValueError(f"No API key configured for provider '{self.provider}'.")
        last_exc: Exception | None = None
        for index, api_key in enumerate(keys):
            try:
                llm = self._build_llm(api_key)
                yield from llm._stream(messages, stop=stop, run_manager=run_manager, **kwargs)
                return
            except Exception as exc:
                if is_provider_key_error_exc(exc) and index < len(keys) - 1:
                    last_exc = exc
                    continue
                raise
        raise last_exc or ValueError(f"All API keys failed for provider '{self.provider}'.")

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        keys = get_provider_api_keys(self.provider)
        if not keys:
            raise ValueError(f"No API key configured for provider '{self.provider}'.")
        last_exc: Exception | None = None
        for index, api_key in enumerate(keys):
            try:
                llm = self._build_llm(api_key)
                async for chunk in llm._astream(
                    messages, stop=stop, run_manager=run_manager, **kwargs
                ):
                    yield chunk
                return
            except Exception as exc:
                if is_provider_key_error_exc(exc) and index < len(keys) - 1:
                    last_exc = exc
                    continue
                raise
        raise last_exc or ValueError(f"All API keys failed for provider '{self.provider}'.")

    def bind_tools(self, *args: Any, **kwargs: Any) -> Any:
        keys = get_provider_api_keys(self.provider)
        if not keys:
            raise ValueError(f"No API key configured for provider '{self.provider}'.")
        return self._build_llm(keys[0]).bind_tools(*args, **kwargs)

    def with_structured_output(self, *args: Any, **kwargs: Any) -> Any:
        keys = get_provider_api_keys(self.provider)
        if not keys:
            raise ValueError(f"No API key configured for provider '{self.provider}'.")
        return self._build_llm(keys[0]).with_structured_output(*args, **kwargs)


async def test_provider_api_key(
    provider: str,
    api_key: str,
    *,
    model: str | None = None,
    temperature: float = 0.0,
) -> tuple[bool, str, int | None]:
    """Ping provider with a minimal prompt. Returns (ok, message, latency_ms)."""
    import time

    from langchain_core.messages import HumanMessage

    from src.services.llm import GOOGLE_CHAT_MODEL_CATALOG, _build_llm_with_key

    models_to_try: list[str | None] = [model]
    if provider == "google":
        catalog = [mid for mid, _ in GOOGLE_CHAT_MODEL_CATALOG]
        if model and model in catalog:
            models_to_try = [model] + [m for m in catalog if m != model]
        elif not model:
            models_to_try = catalog

    started = time.perf_counter()
    last_exc: Exception | None = None
    last_model: str | None = model

    for try_model in models_to_try:
        last_model = try_model
        try:
            llm = _build_llm_with_key(
                provider,  # type: ignore[arg-type]
                api_key,
                model=try_model,
                temperature=temperature,
                thinking=False,
            )
            response = await llm.ainvoke([HumanMessage(content="Reply with exactly: OK")])
            latency_ms = int((time.perf_counter() - started) * 1000)
            preview = str(getattr(response, "content", "") or "").strip()[:80]
            ok_msg = preview or "OK"
            if try_model and len(models_to_try) > 1 and try_model != model:
                ok_msg = f"{ok_msg} (model: {try_model})"
            return True, ok_msg, latency_ms
        except Exception as exc:
            last_exc = exc
            if provider == "google" and is_google_project_denied(str(exc)):
                break
            continue

    latency_ms = int((time.perf_counter() - started) * 1000)
    assert last_exc is not None
    return False, format_provider_test_failure(provider, last_model, last_exc), latency_ms
