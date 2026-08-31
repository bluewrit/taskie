"""Team / user management endpoints."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import security
from ..database import get_db
from ..deps import get_current_user
from ..models import Task, User
from ..schemas import UserCreateIn, UserOut
from .auth import PALETTE

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(User).order_by(User.id).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreateIn, db: Session = Depends(get_db),
                current: User = Depends(get_current_user)):
    username = payload.username.strip().lower()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(409, f"Username '{username}' is already taken")
    user = User(
        username=username,
        full_name=payload.full_name.strip() or username.title(),
        email=payload.email.strip(),
        password_hash=security.hash_password(payload.password),
        color=PALETTE[db.query(User).count() % len(PALETTE)],
        role="member",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db),
                current: User = Depends(get_current_user)):
    if user_id == current.id:
        raise HTTPException(400, "You cannot delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()


@router.get("/stats")
def user_stats(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Per-user workload: open, overdue, completed this week, focus load."""
    today = date.today()
    week_ago = datetime.utcnow() - timedelta(days=7)
    out = []
    for u in db.query(User).order_by(User.id).all():
        tasks = db.query(Task).filter(Task.assignee_id == u.id).all()
        open_tasks = [t for t in tasks if t.status != "done"]
        overdue = sum(
            1 for t in open_tasks
            if t.due_date
            and (t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date) < today
        )
        done_week = sum(1 for t in tasks if t.status == "done" and t.completed_at and t.completed_at >= week_ago)
        load_minutes = sum(t.estimated_minutes or 60 for t in open_tasks)
        out.append({
            "user_id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "color": u.color,
            "role": u.role,
            "open": len(open_tasks),
            "overdue": overdue,
            "done_7d": done_week,
            "load_minutes": load_minutes,
            "in_progress": sum(1 for t in open_tasks if t.status == "in_progress"),
        })
    return out
