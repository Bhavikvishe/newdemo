from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


# Load server/.env explicitly.
ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE)


def _database_url() -> URL | str:
    url = os.getenv("DATABASE_URL", "").strip()

    if not url:
        raise RuntimeError(
            "DATABASE_URL is not configured. "
            "Example: postgresql+psycopg://postgres:password@localhost:5432/anvesha"
        )

    # Build the SQLAlchemy URL explicitly so special characters
    # in the password (such as @) are handled correctly.
    if url.startswith("postgresql+psycopg://"):
        from urllib.parse import urlparse, unquote

        parsed = urlparse(url)

        return URL.create(
            drivername="postgresql+psycopg",
            username=parsed.username,
            password=unquote(parsed.password or ""),
            host=parsed.hostname,
            port=parsed.port,
            database=parsed.path.lstrip("/"),
        )

    if url.startswith("postgresql://"):
        from urllib.parse import urlparse, unquote

        parsed = urlparse(url)

        return URL.create(
            drivername="postgresql+psycopg",
            username=parsed.username,
            password=unquote(parsed.password or ""),
            host=parsed.hostname,
            port=parsed.port,
            database=parsed.path.lstrip("/"),
        )

    if url.startswith("postgres://"):
        from urllib.parse import urlparse, unquote

        parsed = urlparse(url)

        return URL.create(
            drivername="postgresql+psycopg",
            username=parsed.username,
            password=unquote(parsed.password or ""),
            host=parsed.hostname,
            port=parsed.port,
            database=parsed.path.lstrip("/"),
        )

    return url


class Base(DeclarativeBase):
    pass


engine = create_engine(
    _database_url(),
    pool_pre_ping=True,
    pool_recycle=1800,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()