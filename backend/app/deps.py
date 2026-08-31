"""Shared FastAPI dependencies."""
from datetime import datetime

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuthToken, User

COOKIE_NAME = "taskie_token"


def extract_token(request: Request, authorization: str | None) -> str | None:
    """Session token from the Authorization header or the session cookie.

    The cookie is the primary channel for the browser: some preview proxies
    strip Authorization headers, but cookies always survive (same-origin).
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        if token:
            return token
    return request.cookies.get(COOKIE_NAME)


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Validate the session (bearer token or cookie) and return the user."""
    token = extract_token(request, authorization)
    if not token:
        raise HTTPException(401, "Not authenticated")
    record = db.query(AuthToken).filter(AuthToken.token == token).first()
    if not record:
        raise HTTPException(401, "Invalid or expired session")
    if record.expires_at and record.expires_at < datetime.utcnow():
        db.delete(record)
        db.commit()
        raise HTTPException(401, "Session expired — please sign in again")
    user = db.get(User, record.user_id)
    if not user:
        raise HTTPException(401, "User no longer exists")
    return user
