"""Shared fakes for peer-review pipeline tests (no real LLM calls)."""

from __future__ import annotations

import json
import re
from collections.abc import Callable

from langchain_core.messages import AIMessage

_IDS_RE = re.compile(r"each of these ids: (.+?)\. Write")


def draft_ids(messages: list) -> list[str]:
    """Item ids requested in a drafting call (parsed from the rendered user prompt)."""
    match = _IDS_RE.search(str(messages[1].content))
    return [part.strip() for part in match.group(1).split(",")] if match else []


def auto_draft(messages: list) -> str:
    """Valid drafting reply covering every requested id."""
    return json.dumps(
        {
            "responses": [
                {
                    "id": item_id,
                    "response": f"We thank the reviewer for comment {item_id} and have clarified the Methods section.",
                    "proposed_change": "Clarify the sampling procedure in the Methods section.",
                    "section_refs": ["Methods"],
                }
                for item_id in draft_ids(messages)
            ]
        }
    )


class FakeReviewLLM:
    """Stage-aware fake chat model: STAGE 1 → queued split replies, STAGE 2 → draft replies/handler."""

    def __init__(
        self,
        *,
        split_replies: list[str] | None = None,
        draft_replies: list[str] | None = None,
        draft_handler: Callable[[list], str] | None = None,
        model_name: str = "fake-review-model",
    ) -> None:
        self.split_replies = list(split_replies or [])
        self.draft_replies = list(draft_replies or [])
        self.draft_handler = draft_handler
        self.model_name = model_name
        self.calls: list[list] = []

    @property
    def split_calls(self) -> list[list]:
        return [m for m in self.calls if "STAGE 1" in str(m[0].content)]

    @property
    def draft_calls(self) -> list[list]:
        return [m for m in self.calls if "STAGE 2" in str(m[0].content)]

    async def ainvoke(self, messages: list) -> AIMessage:
        self.calls.append(list(messages))
        if "STAGE 1" in str(messages[0].content):
            reply = self.split_replies.pop(0) if self.split_replies else "{}"
        elif self.draft_replies:
            reply = self.draft_replies.pop(0)
        elif self.draft_handler is not None:
            reply = self.draft_handler(messages)
        else:
            reply = auto_draft(messages)
        return AIMessage(content=reply)


def install_fake_llm(monkeypatch, llm: FakeReviewLLM) -> FakeReviewLLM:
    monkeypatch.setattr("src.services.peer_review.pipeline.get_llm", lambda **_kwargs: llm)
    return llm


def split_reply(items: list[dict]) -> str:
    return json.dumps({"items": items})
