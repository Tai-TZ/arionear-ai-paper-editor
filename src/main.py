from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router
from src.config import get_settings
from src.db.engine import db_is_ready, init_db, is_db_enabled
from src.services.sessions import refresh_session_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    if is_db_enabled():
        try:
            init_db()
            refresh_session_store()
            print("Database connected")
        except Exception as exc:
            print(f"Database init failed, using in-memory store: {exc}")
    else:
        print("DATABASE_URL not set — using in-memory session store")
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


@app.get("/health")
async def health():
    db_status = "connected" if db_is_ready() else "disconnected"
    if not is_db_enabled():
        db_status = "not_configured"
    return {"status": "ok", "env": settings.app_env, "database": db_status}
