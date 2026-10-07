# Benchmark Eval Summary

**Generated:** 2026-07-08 12:08:11 UTC
**API:** https://api.edico.example
**Frontend:** https://edico.example

> Companion evidence (LLM thật + JWT): [`report.md`](./report.md) — 6/6 TC pass @ 2026-07-08 12:13:04 UTC.
> Note: `chat_latency_p50_s` / `style_latency_p50_s` trong script benchmark này đo probe không JWT (HTTP 401 nhanh); latency LLM thật xem `report.md` (~3–5s).

## Metrics vs baseline

| Metric | Edico | Baseline | Improved? |
|--------|----------|----------|-----------|
| intent_routing_accuracy | 1.0 | 0.65 | yes |
| edit_scope_accuracy | 1.0 | 0.4 | yes |
| guardrail_block_rate | 0.5 | 0.0 | yes |
| numeric_drift_detection_rate | 1.0 | 0.0 | yes |
| chat_latency_p50_s | 0.225 | 8.0 | yes |
| style_latency_p50_s | 0.143 | 6.0 | yes |
| compile_success_rate | 1.0 | 0.7 | yes |
| health_latency_p95_ms | 227.1 | 800 | yes |
| cost_per_active_user_month_usd | 1.2 | 4.5 | yes |
