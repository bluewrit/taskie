"""Automatic task planning.

Turns the open backlog into a day-by-day schedule respecting due dates,
agent priority scores and a daily focus-time capacity.
"""
from datetime import date, datetime, timedelta

DAILY_CAPACITY_MINUTES = 6 * 60  # 6h of realistic focus time per day


def build_plan(db, horizon_days: int = 7, capacity_minutes: int = DAILY_CAPACITY_MINUTES,
               user_id: int | None = None) -> dict:
    """Schedule open tasks day-by-day. Personalised to user_id when given
    (their tasks + unassigned ones)."""
    from sqlalchemy import or_

    from ...models import Task
    from .recommender import compute_agent_score

    today = date.today()
    query = db.query(Task).filter(Task.status != "done")
    if user_id is not None:
        query = query.filter(or_(Task.assignee_id == user_id, Task.assignee_id.is_(None)))
    open_tasks = query.all()
    for t in open_tasks:
        t.agent_score, t.agent_note = compute_agent_score(t, today)
    db.commit()

    def sort_key(t):
        due = t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date
        due_rank = (due - today).days if due else 999
        return (due_rank, -t.agent_score, t.id)

    ordered = sorted(open_tasks, key=sort_key)

    days = []
    used = {today + timedelta(days=i): 0 for i in range(horizon_days)}
    unscheduled = []

    for t in ordered:
        est = max(15, t.estimated_minutes or 60)
        placed = False
        due = t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date
        for day in sorted(used):
            if due and day > due:
                break  # must be scheduled on or before the due date
            if used[day] + est <= capacity_minutes:
                used[day] += est
                days.append((day, t))
                placed = True
                break
        if not placed:
            # overflow: append to the last day anyway, flagged
            last = max(used)
            if due is None:
                unscheduled.append(t)
            else:
                used[last] += est
                days.append((last, t))

    # group by day
    schedule = []
    day_map: dict[date, list] = {}
    for day, t in days:
        day_map.setdefault(day, []).append(t)
    for i in range(horizon_days):
        day = today + timedelta(days=i)
        tasks = day_map.get(day, [])
        start_hour = 9
        blocks = []
        cursor = start_hour * 60
        for t in tasks:
            est = max(15, t.estimated_minutes or 60)
            blocks.append({
                "task_id": t.id,
                "title": t.title,
                "priority": t.priority,
                "status": t.status,
                "agent_score": t.agent_score,
                "estimated_minutes": est,
                "time": f"{cursor // 60:02d}:{cursor % 60:02d}",
                "assignee": t.assignee.full_name if t.assignee else None,
                "assignee_color": t.assignee.color if t.assignee else None,
                "due_date": (t.due_date.date() if isinstance(t.due_date, datetime) else t.due_date).isoformat()
                if t.due_date else None,
            })
            cursor += est + 15  # 15-minute buffer between blocks
        total = sum(b["estimated_minutes"] for b in blocks)
        schedule.append({
            "date": day.isoformat(),
            "weekday": day.strftime("%A"),
            "is_today": i == 0,
            "blocks": blocks,
            "load_minutes": total,
            "load_percent": round(100 * total / capacity_minutes),
        })

    total_focus = sum(s["load_minutes"] for s in schedule)
    return {
        "horizon_days": horizon_days,
        "capacity_minutes_per_day": capacity_minutes,
        "generated_at": datetime.utcnow().isoformat(),
        "schedule": schedule,
        "unscheduled": [
            {"task_id": t.id, "title": t.title, "reason": "No capacity left in the horizon — consider extending it or delegating."}
            for t in unscheduled
        ],
        "summary": {
            "tasks_planned": len(days),
            "unscheduled": len(unscheduled),
            "total_focus_minutes": total_focus,
            "busiest_day": max((s["date"] for s in schedule), key=lambda d: next(x["load_minutes"] for x in schedule if x["date"] == d)) if schedule else None,
        },
    }
