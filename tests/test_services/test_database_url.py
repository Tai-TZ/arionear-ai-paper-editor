import pytest
from sqlalchemy import create_engine

from src.config import Settings


def _settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


@pytest.mark.parametrize(
    ("direct", "expected"),
    [
        ("postgres://u:p@db:5432/app", "postgresql+psycopg2://u:p@db:5432/app"),
        ("postgresql://u:p@db:5432/app", "postgresql+psycopg2://u:p@db:5432/app"),
        ("postgresql+psycopg2://u:p@db:5432/app", "postgresql+psycopg2://u:p@db:5432/app"),
        ("  postgresql://u@db/app  ", "postgresql+psycopg2://u@db/app"),
    ],
)
def test_direct_url_pins_psycopg2(direct: str, expected: str) -> None:
    assert _settings(direct_database_url=direct).sqlalchemy_database_url() == expected


def test_database_url_fallback_pins_psycopg2() -> None:
    url = _settings(database_url="postgres://u@db/app").sqlalchemy_database_url()
    assert url == "postgresql+psycopg2://u@db/app"


def test_accelerate_url_without_direct_url_is_ignored() -> None:
    assert _settings(database_url="prisma+postgres://accelerate.example/?api_key=x").sqlalchemy_database_url() == ""


def test_engine_uses_installed_psycopg2_driver() -> None:
    # SQLAlchemy 2.1 defaults bare postgresql:// to psycopg 3, which is not a dependency.
    url = _settings(direct_database_url="postgresql://u@localhost:1/app").sqlalchemy_database_url()
    engine = create_engine(url)
    try:
        assert engine.dialect.driver == "psycopg2"
    finally:
        engine.dispose()
