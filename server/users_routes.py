from __future__ import annotations

from flask import Blueprint, jsonify, request

from .auth import auth_required
from .db import SessionLocal
from .models import User

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


@users_bp.get("")
@auth_required
def list_users():
    """Return the authenticated user's safe personnel directory."""
    department = request.args.get("department")

    db = SessionLocal()
    try:
        query = db.query(User).filter(User.is_active.is_(True))

        if department:
            query = query.filter(User.department == department)

        users = query.order_by(User.name.asc()).all()

        return jsonify(
            {
                "ok": True,
                "users": [
                    {
                        "id": str(user.id),
                        "name": user.name,
                        "username": user.username,
                        "department": user.department,
                        "role": user.role,
                        "isActive": user.is_active,
                        "createdAt": user.created_at.isoformat() if user.created_at else None,
                        "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
                    }
                    for user in users
                ],
            }
        )
    finally:
        db.close()
