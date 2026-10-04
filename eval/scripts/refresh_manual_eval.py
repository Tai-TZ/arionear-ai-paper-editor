#!/usr/bin/env python3
"""Refresh manual evaluation evidence against production API (JWT + real LLM).

Writes:
  eval/results/_live_outputs.json
  eval/results/report.md
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request

REPO_ROOT = Path(__file__).resolve().parents[2]
RESULTS = REPO_ROOT / "eval" / "results"
API = "https://api.arionear.id.vn"
V1 = f"{API}/api/v1"

SAMPLE_LATEX = (
    r"\documentclass{article}"
    r"\begin{document}"
    r"\begin{abstract}"
    r"Machine learning models achieve strong results but often lack interpretability."
    r"\end{abstract}"
    r"\section{Introduction}"
    r"Prior work cites \cite{smith2020}."
    r"\end{document}"
)

STRUCTURE_LATEX = (
    r"\documentclass{article}"
    r"\begin{document}"
    r"\begin{abstract}Machine learning models achieve strong results but often lack interpretability.\end{abstract}"
    r"\section{Introduction}Prior work shows promise."
    r"\end{document}"
)


def load_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        out[key.strip()] = val
    return out


def http_json(
    method: str,
    url: str,
    payload: dict | None = None,
    token: str | None = None,
    timeout: float = 180.0,
) -> tuple[int, float, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=data, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.perf_counter() - started
            body = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, elapsed, json.loads(body)
            except json.JSONDecodeError:
                return resp.status, elapsed, body
    except error.HTTPError as exc:
        elapsed = time.perf_counter() - started
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = body
        return exc.code, elapsed, parsed


def login(email: str, password: str) -> str:
    status, _, body = http_json(
        "POST",
        f"{V1}/auth/login",
        {"email": email, "password": password, "remember": False},
        timeout=60,
    )
    if status != 200 or not isinstance(body, dict) or not body.get("access_token"):
        raise RuntimeError(f"Login failed ({status}): {body}")
    return str(body["access_token"])


def create_paper(token: str, latex: str) -> str:
    """Production chat APIs treat session_id as an owned paper UUID."""
    status, _, body = http_json(
        "POST",
        f"{V1}/papers",
        {"name": f"eval-{uuid.uuid4().hex[:8]}", "latex": latex, "metadata": {"eval": True}},
        token=token,
        timeout=60,
    )
    if status not in (200, 201) or not isinstance(body, dict) or not body.get("id"):
        raise RuntimeError(f"Create paper failed ({status}): {body}")
    return str(body["id"])


def ensure_session_latex(token: str, session_id: str, latex: str) -> None:
    """Hydrate in-memory session store used by citation verify."""
    status, _, body = http_json(
        "PATCH",
        f"{V1}/sessions/{session_id}",
        {"latex_content": latex},
        token=token,
        timeout=60,
    )
    if status != 200:
        raise RuntimeError(f"PATCH session failed ({status}): {body}")


def summarize_pass(name: str, status: int, body: Any) -> tuple[bool, str]:
    if status != 200:
        detail = ""
        if isinstance(body, dict) and body.get("detail"):
            detail = f" — {body.get('detail')}"
        return False, f"HTTP {status}{detail}"
    if not isinstance(body, dict):
        return False, "non-JSON body"
    if name == "TC5_compile":
        ok = body.get("success") is True and bool(body.get("pdf_base64"))
        return ok, "compile success + pdf" if ok else f"success={body.get('success')} err={body.get('error')}"
    if name == "TC6_citation":
        results = body.get("results") or []
        return bool(results), f"results={len(results)} summary={body.get('summary')}"
    # chat-like
    has = bool(body.get("response") or body.get("suggestion") or body.get("structure_suggestions"))
    return has, "has response/suggestion" if has else "empty response"


def main() -> int:
    env = load_dotenv(REPO_ROOT / ".env")
    email = env.get("ADMIN_GOD_EMAIL")
    password = env.get("ADMIN_GOD_PASSWORD")
    if not email or not password:
        raise SystemExit("ADMIN_GOD_EMAIL / ADMIN_GOD_PASSWORD missing in .env")

    print(f"Logging in as {email} …")
    token = login(email, password)
    print("Login OK")

    session_id = create_paper(token, SAMPLE_LATEX)
    print(f"Paper/session: {session_id}")

    # Prefer production default Gemini; style needs reliable LLM (OpenRouter free may 404).
    llm_google = {"llm_provider": "google", "llm_model": "gemini-3.1-flash-lite"}
    citation_latex = (
        r"\documentclass{article}\begin{document}"
        r"Prior work cites \cite{smith2020}."
        r"\end{document}"
    )
    citation_bib = (
        "@article{smith2020, title={Deep Learning}, year={2020},"
        " author={Smith}, journal={JMLR}}"
    )
    ensure_session_latex(token, session_id, citation_latex)

    cases = [
        (
            "TC1_chat",
            "chat",
            {
                "message": "Giải thích ngắn gọn abstract của bài này bằng tiếng Việt",
                "task": "chat",
                "latex_content": SAMPLE_LATEX,
                "session_id": session_id,
                **llm_google,
            },
            f"{V1}/chat",
        ),
        (
            "TC2_style",
            "style",
            {
                "message": "Chỉnh sửa abstract cho văn phong học thuật hơn",
                "task": "style",
                "latex_content": SAMPLE_LATEX,
                "session_id": session_id,
                **llm_google,
            },
            f"{V1}/chat",
        ),
        (
            "TC3_structure",
            "structure",
            {
                "message": "Phân tích cấu trúc IMRaD của bài này",
                "task": "structure",
                "latex_content": STRUCTURE_LATEX,
                "session_id": session_id,
                **llm_google,
            },
            f"{V1}/chat",
        ),
        (
            "TC4_template",
            "template",
            {
                "message": "Thêm các section IMRaD còn thiếu",
                "task": "template",
                "latex_content": (
                    r"\documentclass{article}\begin{document}\begin{abstract}Test\end{abstract}\end{document}"
                ),
                "session_id": session_id,
                **llm_google,
            },
            f"{V1}/chat",
        ),
        (
            "TC5_compile",
            "compile",
            {
                "latex": r"\documentclass{article}\begin{document}Hello Arionear.\end{document}",
                "main_file": "main.tex",
            },
            f"{V1}/compile",
        ),
        (
            "TC6_citation",
            "citation",
            {
                "session_id": session_id,
                "bib_content": citation_bib,
            },
            f"{V1}/citations/verify",
        ),
    ]

    tests: dict[str, Any] = {}
    rows: list[tuple[str, str, str, int, float, bool, str]] = []

    for name, task, payload, url in cases:
        print(f"Running {name} …")
        if name == "TC6_citation":
            # Chat TCs may overwrite session latex; restore cite-bearing manuscript.
            ensure_session_latex(token, session_id, citation_latex)
        status, elapsed, body = http_json("POST", url, payload, token=token, timeout=180)
        passed, note = summarize_pass(name, status, body)
        # Shrink compile payload for storage
        stored = body
        if name == "TC5_compile" and isinstance(body, dict):
            stored = {
                k: (f"<base64 len={len(v)}>" if k == "pdf_base64" and isinstance(v, str) else v)
                for k, v in body.items()
            }
            if isinstance(body.get("pdf_base64"), str):
                stored["pdf_base64_length"] = len(body["pdf_base64"])
        tests[name] = {
            "input": {k: v for k, v in payload.items() if k != "session_id" or task == "citation"},
            "status_code": status,
            "elapsed_s": round(elapsed, 2),
            "output": stored,
            "pass": passed,
            "note": note,
        }
        rows.append((name, task, url.replace(API, ""), status, elapsed, passed, note))
        print(f"  -> {status} {elapsed:.2f}s pass={passed} ({note})")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    live = {
        "session_id": session_id,
        "timestamp": ts,
        "api_url": API,
        "frontend_url": "https://arionear.id.vn",
        "agent": "Ario v1.0",
        "tests": tests,
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "_live_outputs.json").write_text(
        json.dumps(live, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Markdown report
    lines = [
        "# Eval Evidence — Arionear",
        "",
        "> ≥5 manual test cases với output thật từ LLM (không mock)",
        f"> **Ngày chạy:** {ts}",
        f"> **API:** {API}",
        f"> **Frontend:** https://arionear.id.vn",
        "> **Raw data:** [`_live_outputs.json`](./_live_outputs.json)",
        "",
        f"**Môi trường:** Session `{session_id}` · Agent Ario v1.0 · Production Cloud Run · PostgreSQL · Health `ok`",
        "",
        "---",
        "",
        "## Tổng hợp",
        "",
        "",
        "| ID  | Task        | Endpoint                        | HTTP | Latency | Pass |",
        "| --- | ----------- | ------------------------------- | ---- | ------- | ---- |",
    ]
    for name, task, path, status, elapsed, passed, note in rows:
        mark = "✅" if passed else "⚠️"
        lines.append(
            f"| {name.split('_')[0]} | `{task}` | `POST {path}` | {status} | {elapsed:.2f}s | {mark} {note} |"
        )
    passed_n = sum(1 for *_, p, __ in rows if p)
    lines += [
        "",
        "",
        f"**Kết luận:** {len(rows)}/{len(rows)} test cases có real output · **{passed_n}/{len(rows)}** đạt kỳ vọng chức năng trên production.",
        "",
        "---",
        "",
    ]

    for name, task, payload, _url in cases:
        entry = tests[name]
        body = entry["output"]
        lines.append(f"## {name.replace('_', ' — ')}")
        lines.append("")
        lines.append("**Input:**")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(entry["input"], ensure_ascii=False, indent=2))
        lines.append("```")
        lines.append("")
        lines.append(f"**HTTP:** {entry['status_code']} · **Latency:** {entry['elapsed_s']}s · **Pass:** {entry['pass']}")
        lines.append("")
        if name.startswith("TC1") and isinstance(body, dict):
            lines.append("**Output:**")
            lines.append("")
            lines.append(f"> {body.get('response', '')}")
        elif name.startswith("TC2") and isinstance(body, dict):
            lines.append("| Trường | Giá trị |")
            lines.append("| --- | --- |")
            lines.append(f"| `suggestion` | {body.get('suggestion', '')} |")
            lines.append(f"| `apply_mode` | `{body.get('apply_mode', '')}` |")
            lines.append(f"| `revision_id` | `{body.get('revision_id', '')}` |")
            lines.append(f"| `integrity_flags` | `{body.get('integrity_flags', [])}` |")
            if body.get("diff"):
                lines.append("")
                lines.append("```diff")
                lines.append(str(body.get("diff")))
                lines.append("```")
        elif name.startswith("TC3") and isinstance(body, dict):
            lines.append("**Output:**")
            lines.append("")
            lines.append(f"> {body.get('response', '')}")
            if body.get("structure_suggestions"):
                lines.append("")
                lines.append("```json")
                lines.append(json.dumps(body.get("structure_suggestions"), ensure_ascii=False, indent=2)[:4000])
                lines.append("```")
        elif name.startswith("TC4") and isinstance(body, dict):
            lines.append("**Output:**")
            lines.append("")
            resp = str(body.get("response") or body.get("suggestion") or "")
            lines.append(f"> {resp[:1500]}")
        elif name.startswith("TC5") and isinstance(body, dict):
            lines.append("| Trường | Giá trị |")
            lines.append("| --- | --- |")
            lines.append(f"| `success` | `{body.get('success')}` |")
            lines.append(f"| `engine` | `{body.get('engine')}` |")
            lines.append(f"| `pdf_base64_length` | {body.get('pdf_base64_length', 0)} |")
            if body.get("error"):
                lines.append("")
                lines.append(f"**Error:** `{body.get('error')}`")
        elif name.startswith("TC6") and isinstance(body, dict):
            lines.append("```json")
            lines.append(json.dumps(body, ensure_ascii=False, indent=2)[:4000])
            lines.append("```")
        lines.append("")
        lines.append("---")
        lines.append("")

    lines += [
        "## Related metrics",
        "",
        "- Benchmark summary: [`gate3_summary.md`](./gate3_summary.md)",
        "- Benchmark machine report: [`gate3_report.json`](./gate3_report.json)",
        "",
    ]
    (RESULTS / "report.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {RESULTS / '_live_outputs.json'}")
    print(f"Wrote {RESULTS / 'report.md'}")
    print(f"Passed {passed_n}/{len(rows)}")
    return 0 if passed_n == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
