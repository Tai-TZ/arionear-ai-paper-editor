"""Tests for LaTeX compile service (Overleaf parity)."""

from __future__ import annotations

import shutil

import pytest

from src.models.schemas import CompileRequest
from src.services import latex_compile as lc


@pytest.fixture(autouse=True)
def _clear_compile_workspaces():
    yield
    with lc._workspace_lock:
        for workspace in lc._workspaces.values():
            shutil.rmtree(workspace.path, ignore_errors=True)
        lc._workspaces.clear()
    with lc._pdf_cache_lock:
        lc._pdf_cache.clear()


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
    prepared, _warnings = lc._prepare_latex_source(latex, tmp_path, set())
    assert "[demo]{graphicx}" not in prepared


def test_prepare_latex_source_uses_demo_when_figure_missing(tmp_path):
    latex = r"\usepackage{graphicx}\includegraphics{missing-figure}"
    prepared, _warnings = lc._prepare_latex_source(latex, tmp_path, set())
    assert "[demo]{graphicx}" in prepared


def test_repair_latex_syntax_fixes_textbfface_and_stray_backslash():
    broken = (
        r"\documentclass{article}"
        r"\usepackage{algorithm2e}"
        r"\usepackage{algorithm,algorithmic}"
        r"\textbfface{broken heading}"
        r"\subsubsection{Foo}\\"
        r"{\textbf{Introduction}In Thailand"
    )
    fixed, warnings = lc._repair_latex_syntax(broken)
    assert r"\textbf" in fixed
    assert "textbfface" not in fixed.lower()
    assert r"\subsubsection{Foo}" in fixed
    assert r"\subsubsection{Foo}\\" not in fixed
    assert r"\section{Introduction}" in fixed
    assert "algorithm2e" not in fixed
    assert warnings


def test_repair_latex_syntax_simplifies_section_textbf():
    src = r"\section{\textbf{Conclusion}}"
    fixed, warnings = lc._repair_latex_syntax(src)
    assert fixed == src
    assert not warnings


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
    hit = lc.parse_synctex_inverse_disambiguated(result.synctex_base64, result.pdf_base64, 1, 200.0, 650.0, "main")
    assert hit is not None
    assert hit["line"] >= 1


def test_synctex_inverse_uses_cached_workspace():
    if not lc.find_pdflatex() or not lc.find_synctex():
        return
    cache_id = "test-synctex-cache"
    req = CompileRequest(
        latex="\\documentclass{article}\\begin{document}\nTarget line here\n\\end{document}",
        compiler="pdflatex",
        cache_id=cache_id,
    )
    result = lc.compile_latex(req)
    assert result.success and result.synctex_base64
    hit = lc.parse_synctex_inverse_disambiguated(
        "",
        "",
        1,
        200.0,
        650.0,
        "main",
        cache_id=cache_id,
    )
    assert hit is not None
    assert hit["line"] >= 1


def test_max_direct_passes_simple_article():
    latex = r"\documentclass{article}\begin{document}Hello\end{document}"
    assert lc._max_direct_passes(latex) == 1


def test_max_direct_passes_with_references():
    latex = r"\documentclass{article}\begin{document}\label{sec:a}See \ref{sec:a}\end{document}"
    assert lc._max_direct_passes(latex) == 2


def test_max_direct_passes_with_bibliography():
    latex = r"\documentclass{article}\begin{document}\cite{smith}\bibliography{refs}\end{document}"
    assert lc._max_direct_passes(latex) == 0


def test_assets_fingerprint_changes_with_asset_content():
    from src.models.schemas import CompileAssetFile

    a = [CompileAssetFile(name="a.tex", content_base64="ZGE=")]
    b = [CompileAssetFile(name="a.tex", content_base64="ZGI=")]
    assert lc._assets_fingerprint(a) != lc._assets_fingerprint(b)


def test_workspace_cache_key_scopes_by_project():
    assets_key = "abc123"
    assert lc._workspace_cache_key("proj-1", assets_key) == "proj:proj-1"
    assert lc._workspace_cache_key("proj-2", assets_key) == "proj:proj-2"
    assert lc._workspace_cache_key(None, assets_key) == f"ephemeral:{assets_key}"


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


def test_compile_reuses_workspace_with_hash_only_assets():
    if not lc.find_pdflatex():
        return
    from src.models.schemas import CompileAssetFile

    tex = r"\documentclass{article}\begin{document}Hello\end{document}"
    asset = CompileAssetFile(name="extra.tex", content_base64="ZGE=")
    first = lc.compile_latex(
        CompileRequest(latex=tex, compiler="pdflatex", cache_id="proj-delta", assets=[asset]),
    )
    assert first.success is True
    asset_hash = lc._file_content_hash(
        lc._workspaces["proj:proj-delta"].path / "extra.tex",
    )
    second = lc.compile_latex(
        CompileRequest(
            latex=r"\documentclass{article}\begin{document}Hello again\end{document}",
            compiler="pdflatex",
            cache_id="proj-delta",
            assets=[CompileAssetFile(name="extra.tex", content_hash=asset_hash)],
        ),
    )
    assert second.success is True


def test_compile_pdf_cache_returns_without_rerunning_tex():
    if not lc.find_pdflatex():
        return
    req = CompileRequest(
        latex=r"\documentclass{article}\begin{document}Cache me\end{document}",
        compiler="pdflatex",
        cache_id="proj-cache",
    )
    first = lc.compile_latex(req)
    assert first.success is True

    original_run = lc._run_compile_attempts

    def boom(*_args, **_kwargs):
        raise AssertionError("compile should have been served from cache")

    lc._run_compile_attempts = boom
    try:
        second = lc.compile_latex(req)
        assert second.success is True
        assert second.pdf_base64 == first.pdf_base64
    finally:
        lc._run_compile_attempts = original_run


def test_asset_resync_when_hash_only_missing():
    from src.models.schemas import CompileAssetFile

    with pytest.raises(lc.AssetResyncRequiredError):
        lc._acquire_workspace(
            "proj-missing",
            [CompileAssetFile(name="fig.png", content_hash="a" * 64)],
            assets_key="deadbeef",
        )


def test_build_tex_cmd_omits_enable_installer_on_posix(monkeypatch):
    monkeypatch.setattr(lc, "_is_miktex", lambda: False)
    cmd = lc._build_tex_cmd("/usr/bin/pdflatex", "main.tex", synctex=True)
    assert "--enable-installer" not in cmd
    assert cmd[-1] == "main.tex"


def test_build_tex_cmd_includes_enable_installer_on_miktex(monkeypatch):
    monkeypatch.setattr(lc, "_is_miktex", lambda: True)
    cmd = lc._build_tex_cmd("pdflatex", "main.tex", synctex=False)
    assert "--enable-installer" in cmd


def test_compile_budget_exceeded():
    import time

    lc._set_compile_budget(time.monotonic() - 1)
    with pytest.raises(lc.CompileBudgetExceededError):
        lc._assert_compile_budget()
    lc._clear_compile_budget()
