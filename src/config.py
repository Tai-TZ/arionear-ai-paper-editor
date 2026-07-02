from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProvider = Literal["openai", "anthropic", "openrouter", "zai", "google"]


def normalize_llm_provider(provider: str | None) -> LLMProvider | None:
    """Map legacy provider ids to current ones."""
    if not provider:
        return None
    if provider in {"nvidia", "tokenrouter"}:
        return "openrouter"
    return provider  # type: ignore[return-value]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Load repo-root .env regardless of current working directory.
        # `config.py` lives in `src/`, so repo root is one level up.
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "Ario Academic Editor"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # LLM — default provider & model
    llm_provider: LLMProvider = "zai"
    model_name: str = "glm-4.7-flash"
    llm_temperature: float = Field(default=0.3, ge=0.0, le=2.0)

    # Provider API keys (set at least one)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    openrouter_api_key: str = ""
    zai_api_key: str = ""
    google_api_key: str = ""

    # Provider base URLs
    openai_base_url: str = "https://api.openai.com/v1"
    anthropic_base_url: str = "https://api.anthropic.com"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    zai_base_url: str = "https://api.z.ai/api/paas/v4"

    # OpenRouter optional headers
    openrouter_site_url: str = ""
    openrouter_app_name: str = "Arionear Academic Editor"

    # Inngest — chat pipeline observability
    inngest_app_id: str = "ario-academic-editor"
    inngest_event_key: str = ""
    inngest_signing_key: str = ""
    inngest_dev: bool = False

    @field_validator("inngest_dev", mode="before")
    @classmethod
    def _parse_inngest_dev(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return False

    def inngest_enabled(self) -> bool:
        return self.inngest_dev or bool(self.inngest_event_key.strip())

    def inngest_serve_enabled(self) -> bool:
        return self.inngest_dev or bool(self.inngest_signing_key.strip())

    # Default models per provider (used when client does not specify)
    openai_default_model: str = "gpt-4o-mini"
    anthropic_default_model: str = "claude-sonnet-4-20250514"
    openrouter_default_model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"
    openrouter_logic_audit_quick_model: str = "openai/gpt-4o-mini"
    zai_default_model: str = "glm-4.7-flash"
    google_default_model: str = "gemini-2.5-flash"

    # LLM HTTP + logic-audit stream timeouts (seconds)
    llm_request_timeout_sec: float = Field(default=180.0, ge=30.0, le=900.0)
    logic_audit_persona_timeout_sec: float = Field(default=90.0, ge=30.0, le=900.0)
    logic_audit_persona_timeout_reasoning_sec: float = Field(default=240.0, ge=60.0, le=900.0)
    logic_audit_synth_timeout_sec: float = Field(default=120.0, ge=30.0, le=900.0)
    logic_audit_synth_timeout_reasoning_sec: float = Field(default=240.0, ge=60.0, le=900.0)
    logic_audit_gate_timeout_sec: float = Field(default=120.0, ge=30.0, le=900.0)

    # Database — Prisma CLI uses DATABASE_URL (prisma+postgres:// Accelerate).
    # FastAPI/SQLAlchemy requires DIRECT_DATABASE_URL (postgresql:// TCP).
    database_url: str = ""
    direct_database_url: str = ""

    def sqlalchemy_database_url(self) -> str:
        direct = self.direct_database_url.strip()
        if direct:
            if direct.startswith("postgres://"):
                direct = "postgresql://" + direct[len("postgres://") :]
            return direct
        url = self.database_url.strip()
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            return url
        return ""

    # Guardrails
    integrity_strictness: Literal["relaxed", "standard", "strict"] = "standard"
    semantic_similarity_threshold: float = Field(default=0.0, ge=0.0, le=1.0)
    max_style_retries: int = Field(default=2, ge=0, le=5)

    # External APIs (citation verification)
    semantic_scholar_api_key: str = ""

    # Auth (JWT)
    auth_secret_key: str = "dev-only-change-in-production"
    auth_token_expire_hours: int = Field(default=72, ge=1, le=168)  # 3 days
    auth_token_remember_days: int = Field(default=30, ge=1, le=90)
    auth_reset_expire_minutes: int = Field(default=30, ge=5, le=120)
    auth_signup_code_expire_minutes: int = Field(default=15, ge=5, le=60)
    auth_signup_max_attempts: int = Field(default=5, ge=3, le=10)
    auth_signup_resend_cooldown_seconds: int = Field(default=60, ge=15, le=300)
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    frontend_base_url: str = "http://localhost:8080"
    backend_base_url: str = "http://127.0.0.1:8001"

    # Google OAuth (SSO)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_oauth_redirect_uri: str = ""

    # God admin — sole superuser; provisioned on startup from env credentials
    admin_god_email: str = ""
    admin_god_password: str = ""
    admin_god_name: str = "Platform God Admin"


@lru_cache
def get_settings() -> Settings:
    return Settings()
