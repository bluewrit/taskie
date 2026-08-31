"""Proactive recommendation engine.

Scores every open task and derives ranked, actionable recommendations:
risk alerts, quick wins, focus advice, hygiene nudges and priority
realignment — the "efficient task management" brain of the app.
"""
from datetime import date, datetime, timedelta

PRIORITY_WEIGHT = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def compute_agent_score(task, today: date | None = None) -> tuple[float, str]:
    """Heuristic priority score in [0, 100] + a one-line rationale."""
    today = today or date.today()
    score = PRIORITY_WEIGHT.get(task.priority, 2) * 12  # up to 48
    reasons = []

    due = task.due_date.date() if isinstance(task.due_date, datetime) else task.due_date
    if due:
        days_left = (due - today).days
        if days_left < 0:
            score += 35
            reasons.append(f"overdue by {abs(days_left)}d")
        elif days_left == 0:
            score += 30
            reasons.append("due today")
        elif days_left <= 2:
            score += 22
            reasons.append(f"due in {days_left}d")
        elif days_left <= 7:
            score += 12
            reasons.append(f"due in {days_left}d")
    else:
        score -= 4

    if task.status == "in_progress":
        score += 8
        reasons.append("already in progress")
    if task.progress and task.progress < 100:
        score += min(8, task.progress // 15)
    est = task.estimated_minutes or 60
    if est <= 30:
        score += 6
        reasons.append("quick win (<30m)")
    if task.status == "blocked":
        score -= 10
        reasons.append("blocked")

    return round(min(score, 100.0), 1), ", ".join(reasons) or "normal priority"


def generate_recommendations(db) -> list[dict]:
    """Return a ranked list of recommendation dicts."""
    from ...models import Task

    today = date.today()
    open_tasks = (
        db.query(Task).filter(Task.status != "done").order_by(Task.id).all()
    )
    done_recent = (
        db.query(Task)
        .filter(Task.status == "done", Task.completed_at != None)  # noqa: E711
        .filter(Task.completed_at >= datetime.utcnow() - timedelta(days=7))
        .all()
    )

    recs: list[dict] = []

    def add(rtype, severity, title, message, task_id=None, action=None, score=0):
        recs.append({
            "id": f"{rtype}-{task_id or len(recs)}",
            "type": rtype,
            "severity": severity,
            "title": title,
            "message": message,
            "task_id": task_id,
            "action": action,
            "score": score,
        })

    for t in open_tasks:
        t.agent_score, t.agent_note = compute_agent_score(t, today)

    ranked = sorted(open_tasks, key=lambda t: t.agent_score, reverse=True)

    # 1. Overdue tasks -> resolve now
    for t in ranked:
        due = t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date
        if due and due < today:
            days = (today - due).days
            add("overdue", "critical" if days > 3 else "high",
                f"Overdue: {t.title}",
                f"{days} day(s) past due ({due.isoformat()}, progress {t.progress}%). "
                "Finish it now or reschedule with a realistic date.",
                task_id=t.id,
                action={"kind": "reschedule", "task_id": t.id, "due_date": (today + timedelta(days=2)).isoformat()},
                score=95 - min(days, 10))

    # 2. At-risk: due soon with low progress
    for t in ranked:
        due = t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date
        if due and today <= due <= today + timedelta(days=2) and t.progress < 50:
            add("at_risk", "high",
                f"At risk: {t.title}",
                f"Due {due.isoformat()} but only {t.progress}% done. Block a focus slot for it today.",
                task_id=t.id,
                action={"kind": "status", "task_id": t.id, "status": "in_progress"},
                score=85)

    # 3. Quick wins
    quick = [t for t in ranked if (t.estimated_minutes or 999) <= 30 and t.status == "todo"]
    if quick:
        names = ", ".join(t.title for t in quick[:3])
        add("quick_win", "medium",
            f"{len(quick)} quick win(s) available",
            f"Small tasks you can clear fast ({names}). Completing them builds momentum.",
            task_id=quick[0].id,
            action={"kind": "start", "task_id": quick[0].id},
            score=60)

    # 4. Stale in-progress tasks (WIP discipline)
    in_prog = [t for t in ranked if t.status == "in_progress"]
    stale = [t for t in in_prog if (datetime.utcnow() - t.updated_at).days >= 3]
    if len(in_prog) > 3:
        add("wip_limit", "medium",
            f"{len(in_prog)} tasks in progress at once",
            "WIP above 3 slows everything down. Finish or park all but your top 2-3.",
            score=55)
    for t in stale:
        add("stale", "high",
            f"Stalled: {t.title}",
            f"In progress but untouched for {(datetime.utcnow() - t.updated_at).days} day(s). "
            "Either push it forward or mark it blocked with a note.",
            task_id=t.id,
            action={"kind": "status", "task_id": t.id, "status": "blocked"},
            score=70)

    # 5. Priority realignment
    for t in ranked:
        expected = ("critical" if t.agent_score >= 70 else
                    "high" if t.agent_score >= 55 else
                    "medium" if t.agent_score >= 35 else "low")
        if expected != t.priority and t.status == "todo" and t.due_date:
            add("priority", "low",
                f"Re-prioritise: {t.title}",
                f"Agent score {t.agent_score}/100 suggests '{expected}' but it is marked '{t.priority}'.",
                task_id=t.id,
                action={"kind": "priority", "task_id": t.id, "priority": expected},
                score=40)

    # 6. Hygiene: open tasks without due dates
    no_due = [t for t in open_tasks if not t.due_date]
    if len(no_due) >= 2:
        add("hygiene", "low",
            f"{len(no_due)} open tasks have no due date",
            "Undated tasks rarely get done. Give each one a date (the planner can do it for you).",
            score=30)

    # 7. Encouragement / momentum
    if len(done_recent) >= 3:
        add("momentum", "info",
            f"Nice streak — {len(done_recent)} tasks completed this week",
            "You're shipping consistently. Keep protecting your focus blocks.",
            score=20)
    if not open_tasks:
        add("empty", "info", "Inbox zero", "No open tasks. Great time for deep work or planning ahead.", score=10)

    recs.sort(key=lambda r: r["score"], reverse=True)
    db.commit()  # persist refreshed agent scores
    return recs
