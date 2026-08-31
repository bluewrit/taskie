"""Performance evaluation.

Computes productivity metrics (completion rate, on-time rate, cycle time,
throughput, backlog health), assigns a grade and produces written feedback.
"""
from datetime import date, datetime, timedelta


def evaluate(db) -> dict:
    from ...models import Task

    today = date.today()
    tasks = db.query(Task).all()
    done = [t for t in tasks if t.status == "done"]
    open_tasks = [t for t in tasks if t.status != "done"]

    # completion rate
    completion_rate = round(100 * len(done) / len(tasks), 1) if tasks else 0.0

    # on-time rate among completed tasks that had a due date
    dated_done = [t for t in done if t.due_date and t.completed_at]
    on_time = [
        t for t in dated_done
        if t.completed_at.date() <= (t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date)
    ]
    on_time_rate = round(100 * len(on_time) / len(dated_done), 1) if dated_done else None

    # average cycle time (created -> completed) in days
    cycles = [
        (t.completed_at - t.created_at).total_seconds() / 86400
        for t in done if t.completed_at
    ]
    avg_cycle_days = round(sum(cycles) / len(cycles), 1) if cycles else None

    # overdue open
    overdue = [
        t for t in open_tasks
        if t.due_date and (t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date) < today
    ]

    # throughput: completed per day over the last 14 days
    throughput = []
    for i in range(13, -1, -1):
        day = today - timedelta(days=i)
        n = sum(1 for t in done if t.completed_at and t.completed_at.date() == day)
        throughput.append({"date": day.isoformat(), "completed": n})
    last7 = sum(x["completed"] for x in throughput[-7:])

    # backlog health score 0-100
    health = 100.0
    health -= min(30, len(overdue) * 8)
    health -= min(20, len(open_tasks) * 2)
    if on_time_rate is not None:
        health -= max(0, (80 - on_time_rate)) * 0.4
    wip = sum(1 for t in open_tasks if t.status == "in_progress")
    if wip > 3:
        health -= (wip - 3) * 5
    blocked = sum(1 for t in open_tasks if t.status == "blocked")
    health -= blocked * 6
    health = round(max(0, min(100, health)), 1)

    # overall score + grade
    parts = [health]
    if on_time_rate is not None:
        parts.append(on_time_rate)
    parts.append(completion_rate)
    overall = round(sum(parts) / len(parts), 1)
    grade = ("A" if overall >= 85 else "B" if overall >= 70 else
             "C" if overall >= 55 else "D" if overall >= 40 else "F")

    # per-project breakdown
    projects = {}
    for t in tasks:
        key = t.project.name if t.project else "No project"
        p = projects.setdefault(key, {"total": 0, "done": 0, "overdue": 0})
        p["total"] += 1
        if t.status == "done":
            p["done"] += 1
        elif t.due_date and (t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date) < today:
            p["overdue"] += 1
    for p in projects.values():
        p["completion_percent"] = round(100 * p["done"] / p["total"], 1) if p["total"] else 0

    # written feedback
    feedback = []
    if not tasks:
        feedback.append("No tasks yet — create a few and the agent will start evaluating you.")
    if overdue:
        feedback.append(f"{len(overdue)} open task(s) are overdue. Clearing these is your highest-leverage move.")
    if on_time_rate is not None and on_time_rate < 60:
        feedback.append(f"Only {on_time_rate}% of finished tasks landed on time — your estimates or dates are too optimistic; pad estimates by ~30%.")
    if on_time_rate is not None and on_time_rate >= 85:
        feedback.append(f"Strong delivery discipline: {on_time_rate}% on-time completion.")
    if wip > 3:
        feedback.append(f"{wip} tasks in progress simultaneously — reduce WIP to 2-3 for better throughput.")
    if last7 >= 5:
        feedback.append(f"Throughput is healthy: {last7} tasks completed in the last 7 days.")
    elif last7 == 0 and tasks:
        feedback.append("Nothing completed in the last 7 days. Pick the single highest-scored task and finish it today.")
    if avg_cycle_days is not None and avg_cycle_days > 10:
        feedback.append(f"Average cycle time is {avg_cycle_days} days — try splitting long tasks into sub-tasks under 2 days.")

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "grade": grade,
        "overall_score": overall,
        "backlog_health": health,
        "metrics": {
            "total_tasks": len(tasks),
            "open_tasks": len(open_tasks),
            "completed_tasks": len(done),
            "completion_rate": completion_rate,
            "on_time_rate": on_time_rate,
            "avg_cycle_days": avg_cycle_days,
            "overdue_open": len(overdue),
            "blocked_open": blocked,
            "wip": wip,
            "completed_last_7_days": last7,
        },
        "throughput": throughput,
        "projects": projects,
        "feedback": feedback,
    }
