"""Agent tool registry — the actions the agent can take on the workspace.

Each tool receives the SQLAlchemy session plus kwargs and returns a plain
dict result. The brain calls these during its act phase, both from chat
and from proactive runs.
"""
from datetime import date, datetime

from ...models import AgentAction, Project, Task, User

VALID_STATUS = {"todo", "in_progress", "done", "blocked"}
VALID_PRIORITY = {"low", "medium", "high", "critical"}


def log_action(db, kind: str, summary: str, detail: dict | None = None):
    db.add(AgentAction(kind=kind, summary=summary, detail=detail or {}))
    db.commit()


def resolve_user(db, name: str) -> User | None:
    """Find a user by username or (partial, case-insensitive) full name."""
    name = name.strip().lower()
    user = db.query(User).filter(User.username == name).first()
    if user:
        return user
    return db.query(User).filter(User.full_name.ilike(f"%{name}%")).first()


# ------------------------------------------------------------------ tools
def tool_list_tasks(db, status: str | None = None, limit: int = 20,
                    assignee_id: int | None = None, **_):
    q = db.query(Task).order_by(Task.agent_score.desc(), Task.id.desc())
    if status:
        q = q.filter(Task.status == status)
    if assignee_id:
        q = q.filter(Task.assignee_id == assignee_id)
    tasks = q.limit(limit).all()
    return {
        "count": len(tasks),
        "tasks": [
            {
                "id": t.id, "title": t.title, "status": t.status,
                "priority": t.priority,
                "assignee": t.assignee.full_name if t.assignee else "unassigned",
                "due_date": (t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date).isoformat() if t.due_date else None,
                "progress": t.progress, "agent_score": t.agent_score,
            }
            for t in tasks
        ],
    }


def tool_search_tasks(db, query: str = "", **_):
    q = db.query(Task).filter(
        (Task.title.ilike(f"%{query}%")) | (Task.description.ilike(f"%{query}%"))
    ).order_by(Task.id.desc()).limit(20)
    tasks = q.all()
    return {
        "count": len(tasks),
        "tasks": [
            {"id": t.id, "title": t.title, "status": t.status, "priority": t.priority}
            for t in tasks
        ],
    }


def _find_task(db, task_id: int | None = None, title: str | None = None) -> Task | None:
    if task_id:
        return db.get(Task, task_id)
    if title:
        t = db.query(Task).filter(Task.title.ilike(f"%{title}%")).order_by(Task.id.desc()).first()
        if t:
            return t
        words = title.split()
        for w in words:
            if len(w) > 3:
                t = db.query(Task).filter(Task.title.ilike(f"%{w}%")).order_by(Task.id.desc()).first()
                if t:
                    return t
    return None


def tool_create_task(db, title: str, description: str = "", priority: str = "medium",
                     due_date: str | None = None, estimated_minutes: int = 60,
                     project_name: str | None = None, assignee_id: int | None = None, **_):
    priority = priority if priority in VALID_PRIORITY else "medium"
    project = None
    if project_name:
        project = db.query(Project).filter(Project.name.ilike(f"%{project_name}%")).first()
    task = Task(
        title=title[:300], description=description, priority=priority,
        estimated_minutes=max(5, int(estimated_minutes or 60)),
        project_id=project.id if project else None,
        assignee_id=assignee_id,
        due_date=date.fromisoformat(due_date) if due_date else None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    who = task.assignee.full_name if task.assignee else "unassigned"
    log_action(db, "chat", f"Created task #{task.id}: {task.title} (→ {who})",
               {"tool": "create_task", "task_id": task.id})
    return {"created": True, "task_id": task.id, "title": task.title,
            "priority": task.priority, "assignee": who,
            "due_date": task.due_date.isoformat() if task.due_date else None}


def tool_update_task(db, task_id: int | None = None, title: str | None = None,
                     status: str | None = None, priority: str | None = None,
                     due_date: str | None = None, progress: int | None = None,
                     assignee_id: int | None = None, assignee_name: str | None = None,
                     **_):
    task = _find_task(db, task_id=task_id, title=title)
    if not task:
        return {"updated": False, "error": "No matching task found."}
    changes = {}
    if assignee_name:
        user = resolve_user(db, assignee_name)
        if user:
            assignee_id = user.id
    if assignee_id:
        task.assignee_id = assignee_id
        changes["assignee_id"] = assignee_id
    if status in VALID_STATUS:
        changes["status"] = status
        task.status = status
        if status == "done":
            task.completed_at = datetime.utcnow()
            task.progress = 100
            changes["progress"] = 100
    if priority in VALID_PRIORITY:
        changes["priority"] = priority
        task.priority = priority
    if due_date:
        try:
            task.due_date = date.fromisoformat(due_date)
            changes["due_date"] = due_date
        except ValueError:
            pass
    if progress is not None:
        task.progress = max(0, min(100, int(progress)))
        changes["progress"] = task.progress
        if task.progress == 100 and task.status != "done":
            task.status = "done"
            task.completed_at = datetime.utcnow()
            changes["status"] = "done"
    task.updated_at = datetime.utcnow()
    db.commit()
    log_action(db, "chat", f"Updated task #{task.id}: {', '.join(changes)}",
               {"tool": "update_task", "task_id": task.id, "changes": changes})
    return {"updated": True, "task_id": task.id, "title": task.title, "changes": changes}


def tool_complete_task(db, task_id: int | None = None, title: str | None = None, **_):
    task = _find_task(db, task_id=task_id, title=title)
    if not task:
        return {"completed": False, "error": "No matching task found."}
    task.status = "done"
    task.progress = 100
    task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    db.commit()
    log_action(db, "chat", f"Completed task #{task.id}: {task.title}",
               {"tool": "complete_task", "task_id": task.id})
    return {"completed": True, "task_id": task.id, "title": task.title}


def tool_delete_task(db, task_id: int | None = None, title: str | None = None, **_):
    task = _find_task(db, task_id=task_id, title=title)
    if not task:
        return {"deleted": False, "error": "No matching task found."}
    info = {"deleted": True, "task_id": task.id, "title": task.title}
    db.delete(task)
    db.commit()
    log_action(db, "chat", f"Deleted task #{info['task_id']}: {info['title']}",
               {"tool": "delete_task"})
    return info


def tool_reschedule_task(db, task_id: int | None = None, title: str | None = None,
                         due_date: str | None = None, **_):
    task = _find_task(db, task_id=task_id, title=title)
    if not task:
        return {"rescheduled": False, "error": "No matching task found."}
    if not due_date:
        return {"rescheduled": False, "error": "No target date given."}
    task.due_date = date.fromisoformat(due_date)
    task.updated_at = datetime.utcnow()
    db.commit()
    log_action(db, "chat", f"Rescheduled task #{task.id} to {due_date}",
               {"tool": "reschedule_task", "task_id": task.id, "due_date": due_date})
    return {"rescheduled": True, "task_id": task.id, "title": task.title, "due_date": due_date}


def tool_recommendations(db, user_id: int | None = None, **_):
    from .recommender import generate_recommendations
    recs = generate_recommendations(db, user_id=user_id)
    log_action(db, "proactive", f"Generated {len(recs)} recommendations", {"count": len(recs)})
    return {"count": len(recs), "recommendations": recs}


def tool_plan(db, horizon_days: int = 7, user_id: int | None = None, **_):
    from .planner import build_plan
    plan = build_plan(db, horizon_days=horizon_days, user_id=user_id)
    log_action(db, "planner", f"Built {horizon_days}-day plan ({plan['summary']['tasks_planned']} tasks)",
               {"horizon_days": horizon_days})
    return plan


def tool_evaluate(db, user_id: int | None = None, **_):
    from .evaluator import evaluate
    report = evaluate(db, user_id=user_id)
    log_action(db, "evaluation", f"Performance grade {report['grade']} ({report['overall_score']}/100)",
               {"grade": report["grade"]})
    return report


TOOLS = {
    "list_tasks": tool_list_tasks,
    "search_tasks": tool_search_tasks,
    "create_task": tool_create_task,
    "update_task": tool_update_task,
    "complete_task": tool_complete_task,
    "delete_task": tool_delete_task,
    "reschedule_task": tool_reschedule_task,
    "recommendations": tool_recommendations,
    "plan": tool_plan,
    "evaluate": tool_evaluate,
}
