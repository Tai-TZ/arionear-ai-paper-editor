from src.services.llm import OPENROUTER_NEMOTRON_MODEL
from src.services.logic_audit.config import (
    resolve_logic_audit_llm,
    select_logic_targets,
)


def test_resolve_logic_audit_quick_prefers_openrouter(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    provider, model = resolve_logic_audit_llm("quick", "openrouter")
    assert provider == "openrouter"
    assert model == "openai/gpt-4o-mini"


def test_resolve_logic_audit_deep_uses_nemotron(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    provider, model = resolve_logic_audit_llm("deep", "openrouter")
    assert provider == "openrouter"
    assert model == OPENROUTER_NEMOTRON_MODEL


def test_select_logic_targets_quick_defaults():
    sections = [
        {"name": "Abstract", "content": "We show X."},
        {"name": "Introduction", "content": "Background."},
        {"name": "Methods", "content": "Pipeline."},
        {"name": "Conclusion", "content": "We conclude."},
    ]
    picked = select_logic_targets(sections, mode="quick")
    names = [s["name"] for s in picked]
    assert "Abstract" in names
    assert "Introduction" in names
    assert "Conclusion" in names
    assert "Methods" not in names


def test_select_logic_targets_full_quick():
    sections = [{"name": f"S{i}", "content": f"body {i}"} for i in range(5)]
    picked = select_logic_targets(sections, mode="quick", scope="full")
    assert len(picked) == 5


def test_select_logic_targets_full_deep_caps():
    sections = [{"name": f"S{i}", "content": f"body {i}"} for i in range(12)]
    picked = select_logic_targets(sections, mode="deep", scope="full")
    assert len(picked) == 8


def test_select_logic_targets_deep_selected_one():
    sections = [
        {"name": "Abstract", "content": "A"},
        {"name": "Introduction", "content": "B"},
    ]
    picked = select_logic_targets(
        sections,
        mode="deep",
        scope="selected",
        section_filter=["Introduction"],
    )
    assert len(picked) == 1
    assert picked[0]["name"] == "Introduction"
