import pytest

from src.services.logic_audit.config import (
    compute_logic_audit_timeout_sec,
    logic_audit_engine_label,
    logic_audit_runtime_flags,
    resolve_logic_audit_llm,
    select_logic_targets,
    split_section_text,
)


def test_logic_audit_runtime_flags_quick_full_throttles():
    flags = logic_audit_runtime_flags("quick", "google", scope="full")
    assert flags["section_concurrency"] == 1
    assert flags["section_cooldown_sec"] >= 0


def test_logic_audit_runtime_flags_quick_selected_parallel():
    flags = logic_audit_runtime_flags("quick", "google", scope="selected")
    assert flags["section_concurrency"] == 2
    assert flags["section_cooldown_sec"] == 0


def test_resolve_logic_audit_quick_prefers_google(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("ZAI_API_KEY", "zai-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-test")
    provider, model = resolve_logic_audit_llm("quick", "openrouter")
    assert provider == "google"
    assert model == "gemini-2.5-flash"


def test_resolve_logic_audit_deep_uses_gemini_quality(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("ZAI_API_KEY", "zai-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-test")
    provider, model = resolve_logic_audit_llm("deep", "openrouter")
    assert provider == "google"
    assert model == "gemini-3.5-flash"


def test_resolve_logic_audit_quick_full_uses_gemini_quality(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("ZAI_API_KEY", "zai-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "google-test")
    provider, model = resolve_logic_audit_llm("quick", "openrouter", scope="full")
    assert provider == "google"
    assert model == "gemini-3.5-flash"
    assert logic_audit_engine_label("quick", scope="full") == "Gemini 3.5 Flash"


def test_logic_audit_engine_label(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("GOOGLE_API_KEY", "google-test")
    assert logic_audit_engine_label("quick") == "Gemini 2.5 Flash"
    assert logic_audit_engine_label("deep") == "Gemini 3.5 Flash"


def test_persona_timeout_reads_settings(monkeypatch):
    from src.config import get_settings
    from src.services.logic_audit.debate import _persona_timeout_sec

    get_settings.cache_clear()
    monkeypatch.setenv("LOGIC_AUDIT_PERSONA_TIMEOUT_SEC", "120")
    assert _persona_timeout_sec("gemini-2.5-flash") == 120.0


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


def test_compute_logic_audit_timeout_gate_mode(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    timeout = compute_logic_audit_timeout_sec("gate", "selected", 5)
    assert timeout == 140.0


def test_compute_logic_audit_timeout_quick_selected(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    timeout = compute_logic_audit_timeout_sec("quick", "selected", 3)
    assert timeout >= 240.0


def test_compute_logic_audit_timeout_deep_full(monkeypatch):
    from src.config import get_settings

    # A platform without the 300s cap: the deep/full floor and the configured max apply.
    monkeypatch.setenv("PLATFORM_REQUEST_TIMEOUT_SEC", "3600")
    get_settings.cache_clear()
    try:
        timeout = compute_logic_audit_timeout_sec("deep", "full", 8, run_cross_section=True)
    finally:
        get_settings.cache_clear()
    assert timeout >= 600.0
    assert timeout <= 900.0


@pytest.mark.parametrize(
    ("mode", "scope", "sections"),
    [("deep", "full", 8), ("deep", "selected", 2), ("quick", "full", 6), ("quick", "selected", 3)],
)
def test_compute_logic_audit_timeout_stays_under_platform_timeout(monkeypatch, mode, scope, sections):
    from src.config import get_settings

    monkeypatch.delenv("PLATFORM_REQUEST_TIMEOUT_SEC", raising=False)
    get_settings.cache_clear()
    try:
        timeout = compute_logic_audit_timeout_sec(mode, scope, sections, run_cross_section=scope == "full")
    finally:
        get_settings.cache_clear()
    assert timeout == 285.0  # Cloud Run's 300s minus 15s headroom for the partial result


def test_compute_logic_audit_timeout_follows_platform_setting(monkeypatch):
    from src.config import get_settings

    monkeypatch.setenv("PLATFORM_REQUEST_TIMEOUT_SEC", "120")
    get_settings.cache_clear()
    try:
        assert compute_logic_audit_timeout_sec("gate", "selected", 5) == 105.0
        assert compute_logic_audit_timeout_sec("quick", "selected", 1) == 105.0
    finally:
        get_settings.cache_clear()


def test_split_section_text_single_chunk():
    text = "a" * 1000
    assert split_section_text(text, 2000) == [text]


def test_split_section_text_multiple_chunks_with_overlap():
    text = "x" * 5000
    chunks = split_section_text(text, 2000, max_chunks=2)
    assert len(chunks) == 2
    assert all(len(chunk) <= 2000 for chunk in chunks)


def test_compute_logic_audit_timeout_with_chunked_targets(monkeypatch):
    from src.config import get_settings

    get_settings.cache_clear()
    huge = "x" * 12_000
    targets = [{"name": "Intro", "content": huge}]
    flat = compute_logic_audit_timeout_sec(
        "quick",
        "selected",
        1,
        targets=targets,
        section_char_limit=6000,
        section_concurrency=2,
    )
    naive = compute_logic_audit_timeout_sec("quick", "selected", 1)
    assert flat > naive
