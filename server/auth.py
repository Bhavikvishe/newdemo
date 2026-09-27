from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable, TypeVar

from flask import g, jsonify, request
from sqlalchemy import delete, select

from .db import SessionLocal
from .models import AuthSession, User

F = TypeVar("F", bound=Callable)


SESSION_COOKIE = "anvesha_session"
CSRF_COOKIE = "anvesha_csrf"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_session(db, user: User, remember: bool) -> str:
    raw_token = secrets.token_urlsafe(48)
    lifetime = timedelta(days=30) if remember else timedelta(hours=8)
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=utcnow() + lifetime,
    )
    db.add(session)
    return raw_token


def _cookie_secure() -> bool:
    # Set COOKIE_SECURE=true in production HTTPS deployments.
    return str(__import__("os").getenv("COOKIE_SECURE", "false")).lower() in {"1", "true", "yes"}


def set_session_cookie(response, token: str, remember: bool):
    max_age = 30 * 24 * 60 * 60 if remember else 8 * 60 * 60
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max_age,
        httponly=True,
        secure=_cookie_secure(),
        samesite="Lax",
        path="/",
    )


def clear_session_cookie(response):
    response.delete_cookie(SESSION_COOKIE, path="/")


def set_csrf_cookie(response, token: str):
    response.set_cookie(
        CSRF_COOKIE,
        token,
        max_age=30 * 24 * 60 * 60,
        httponly=False,
        secure=_cookie_secure(),
        samesite="Lax",
        path="/",
    )


def require_csrf():
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return None

    cookie = request.cookies.get(CSRF_COOKIE)
    header = request.headers.get("X-CSRF-Token")
    if not cookie or not header or not secrets.compare_digest(cookie, header):
        return jsonify({"error": "Invalid or missing CSRF token."}), 403
    return None


def current_user() -> User | None:
    return getattr(g, "current_user", None)


def auth_required(fn: F) -> F:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        raw = request.cookies.get(SESSION_COOKIE)
        if not raw:
            return jsonify({"error": "Authentication required."}), 401

        db = SessionLocal()
        try:
            session = db.scalar(
                select(AuthSession).where(AuthSession.token_hash == hash_token(raw))
            )
            if not session or session.expires_at <= utcnow():
                if session:
                    db.delete(session)
                    db.commit()
                return jsonify({"error": "Session expired."}), 401

            user = db.get(User, session.user_id)
            if not user or not user.is_active:
                return jsonify({"error": "Account is inactive."}), 403

            session.last_seen_at = utcnow()
            db.commit()

            g.current_user = user
            g.db = db
            return fn(*args, **kwargs)
        except Exception:
            db.rollback()
            db.close()
            raise
        finally:
            # The request handler owns the session through g.db. If it is not
            # stored there, close it here.
            if getattr(g, "db", None) is not db:
                db.close()

    return wrapper  # type: ignore[return-value]


def admin_required(fn: F) -> F:
    @wraps(fn)
    @auth_required
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user or user.role != "admin":
            return jsonify({"error": "Administrator privileges required."}), 403
        return fn(*args, **kwargs)

    return wrapper  # type: ignore[return-value]


def close_request_db():
    db = getattr(g, "db", None)
    if db is not None:
        db.close()
        g.db = None


def cleanup_expired_sessions():
    db = SessionLocal()
    try:
        db.execute(delete(AuthSession).where(AuthSession.expires_at <= utcnow()))
        db.commit()
    finally:
        db.close()
