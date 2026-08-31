"""Shared FastAPI dependencies."""
from datetime import datetime

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuthToken, User


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Validate `Authorization: Bearer <token>` and return the user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
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
