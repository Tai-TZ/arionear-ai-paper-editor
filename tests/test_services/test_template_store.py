from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

from src.models.template_schemas import PaperTemplateUpdateRequest
from src.services import latex_compile as lc
from src.services import template_store as ts
from src.services.template_builtins import PUBLISHER_TEMPLATES, BuiltinTemplate

EXPECTED_CLASSES = {
    "ieee-journal": ("IEEEtran", "journal", "IEEEtran"),
    "springer-lncs": ("llncs", "runningheads", "splncs04"),
    "elsevier-elsarticle": ("elsarticle", "preprint", "elsarticle-num"),
}
_DOCUMENTCLASS_RE = re.compile(r"\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]+)\}")


@pytest.fixture
def templates_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "templates"
    monkeypatch.setattr(ts, "_TEMPLATES_ROOT", root)
    monkeypatch.setattr(ts, "_REGISTRY_PATH", root / "registry.json")
    monkeypatch.setattr(ts, "_STUB_IEEE", tmp_path / "no-ieee-stubs")
    return root


def _registry(root: Path) -> dict:
    return json.loads((root / "registry.json").read_text(encoding="utf-8"))


def _ids(root: Path) -> list[str]:
    return [row["id"] for row in _registry(root)["templates"]]


def _legacy_ieee_only_registry(root: Path) -> dict:
    """Registry as written by the IEEE-only seed (no ``seeded_builtins`` key)."""
    row = {
        "id": "ieee-journal",
        "slug": "ieee-journal",
        "title": "IEEE for journals template with bibtex example files included",
        "title_vi": "Mẫu IEEE cho tạp chí (kèm ví dụ BibTeX)",
        "description": "Admin-edited description.",
        "author": "IEEE template (Arionear gallery)",
        "tags": ["IEEE (all)"],
        "is_official": True,
        "format": "ieee",
        "venue": "journal",
        "featured": True,
        "created_at": "2026-06-27T06:47:43.728052+00:00",
        "updated_at": "2026-06-27T06:47:43.728052+00:00",
    }
    root.mkdir(parents=True, exist_ok=True)
    folder = root / "ieee-journal"
    folder.mkdir()
    (folder / "main.tex").write_text("% admin-edited IEEE source\n", encoding="utf-8")
    data = {"templates": [row]}
    (root / "registry.json").write_text(json.dumps(data), encoding="utf-8")
    return row


def test_fresh_registry_seeds_all_four_builtins(templates_root: Path):
    ts.ensure_template_seed()

    registry = _registry(templates_root)
    assert sorted(_ids(templates_root)) == sorted(EXPECTED_CLASSES)
    assert registry["seeded_builtins"] == list(ts.BUILTIN_TEMPLATE_IDS)
    for template_id in EXPECTED_CLASSES:
        folder = templates_root / template_id
        for name in ("main.tex", "references.bib", "preview.svg", "sample.pdf"):
            assert (folder / name).is_file(), f"{template_id}/{name} missing"
        assert ts._is_valid_pdf(folder / "sample.pdf")


def test_seed_is_idempotent(templates_root: Path):
    ts.ensure_template_seed()
    before = (templates_root / "registry.json").read_bytes()

    ts.ensure_template_seed()
    ts.ensure_template_seed()

    assert (templates_root / "registry.json").read_bytes() == before
    assert len(_ids(templates_root)) == len(EXPECTED_CLASSES)


def test_existing_ieee_only_registry_gets_publisher_templates(templates_root: Path):
    ieee_row = _legacy_ieee_only_registry(templates_root)

    ts.ensure_template_seed()

    registry = _registry(templates_root)
    assert _ids(templates_root) == ["ieee-journal", "springer-lncs", "elsevier-elsarticle"]
    assert registry["templates"][0] == ieee_row
    assert (templates_root / "ieee-journal" / "main.tex").read_text(encoding="utf-8") == "% admin-edited IEEE source\n"
    assert registry["seeded_builtins"] == list(ts.BUILTIN_TEMPLATE_IDS)


def test_seed_keeps_admin_edits(templates_root: Path):
    ts.ensure_template_seed()
    ts.update_template(
        "elsevier-elsarticle",
        PaperTemplateUpdateRequest(title="Our lab Elsevier template", tags=["Lab"], main_tex="% custom elsevier\n"),
    )
    ts.update_template("ieee-journal", PaperTemplateUpdateRequest(featured=False))

    ts.ensure_template_seed()

    rows = {row["id"]: row for row in _registry(templates_root)["templates"]}
    assert rows["elsevier-elsarticle"]["title"] == "Our lab Elsevier template"
    assert rows["elsevier-elsarticle"]["tags"] == ["Lab"]
    assert rows["ieee-journal"]["featured"] is False
    assert (templates_root / "elsevier-elsarticle" / "main.tex").read_text(encoding="utf-8") == "% custom elsevier\n"


def test_seed_does_not_resurrect_deleted_or_renamed_builtins(templates_root: Path):
    ts.ensure_template_seed()
    ts.delete_template("elsevier-elsarticle")
    ts.update_template("springer-lncs", PaperTemplateUpdateRequest(new_id="lab-lncs"))

    ts.ensure_template_seed()

    ids = _ids(templates_root)
    assert "elsevier-elsarticle" not in ids
    assert "springer-lncs" not in ids
    assert "lab-lncs" in ids


def test_seed_skips_admin_row_that_reuses_a_builtin_id(templates_root: Path):
    _legacy_ieee_only_registry(templates_root)
    data = _registry(templates_root)
    data["templates"].append(
        {"id": "springer-lncs", "slug": "springer-lncs", "title": "Admin LNCS", "format": "springer"}
    )
    (templates_root / "registry.json").write_text(json.dumps(data), encoding="utf-8")
    (templates_root / "springer-lncs").mkdir()
    (templates_root / "springer-lncs" / "main.tex").write_text("% admin lncs\n", encoding="utf-8")

    ts.ensure_template_seed()

    rows = {row["id"]: row for row in _registry(templates_root)["templates"]}
    assert len(rows) == len(EXPECTED_CLASSES)
    assert rows["springer-lncs"]["title"] == "Admin LNCS"
    assert (templates_root / "springer-lncs" / "main.tex").read_text(encoding="utf-8") == "% admin lncs\n"


@pytest.mark.parametrize("template_id", sorted(EXPECTED_CLASSES))
def test_builtin_main_tex_declares_expected_documentclass(templates_root: Path, template_id: str):
    ts.ensure_template_seed()
    cls_name, option, bst = EXPECTED_CLASSES[template_id]

    detail = ts.get_template(template_id)
    assert detail.main_tex
    match = _DOCUMENTCLASS_RE.search(detail.main_tex)
    assert match, "missing \\documentclass"
    assert match.group(2) == cls_name
    assert option in [opt.strip() for opt in (match.group(1) or "").split(",")]
    assert f"\\bibliographystyle{{{bst}}}" in detail.main_tex
    assert "\\bibliography{references}" in detail.main_tex


@pytest.mark.parametrize("spec", PUBLISHER_TEMPLATES, ids=lambda spec: spec.id)
def test_publisher_template_metadata_and_citations(templates_root: Path, spec: BuiltinTemplate):
    ts.ensure_template_seed()

    detail = ts.get_template(spec.id)
    assert detail.title and detail.title_vi
    assert detail.description and detail.description_vi
    assert detail.abstract and detail.abstract_vi
    assert detail.is_official is True
    assert detail.featured is False
    assert detail.format in {"springer", "elsevier"}
    assert detail.venue in {"journal", "conference"}
    assert "Bibliographies" in detail.tags
    assert detail.has_preview and detail.preview_url
    assert detail.has_pdf and detail.pdf_url
    assert spec.sample_title.encode("latin-1") in (templates_root / spec.id / "sample.pdf").read_bytes()

    bib = spec.files["references.bib"]
    bib_keys = set(re.findall(r"@\w+\{([^,\s]+),", bib))
    cited = {
        key.strip() for group in re.findall(r"\\cite\{([^}]+)\}", spec.files["main.tex"]) for key in group.split(",")
    }
    assert cited, "skeleton should cite at least one reference"
    assert cited <= bib_keys


def test_ieee_template_unchanged(templates_root: Path):
    ts.ensure_template_seed()

    detail = ts.get_template("ieee-journal")
    assert detail.main_tex == ts.IEEE_JOURNAL_MAIN_TEX
    assert detail.featured is True
    assert detail.tags == ["Citations", "IEEE Official Templates", "IEEE (all)", "Journal articles", "Bibliographies"]
    assert b"IEEE Journal Template Sample" in (templates_root / "ieee-journal" / "sample.pdf").read_bytes()


@pytest.mark.parametrize(
    ("tag", "expected"),
    [
        ("IEEE", {"ieee-journal"}),
        ("Springer", {"springer-lncs"}),
        ("Elsevier", {"elsevier-elsarticle"}),
        ("Journal", {"ieee-journal", "elsevier-elsarticle"}),
        ("Conference", {"springer-lncs"}),
        ("Bibliographies", set(EXPECTED_CLASSES)),
    ],
)
def test_gallery_quick_filters_match_publisher_and_venue(templates_root: Path, tag: str, expected: set[str]):
    ts.ensure_template_seed()

    assert {item.id for item in ts.list_templates(tag=tag)} == expected


def test_featured_ieee_stays_first_in_gallery(templates_root: Path):
    ts.ensure_template_seed()

    assert ts.list_templates()[0].id == "ieee-journal"


@pytest.mark.parametrize("spec", PUBLISHER_TEMPLATES, ids=lambda spec: spec.id)
def test_publisher_template_opens_with_bib_asset(templates_root: Path, spec: BuiltinTemplate):
    ts.ensure_template_seed()

    files, assets = ts._collect_template_files(spec.id)

    assert [f["path"] for f in files] == ["main.tex"]
    assert [a["name"] for a in assets] == ["references.bib"]


def _run_tex(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=lc._miktex_env(allow_package_install=False),
        capture_output=True,
        text=True,
        errors="ignore",
        timeout=180,
    )


@pytest.mark.parametrize("spec", PUBLISHER_TEMPLATES, ids=lambda spec: spec.id)
def test_publisher_skeleton_compiles_when_class_available(tmp_path: Path, spec: BuiltinTemplate):
    pdflatex = lc.find_pdflatex()
    bibtex = lc.find_bibtex()
    if not pdflatex or not bibtex:
        pytest.skip("pdflatex/bibtex not available")
    for rel_path, content in spec.files.items():
        (tmp_path / rel_path).write_text(content, encoding="utf-8")

    # Never trigger MiKTeX's on-the-fly package installer from the test suite.
    no_install = ["--disable-installer"] if lc._is_miktex() else []
    tex_cmd = [pdflatex, *no_install, "-interaction=nonstopmode", "-halt-on-error", "main.tex"]

    first = _run_tex(tex_cmd, tmp_path)
    log = (
        (tmp_path / "main.log").read_text(encoding="utf-8", errors="ignore") if (tmp_path / "main.log").exists() else ""
    )
    missing = re.search(r"! LaTeX Error: File `([^']+)' not found", log)
    if first.returncode != 0 and missing:
        pytest.skip(f"{missing.group(1)} not installed (needs TeX Live texlive-publishers)")
    assert first.returncode == 0, log[-3000:]

    bib = _run_tex([bibtex, *no_install, "main"], tmp_path)
    if bib.returncode != 0 and "couldn't open style file" in bib.stdout:
        pytest.skip(f"{spec.bibliography_style}.bst not installed")
    assert bib.returncode == 0, bib.stdout[-3000:]

    for _ in range(2):
        result = _run_tex(tex_cmd, tmp_path)
        assert result.returncode == 0, result.stdout[-3000:]

    final_log = (tmp_path / "main.log").read_text(encoding="utf-8", errors="ignore")
    assert (tmp_path / "main.pdf").is_file()
    assert not re.search(r"Citation `[^']+'[^\n]*undefined", final_log)
