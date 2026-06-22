from __future__ import annotations

import base64
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

from src.models.schemas import (
    CompileEnginesInfo,
    CompileRequest,
    CompileResponse,
    CompileStatusResponse,
)

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_LATEX_STUB_DIRS = (
    _PROJECT_ROOT / "frontend" / "public" / "latex-stubs",
    _PROJECT_ROOT / "frontend" / "public" / "assets" / "latex" / "ieee",
    _PROJECT_ROOT / "frontend" / "public" / "assets" / "latex" / "tikz-cd",
)
_STUB_FILES = ("IEEEtran.cls", "IEEEtran.bst", "tikz-cd.sty")
_LATEX_SUPPORT_SUFFIXES = {".cls", ".bst", ".sty", ".bib"}
_TEX_SUFFIXES = {".tex", ".latex"}
_COMPILER_NAMES = ("pdflatex", "xelatex", "lualatex", "latex")
LatexCompiler = Literal["auto", "pdflatex", "xelatex", "lualatex", "latex"]

# Custom Overleaf/journal classes → IEEE conference fallback when .cls is missing.
_DOCUMENTCLASS_FALLBACKS: dict[str, str] = {
    "RevDigMatEduInt": r"\documentclass[conference]{IEEEtran}",
    "revdigmateduint": r"\documentclass[conference]{IEEEtran}",
}
_WINDOWS_MIKTEX_BIN = (
    Path(r"C:\Program Files\MiKTeX\miktex\bin\x64"),
    Path(r"C:\Program Files (x86)\MiKTeX\miktex\bin"),
    Path.home() / "AppData" / "Local" / "Programs" / "MiKTeX" / "miktex" / "bin" / "x64",
)
_LOG_LIMIT = 200_000


def _find_executable(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    for bin_dir in _WINDOWS_MIKTEX_BIN:
        candidate = bin_dir / f"{name}.exe"
        if candidate.is_file():
            return str(candidate)
    return None


def find_pdflatex() -> str | None:
    return _find_executable("pdflatex")


def find_bibtex() -> str | None:
    return _find_executable("bibtex")


def find_biber() -> str | None:
    return _find_executable("biber")


def find_latexmk() -> str | None:
    return _find_executable("latexmk")


def find_tex_engine(compiler: str) -> str | None:
    if compiler not in _COMPILER_NAMES:
        return None
    return _find_executable(compiler)


def _engines_info() -> CompileEnginesInfo:
    return CompileEnginesInfo(
        pdflatex=find_pdflatex(),
        xelatex=find_tex_engine("xelatex"),
        lualatex=find_tex_engine("lualatex"),
        latex=find_tex_engine("latex"),
        latexmk=find_latexmk(),
        biber=find_biber(),
        bibtex=find_bibtex(),
    )


def compile_status() -> CompileStatusResponse:
    engines = _engines_info()
    primary = engines.pdflatex or engines.xelatex or engines.lualatex
    return CompileStatusResponse(
        available=primary is not None,
        engine=primary,
        engines=engines,
    )


def detect_compiler(latex: str, requested: LatexCompiler) -> str:
    if requested != "auto":
        return requested
    lowered = latex.lower()
    if any(token in lowered for token in ("\\usepackage{fontspec}", "\\setmainfont", "\\setmainlanguage")):
        if find_tex_engine("xelatex"):
            return "xelatex"
        if find_tex_engine("lualatex"):
            return "lualatex"
    if "\\usepackage{polyglossia}" in lowered and find_tex_engine("xelatex"):
        return "xelatex"
    if "\\usepackage{unicode-math}" in lowered and find_tex_engine("lualatex"):
        return "lualatex"
    return "pdflatex"


def uses_biblatex(latex: str) -> bool:
    lowered = latex.lower()
    return "biblatex" in lowered or "\\addbibresource" in lowered


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
    needs_ieee = "IEEEtran" in latex
    needs_tikz_cd = "tikz-cd" in latex
    for root in _LATEX_STUB_DIRS:
        if not root.is_dir():
            continue
        for stub in _STUB_FILES:
            if stub.startswith("IEEEtran") and not needs_ieee:
                continue
            if stub == "tikz-cd.sty" and not needs_tikz_cd:
                continue
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
    if uses_biblatex(latex):
        return
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


_DROPPABLE_PACKAGES = {
    "flushend",
    "balance",
    "fixltx2e",
    "stfloats",
    "endfloat",
    "nidanfloat",
}


def _strip_droppable_packages(latex: str) -> str:
    def _replace(m: re.Match) -> str:
        names_str = m.group(1)
        names = [n.strip() for n in names_str.split(",")]
        kept = [n for n in names if n not in _DROPPABLE_PACKAGES]
        if not kept:
            return ""
        if len(kept) == len(names):
            return m.group(0)
        return r"\usepackage{" + ",".join(kept) + "}"

    return re.sub(
        r"\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}",
        _replace,
        latex,
    )


_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".eps")


def _figure_available(fig_path: str, work_dir: Path) -> bool:
    """True when a figure file exists for an \\includegraphics path (with or without extension)."""
    normalized = fig_path.replace("\\", "/").strip()
    if not normalized:
        return False

    rel = Path(normalized)
    candidates: list[Path] = [work_dir / rel]
    if not rel.suffix:
        for ext in _IMAGE_EXTENSIONS:
            candidates.append(work_dir / f"{normalized}{ext}")

    name = rel.name
    stem = Path(name).stem if "." in name else name
    for ext in ("", *_IMAGE_EXTENSIONS):
        candidates.append(work_dir / f"{name}{ext}")
        candidates.append(work_dir / f"{stem}{ext}")

    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        if candidate.is_file() and candidate.stat().st_size > 0:
            return True

    stem_guess = rel.stem if rel.suffix else normalized.split("/")[-1]
    for ext in _IMAGE_EXTENSIONS:
        if any(work_dir.rglob(f"*{stem_guess}{ext}")):
            return True
    return False


def _mirror_figure_assets_to_root(work_dir: Path) -> None:
    """Copy figures to compile root so basename-only \\includegraphics{} resolves."""
    for path in work_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in _IMAGE_EXTENSIONS:
            continue
        root_copy = work_dir / path.name
        if root_copy.resolve() != path.resolve() and not root_copy.exists():
            shutil.copy2(path, root_copy)


def _prepare_latex_source(latex: str, work_dir: Path, asset_names: set[str]) -> str:
    prepared = latex.replace(
        "[font=Medium, justification=raggedright]{caption}",
        "[font=small, justification=raggedright]{caption}",
    )
    prepared = _strip_droppable_packages(prepared)

    figure_paths = re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", prepared)
    missing_figures = [
        path for path in figure_paths if not _figure_available(path, work_dir)
    ]
    if missing_figures and "\\usepackage{graphicx}" in prepared:
        prepared = prepared.replace(
            "\\usepackage{graphicx}",
            "\\usepackage[demo]{graphicx}",
            1,
        )

    return prepared


def _extract_missing_sty(log: str) -> str | None:
    m = re.search(r"File `([^']+\.sty)' not found", log)
    return m.group(1).replace(".sty", "") if m else None


def _extract_latex_error(log: str) -> str:
    missing_cls = re.search(r"File `([^']+\.cls)' not found", log)
    if missing_cls:
        cls_file = missing_cls.group(1)
        return (
            f"Missing LaTeX class file `{cls_file}`. "
            f"Upload {cls_file} as a project asset, or change \\documentclass."
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
        return "\n".join(errors[-6:])
    for line in reversed(lines):
        if "Fatal error" in line or "Emergency stop" in line:
            return line.strip()
    return "PDF generation failed. Review the LaTeX log for errors."


def _extract_bib_files(latex: str) -> list[str]:
    return re.findall(r"\\bibliography\{([^}]+)\}", latex)


def _jobname(main_file: str) -> str:
    return Path(main_file).stem or "main"


def _run_subprocess(cmd: list[str], work_dir: Path, timeout: int = 600) -> tuple[int, str]:
    result = subprocess.run(
        cmd,
        cwd=work_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
        env=_miktex_env(),
    )
    log = (result.stdout or "") + (result.stderr or "")
    return result.returncode, log


def _latexmk_compiler_flag(compiler: str) -> list[str]:
    if compiler == "pdflatex":
        return ["-pdf"]
    if compiler == "xelatex":
        return ["-xelatex"]
    if compiler == "lualatex":
        return ["-lualatex"]
    if compiler == "latex":
        return ["-pdfdvi"]
    return ["-pdf"]


def _run_latexmk(compiler: str, work_dir: Path, main_file: str) -> tuple[int, str]:
    latexmk = find_latexmk()
    if not latexmk:
        return -1, ""
    cmd = [
        latexmk,
        *_latexmk_compiler_flag(compiler),
        "-interaction=nonstopmode",
        "-synctex=1",
        "-halt-on-error",
        main_file,
    ]
    return _run_subprocess(cmd, work_dir, timeout=600)


def _run_tex_pass(compiler: str, engine: str, work_dir: Path, main_file: str) -> tuple[int, str]:
    cmd = [
        engine,
        "-interaction=nonstopmode",
        "-synctex=1",
        "--enable-installer",
        main_file,
    ]
    return _run_subprocess(cmd, work_dir, timeout=600)


def _run_bibtex(work_dir: Path, jobname: str, bibtex: str | None = None) -> tuple[int, str]:
    engine = bibtex or find_bibtex() or "bibtex"
    return _run_subprocess([engine, jobname], work_dir, timeout=120)


def _run_biber(work_dir: Path, jobname: str) -> tuple[int, str]:
    biber = find_biber()
    if not biber:
        return -1, "biber not found"
    return _run_subprocess([biber, jobname], work_dir, timeout=180)


def _needs_rerun(log_text: str) -> bool:
    markers = (
        "Rerun to get",
        "rerun LaTeX",
        "Label(s) may have changed",
        "There were undefined references",
        "Citation(s) may have changed",
    )
    return any(m in log_text for m in markers)


def _manual_compile(
    compiler: str,
    work_dir: Path,
    main_file: str,
    main_latex: str,
) -> list[str]:
    logs: list[str] = []
    engine = find_tex_engine(compiler)
    if not engine:
        logs.append(f"Engine `{compiler}` not found.")
        return logs

    jobname = _jobname(main_file)
    needs_bibtex = bool(_extract_bib_files(main_latex)) and not uses_biblatex(main_latex)
    needs_biber = uses_biblatex(main_latex)

    def tex_passes() -> None:
        code, log = _run_tex_pass(compiler, engine, work_dir, main_file)
        logs.append(log)
        if code != 0 and not (work_dir / f"{jobname}.pdf").exists():
            return
        if _needs_rerun(log):
            code, log = _run_tex_pass(compiler, engine, work_dir, main_file)
            logs.append(log)

    tex_passes()

    if needs_biber:
        biber = find_biber()
        if biber:
            code, log = _run_biber(work_dir, jobname)
            logs.append(log)
            for _ in range(2):
                code, log = _run_tex_pass(compiler, engine, work_dir, main_file)
                logs.append(log)
        else:
            logs.append("biblatex detected but biber is not installed.")

    if needs_bibtex:
        bibtex = find_bibtex()
        if bibtex:
            code, log = _run_bibtex(work_dir, jobname, bibtex)
            logs.append(log)
            for _ in range(2):
                code, log = _run_tex_pass(compiler, engine, work_dir, main_file)
                logs.append(log)

    return logs


def _read_synctex_gz(work_dir: Path, jobname: str) -> str:
    synctex_path = work_dir / f"{jobname}.synctex.gz"
    if not synctex_path.is_file():
        return ""
    return base64.b64encode(synctex_path.read_bytes()).decode("ascii")


def _force_apply_known_fallbacks(latex: str) -> tuple[str, list[str]]:
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


def _collect_all_tex_sources(main_latex: str, work_dir: Path, main_file: str) -> str:
    """Merge main + \\input/\\include .tex files for citation/bib detection."""
    combined = [main_latex]
    for match in re.finditer(r"\\(?:input|include)\{([^}]+)\}", main_latex):
        rel = match.group(1).strip()
        if not rel.endswith((".tex", ".latex")):
            rel = f"{rel}.tex"
        candidate = work_dir / rel.replace("\\", "/")
        if candidate.is_file():
            combined.append(candidate.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(combined)


def compile_latex(request: CompileRequest) -> CompileResponse:
    main_file = request.main_file.strip() or "main.tex"
    compiler = detect_compiler(request.latex, request.compiler)
    engine_path = find_tex_engine(compiler)

    if not engine_path:
        return CompileResponse(
            success=False,
            error=(
                f"`{compiler}` not found. Install MiKTeX (winget install MiKTeX.MiKTeX) "
                "or TeX Live with xelatex/lualatex support, then restart the backend."
            ),
            engine="none",
            compiler=compiler,
        )

    logs: list[str] = []
    warnings: list[str] = []
    jobname = _jobname(main_file)

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

        _mirror_figure_assets_to_root(work_dir)

        patched_latex, fallback_warnings = _force_apply_known_fallbacks(request.latex)
        if fallback_warnings:
            warnings.extend(fallback_warnings)
            for cls_name in _DOCUMENTCLASS_FALLBACKS:
                bogus = work_dir / f"{cls_name}.cls"
                if bogus.is_file() and not _is_usable_cls_file(bogus):
                    bogus.unlink(missing_ok=True)

        _copy_support_files_to_root(work_dir)

        prepared = _prepare_latex_source(patched_latex, work_dir, asset_names)
        prepared, class_warnings = _resolve_document_class(prepared, work_dir)
        warnings.extend(class_warnings)

        main_path = work_dir / main_file.replace("\\", "/")
        main_path.parent.mkdir(parents=True, exist_ok=True)
        main_path.write_text(prepared, encoding="utf-8")

        _copy_latex_stubs(work_dir, prepared)
        all_tex = _collect_all_tex_sources(prepared, work_dir, main_file)
        _ensure_bibliography(work_dir, all_tex)

        latexmk_code, latexmk_log = _run_latexmk(compiler, work_dir, main_file)
        if latexmk_code >= 0 and latexmk_log:
            logs.append(latexmk_log)

        pdf_path = work_dir / f"{jobname}.pdf"
        if not pdf_path.is_file():
            logs.extend(_manual_compile(compiler, work_dir, main_file, all_tex))

        if not pdf_path.is_file():
            merged = "\n".join(logs)
            missing_sty = _extract_missing_sty(merged)
            if missing_sty and missing_sty not in _DROPPABLE_PACKAGES:
                _DROPPABLE_PACKAGES.add(missing_sty)
                warnings.append(f"Package `{missing_sty}` not available — removed for preview.")
                retry_tex = _strip_droppable_packages(prepared)
                main_path.write_text(retry_tex, encoding="utf-8")
                logs.clear()
                latexmk_code, latexmk_log = _run_latexmk(compiler, work_dir, main_file)
                if latexmk_log:
                    logs.append(latexmk_log)
                if not pdf_path.is_file():
                    logs.extend(_manual_compile(compiler, work_dir, main_file, retry_tex))

        if not pdf_path.is_file():
            merged_log = "\n".join(logs)
            return CompileResponse(
                success=False,
                log=merged_log[-_LOG_LIMIT:],
                error=_extract_latex_error(merged_log),
                engine=compiler,
                compiler=compiler,
            )

        synctex_b64 = _read_synctex_gz(work_dir, jobname)
        merged_log = "\n".join(logs)
        return CompileResponse(
            success=True,
            pdf_base64=base64.b64encode(pdf_path.read_bytes()).decode("ascii"),
            log=merged_log[-_LOG_LIMIT:],
            engine=compiler,
            compiler=compiler,
            warning="\n".join(warnings),
            synctex_base64=synctex_b64,
            main_file=main_file,
        )


def find_synctex() -> str | None:
    return _find_executable("synctex")


def _parse_synctex_cli_output(stdout: str) -> dict[str, str | int] | None:
    input_file = ""
    line_no = 0
    column_no = -1
    in_block = False
    for raw in stdout.splitlines():
        line = raw.strip()
        if line == "SyncTeX result begin":
            in_block = True
            continue
        if line == "SyncTeX result end":
            break
        if not in_block:
            continue
        if line.startswith("Input:"):
            input_file = line.split(":", 1)[1].strip()
        elif line.startswith("Line:"):
            try:
                line_no = int(line.split(":", 1)[1].strip())
            except ValueError:
                line_no = 0
        elif line.startswith("Column:"):
            try:
                column_no = int(line.split(":", 1)[1].strip())
            except ValueError:
                column_no = -1
    if not input_file or line_no < 0:
        return None
    return {
        "file": Path(input_file.replace("\\", "/")).name,
        "line": max(1, line_no),
        "column": column_no,
    }


def _normalize_match_text(text: str) -> str:
    cleaned = re.sub(r"\\[a-zA-Z*]+\{([^}]*)\}", r"\1", text)
    cleaned = re.sub(r"\\[a-zA-Z*]+", " ", cleaned)
    cleaned = re.sub(r"[{}]", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned.lower()).strip()


def _resolve_line_by_context(
    latex: str,
    context: str,
    synctex_line: int,
    word: str = "",
) -> int | None:
    ctx = _normalize_match_text(context)
    if len(ctx) < 8:
        return None

    needle = word.strip().lower()
    words = ctx.split()
    lines = latex.splitlines()

    for length in range(len(words), 1, -1):
        for start in range(0, len(words) - length + 1):
            phrase = " ".join(words[start : start + length])
            if len(phrase) < 8:
                continue
            if needle and needle not in phrase:
                continue

            hits = [
                index + 1
                for index, line in enumerate(lines)
                if phrase in _normalize_match_text(line)
            ]
            if len(hits) == 1:
                return hits[0]
            if len(hits) > 1:
                return min(hits, key=lambda candidate: abs(candidate - synctex_line))

    return None


def _lines_containing_word(latex: str, word: str) -> list[int]:
    needle = word.strip().lower()
    if not needle:
        return []
    hits: list[int] = []
    for index, line in enumerate(latex.splitlines(), start=1):
        if needle in line.lower():
            hits.append(index)
    return hits


def _resolve_synctex_line(
    latex: str,
    synctex_line: int,
    word: str = "",
    context: str = "",
) -> int:
    """Map raw SyncTeX line to the source line that contains the clicked word."""
    ctx_line = _resolve_line_by_context(latex, context, synctex_line, word)
    if ctx_line:
        return ctx_line

    needle = word.strip().lower()
    if not needle or not latex.strip():
        return synctex_line

    lines = latex.splitlines()
    matches = [index + 1 for index, line in enumerate(lines) if needle in line.lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        return min(matches, key=lambda candidate: abs(candidate - synctex_line))

    for delta in range(1, 31):
        for candidate in (synctex_line - delta, synctex_line + delta):
            if 1 <= candidate <= len(lines) and needle in lines[candidate - 1].lower():
                return candidate

    return synctex_line


resolve_synctex_line = _resolve_synctex_line


def _synctex_inverse_probe(
    synctex: str,
    work_dir: Path,
    pdf_name: str,
    page: int,
    x: float,
    y: float,
) -> dict[str, str | int] | None:
    spec = f"{page}:{x:.2f}:{y:.2f}:{pdf_name}"
    result = subprocess.run(
        [synctex, "edit", "-o", spec, "-d", str(work_dir)],
        cwd=work_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
        check=False,
        env=_miktex_env(),
    )
    if result.returncode != 0 and "SyncTeX result begin" not in (result.stdout or ""):
        return None
    return _parse_synctex_cli_output(result.stdout or "")


def _synctex_inverse_with_workdir(
    synctex: str,
    work_dir: Path,
    pdf_name: str,
    page: int,
    x: float,
    y: float,
) -> dict[str, str | int | float] | None:
    hit = _synctex_inverse_probe(synctex, work_dir, pdf_name, page, x, y)
    if not hit:
        return None
    return {
        "file": hit["file"],
        "line": hit["line"],
        "column": hit.get("column", -1),
        "page": page,
        "x": x,
        "y": y,
    }


def _best_candidate_yscan(
    synctex: str,
    work_dir: Path,
    pdf_name: str,
    page: int,
    x: float,
    y: float,
    candidates: list[int],
) -> int:
    best_line = candidates[0]
    best_score = 10_000
    for dy in range(-56, 57, 4):
        probe = _synctex_inverse_probe(synctex, work_dir, pdf_name, page, x, y + dy)
        if not probe:
            continue
        probe_line = int(probe.get("line", 0))
        for candidate in candidates:
            score = abs(dy) + abs(probe_line - candidate)
            if score < best_score:
                best_score = score
                best_line = candidate
    return best_line


def parse_synctex_inverse_disambiguated(
    synctex_gz_b64: str,
    pdf_b64: str,
    page: int,
    x: float,
    y: float,
    jobname: str = "main",
    word: str = "",
    latex: str = "",
    context: str = "",
) -> dict[str, str | int | float] | None:
    """Inverse SyncTeX with y-scan when the same word appears on multiple lines."""
    synctex = find_synctex()
    if not synctex or not synctex_gz_b64 or not pdf_b64:
        return None

    safe_job = Path(jobname).stem or "main"
    pdf_name = f"{safe_job}.pdf"

    try:
        pdf_bytes = base64.b64decode(pdf_b64)
        synctex_bytes = base64.b64decode(synctex_gz_b64)
    except (OSError, ValueError):
        return None

    with tempfile.TemporaryDirectory(prefix="arionear-synctex-") as tmp:
        work_dir = Path(tmp)
        (work_dir / pdf_name).write_bytes(pdf_bytes)
        (work_dir / f"{safe_job}.synctex.gz").write_bytes(synctex_bytes)

        base = _synctex_inverse_with_workdir(synctex, work_dir, pdf_name, page, x, y)
        if not base:
            return None

        ctx_line = (
            _resolve_line_by_context(latex, context, int(base.get("line", 0)), word)
            if context.strip() and word.strip() and latex.strip()
            else None
        )
        if ctx_line:
            return {
                "file": str(base.get("file", "main.tex")),
                "line": ctx_line,
                "column": int(base.get("column", -1)),
                "page": page,
                "x": x,
                "y": y,
            }

        candidates = _lines_containing_word(latex, word) if word.strip() and latex.strip() else []
        if len(candidates) <= 1:
            return base

        best_line = _best_candidate_yscan(synctex, work_dir, pdf_name, page, x, y, candidates)
        return {
            "file": str(base.get("file", "main.tex")),
            "line": best_line,
            "column": int(base.get("column", -1)),
            "page": page,
            "x": x,
            "y": y,
        }


def parse_synctex_inverse(
    synctex_gz_b64: str,
    pdf_b64: str,
    page: int,
    x: float,
    y: float,
    jobname: str = "main",
) -> dict[str, str | int | float] | None:
    """Inverse SyncTeX via `synctex edit` (page click → source line)."""
    synctex = find_synctex()
    if not synctex or not synctex_gz_b64 or not pdf_b64:
        return None

    safe_job = Path(jobname).stem or "main"
    pdf_name = f"{safe_job}.pdf"

    try:
        pdf_bytes = base64.b64decode(pdf_b64)
        synctex_bytes = base64.b64decode(synctex_gz_b64)
    except (OSError, ValueError):
        return None

    with tempfile.TemporaryDirectory(prefix="arionear-synctex-") as tmp:
        work_dir = Path(tmp)
        (work_dir / pdf_name).write_bytes(pdf_bytes)
        (work_dir / f"{safe_job}.synctex.gz").write_bytes(synctex_bytes)
        return _synctex_inverse_with_workdir(synctex, work_dir, pdf_name, page, x, y)
