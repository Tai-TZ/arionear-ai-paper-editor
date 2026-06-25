"""Tests for LaTeX compile service (Overleaf parity)."""

from __future__ import annotations

from src.models.schemas import CompileRequest
from src.services import latex_compile as lc


def test_detect_compiler_defaults_to_pdflatex():
    assert lc.detect_compiler(r"\documentclass{article}", "auto") == "pdflatex"


def test_detect_compiler_fontspec_prefers_xelatex(monkeypatch):
    monkeypatch.setattr(lc, "find_tex_engine", lambda name: "/usr/bin/xelatex" if name == "xelatex" else None)
    src = r"\documentclass{article}\usepackage{fontspec}"
    assert lc.detect_compiler(src, "auto") == "xelatex"


def test_uses_biblatex_detection():
    assert lc.uses_biblatex(r"\usepackage{biblatex}")
    assert not lc.uses_biblatex(r"\bibliography{refs}")


def test_extract_bib_files_ignores_commented_ieee_example():
    latex = r"""
\begin{document}
%\bibliography{IEEEabrv,../bib/paper}
\bibliography{references}
\end{document}
"""
    assert lc._extract_bib_files(latex) == ["references"]


def test_extract_bib_files_splits_comma_separated_names():
    latex = r"\bibliography{refs,extra}"
    assert lc._extract_bib_files(latex) == ["refs", "extra"]


def test_compile_status_shape():
    status = lc.compile_status()
    assert hasattr(status, "available")
    assert hasattr(status, "engines")


def test_safe_asset_path_rejects_traversal():
    assert lc._safe_asset_path("../etc/passwd") is None
    assert lc._safe_asset_path("figures/a.png") is not None


def test_figure_available_matches_extensionless_includegraphics(tmp_path):
    figures = tmp_path / "figures"
    figures.mkdir()
    (figures / "architecture.png").write_bytes(b"\x89PNG\r\n")

    assert lc._figure_available("figures/architecture", tmp_path) is True
    assert lc._figure_available("architecture", tmp_path) is True


def test_prepare_latex_source_keeps_graphicx_when_figure_exists(tmp_path):
    (tmp_path / "diagram.pdf").write_bytes(b"%PDF-1.4")
    latex = r"\usepackage{graphicx}\includegraphics{diagram}"
    prepared = lc._prepare_latex_source(latex, tmp_path, set())
    assert "[demo]{graphicx}" not in prepared


def test_prepare_latex_source_uses_demo_when_figure_missing(tmp_path):
    latex = r"\usepackage{graphicx}\includegraphics{missing-figure}"
    prepared = lc._prepare_latex_source(latex, tmp_path, set())
    assert "[demo]{graphicx}" in prepared


def test_force_apply_known_fallbacks():
    src = r"\documentclass{RevDigMatEduInt}"
    patched, warnings = lc._force_apply_known_fallbacks(src)
    assert "IEEEtran" in patched
    assert warnings


def test_compile_missing_engine(monkeypatch):
    monkeypatch.setattr(lc, "find_tex_engine", lambda _c: None)
    result = lc.compile_latex(CompileRequest(latex=r"\documentclass{article}\begin{document}hi\end{document}"))
    assert result.success is False
    assert "not found" in result.error.lower()


def test_synctex_inverse_when_available():
    if not lc.find_pdflatex() or not lc.find_synctex():
        return
    req = CompileRequest(
        latex="\\documentclass{article}\\begin{document}\nTarget line here\n\\end{document}",
        compiler="pdflatex",
    )
    result = lc.compile_latex(req)
    assert result.success and result.synctex_base64
    hit = lc.parse_synctex_inverse(result.synctex_base64, result.pdf_base64, 1, 200.0, 650.0, "main")
    assert hit is not None
    assert hit["line"] >= 1


def test_compile_minimal_document_when_pdflatex_available():
    if not lc.find_pdflatex():
        return
    req = CompileRequest(
        latex=r"\documentclass{article}\begin{document}Hello Arionear\end{document}",
        compiler="pdflatex",
    )
    result = lc.compile_latex(req)
    assert result.success is True
    assert result.pdf_base64
    assert result.compiler == "pdflatex"
