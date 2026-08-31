"""Task and project CRUD endpoints."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Project, Task
from ..schemas import ProjectIn, ProjectOut, TaskIn, TaskOut, TaskUpdate

router = APIRouter(prefix="/api", tags=["tasks"])

VALID_STATUS = {"todo", "in_progress", "done", "blocked"}
VALID_PRIORITY = {"low", "medium", "high", "critical"}


def _validate(status: str | None, priority: str | None):
    if status and status not in VALID_STATUS:
        raise HTTPException(422, f"Invalid status '{status}'")
    if priority and priority not in VALID_PRIORITY:
        raise HTTPException(422, f"Invalid priority '{priority}'")


# ------------------------------------------------------------------ projects
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.id).all()


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectIn, db: Session = Depends(get_db)):
    project = Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()


# ------------------------------------------------------------------ tasks
@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(status: str | None = None, project_id: int | None = None,
               q: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Task).options(joinedload(Task.files), joinedload(Task.project))
    if status:
        query = query.filter(Task.status == status)
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if q:
        like = f"%{q}%"
        query = query.filter(Task.title.ilike(like) | Task.description.ilike(like))
    return query.order_by(Task.agent_score.desc(), Task.id.desc()).all()


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(payload: TaskIn, db: Session = Depends(get_db)):
    _validate(payload.status, payload.priority)
    if payload.project_id and not db.get(Project, payload.project_id):
        raise HTTPException(422, "Project not found")
    task = Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    data = payload.model_dump(exclude_unset=True)
    _validate(data.get("status"), data.get("priority"))
    if "project_id" in data and data["project_id"] and not db.get(Project, data["project_id"]):
        raise HTTPException(422, "Project not found")
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
def complete_task(task_id: int, db: Session = Depends(get_db)):
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
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    db.delete(task)
    db.commit()
