from __future__ import annotations

from typing import Literal, TypedDict

TaskType = Literal["style", "edit", "structure", "logic", "citation", "template", "chat"]


class AgentState(TypedDict, total=False):
    session_id: str
    query: str
    task: TaskType
    latex: str
    selection: str
    section: str
    parsed_sections: list[dict]
    citation_keys: list[str]
    bib_content: str

    original_text: str
    suggestion: str
    diff: str
    integrity_flags: list[dict]
    citation_results: list[dict]
    structure_suggestions: list[dict]
    logic_audit_report: dict

    llm_provider: str
    llm_model: str

    analysis: str
    response: str
    error: str
    apply_mode: str
    metadata: dict
    integrity_strictness: str
    active_file: str
    main_file: str
    main_latex: str
    selection_start: int
    selection_end: int
    conversation_history: list
