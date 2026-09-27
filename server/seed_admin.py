from __future__ import annotations

import argparse

from sqlalchemy import select
from werkzeug.security import generate_password_hash

from server.db import SessionLocal
from server.models import User


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        existing = db.scalar(
            select(User).where(
                (User.username == args.username.lower()) |
                (User.email == args.email.lower())
            )
        )
        if existing:
            raise SystemExit("Username or email already exists.")

        user = User(
            name=args.name.strip(),
            email=args.email.strip().lower(),
            username=args.username.strip().lower(),
            password_hash=generate_password_hash(args.password),
            department="system-admin",
            role="admin",
        )
        db.add(user)
        db.commit()
        print(f"Created administrator: {user.username}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
