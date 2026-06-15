from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

LLMProvider = Literal["openai", "anthropic", "openrouter"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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
    llm_provider: LLMProvider = "openrouter"
    model_name: str = "nvidia/llama-nemotron-rerank-vl-1b-v2:free"
    llm_temperature: float = Field(default=0.3, ge=0.0, le=2.0)

    # Provider API keys (set at least one)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    openrouter_api_key: str = ""

    # Provider base URLs
    openai_base_url: str = "https://api.openai.com/v1"
    anthropic_base_url: str = "https://api.anthropic.com"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # OpenRouter optional headers
    openrouter_site_url: str = ""
    openrouter_app_name: str = "Arionear Academic Editor"

    # Default models per provider (used when client does not specify)
    openai_default_model: str = "gpt-4o-mini"
    anthropic_default_model: str = "claude-sonnet-4-20250514"
    openrouter_default_model: str = "nvidia/llama-nemotron-rerank-vl-1b-v2:free"

    # Database — Prisma CLI uses DATABASE_URL (may be prisma+postgres:// Accelerate).
    # Python/SQLAlchemy needs a direct postgresql:// URL via DIRECT_DATABASE_URL.
    database_url: str = "sqlite:///./data/app.db"
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
        if url.startswith(("postgresql://", "sqlite://")):
            return url
        return ""

    # Guardrails
    semantic_similarity_threshold: float = Field(default=0.0, ge=0.0, le=1.0)
    max_style_retries: int = Field(default=2, ge=0, le=5)

    # External APIs (citation verification)
    semantic_scholar_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
