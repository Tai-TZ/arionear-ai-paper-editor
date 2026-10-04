#!/usr/bin/env python3
"""Regenerate the dependency tables in THIRD_PARTY_NOTICES.md from pip-licenses / license-checker JSON.

Only the blocks between ``<!-- BEGIN:<name> -->`` and ``<!-- END:<name> -->`` markers are rewritten
(``license-summary``, ``python-deps``, ``frontend-deps``); the hand-written sections (assets, fonts,
data sources, copyleft notes) are left as they are.

Usage, from the repo root. Both lists are resolved for Linux x86_64, the platform of the Docker images
(on Windows, pass pip-licenses the absolute path of ``/tmp/licvenv/Scripts/python.exe``):

    # 1. Production closure of requirements.txt in a throwaway venv (no dev tools in it)
    uv venv --python 3.11 /tmp/licvenv
    uv pip install --python /tmp/licvenv --python-platform x86_64-manylinux_2_28 -r requirements.txt
    uvx pip-licenses==5.5.5 --python /tmp/licvenv/bin/python --from=mixed --with-urls \
        --format=json --output-file /tmp/py-licenses.json

    # 2. Frontend production dependencies (--os/--cpu/--libc pick the Linux optional binaries)
    (cd frontend && npm ci --os=linux --cpu=x64 --libc=glibc && npx --yes license-checker-rseidelsohn@4.4.2 \
        --production --excludePrivatePackages --json --out /tmp/npm-licenses.json)

    # 3. Rewrite the tables, then review the diff (copyleft and UNKNOWN entries are printed);
    #    run a plain `npm ci` in frontend/ afterwards to get your own platform's binaries back
    python scripts/generate_third_party_notices.py --python-json /tmp/py-licenses.json --npm-json /tmp/npm-licenses.json

License strings are shown as the tools report them, except where the report is ambiguous (a bare
"BSD License" classifier, license text pasted into the metadata field, no metadata at all). Those
are resolved by ``PYTHON_OVERRIDES``, each checked against the package's own LICENSE file or
metadata; an override only applies while the tool still reports the string it was written for.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

NOTICES = Path(__file__).resolve().parents[1] / "THIRD_PARTY_NOTICES.md"

# Classifier spellings that map to exactly one SPDX identifier.
ALIASES = {
    "MIT License": "MIT",
    "Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
}

# package -> (string pip-licenses reports, SPDX expression to show, where it was verified)
PYTHON_OVERRIDES: dict[str, tuple[str, str, str]] = {
    "bcrypt": ("Apache Software License", "Apache-2.0", "License metadata"),
    "distro": ("Apache Software License", "Apache-2.0", "License metadata"),
    "google-auth": ("Apache Software License", "Apache-2.0", "License metadata"),
    "jcs": ("Apache Software License", "Apache-2.0", "License metadata"),
    "requests": ("Apache Software License", "Apache-2.0", "License metadata"),
    "requests-toolbelt": ("Apache Software License", "Apache-2.0", "License metadata"),
    "tenacity": ("Apache Software License", "Apache-2.0", "License metadata"),
    "httpx": ("BSD License", "BSD-3-Clause", "License metadata"),
    "jsonpatch": ("BSD License", "BSD-3-Clause", "LICENSE file"),
    "jsonpointer": ("BSD License", "BSD-3-Clause", "License metadata: Modified BSD License"),
    "pyasn1_modules": ("BSD License", "BSD-2-Clause", "LICENSE file"),
    "qrcode": ("BSD License; Other/Proprietary License", "BSD-3-Clause AND MIT", "LICENSE file"),
    "sniffio": ("Apache Software License; MIT License", "Apache-2.0 OR MIT", "License metadata: MIT OR Apache-2.0"),
    "uvloop": ("Apache Software License; MIT License", "Apache-2.0 OR MIT", "README: dual-licensed"),
    "psycopg2-binary": (
        "GNU Library or Lesser General Public License (LGPL)",
        "LGPL-3.0-or-later (with OpenSSL exception)",
        "LICENSE file",
    ),
    "pypdfium2": (
        "BSD-3-Clause, Apache-2.0, dependency licenses",
        "Apache-2.0 / BSD-3-Clause (+ bundled PDFium deps)",
        "README: Licensing",
    ),
    "inngest": ("UNKNOWN", "Apache-2.0", "upstream LICENSE.md at tag inngest@0.5.19"),
}

# Packages whose metadata License field holds the full license text instead of an identifier.
PYTHON_TEXT_LICENSES = {"tiktoken": ("MIT License", "MIT")}

COPYLEFT = re.compile(r"\b(A?GPL|LGPL|MPL|EPL|EUPL|CDDL|LPPL|CC-BY-SA)", re.IGNORECASE)


def python_rows(data: list[dict]) -> list[tuple[str, str, str, str]]:
    rows = []
    for pkg in data:
        name = pkg["Name"]
        reported = pkg["License"].strip()
        license_ = ALIASES.get(reported, reported)
        if name in PYTHON_OVERRIDES:
            expected, spdx, _source = PYTHON_OVERRIDES[name]
            if reported == expected:
                license_ = spdx
            else:
                print(f"note: override for {name} skipped (now reports {reported!r})", file=sys.stderr)
        if name in PYTHON_TEXT_LICENSES:
            prefix, spdx = PYTHON_TEXT_LICENSES[name]
            if reported.startswith(prefix):
                license_ = spdx
        if "\n" in license_:
            license_ = "UNKNOWN (license text in metadata)"
        url = pkg.get("URL") or "UNKNOWN"
        rows.append((name, pkg["Version"], license_, f"https://pypi.org/project/{name}/" if url == "UNKNOWN" else url))
    return sorted(rows, key=lambda r: r[0].lower())


def npm_rows(data: dict[str, dict]) -> list[tuple[str, str, str, str]]:
    rows = []
    for key, info in data.items():
        name, _, version = key.rpartition("@")
        license_ = info.get("licenses", "UNKNOWN")
        if isinstance(license_, list):  # several license files/fields found; listed without implying AND/OR
            license_ = "; ".join(license_)
        url = info.get("repository") or f"https://www.npmjs.com/package/{name}"
        rows.append((name, version, license_, url))
    return sorted(rows, key=lambda r: (r[0].lower(), r[1]))


def cell(text: str) -> str:
    return text.replace("|", "\\|")


def table(rows: list[tuple[str, str, str, str]]) -> str:
    lines = ["| Package | Version | License | URL |", "| --- | --- | --- | --- |"]
    for name, version, license_, url in rows:
        mark = " †" if COPYLEFT.search(license_) else ""
        lines.append(f"| {cell(name)} | {cell(version)} | {cell(license_)}{mark} | <{url}> |")
    return "\n".join(lines)


def summary(py: list[tuple[str, str, str, str]], fe: list[tuple[str, str, str, str]]) -> str:
    py_count = Counter(r[2] for r in py)
    fe_count = Counter(r[2] for r in fe)
    licenses = sorted(set(py_count) | set(fe_count), key=lambda lic: (-(py_count[lic] + fe_count[lic]), lic))
    lines = ["| License | Python | Frontend |", "| --- | ---: | ---: |"]
    for lic in licenses:
        mark = " †" if COPYLEFT.search(lic) else ""
        lines.append(f"| {cell(lic)}{mark} | {py_count[lic] or '—'} | {fe_count[lic] or '—'} |")
    lines.append(f"| **Total** | **{len(py)}** | **{len(fe)}** |")
    return "\n".join(lines)


def replace_block(text: str, name: str, body: str) -> str:
    pattern = re.compile(rf"(<!-- BEGIN:{name} -->\n).*?(<!-- END:{name} -->)", re.DOTALL)
    if not pattern.search(text):
        sys.exit(f"marker <!-- BEGIN:{name} --> not found in {NOTICES.name}")
    return pattern.sub(lambda m: m.group(1) + body + "\n" + m.group(2), text)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--python-json", required=True, type=Path, help="pip-licenses --format=json output")
    parser.add_argument("--npm-json", required=True, type=Path, help="license-checker-rseidelsohn --json output")
    args = parser.parse_args()

    py = python_rows(json.loads(args.python_json.read_text(encoding="utf-8")))
    fe = npm_rows(json.loads(args.npm_json.read_text(encoding="utf-8")))

    text = NOTICES.read_text(encoding="utf-8")
    text = replace_block(text, "license-summary", summary(py, fe))
    text = replace_block(text, "python-deps", table(py))
    text = replace_block(text, "frontend-deps", table(fe))
    NOTICES.write_text(text, encoding="utf-8", newline="\n")

    print(f"{NOTICES.name}: {len(py)} Python + {len(fe)} frontend packages")
    for name, version, license_, _url in py + fe:
        if COPYLEFT.search(license_) or "UNKNOWN" in license_.upper():
            print(f"  review: {name} {version}: {license_}")


if __name__ == "__main__":
    main()
