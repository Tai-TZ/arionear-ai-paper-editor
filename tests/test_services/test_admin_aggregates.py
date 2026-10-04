"""Admin aggregates computed in SQL must equal the previous row-by-row Python results."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event, func, or_

from src.config import get_settings
from src.db import engine as engine_mod
from src.db.engine import get_db, init_db, reset_db_state
from src.db.models import AiSession, Paper, TaskType, User, UserRole
from src.services import admin_service
from src.services.llm_policy import cost_rate_per_token, get_llm_limits_from_profile
from src.services.usage_tracking import effective_tokens_expr

NOW = datetime.now(UTC)


@pytest.fixture
def seeded(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'admin.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DIRECT_DATABASE_URL", url)
    monkeypatch.setenv("APP_ENV", "test")
    get_settings.cache_clear()
    reset_db_state()
    assert init_db()
    _seed()
    yield
    reset_db_state()
    get_settings.cache_clear()


def _user(db, email, *, role=UserRole.RESEARCHER, active=True, profile=None, age_days=0.0) -> User:
    user = User(
        email=email,
        full_name=email.split("@")[0].title(),
        role=role,
        is_active=active,
        profile_settings=profile or {},
        created_at=NOW - timedelta(days=age_days),
    )
    db.add(user)
    db.flush()
    return user


def _usage(db, user, *, tokens=0, output="answer", user_input="question", meta=None, age_days=0.0) -> None:
    paper = Paper(user_id=user.id, title="p")
    db.add(paper)
    db.flush()
    db.add(
        AiSession(
            paper_id=paper.id,
            user_id=user.id,
            task_type=TaskType.CHAT,
            user_input=user_input,
            ai_output=output,
            tokens_used=tokens,
            metadata_=meta or {},
            created_at=NOW - timedelta(days=age_days),
        )
    )


def _seed() -> None:
    with get_db() as db:
        admin = _user(db, "admin@test.local", role=UserRole.ADMIN, age_days=100)
        heavy = _user(
            db,
            "heavy@test.local",
            profile={
                "default_llm_provider": "google",
                "default_llm_model": "gemini-x",
                "llm_limits": {"daily_token_max": 100},
            },
            age_days=0.2,
        )
        idle = _user(db, "idle@test.local", active=False, profile={"default_llm_provider": ""}, age_days=5)
        capped = _user(db, "capped@test.local", profile={"llm_limits": {"monthly_cost_cap_usd": 0}}, age_days=20)
        _user(db, "old@test.local", profile={"default_llm_model": " spaced "}, age_days=45)

        _usage(db, heavy, tokens=60, meta={"llm_provider": "google", "llm_model": "gemini-x"})
        _usage(db, heavy, tokens=70, meta={"llm_provider": "google", "llm_model": "gemini-x"})
        _usage(db, heavy, tokens=5, meta={"llm_provider": "openrouter"})
        _usage(db, heavy, tokens=9, meta={"llm_model": "solo-model"}, age_days=40)
        _usage(db, heavy, tokens=0, output="x" * 400, meta={"llm_provider": "zai", "llm_model": "glm"})
        _usage(db, heavy, tokens=0, output="", user_input="", meta={"llm_provider": "google"})  # placeholder
        _usage(db, idle, tokens=0, output="", user_input="only input", meta={})
        _usage(db, admin, tokens=1000, meta={"llm_provider": "google", "llm_model": "gemini-x"}, age_days=33)
        _usage(db, capped, tokens=3, meta={"task": "chat"})


# --- the previous Python implementations (reference) ------------------------------------------------


def _legacy_filter():
    return or_(
        AiSession.tokens_used > 0,
        func.coalesce(func.length(AiSession.ai_output), 0) > 0,
        func.coalesce(func.length(AiSession.user_input), 0) > 0,
    )


def _legacy_owner():
    return func.coalesce(AiSession.user_id, Paper.user_id)


def _legacy_window(db, start, end) -> dict[str, int]:
    rows = (
        db.query(_legacy_owner(), func.coalesce(func.sum(effective_tokens_expr()), 0))
        .outerjoin(Paper, AiSession.paper_id == Paper.id)
        .filter(_legacy_owner().isnot(None), _legacy_filter())
        .filter(AiSession.created_at >= start, AiSession.created_at < end)
        .group_by(_legacy_owner())
        .all()
    )
    return {str(uid): int(tok or 0) for uid, tok in rows if uid}


def _legacy_usage(db, start=None, end=None) -> dict[str, tuple[int, int]]:
    query = (
        db.query(_legacy_owner(), func.coalesce(func.sum(effective_tokens_expr()), 0), func.count(AiSession.id))
        .outerjoin(Paper, AiSession.paper_id == Paper.id)
        .filter(_legacy_owner().isnot(None), _legacy_filter())
    )
    if start is not None:
        query = query.filter(AiSession.created_at >= start, AiSession.created_at < end)
    return {str(uid): (int(tok or 0), int(n or 0)) for uid, tok, n in query.group_by(_legacy_owner()).all() if uid}


def _legacy_summary(db) -> dict:
    day_start, day_end, month_start, month_end = admin_service._today_month_windows()
    users = db.query(User).all()
    usage = _legacy_usage(db)
    today = _legacy_window(db, day_start, day_end)
    month = _legacy_window(db, month_start, month_end)
    rate = cost_rate_per_token()
    over_token = over_cost = 0
    for user in users:
        limits = get_llm_limits_from_profile(user.profile_settings)
        if today.get(str(user.id), 0) >= limits.daily_token_max:
            over_token += 1
        if round(month.get(str(user.id), 0) * rate, 4) >= limits.monthly_cost_cap_usd:
            over_cost += 1
    return {
        "total_users": len(users),
        "active_users": sum(1 for u in users if u.is_active),
        "admin_users": sum(1 for u in users if u.role == UserRole.ADMIN),
        "total_tokens": sum(t for t, _ in usage.values()),
        "total_sessions": sum(n for _, n in usage.values()),
        "today_tokens": sum(today.values()),
        "users_over_token_cap": over_token,
        "users_over_cost_cap": over_cost,
    }


def _legacy_model_usage(db) -> set[tuple[str, str, int, int]]:
    rows = db.query(AiSession.metadata_, effective_tokens_expr()).filter(_legacy_filter()).all()
    agg: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for meta, tokens in rows:
        md = meta or {}
        provider = str(md.get("llm_provider") or "").strip()
        model = str(md.get("llm_model") or "").strip()
        if not provider and not model:
            continue
        agg[(provider or "—", model or "—")][0] += 1
        agg[(provider or "—", model or "—")][1] += int(tokens or 0)
    return {(p, m, n, t) for (p, m), (n, t) in agg.items()}


def _legacy_preferences(db) -> list[tuple[str, str, int]]:
    settings = get_settings()
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for user in db.query(User).all():
        prof = user.profile_settings or {}
        provider = str(prof.get("default_llm_provider") or settings.llm_provider).strip()
        model = str(prof.get("default_llm_model") or settings.model_name).strip()
        counts[(provider, model)] += 1
    return sorted(((p, m, c) for (p, m), c in counts.items()), key=lambda r: (-r[2], r[0], r[1]))


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


# --- tests --------------------------------------------------------------------------------------------


def test_usage_summary_matches_legacy(seeded):
    with get_db() as db:
        summary = admin_service.get_usage_summary(db).model_dump()
        expected = _legacy_summary(db)
    assert {k: summary[k] for k in expected} == expected
    assert summary["users_over_token_cap"] >= 1  # heavy: 130 tokens today vs cap 100
    assert summary["users_over_cost_cap"] >= 1  # capped: monthly cap 0


def test_session_model_usage_matches_legacy(seeded):
    with get_db() as db:
        rows = admin_service._aggregate_session_model_usage(db)
        expected = _legacy_model_usage(db)
    assert {(r.provider, r.model, r.session_count, r.tokens) for r in rows} == expected
    assert len(rows) == len(expected)
    assert [(-r.session_count, -r.tokens) for r in rows] == sorted((-r.session_count, -r.tokens) for r in rows)
    assert ("—", "solo-model", 1, 9) in expected


def test_user_model_preferences_match_legacy(seeded):
    with get_db() as db:
        rows = admin_service._aggregate_user_model_preferences(db)
        expected = _legacy_preferences(db)
    assert [(r.provider, r.model, r.user_count) for r in rows] == expected


def test_overview_counts_and_recent_users_match_legacy(seeded):
    with get_db() as db:
        overview = admin_service.get_admin_overview(db)
        users = db.query(User).order_by(User.created_at.desc()).all()
        recent = [str(u.id) for u in users[:8]]
        created = [_aware(u.created_at) for u in users]
    assert overview.new_users_1d == sum(1 for c in created if c >= NOW - timedelta(days=1)) == 1
    assert overview.new_users_7d == sum(1 for c in created if c >= NOW - timedelta(days=7)) == 2
    assert overview.new_users_30d == sum(1 for c in created if c >= NOW - timedelta(days=30)) == 3
    assert [r.id for r in overview.recent_users] == recent


@pytest.mark.parametrize("include_unused", [False, True])
def test_cost_report_matches_legacy(seeded, include_unused):
    year, month = NOW.year, NOW.month
    with get_db() as db:
        report = admin_service.get_cost_report(db, year=year, month=month, include_unused=include_unused)
        start = datetime(year, month, 1, tzinfo=UTC)
        end = datetime(year + 1, 1, 1, tzinfo=UTC) if month == 12 else datetime(year, month + 1, 1, tzinfo=UTC)
        usage = _legacy_usage(db, start, end)
        user_ids = [str(uid) for (uid,) in db.query(User.id)]
    expected_ids = {uid for uid in user_ids if include_unused or uid in usage}
    assert {r.user_id for r in report.rows} == expected_ids
    for row in report.rows:
        tokens, sessions = usage.get(row.user_id, (0, 0))
        assert (row.tokens, row.sessions) == (tokens, sessions)
    assert report.total_tokens == sum(t for t, _ in usage.values())


def test_single_user_row_only_aggregates_that_user(seeded):
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    with get_db() as db:
        rows = {r.email: r for r in admin_service.list_admin_users(db)}
        heavy = db.query(User).filter(User.email == "heavy@test.local").one()
        eng = engine_mod._get_engine()
        event.listen(eng, "before_cursor_execute", record)
        try:
            single = admin_service._user_row(db, heavy)
        finally:
            event.remove(eng, "before_cursor_execute", record)
    assert single.usage == rows["heavy@test.local"].usage
    assert single.usage.today_tokens == 60 + 70 + 5 + 400 // 4
    usage_queries = [s for s in statements if "FROM ai_sessions" in s]
    assert len(usage_queries) == 3
    assert all("ai_sessions.user_id = " in s and "papers" not in s for s in usage_queries)


def test_summary_does_not_hydrate_user_rows(seeded):
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(" ".join(statement.split()))

    eng = engine_mod._get_engine()
    with get_db() as db:
        event.listen(eng, "before_cursor_execute", record)
        try:
            admin_service.get_usage_summary(db)
        finally:
            event.remove(eng, "before_cursor_execute", record)
    user_selects = [s for s in statements if "FROM users" in s]
    assert user_selects
    assert not any("users.email" in s or "users.password_hash" in s for s in user_selects)
