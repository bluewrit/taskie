"""Pydantic request/response schemas."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------- Users / Auth
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=4, max_length=200)
    full_name: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=160)


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: str
    color: str
    role: str
    created_at: datetime


class AuthOut(BaseModel):
    token: str
    user: UserOut


class UserCreateIn(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=4, max_length=200)
    full_name: str = Field(default="", max_length=120)
    email: str = Field(default="", max_length=160)


# ---------------------------------------------------------------- Projects
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    color: str = "#6366f1"


class ProjectOut(ProjectIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------------------------------------------------------------- Tasks
class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    project_id: int | None = None
    assignee_id: int | None = None
    status: str = "todo"
    priority: str = "medium"
    due_date: date | None = None
    estimated_minutes: int = 60
    progress: int = 0
    tags: str = ""


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    project_id: int | None = None
    assignee_id: int | None = None
    status: str | None = None
    priority: str | None = None
    due_date: date | None = None
    estimated_minutes: int | None = None
    progress: int | None = None
    tags: str | None = None


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    mime_type: str
    extension: str
    size: int
    uploaded_at: datetime


class TaskOut(TaskIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    agent_score: float
    agent_note: str
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    assignee: UserOut | None = None
    files: list[FileOut] = []


# ---------------------------------------------------------------- Project hub
class ProjectFileOut(FileOut):
    task_id: int | None = None
    task_title: str | None = None
    uploaded_by_name: str | None = None


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: int
    body: str
    created_at: datetime
    user: UserOut | None = None


# ---------------------------------------------------------------- Agent
class ChatMessage(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatReply(BaseModel):
    reply: str
    reasoning: list[str] = []
    actions: list[dict] = []


class AgentActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    kind: str
    summary: str
    detail: dict
