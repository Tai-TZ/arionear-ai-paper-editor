"""Tests for paper_gate_skim — lightweight pre-publication gate scan."""
import pytest

# ---------------------------------------------------------------------------
# _pick_gate_sections
# ---------------------------------------------------------------------------
from src.services.logic_audit.paper_gate_skim import (
    _extract_json,
    _normalise_section,
    _pick_gate_sections,
)


def _sec(name: str, content: str = "some content here") -> dict:
    return {"name": name, "content": content}


class TestPickGateSections:
    def test_picks_abstract_intro_conclusion(self):
        sections = [
            _sec("Abstract"),
            _sec("Introduction"),
            _sec("Methods"),
            _sec("Results"),
            _sec("Conclusion"),
        ]
        picked = _pick_gate_sections(sections)
        names = [s["name"] for s in picked]
        assert "Abstract" in names
        assert "Introduction" in names
        assert "Conclusion" in names
        assert len(picked) <= 3

    def test_respects_max_sections(self):
        sections = [_sec(f"Section {i}") for i in range(10)]
        picked = _pick_gate_sections(sections)
        assert len(picked) <= 3

    def test_falls_back_to_first_sections_when_no_key_names(self):
        sections = [_sec("Background"), _sec("Experiments"), _sec("Related Work")]
        picked = _pick_gate_sections(sections)
        assert len(picked) >= 1

    def test_skips_empty_sections(self):
        sections = [
            _sec("Abstract", ""),
            _sec("Introduction", "   "),
            _sec("Conclusion", "real content here"),
        ]
        picked = _pick_gate_sections(sections)
        names = [s["name"] for s in picked]
        assert "Abstract" not in names
        assert "Introduction" not in names
        assert "Conclusion" in names

    def test_case_insensitive_matching(self):
        sections = [_sec("ABSTRACT"), _sec("INTRODUCTION"), _sec("CONCLUSION")]
        picked = _pick_gate_sections(sections)
        assert len(picked) == 3

    def test_partial_key_match(self):
        """Discussion should match as a gate target."""
        sections = [_sec("Abstract"), _sec("Discussion")]
        picked = _pick_gate_sections(sections)
        names = [s["name"] for s in picked]
        assert "Abstract" in names
        assert "Discussion" in names


# ---------------------------------------------------------------------------
# _extract_json
# ---------------------------------------------------------------------------

class TestExtractJson:
    def test_parses_clean_json(self):
        raw = '{"summary": "ok", "sections": []}'
        result = _extract_json(raw)
        assert result is not None
        assert result["summary"] == "ok"

    def test_parses_json_with_markdown_fence(self):
        raw = "```json\n{\"summary\": \"ok\"}\n```"
        result = _extract_json(raw)
        assert result is not None

    def test_parses_json_embedded_in_prose(self):
        raw = 'Here is the result: {"summary": "test", "sections": []} end.'
        result = _extract_json(raw)
        assert result is not None
        assert result["summary"] == "test"

    def test_returns_none_on_invalid(self):
        assert _extract_json("not json at all") is None
        assert _extract_json("") is None
        assert _extract_json("[]") is None  # list, not dict

    def test_strips_thinking_markup(self):
        raw = "<think>internal thoughts</think>{\"summary\": \"clean\"}"
        result = _extract_json(raw)
        assert result is not None
        assert result["summary"] == "clean"


# ---------------------------------------------------------------------------
# _normalise_section
# ---------------------------------------------------------------------------

class TestNormaliseSection:
    def test_basic_structure(self):
        raw = {
            "section": "Abstract",
            "conflicts": [
                {
                    "id": "c1",
                    "type": "unsupported_claim",
                    "severity": "critical",
                    "comment": "Missing evidence.",
                    "suggested_action": "add_citation",
                    "persona_sources": ["gate_reviewer"],
                }
            ],
            "weak_claims": ["Vague claim here"],
        }
        result = _normalise_section(raw)
        assert result["section"] == "Abstract"
        assert len(result["conflicts"]) == 1
        assert result["conflicts"][0]["severity"] == "critical"
        assert len(result["weak_claims"]) == 1

    def test_caps_conflicts_at_4(self):
        conflicts = [
            {"id": f"c{i}", "comment": f"Issue {i}", "type": "unclear_reasoning"}
            for i in range(10)
        ]
        raw = {"section": "Results", "conflicts": conflicts}
        result = _normalise_section(raw)
        assert len(result["conflicts"]) <= 4

    def test_caps_weak_claims_at_3(self):
        raw = {
            "section": "Methods",
            "weak_claims": [f"Weak {i}" for i in range(10)],
        }
        result = _normalise_section(raw)
        assert len(result["weak_claims"]) <= 3

    def test_handles_missing_fields(self):
        result = _normalise_section({"section": "Intro"})
        assert result["conflicts"] == []
        assert result["weak_claims"] == []
        assert result["consensus_notes"] == []

    def test_truncates_long_comment(self):
        raw = {
            "section": "Discussion",
            "conflicts": [{"comment": "x" * 1000, "type": "unclear_reasoning"}],
        }
        result = _normalise_section(raw)
        assert len(result["conflicts"][0]["comment"]) <= 400

    def test_skips_non_dict_conflict_items(self):
        raw = {
            "section": "Abstract",
            "conflicts": ["not a dict", None, {"comment": "valid", "type": "unsupported_claim"}],
        }
        result = _normalise_section(raw)
        assert len(result["conflicts"]) == 1


# ---------------------------------------------------------------------------
# Integration: run_paper_gate_skim with mocked LLM
# ---------------------------------------------------------------------------

class TestRunPaperGateSkimIntegration:
    """Integration tests that mock the LLM call."""

    @pytest.mark.asyncio
    async def test_returns_gate_audit_mode_meta(self, monkeypatch):
        from src.services.logic_audit import paper_gate_skim

        class FakeLLM:
            async def ainvoke(self, messages):
                class Resp:
                    content = '{"summary": "Looks fine.", "sections": [{"section": "Abstract", "conflicts": [], "weak_claims": []}], "cross_section_conflicts": []}'
                return Resp()

        monkeypatch.setattr(paper_gate_skim, "get_llm", lambda **kw: FakeLLM())

        sections = [{"name": "Abstract", "content": "Machine learning paper abstract."}]
        result = await paper_gate_skim.run_paper_gate_skim(
            latex="\\begin{abstract}test\\end{abstract}",
            sections=sections,
        )
        report = result.get("logic_audit_report", {})
        assert report.get("meta", {}).get("audit_mode") == "gate"
        assert "sections" in report

    @pytest.mark.asyncio
    async def test_handles_unparseable_llm_output(self, monkeypatch):
        from src.services.logic_audit import paper_gate_skim

        class FakeLLM:
            async def ainvoke(self, messages):
                class Resp:
                    content = "Sorry, I cannot help with that."
                return Resp()

        monkeypatch.setattr(paper_gate_skim, "get_llm", lambda **kw: FakeLLM())

        sections = [{"name": "Abstract", "content": "Some content."}]
        result = await paper_gate_skim.run_paper_gate_skim(
            latex="\\begin{abstract}test\\end{abstract}",
            sections=sections,
        )
        report = result.get("logic_audit_report", {})
        # Should still return a valid report structure with gate meta
        assert report.get("meta", {}).get("audit_mode") == "gate"
        assert isinstance(report.get("sections"), list)

    @pytest.mark.asyncio
    async def test_passes_cross_section_conflicts(self, monkeypatch):
        from src.services.logic_audit import paper_gate_skim

        class FakeLLM:
            async def ainvoke(self, messages):
                class Resp:
                    content = """{
                        "summary": "Cross-section issue detected.",
                        "sections": [],
                        "cross_section_conflicts": [
                            {"type": "mismatch", "description": "Abstract claims differ from conclusion."}
                        ]
                    }"""
                return Resp()

        monkeypatch.setattr(paper_gate_skim, "get_llm", lambda **kw: FakeLLM())

        sections = [{"name": "Abstract", "content": "Content."}]
        result = await paper_gate_skim.run_paper_gate_skim(
            latex="\\begin{abstract}test\\end{abstract}",
            sections=sections,
        )
        report = result.get("logic_audit_report", {})
        cross = report.get("cross_section_conflicts", [])
        assert len(cross) == 1
        assert "differ" in cross[0]["description"]

    @pytest.mark.asyncio
    async def test_empty_sections_returns_no_content_report(self, monkeypatch):
        from src.services.logic_audit import paper_gate_skim

        monkeypatch.setattr(paper_gate_skim, "get_llm", lambda **kw: None)

        result = await paper_gate_skim.run_paper_gate_skim(
            latex="\\documentclass{article}",
            sections=[],  # No sections at all
        )
        report = result.get("logic_audit_report", {})
        assert report.get("meta", {}).get("audit_mode") == "gate"
        # Should not raise — graceful no-content path
