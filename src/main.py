import asyncio
from contextlib import asynccontextmanager

import inngest.fast_api
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.admin_routes import router as admin_router
from src.api.auth_routes import router as auth_router
from src.api.defense_routes import router as defense_router
from src.api.paper_routes import router as papers_router
from src.api.profile_routes import router as profile_router
from src.api.routes import router
from src.api.share_routes import router as share_router
from src.config import get_settings
from src.db.engine import db_is_ready, get_db, init_db, is_db_enabled
from src.inngest.client import inngest_client
from src.inngest.functions import INNGEST_FUNCTIONS
from src.services.auth_service import ensure_god_admin
from src.services.sessions import refresh_session_store


def _provision_god_admin() -> None:
    try:
        with get_db() as db:
            user = ensure_god_admin(db)
            if user:
                print(f"God admin ready: {user.email}")
    except Exception as exc:
        print(f"God admin provisioning skipped: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    if settings.app_env == "production" and settings.auth_secret_key == "dev-only-change-in-production":
        print("WARNING: AUTH_SECRET_KEY is still the default. Set a strong secret before production.")
    if is_db_enabled():
        try:
            await asyncio.wait_for(asyncio.to_thread(init_db), timeout=20.0)
            if db_is_ready():
                await asyncio.to_thread(_provision_god_admin)
            refresh_session_store()
            print("Database connected")
        except TimeoutError:
            print("Database init timed out after 20s, using in-memory store")
        except Exception as exc:
            print(f"Database init failed, using in-memory store: {exc}")
    else:
        print("DATABASE_URL not set — using in-memory session store")
    if settings.inngest_serve_enabled():
        print("Inngest sync endpoint: /api/inngest")
    yield
    print("Shutting down...")


app = FastAPI(
    title="Arionear Agent",
    description="AI Agent built with LangGraph",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
_cors_kwargs: dict = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if settings.app_env == "development":
    # Vite may bind to 8080/8081/etc. when default ports are busy.
    _cors_kwargs["allow_origins"] = _cors_origins
    _cors_kwargs["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"
else:
    _cors_kwargs["allow_origins"] = _cors_origins

app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(papers_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(share_router, prefix="/api/v1")
app.include_router(defense_router, prefix="/api/v1")

if settings.inngest_serve_enabled():
    inngest.fast_api.serve(app, inngest_client, INNGEST_FUNCTIONS)


@app.get("/health")
async def health():
    db_status = "connected" if db_is_ready() else "disconnected"
    if not is_db_enabled():
        db_status = "not_configured"
    return {"status": "ok", "env": settings.app_env, "database": db_status}
