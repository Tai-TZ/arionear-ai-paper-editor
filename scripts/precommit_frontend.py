#!/usr/bin/env python3
"""pre-commit hook: Prettier + ESLint on the staged frontend files.

pre-commit passes paths relative to the repo root; the frontend tooling runs from ``frontend/``.
"""

from __future__ import annotations

import shutil
import subprocess
import sys

PREFIX = "frontend/"


def main(paths: list[str]) -> int:
    files = [p[len(PREFIX) :] for p in paths if p.startswith(PREFIX)]
    if not files:
        return 0
    npx = shutil.which("npx") or "npx"
    failed = subprocess.run([npx, "prettier", "--check", *files], cwd="frontend").returncode != 0
    lintable = [f for f in files if f.startswith("src/") and f.endswith((".ts", ".tsx"))]
    if lintable:
        eslint = subprocess.run([npx, "eslint", "--max-warnings", "0", *lintable], cwd="frontend")
        failed = failed or eslint.returncode != 0
    if failed:
        print("Fix with: cd frontend && npx prettier --write . && npx eslint --fix <files>")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
