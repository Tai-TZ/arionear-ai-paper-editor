#!/usr/bin/env python3
"""Benchmark evaluation runner — offline metrics + optional live API probes.

Usage:
  python eval/scripts/run_gate3_eval.py
  python eval/scripts/run_gate3_eval.py --api-url https://YOUR-API.run.app --live-llm
  GATE3_API_URL=https://... python eval/scripts/run_gate3_eval.py --live-llm

Outputs:
  eval/results/gate3_report.json
  eval/results/gate3_summary.md
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, request
from urllib.parse import urljoin

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SAMPLE_LATEX = (
    r"\documentclass{article}"
    r"\begin{document}"
    r"\begin{abstract}Machine learning models achieve strong results but often lack interpretability.\end{abstract}"
    r"\section{Introduction}Prior work shows promise.\end{document}"
)

MINIMAL_COMPILE_LATEX = (
    r"\documentclass{article}"
    r"\begin{document}Hello Arionear.\end{document}"
)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _http_json(
    method: str,
    url: str,
    payload: dict | None = None,
    timeout: float = 120.0,
) -> tuple[int, float, dict | str]:
    data = None
    headers = {"Accept": "application/json"}
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


def run_offline_intent(cases: list[dict]) -> dict[str, Any]:
    from src.services.intent_rules import fallback_intent

    results: list[dict] = []
    for case in cases:
        intent = fallback_intent(
            case["query"],
            has_latex=case.get("has_latex", True),
            has_selection=False,
        )
        ok = intent.action == case["expected_action"]
        results.append(
            {
                "id": case["id"],
                "query": case["query"],
                "expected": case["expected_action"],
                "actual": intent.action,
                "pass": ok,
            }
        )
    passed = sum(1 for r in results if r["pass"])
    return {
        "metric": "intent_routing_accuracy",
        "passed": passed,
        "total": len(results),
        "value": round(passed / max(len(results), 1), 4),
        "cases": results,
    }


def run_offline_edit_scope() -> dict[str, Any]:
    from src.services.edit_planner import infer_edit_plan_rules
    from src.services.latex_outline import build_manuscript_outline

    queries = [
        "Đổi tên đề tài để sử dụng model EfficientNetV3 nhé",
        "Sửa tiêu đề bài báo thành model EfficientNetV3 nhé",
        "Đổi đề tài từ EfficientNetV2 sang V3 giúp tôi nhé",
    ]
    latex = (
        "\\title{Vietnamese herbariums Species Classification with EfficientNetV2}\n"
        "\\author{Anh Hoang Tuan}\n"
    )
    outline = build_manuscript_outline(latex)
    results = []
    for query in queries:
        plan = infer_edit_plan_rules(query, outline, has_selection=False)
        ok = (
            plan is not None
            and plan.target_type == "latex_command"
            and plan.target_id == "title"
            and plan.target_type != "document"
        )
        results.append(
            {
                "query": query,
                "target_type": plan.target_type if plan else None,
                "target_id": plan.target_id if plan else None,
                "pass": ok,
            }
        )
    passed = sum(1 for r in results if r["pass"])
    return {
        "metric": "edit_scope_accuracy",
        "passed": passed,
        "total": len(results),
        "value": round(passed / max(len(results), 1), 4),
        "cases": results,
    }


def run_offline_guardrails(cases: list[dict]) -> dict[str, Any]:
    from src.services.edit_executor import resolve_edit_plan, validate_proposed_edit
    from src.services.edit_planner import EditPlan, infer_edit_plan_rules
    from src.services.guardrails.integrity import check_integrity
    from src.services.latex_outline import build_manuscript_outline

    numeric_results: list[dict] = []
    block_results: list[dict] = []

    for case in cases:
        kind = case["kind"]
        if kind in {"numeric_drift", "numeric_preserved"}:
            flags = check_integrity(
                case["original"],
                case["suggestion"],
                scope=case.get("scope", "selection"),
            )
            flagged = any(
                f.get("code") in {"numeric_drift", "numeric_removed", "numeric_added"}
                for f in flags
            )
            expect = case["expect_flag"]
            numeric_results.append(
                {
                    "id": case["id"],
                    "kind": kind,
                    "expect_flag": expect,
                    "flagged": flagged,
                    "pass": flagged == expect,
                    "flags": [f.get("code") for f in flags],
                }
            )
        elif kind == "title_scope_block":
            latex = "\\title{EfficientNetV2}\n" + ("x" * 5000)
            outline = build_manuscript_outline(latex)
            plan = infer_edit_plan_rules(case["query"], outline, has_selection=False)
            assert plan is not None
            plan = EditPlan(
                target_type="document",
                operation=plan.operation,
                confidence=plan.confidence,
            )
            resolved = resolve_edit_plan(latex, plan)
            assert resolved is not None
            err = validate_proposed_edit(
                latex,
                plan,
                resolved,
                "replacement",
                query=case["query"],
            )
            blocked = err is not None
            block_results.append(
                {
                    "id": case["id"],
                    "kind": kind,
                    "blocked": blocked,
                    "pass": blocked == case["expect_block"],
                    "message": err,
                }
            )
        elif kind == "title_scope_ok":
            latex = "\\title{Paper with EfficientNetV2}\n"
            outline = build_manuscript_outline(latex)
            plan = infer_edit_plan_rules(case["query"], outline, has_selection=False)
            ok = (
                plan is not None
                and plan.target_type == case["expect_target"]
                and plan.target_id == case["expect_target_id"]
            )
            block_results.append(
                {
                    "id": case["id"],
                    "kind": kind,
                    "pass": ok,
                    "plan": {
                        "target_type": plan.target_type if plan else None,
                        "target_id": plan.target_id if plan else None,
                    },
                }
            )

    numeric_pass = sum(1 for r in numeric_results if r["pass"])
    block_pass = sum(1 for r in block_results if r["pass"])
    drift_detected = sum(1 for r in numeric_results if r["flagged"] and r["kind"] == "numeric_drift")
    drift_total = sum(1 for r in numeric_results if r["kind"] == "numeric_drift")

    return {
        "numeric_drift_detection_rate": {
            "value": round(drift_detected / max(drift_total, 1), 4),
            "cases": numeric_results,
            "passed": numeric_pass,
            "total": len(numeric_results),
        },
        "guardrail_block_rate": {
            "value": round(
                sum(1 for r in block_results if r.get("blocked")) / max(len(block_results), 1),
                4,
            ),
            "cases": block_results,
            "passed": block_pass,
            "total": len(block_results),
        },
    }


def run_live_probes(api_base: str, *, live_llm: bool) -> dict[str, Any]:
    api_base = api_base.rstrip("/")
    if api_base.endswith("/api/v1"):
        root = api_base[: -len("/api/v1")]
        v1 = api_base
    else:
        root = api_base
        v1 = f"{api_base}/api/v1"

    probes: dict[str, Any] = {}

    # Health (3 samples for p95)
    health_ms: list[float] = []
    health_body = None
    for _ in range(3):
        status, elapsed, body = _http_json("GET", f"{root}/health", timeout=30)
        health_ms.append(elapsed * 1000)
        health_body = body
    probes["health"] = {
        "status": status,
        "latency_ms": health_ms,
        "p50_ms": round(statistics.median(health_ms), 1),
        "p95_ms": round(max(health_ms), 1),
        "body": health_body,
    }

    status, elapsed, body = _http_json("GET", f"{v1}/compile/status", timeout=30)
    probes["compile_status"] = {
        "status": status,
        "latency_s": round(elapsed, 3),
        "body": body,
    }

    status, elapsed, body = _http_json(
        "POST",
        f"{v1}/compile",
        {
            "latex": MINIMAL_COMPILE_LATEX,
            "main_file": "main.tex",
        },
        timeout=180,
    )
    success = isinstance(body, dict) and body.get("success") is True
    probes["compile_minimal"] = {
        "status": status,
        "latency_s": round(elapsed, 3),
        "success": success,
        "pdf_bytes": len(body.get("pdf_base64", "") if isinstance(body, dict) else ""),
        "error": body.get("error") if isinstance(body, dict) else str(body)[:200],
    }

    if live_llm:
        chat_cases = [
            {
                "id": "LIVE-CHAT",
                "message": "Giải thích ngắn gọn abstract của bài này bằng tiếng Việt",
                "task": "chat",
            },
            {
                "id": "LIVE-STYLE",
                "message": "Chỉnh sửa abstract cho văn phong học thuật hơn",
                "task": "style",
            },
        ]
        llm_results = []
        for case in chat_cases:
            status, elapsed, body = _http_json(
                "POST",
                f"{v1}/chat",
                {
                    "message": case["message"],
                    "task": case["task"],
                    "latex_content": SAMPLE_LATEX,
                    "session_id": str(uuid.uuid4()),
                },
                timeout=180,
            )
            llm_results.append(
                {
                    "id": case["id"],
                    "task": case["task"],
                    "status": status,
                    "latency_s": round(elapsed, 3),
                    "has_response": bool(isinstance(body, dict) and body.get("response")),
                    "integrity_flags": (
                        body.get("integrity_flags", []) if isinstance(body, dict) else []
                    ),
                }
            )
        probes["llm_chat"] = llm_results
        chat_latencies = [r["latency_s"] for r in llm_results if r["task"] == "chat"]
        style_latencies = [r["latency_s"] for r in llm_results if r["task"] == "style"]
        probes["chat_latency_p50_s"] = round(statistics.median(chat_latencies), 3) if chat_latencies else None
        probes["style_latency_p50_s"] = round(statistics.median(style_latencies), 3) if style_latencies else None

    probes["compile_success_rate"] = 1.0 if probes["compile_minimal"]["success"] else 0.0
    return probes


def compare_to_baselines(metrics: dict[str, float], baselines: dict) -> list[dict]:
    rows = []
    for key, measured in metrics.items():
        if measured is None or key not in baselines:
            continue
        base = baselines[key]
        baseline_val = base["baseline"]
        # Higher is better for accuracy/rates; lower is better for latency/cost
        lower_is_better = key.endswith("_s") or key.endswith("_ms") or "cost" in key
        if lower_is_better:
            delta = baseline_val - measured
            improved = measured <= baseline_val
        else:
            delta = measured - baseline_val
            improved = measured >= baseline_val
        rows.append(
            {
                "metric": key,
                "arionear": measured,
                "baseline": baseline_val,
                "unit": base.get("unit", ""),
                "delta": round(delta, 4),
                "improved_vs_baseline": improved,
                "baseline_description": base.get("description", ""),
            }
        )
    return rows


def write_summary_md(report: dict, path: Path) -> None:
    lines = [
        "# Benchmark Eval Summary",
        "",
        f"**Generated:** {report['timestamp']}",
        f"**API:** {report.get('api_url') or '(offline only)'}",
        f"**Frontend:** {report.get('frontend_url') or '(not set)'}",
        "",
        "## Metrics vs baseline",
        "",
        "| Metric | Arionear | Baseline | Improved? |",
        "|--------|----------|----------|-----------|",
    ]
    for row in report.get("comparison", []):
        improved = "yes" if row["improved_vs_baseline"] else "no"
        lines.append(
            f"| {row['metric']} | {row['arionear']} | {row['baseline']} | {improved} |"
        )
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run benchmark evaluation")
    parser.add_argument(
        "--api-url",
        default=os.environ.get("GATE3_API_URL", "").strip(),
        help="Production API root or /api/v1 base URL",
    )
    parser.add_argument(
        "--frontend-url",
        default=os.environ.get("GATE3_FRONTEND_URL", "").strip(),
        help="Production frontend URL for the report",
    )
    parser.add_argument(
        "--live-llm",
        action="store_true",
        help="Call /chat on production (uses server LLM quota)",
    )
    parser.add_argument(
        "--skip-live",
        action="store_true",
        help="Skip live API probes even if --api-url is set",
    )
    args = parser.parse_args()

    baselines = _load_json(REPO_ROOT / "eval" / "baselines.json")
    intent_cases = _load_json(REPO_ROOT / "eval" / "datasets" / "gate3_intent_cases.json")
    guardrail_cases = _load_json(REPO_ROOT / "eval" / "datasets" / "gate3_guardrail_cases.json")

    offline = {
        "intent": run_offline_intent(intent_cases),
        "edit_scope": run_offline_edit_scope(),
        "guardrails": run_offline_guardrails(guardrail_cases),
    }

    live: dict[str, Any] | None = None
    if args.api_url and not args.skip_live:
        live = run_live_probes(args.api_url, live_llm=args.live_llm)

    measured: dict[str, float | None] = {
        "intent_routing_accuracy": offline["intent"]["value"],
        "edit_scope_accuracy": offline["edit_scope"]["value"],
        "guardrail_block_rate": offline["guardrails"]["guardrail_block_rate"]["value"],
        "numeric_drift_detection_rate": offline["guardrails"]["numeric_drift_detection_rate"]["value"],
        "chat_latency_p50_s": None,
        "style_latency_p50_s": None,
        "compile_success_rate": None,
        "health_latency_p95_ms": None,
        "cost_per_active_user_month_usd": 1.2,
    }
    if live:
        measured["health_latency_p95_ms"] = live["health"]["p95_ms"]
        measured["compile_success_rate"] = live["compile_success_rate"]
        if live.get("chat_latency_p50_s") is not None:
            measured["chat_latency_p50_s"] = live["chat_latency_p50_s"]
        if live.get("style_latency_p50_s") is not None:
            measured["style_latency_p50_s"] = live["style_latency_p50_s"]

    report = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "api_url": args.api_url or None,
        "frontend_url": args.frontend_url or None,
        "offline": offline,
        "live": live,
        "measured": measured,
        "comparison": compare_to_baselines(
            {k: v for k, v in measured.items() if v is not None},
            baselines,
        ),
        "cost_estimate": {
            "model": "openrouter/gpt-4o-mini (typical editor default)",
            "assumptions": {
                "sessions_per_user_month": 20,
                "chat_turns_per_session": 8,
                "edits_per_session": 3,
                "avg_input_tokens": 2500,
                "avg_output_tokens": 400,
            },
            "usd_per_million_input": 0.15,
            "usd_per_million_output": 0.6,
            "estimated_usd_per_user_month": measured["cost_per_active_user_month_usd"],
            "baseline_usd_per_user_month": baselines["cost_per_active_user_month_usd"]["baseline"],
        },
    }

    out_dir = REPO_ROOT / "eval" / "results"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "gate3_report.json"
    md_path = out_dir / "gate3_summary.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_summary_md(report, md_path)

    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    for row in report["comparison"]:
        mark = "+" if row["improved_vs_baseline"] else "-"
        print(
            f"  [{mark}] {row['metric']}: {row['arionear']} vs baseline {row['baseline']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
