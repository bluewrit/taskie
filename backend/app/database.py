"""Database setup: SQLite + SQLAlchemy."""
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("TASKIE_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "taskie.db"
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate():
    """Lightweight additive migrations for pre-existing databases."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "tasks" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("tasks")}
        if "assignee_id" not in columns:
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE tasks ADD COLUMN assignee_id INTEGER REFERENCES users(id)"
                ))
    if "file_attachments" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("file_attachments")}
        if "project_id" not in columns:
            # SQLite can't drop the old NOT NULL on task_id, so rebuild the
            # table with the new schema and copy rows across.
            from .models import FileAttachment  # noqa: F401  (ensure mapper)

            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE file_attachments RENAME TO _file_attachments_old"))
                Base.metadata.tables["file_attachments"].create(conn)
                conn.execute(text(
                    "INSERT INTO file_attachments "
                    "(id, task_id, project_id, filename, stored_name, mime_type, extension, size, uploaded_at, uploaded_by) "
                    "SELECT id, task_id, NULL, filename, stored_name, mime_type, extension, size, uploaded_at, NULL "
                    "FROM _file_attachments_old"
                ))
                conn.execute(text("DROP TABLE _file_attachments_old"))


def init_db():
    from . import models  # noqa: F401  (register mappers)

    Base.metadata.create_all(bind=engine)
    _migrate()
    _ensure_demo_users()


def _ensure_demo_users():
    """Create default accounts on first start so the app is usable immediately."""
    from . import security
    from .models import User

    palette = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#38bdf8"]
    defaults = [
        ("demo", "Demo User", "admin"),
        ("ava", "Ava Sharma", "member"),
        ("ben", "Ben Carter", "member"),
    ]
    with SessionLocal() as db:
        existing = {u.username for u in db.query(User).all()}
        for i, (username, full_name, role) in enumerate(defaults):
            if username in existing:
                continue
            db.add(User(
                username=username,
                full_name=full_name,
                password_hash=security.hash_password("taskie123"),
                color=palette[i % len(palette)],
                role=role,
            ))
        db.commit()
