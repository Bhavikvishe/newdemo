from __future__ import annotations

import secrets

from flask import Blueprint, jsonify, request
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from .auth import (
    CSRF_COOKIE,
    clear_session_cookie,
    create_session,
    current_user,
    hash_token,
    require_csrf,
    set_csrf_cookie,
    set_session_cookie,
)
from .db import SessionLocal
from .models import AuthSession, User, utcnow

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


ALLOWED_DEPARTMENTS = {
    "marine-operations",
    "marine-engineering",
    "marine-environmental",
    "search-rescue",
    "ocean-survey",
    "recovery-response",
}


def serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "username": user.username,
        "department": user.department,
        "role": user.role,
        "createdAt": user.created_at.isoformat(),
        "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
    }


@auth_bp.get("/csrf")
def csrf():
    token = secrets.token_urlsafe(32)
    response = jsonify({"ok": True})
    set_csrf_cookie(response, token)
    return response


@auth_bp.post("/register")
def register():
    csrf_error = require_csrf()
    if csrf_error:
        return csrf_error

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", ""))
    department = str(payload.get("department", "")).strip()

    if not name or not email or not username or not password:
        return jsonify({"error": "All fields are required."}), 400

    if len(name) > 120 or len(username) > 80 or len(email) > 320:
        return jsonify({"error": "One or more fields are too long."}), 400

    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    if department not in ALLOWED_DEPARTMENTS:
        return jsonify({"error": "Invalid department."}), 400

    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return jsonify({"error": "Enter a valid email address."}), 400

    db = SessionLocal()
    try:
        exists = db.scalar(
            select(User).where(or_(User.username == username, User.email == email))
        )
        if exists:
            if exists.username == username:
                return jsonify({"error": "Username is already registered."}), 409
            return jsonify({"error": "Email is already registered."}), 409

        user = User(
            name=name,
            email=email,
            username=username,
            password_hash=generate_password_hash(password),
            department=department,
            # Public registration can never create an administrator.
            role="operator",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_session(db, user, remember=True)
        db.commit()

        response = jsonify({"ok": True, "user": serialize_user(user)})
        set_session_cookie(response, token, remember=True)
        return response, 201
    except IntegrityError:
        db.rollback()
        return jsonify({"error": "Username or email is already registered."}), 409
    finally:
        db.close()


@auth_bp.post("/login")
def login():
    csrf_error = require_csrf()
    if csrf_error:
        return csrf_error

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    identifier = str(payload.get("identifier", "")).strip().lower()
    password = str(payload.get("password", ""))
    department = str(payload.get("department", "")).strip()
    remember = bool(payload.get("remember", True))

    if not identifier or not password:
        return jsonify({"error": "Username/email and password are required."}), 400

    db = SessionLocal()
    try:
        user = db.scalar(
            select(User).where(
                or_(User.username == identifier, User.email == identifier)
            )
        )

        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({"error": "Invalid credentials."}), 401

        if not user.is_active:
            return jsonify({"error": "This account is inactive."}), 403

        if department and user.department != department:
            return jsonify(
                {
                    "error": "The selected department does not match this account.",
                    "code": "DEPARTMENT_MISMATCH",
                }
            ), 403

        user.last_login_at = utcnow()
        token = create_session(db, user, remember=remember)
        db.commit()

        response = jsonify({"ok": True, "user": serialize_user(user)})
        set_session_cookie(response, token, remember=remember)
        return response
    finally:
        db.close()


@auth_bp.get("/me")
def me():
    user = current_user()
    if user:
        return jsonify({"authenticated": True, "user": serialize_user(user)})

    raw = request.cookies.get("anvesha_session")
    if not raw:
        return jsonify({"authenticated": False, "user": None})

    db = SessionLocal()
    try:
        session = db.scalar(
            select(AuthSession).where(AuthSession.token_hash == hash_token(raw))
        )
        if not session or session.expires_at <= utcnow():
            return jsonify({"authenticated": False, "user": None})
        user = db.get(User, session.user_id)
        if not user or not user.is_active:
            return jsonify({"authenticated": False, "user": None})
        return jsonify({"authenticated": True, "user": serialize_user(user)})
    finally:
        db.close()


@auth_bp.post("/logout")
def logout():
    csrf_error = require_csrf()
    if csrf_error:
        return csrf_error

    raw = request.cookies.get("anvesha_session")
    db = SessionLocal()
    try:
        if raw:
            session = db.scalar(
                select(AuthSession).where(AuthSession.token_hash == hash_token(raw))
            )
            if session:
                db.delete(session)
                db.commit()
        response = jsonify({"ok": True})
        clear_session_cookie(response)
        return response
    finally:
        db.close()
