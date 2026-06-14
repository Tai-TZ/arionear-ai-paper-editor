from __future__ import annotations

import base64
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from src.models.schemas import CompileAssetFile, CompileRequest, CompileResponse, CompileStatusResponse

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_LATEX_STUB_DIRS = (
    _PROJECT_ROOT / "frontend" / "public" / "latex-stubs",
    _PROJECT_ROOT / "frontend" / "public" / "assets" / "latex" / "ieee",
)
_STUB_FILES = ("IEEEtran.cls", "IEEEtran.bst")
_LATEX_SUPPORT_SUFFIXES = {".cls", ".bst", ".sty", ".bib"}
# Custom Overleaf/journal classes → IEEE conference fallback when .cls is missing.
_DOCUMENTCLASS_FALLBACKS: dict[str, str] = {
    "RevDigMatEduInt": r"\documentclass[conference]{IEEEtran}",
    "revdigmateduint": r"\documentclass[conference]{IEEEtran}",
}
_WINDOWS_PDFLATEX_CANDIDATES = (
    Path(r"C:\Program Files\MiKTeX\miktex\bin\x64\pdflatex.exe"),
    Path(r"C:\Program Files (x86)\MiKTeX\miktex\bin\pdflatex.exe"),
    Path.home() / "AppData" / "Local" / "Programs" / "MiKTeX" / "miktex" / "bin" / "x64" / "pdflatex.exe",
)


def find_pdflatex() -> str | None:
    found = shutil.which("pdflatex")
    if found:
        return found
    for candidate in _WINDOWS_PDFLATEX_CANDIDATES:
        if candidate.is_file():
            return str(candidate)
    return None


def find_bibtex() -> str | None:
    found = shutil.which("bibtex")
    if found:
        return found
    pdflatex = find_pdflatex()
    if pdflatex:
        sibling = Path(pdflatex).with_name("bibtex.exe")
        if sibling.is_file():
            return str(sibling)
    return None


def compile_status() -> CompileStatusResponse:
    engine = find_pdflatex()
    return CompileStatusResponse(available=engine is not None, engine=engine)


def _decode_asset_payload(content_base64: str) -> bytes:
    payload = content_base64.strip()
    if "," in payload and payload.startswith("data:"):
        payload = payload.split(",", 1)[1]
    return base64.b64decode(payload)


def _safe_asset_path(name: str) -> Path | None:
    normalized = name.replace("\\", "/").lstrip("/")
    if not normalized or ".." in normalized.split("/"):
        return None
    return Path(normalized)


def _extract_document_class(latex: str) -> str | None:
    match = re.search(r"\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}", latex)
    if not match:
        return None
    cls_name = match.group(1).strip()
    return Path(cls_name.replace("\\", "/")).name or None


def _is_usable_cls_file(cls_path: Path) -> bool:
    if not cls_path.is_file():
        return False
    try:
        if cls_path.stat().st_size < 32:
            return False
        content = cls_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return "\\ProvidesClass" in content or "\\LoadClass" in content or len(content) > 200


def _copy_support_files_to_root(work_dir: Path) -> None:
    for path in work_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in _LATEX_SUPPORT_SUFFIXES:
            continue
        root_copy = work_dir / path.name
        if root_copy.resolve() != path.resolve() and not root_copy.exists():
            shutil.copy2(path, root_copy)


def _resolve_document_class(latex: str, work_dir: Path) -> tuple[str, list[str]]:
    warnings: list[str] = []
    cls_name = _extract_document_class(latex)
    if not cls_name:
        return latex, warnings

    if _is_usable_cls_file(work_dir / f"{cls_name}.cls"):
        return latex, warnings

    fallback = _DOCUMENTCLASS_FALLBACKS.get(cls_name) or _DOCUMENTCLASS_FALLBACKS.get(cls_name.lower())
    if fallback:
        substituted = re.sub(
            r"\\documentclass\s*(?:\[[^\]]*\])?\s*\{[^}]+\}",
            lambda _match: fallback,
            latex,
            count=1,
        )
        warnings.append(
            f"Missing {cls_name}.cls - auto-switched to IEEEtran conference layout for preview."
        )
        _copy_latex_stubs(work_dir, substituted)
        return substituted, warnings

    return latex, warnings


def _copy_latex_stubs(work_dir: Path, latex: str) -> None:
    if "IEEEtran" not in latex:
        return
    for root in _LATEX_STUB_DIRS:
        if not root.is_dir():
            continue
        for stub in _STUB_FILES:
            src = root / stub
            dest = work_dir / stub
            if src.is_file() and not dest.exists():
                shutil.copy2(src, dest)


def _miktex_env() -> dict[str, str]:
    env = os.environ.copy()
    env["MIKTEX_ENABLE_INSTALLER"] = "1"
    env["MIKTEX_ALLOW_UNATTENDED"] = "1"
    return env


def _extract_cite_keys(latex: str) -> set[str]:
    keys: set[str] = set()
    for match in re.finditer(r"\\cite[a-zA-Z*]*\{([^}]+)\}", latex):
        for key in match.group(1).split(","):
            cleaned = key.strip()
            if cleaned:
                keys.add(cleaned)
    return keys


def _ensure_bibliography(work_dir: Path, latex: str) -> None:
    cite_keys = _extract_cite_keys(latex)
    for bib_name in _extract_bib_files(latex):
        bib_path = work_dir / f"{bib_name}.bib"
        if bib_path.is_file():
            continue
        entries = "\n\n".join(
            f"@misc{{{key},\n  title = {{Reference placeholder for {key}}},\n  year = {{2024}}\n}}"
            for key in sorted(cite_keys)
        )
        bib_path.write_text(entries + "\n", encoding="utf-8")


# Packages that are often missing from default MiKTeX / TeX Live installs
# and can be safely dropped without breaking the document structure.
_DROPPABLE_PACKAGES = {
    "flushend",    # column balancing on last page — not essential for preview
    "balance",     # similar to flushend
    "fixltx2e",   # obsolete since LaTeX 2015
    "stfloats",   # column floats helper (bundled with flushend in sttools)
    "endfloat",   # move floats to end — breaks two-column preview anyway
    "nidanfloat",  # two-column float helper
}


def _strip_droppable_packages(latex: str) -> str:
    r"""Remove \usepackage{<name>} lines for packages that are commonly missing."""
    def _replace(m: re.Match) -> str:
        # Extract all package names from options like {flushend,balance}
        names_str = m.group(1)
        names = [n.strip() for n in names_str.split(",")]
        kept = [n for n in names if n not in _DROPPABLE_PACKAGES]
        if not kept:
            return ""          # drop entire \usepackage line
        if len(kept) == len(names):
            return m.group(0)  # nothing removed
        return r"\usepackage{" + ",".join(kept) + "}"

    return re.sub(
        r"\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}",
        _replace,
        latex,
    )


def _prepare_latex_source(latex: str, work_dir: Path, asset_names: set[str]) -> str:
    prepared = latex.replace(
        "[font=Medium, justification=raggedright]{caption}",
        "[font=small, justification=raggedright]{caption}",
    )

    # Drop packages that are commonly missing and safe to omit for preview.
    prepared = _strip_droppable_packages(prepared)

    figure_paths = re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", prepared)
    missing_figures = [path for path in figure_paths if path.replace("\\", "/").split("/")[-1] not in asset_names]
    if missing_figures and "\\usepackage{graphicx}" in prepared:
        prepared = prepared.replace(
            "\\usepackage{graphicx}",
            "\\usepackage[demo]{graphicx}",
            1,
        )

    return prepared


def _extract_missing_sty(log: str) -> str | None:
    """Return the name of the first missing .sty package, or None."""
    m = re.search(r"File `([^']+\.sty)' not found", log)
    return m.group(1).replace(".sty", "") if m else None


def _extract_latex_error(log: str) -> str:
    missing_cls = re.search(r"File `([^']+\.cls)' not found", log)
    if missing_cls:
        cls_file = missing_cls.group(1)
        return (
            f"Missing LaTeX class file `{cls_file}`. "
            f"Upload {cls_file} as a project asset, or change \\documentclass to "
            f"\\documentclass[conference]{{IEEEtran}}."
        )

    lines = log.splitlines()
    errors: list[str] = []
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("! "):
            errors.append(stripped)
            if index + 1 < len(lines):
                next_line = lines[index + 1].strip()
                if next_line and not next_line.startswith("!"):
                    errors.append(next_line)
    if errors:
        return "\n".join(errors[-4:])
    for line in reversed(lines):
        if "Fatal error" in line or "Emergency stop" in line:
            return line.strip()
    return "PDF generation failed. Review the LaTeX log for errors."


def _extract_bib_files(latex: str) -> list[str]:
    return re.findall(r"\\bibliography\{([^}]+)\}", latex)


def _run_pdflatex(engine: str, work_dir: Path) -> tuple[int, str]:
    result = subprocess.run(
        [
            engine,
            "-interaction=nonstopmode",
            "--enable-installer",
            "main.tex",
        ],
        cwd=work_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=600,
        check=False,
        env=_miktex_env(),
    )
    log = (result.stdout or "") + (result.stderr or "")
    return result.returncode, log


def _run_bibtex(work_dir: Path, bibtex: str | None = None) -> tuple[int, str]:
    engine = bibtex or find_bibtex() or "bibtex"
    result = subprocess.run(
        [engine, "main"],
        cwd=work_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        check=False,
        env=_miktex_env(),
    )
    log = (result.stdout or "") + (result.stderr or "")
    return result.returncode, log


def _force_apply_known_fallbacks(latex: str) -> tuple[str, list[str]]:
    """
    Eagerly replace any known-problematic document classes BEFORE writing assets
    or checking for cls files. This guarantees the fallback runs even when
    regex-based detection has edge cases (whitespace, encoding, options, etc.).
    """
    applied: list[str] = []
    for cls_name, fallback_decl in _DOCUMENTCLASS_FALLBACKS.items():
        pattern = re.compile(
            r"\\documentclass\s*(?:\[[^\]]*\])?\s*\{" + re.escape(cls_name) + r"\}",
            re.IGNORECASE,
        )
        if pattern.search(latex):
            latex = pattern.sub(lambda _m: fallback_decl, latex, count=1)
            applied.append(
                f"Missing {cls_name}.cls - auto-switched to IEEEtran conference layout for preview."
            )
    return latex, applied


def compile_latex(request: CompileRequest) -> CompileResponse:
    engine = find_pdflatex()
    if not engine:
        return CompileResponse(
            success=False,
            error=(
                "pdflatex not found. Install MiKTeX (winget install MiKTeX.MiKTeX) "
                "or TeX Live, then restart the backend terminal."
            ),
            engine="none",
        )

    logs: list[str] = []
    warnings: list[str] = []

    with tempfile.TemporaryDirectory(prefix="arionear-latex-") as tmp:
        work_dir = Path(tmp)
        asset_names = {Path(a.name).name for a in request.assets}

        for asset in request.assets:
            rel = _safe_asset_path(asset.name)
            if rel is None:
                continue
            dest = work_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(_decode_asset_payload(asset.content_base64))

        # Apply known class fallbacks BEFORE anything else — prevents
        # edge-case failures (whitespace in \documentclass, bad cls uploads).
        patched_latex, fallback_warnings = _force_apply_known_fallbacks(request.latex)
        if fallback_warnings:
            warnings.extend(fallback_warnings)
            # Remove any uploaded .cls that would conflict with the fallback.
            for cls_name in _DOCUMENTCLASS_FALLBACKS:
                bogus = work_dir / f"{cls_name}.cls"
                if bogus.is_file() and not _is_usable_cls_file(bogus):
                    bogus.unlink(missing_ok=True)

        _copy_support_files_to_root(work_dir)

        prepared = _prepare_latex_source(patched_latex, work_dir, asset_names)
        prepared, class_warnings = _resolve_document_class(prepared, work_dir)
        warnings.extend(class_warnings)
        (work_dir / "main.tex").write_text(prepared, encoding="utf-8")

        _copy_latex_stubs(work_dir, prepared)
        _ensure_bibliography(work_dir, prepared)
        bib_targets = _extract_bib_files(prepared)
        needs_bibtex = any((work_dir / f"{name}.bib").exists() for name in bib_targets)

        def _needs_rerun(log_text: str) -> bool:
            """True when LaTeX signals that a second pass is needed."""
            markers = (
                "Rerun to get",
                "rerun LaTeX",
                "Label(s) may have changed",
                "There were undefined references",
                "Citation(s) may have changed",
            )
            return any(m in log_text for m in markers)

        def run_pdflatex_passes() -> None:
            code, log = _run_pdflatex(engine, work_dir)
            logs.append(log)
            if code != 0 and not (work_dir / "main.pdf").exists():
                return
            # Only run second pass when cross-refs/labels need re-resolving.
            if _needs_rerun(log):
                code, log = _run_pdflatex(engine, work_dir)
                logs.append(log)

        run_pdflatex_passes()

        # If a .sty is missing, add it to _DROPPABLE_PACKAGES on-the-fly and retry once.
        if not (work_dir / "main.pdf").exists():
            merged = "\n".join(logs)
            missing_sty = _extract_missing_sty(merged)
            if missing_sty and missing_sty not in _DROPPABLE_PACKAGES:
                _DROPPABLE_PACKAGES.add(missing_sty)
                warnings.append(
                    f"Package `{missing_sty}` not available — removed for preview."
                )
                retry_tex = _strip_droppable_packages(prepared)
                (work_dir / "main.tex").write_text(retry_tex, encoding="utf-8")
                run_pdflatex_passes()

        if needs_bibtex:
            bibtex = find_bibtex()
            if bibtex:
                code, log = _run_bibtex(work_dir, bibtex)
                logs.append(log)
                for _ in range(2):
                    code, log = _run_pdflatex(engine, work_dir)
                    logs.append(log)

        pdf_path = work_dir / "main.pdf"
        if not pdf_path.is_file():
            merged_log = "\n".join(logs)
            return CompileResponse(
                success=False,
                log=merged_log[-12000:],
                error=_extract_latex_error(merged_log),
                engine="pdflatex",
            )

        pdf_base64 = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
        return CompileResponse(
            success=True,
            pdf_base64=pdf_base64,
            log="\n".join(logs)[-6000:],
            engine="pdflatex",
            warning="\n".join(warnings),
        )
