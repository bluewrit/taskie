"""Authentication: register, login, logout, current user."""
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..deps import get_current_user
from ..models import AuthToken, User
from ..schemas import AuthOut, LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#38bdf8", "#8b5cf6", "#ef4444", "#14b8a6"]


def _issue_token(db: Session, user: User) -> AuthOut:
    token = security.make_token()
    db.add(AuthToken(token=token, user_id=user.id, expires_at=security.token_expiry()))
    db.commit()
    return AuthOut(token=token, user=UserOut.model_validate(user))


@router.post("/register", response_model=AuthOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(409, f"Username '{username}' is already taken")
    count = db.query(User).count()
    user = User(
        username=username,
        full_name=payload.full_name.strip() or username.title(),
        email=payload.email.strip(),
        password_hash=security.hash_password(payload.password),
        color=PALETTE[count % len(PALETTE)],
        role="admin" if count == 0 else "member",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token(db, user)


@router.post("/login", response_model=AuthOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username.strip().lower()).first()
    if not user or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect username or password")
    return _issue_token(db, user)


@router.post("/logout", status_code=204)
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
        record = db.query(AuthToken).filter(AuthToken.token == token).first()
        if record:
            db.delete(record)
            db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
