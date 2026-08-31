"""Task and project CRUD endpoints (authenticated, assignment-aware)."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from .. import models
from ..database import UPLOAD_DIR, get_db
from ..deps import get_current_user
from ..models import FileAttachment, Project, ProjectMessage, Task, User
from ..schemas import (
    MessageIn,
    MessageOut,
    ProjectFileOut,
    ProjectIn,
    ProjectOut,
    TaskIn,
    TaskOut,
    TaskUpdate,
)

router = APIRouter(prefix="/api", tags=["tasks"])

VALID_STATUS = {"todo", "in_progress", "done", "blocked"}
VALID_PRIORITY = {"low", "medium", "high", "critical"}


def _validate(status: str | None, priority: str | None):
    if status and status not in VALID_STATUS:
        raise HTTPException(422, f"Invalid status '{status}'")
    if priority and priority not in VALID_PRIORITY:
        raise HTTPException(422, f"Invalid priority '{priority}'")


def _check_assignee(db: Session, assignee_id: int | None):
    if assignee_id and not db.get(User, assignee_id):
        raise HTTPException(422, "Assignee not found")


# ------------------------------------------------------------------ projects
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Project).order_by(Project.id).all()


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectIn, db: Session = Depends(get_db),
                   _: User = Depends(get_current_user)):
    project = Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db),
                   _: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()


# ------------------------------------------------------------------ project hub
def _get_project(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.get("/projects/{project_id}/files", response_model=list[ProjectFileOut])
def project_files(project_id: int, db: Session = Depends(get_db),
                  _: User = Depends(get_current_user)):
    """Shared files of a project: project-level uploads + every file
    attached to its tasks."""
    from sqlalchemy import or_

    _get_project(db, project_id)
    task_ids = [t.id for t in db.query(Task.id).filter(Task.project_id == project_id).all()]
    conditions = [FileAttachment.project_id == project_id]
    if task_ids:
        conditions.append(FileAttachment.task_id.in_(task_ids))
    query = (db.query(FileAttachment)
             .options(joinedload(FileAttachment.task))
             .filter(or_(*conditions)))
    out = []
    for f in query.order_by(FileAttachment.uploaded_at.desc(), FileAttachment.id.desc()).all():
        uploader = db.get(User, f.uploaded_by) if f.uploaded_by else None
        out.append(ProjectFileOut(
            id=f.id, filename=f.filename, mime_type=f.mime_type, extension=f.extension,
            size=f.size, uploaded_at=f.uploaded_at,
            task_id=f.task_id, task_title=f.task.title if f.task else None,
            uploaded_by_name=(uploader.full_name or uploader.username) if uploader else None,
        ))
    return out


@router.post("/projects/{project_id}/files", response_model=ProjectFileOut, status_code=201)
async def upload_project_file(project_id: int, file: UploadFile,
                              db: Session = Depends(get_db),
                              current: User = Depends(get_current_user)):
    """Upload a file shared with the whole project (not tied to a task)."""
    import uuid
    from pathlib import Path as _P

    _get_project(db, project_id)
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(413, "File exceeds the 100 MB limit")
    if not content:
        raise HTTPException(422, "Empty file")
    filename = _P(file.filename or "upload.bin").name
    ext = _P(filename).suffix.lower()[:20]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / stored_name).write_bytes(content)
    att = FileAttachment(
        task_id=None, project_id=project_id, filename=filename, stored_name=stored_name,
        mime_type=file.content_type or "application/octet-stream",
        extension=ext, size=len(content), uploaded_by=current.id,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return ProjectFileOut(
        id=att.id, filename=att.filename, mime_type=att.mime_type, extension=att.extension,
        size=att.size, uploaded_at=att.uploaded_at,
        uploaded_by_name=current.full_name or current.username,
    )


@router.get("/projects/{project_id}/messages", response_model=list[MessageOut])
def project_messages(project_id: int, after: int = 0, db: Session = Depends(get_db),
                     _: User = Depends(get_current_user)):
    _get_project(db, project_id)
    query = (db.query(ProjectMessage)
             .options(joinedload(ProjectMessage.user))
             .filter(ProjectMessage.project_id == project_id, ProjectMessage.id > after)
             .order_by(ProjectMessage.id))
    return query.all()


@router.post("/projects/{project_id}/messages", response_model=MessageOut, status_code=201)
def post_project_message(project_id: int, payload: MessageIn,
                         db: Session = Depends(get_db),
                         current: User = Depends(get_current_user)):
    _get_project(db, project_id)
    msg = ProjectMessage(project_id=project_id, user_id=current.id, body=payload.body.strip()[:4000])
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


# ------------------------------------------------------------------ tasks
@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(status: str | None = None, project_id: int | None = None,
               assignee_id: int | None = None, mine: bool = False,
               unassigned: bool = False, q: str | None = None,
               db: Session = Depends(get_db),
               current: User = Depends(get_current_user)):
    query = (db.query(Task)
             .options(joinedload(Task.files), joinedload(Task.project), joinedload(Task.assignee)))
    if status:
        query = query.filter(Task.status == status)
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if mine:
        query = query.filter(Task.assignee_id == current.id)
    if unassigned:
        query = query.filter(Task.assignee_id.is_(None))
    elif assignee_id:
        query = query.filter(Task.assignee_id == assignee_id)
    if q:
        like = f"%{q}%"
        query = query.filter(Task.title.ilike(like) | Task.description.ilike(like))
    return query.order_by(Task.agent_score.desc(), Task.id.desc()).all()


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(payload: TaskIn, db: Session = Depends(get_db),
                current: User = Depends(get_current_user)):
    _validate(payload.status, payload.priority)
    if payload.project_id and not db.get(Project, payload.project_id):
        raise HTTPException(422, "Project not found")
    _check_assignee(db, payload.assignee_id)
    task = Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db),
             _: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db),
                _: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    data = payload.model_dump(exclude_unset=True)
    _validate(data.get("status"), data.get("priority"))
    if "project_id" in data and data["project_id"] and not db.get(Project, data["project_id"]):
        raise HTTPException(422, "Project not found")
    if "assignee_id" in data:
        _check_assignee(db, data["assignee_id"])
    was_done = task.status == "done"
    for key, value in data.items():
        setattr(task, key, value)
    if task.status == "done" and not was_done:
        task.completed_at = datetime.utcnow()
        task.progress = 100
    if task.status != "done" and was_done:
        task.completed_at = None
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.post("/tasks/{task_id}/complete", response_model=TaskOut)
def complete_task(task_id: int, db: Session = Depends(get_db),
                  _: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    task.status = "done"
    task.progress = 100
    task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db),
                _: User = Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
