"""SQLAlchemy ORM models."""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    role: Mapped[str] = mapped_column(String(16), default="member")  # admin | member
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    assigned_tasks: Mapped[list["Task"]] = relationship(back_populates="assignee")


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="todo", index=True)
    priority: Mapped[str] = mapped_column(String(12), default="medium", index=True)
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=60)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    tags: Mapped[str] = mapped_column(String(300), default="")
    agent_score: Mapped[float] = mapped_column(Float, default=0.0)
    agent_note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project | None] = relationship(back_populates="tasks")
    assignee: Mapped[User | None] = relationship(back_populates="assigned_tasks")
    files: Mapped[list["FileAttachment"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class FileAttachment(Base):
    __tablename__ = "file_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(300), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    extension: Mapped[str] = mapped_column(String(20), default="")
    size: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    task: Mapped[Task] = relationship(back_populates="files")


class AgentAction(Base):
    """Audit log of everything the agent does (chat, proactive, planning)."""

    __tablename__ = "agent_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    kind: Mapped[str] = mapped_column(String(30), default="chat")  # chat|proactive|planner|evaluation
    summary: Mapped[str] = mapped_column(String(400), default="")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
