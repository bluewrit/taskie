"""The agent brain: a perceive → reason → act → reflect loop.

By default it runs the built-in deterministic engine (always available,
no API key needed). If OPENAI_API_KEY (optionally OPENAI_BASE_URL /
OPENAI_MODEL) is configured, it upgrades to an LLM with function calling
over the same tool registry.
"""
import json
import os
import urllib.request
from datetime import date

from ...models import Task
from . import nlp
from .tools import TOOLS, log_action

TOOL_SCHEMAS = [
    {"name": "list_tasks", "description": "List open/recent tasks, optionally filtered by status",
     "parameters": {"status": "optional: todo|in_progress|done|blocked", "limit": "int"}},
    {"name": "search_tasks", "description": "Search tasks by title/description substring",
     "parameters": {"query": "string"}},
    {"name": "create_task", "description": "Create a new task",
     "parameters": {"title": "string", "priority": "low|medium|high|critical",
                    "due_date": "YYYY-MM-DD", "estimated_minutes": "int",
                    "project_name": "optional string"}},
    {"name": "update_task", "description": "Change status/priority/date/progress of a task",
     "parameters": {"task_id": "int", "title": "fallback fuzzy title",
                    "status": "todo|in_progress|done|blocked", "priority": "…",
                    "due_date": "YYYY-MM-DD", "progress": "0-100"}},
    {"name": "complete_task", "description": "Mark a task done",
     "parameters": {"task_id": "int", "title": "fallback fuzzy title"}},
    {"name": "delete_task", "description": "Delete a task",
     "parameters": {"task_id": "int", "title": "fallback fuzzy title"}},
    {"name": "reschedule_task", "description": "Move a task's due date",
     "parameters": {"task_id": "int", "title": "fallback fuzzy title", "due_date": "YYYY-MM-DD"}},
    {"name": "recommendations", "description": "Generate proactive efficiency recommendations",
     "parameters": {}},
    {"name": "plan", "description": "Build a day-by-day schedule for the backlog",
     "parameters": {"horizon_days": "int"}},
    {"name": "evaluate", "description": "Compute performance metrics, grade and feedback",
     "parameters": {}},
]


def llm_configured() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


def _workspace_context(db) -> dict:
    total = db.query(Task).count()
    open_n = db.query(Task).filter(Task.status != "done").count()
    today = date.today()
    due_today = db.query(Task).filter(Task.due_date == today, Task.status != "done").count()
    return {"total_tasks": total, "open_tasks": open_n, "due_today": due_today}


# ------------------------------------------------------------------ brain
def run(db, message: str, user=None) -> dict:
    """Full agent loop for one user message. Returns reply + trace.

    `user` (a models.User) personalises the loop: created tasks default to
    them, listings/plans/recommendations/evaluations scope to their work."""
    reasoning = []

    # PERCEIVE
    intent = nlp.detect_intent(message)
    entities = nlp.extract_entities(message)
    context = _workspace_context(db)
    reasoning.append(
        f"Perceived intent '{intent}' with entities {entities or '—'} "
        f"(workspace: {context['open_tasks']} open, {context['due_today']} due today)."
    )

    # REASON -> tool plan
    plan: list[tuple[str, dict]] = []
    if intent == "create_task":
        title = entities.get("title")
        if not title:
            return _reply("I couldn't find a task name in that. Try: “add task Review Q3 report due friday high priority”.",
                          reasoning, [])
        assignee_id = user.id if user else None
        if entities.get("assignee_name"):
            from .tools import resolve_user
            target = resolve_user(db, entities["assignee_name"])
            if target:
                assignee_id = target.id
                reasoning.append(f"Resolved assignee '{entities['assignee_name']}' → {target.full_name}.")
            else:
                reasoning.append(f"No user matches '{entities['assignee_name']}' — leaving it to you.")
        args = {
            "title": title,
            "priority": entities.get("priority", "medium"),
            "due_date": entities.get("due_date"),
            "estimated_minutes": entities.get("estimated_minutes", 60),
            "project_name": entities.get("project_name"),
            "assignee_id": assignee_id,
        }
        plan.append(("create_task", args))
        reasoning.append(
            f"Planned create_task(title={title!r}, priority={args['priority']}, due={args['due_date'] or 'none'}).")
    elif intent == "complete_task":
        plan.append(("complete_task", {k: entities[k] for k in ("task_id", "title") if k in entities}))
        reasoning.append("Planned complete_task on the referenced task.")
    elif intent == "reschedule_task":
        plan.append(("reschedule_task", {k: entities[k] for k in ("task_id", "title", "due_date") if k in entities}))
        reasoning.append("Planned reschedule_task.")
    elif intent == "delete_task":
        plan.append(("delete_task", {k: entities[k] for k in ("task_id", "title") if k in entities}))
        reasoning.append("Planned delete_task.")
    elif intent == "update_task":
        plan.append(("update_task", entities))
        reasoning.append("Planned update_task.")
    elif intent == "list_tasks":
        plan.append(("list_tasks", {"status": entities.get("status"), "limit": 10,
                                    "assignee_id": user.id if user else None}))
        reasoning.append("Planned list_tasks to summarise your assigned backlog.")
    elif intent == "next_task":
        plan.append(("recommendations", {"user_id": user.id if user else None}))
        reasoning.append("Planned recommendations to pick your highest-leverage next action.")
    elif intent == "plan":
        horizon = nlp.horizon_days(message)
        plan.append(("plan", {"horizon_days": horizon, "user_id": user.id if user else None}))
        reasoning.append(f"Planned plan(horizon_days={horizon}).")
    elif intent == "evaluate":
        plan.append(("evaluate", {"user_id": user.id if user else None}))
        reasoning.append("Planned evaluate to grade your performance.")
    elif intent == "recommend":
        plan.append(("recommendations", {"user_id": user.id if user else None}))
        reasoning.append("Planned recommendations.")
    elif intent == "greeting":
        return _reply(_greeting(context, user), reasoning, [])
    else:
        return _reply(_fallback(context), reasoning, [])

    # ACT
    actions = []
    results = {}
    for tool_name, args in plan:
        reasoning.append(f"Acting: {tool_name}({args}).")
        result = TOOLS[tool_name](db, **args)
        results[tool_name] = result
        actions.append({"tool": tool_name, "args": args, "result": result})

    # REFLECT -> natural-language reply
    reply = _compose(intent, results, context)
    log_action(db, "chat", f"Chat: {message[:80]} → {intent}",
               {"intent": intent, "actions": [a["tool"] for a in actions]})
    return {"reply": reply, "reasoning": reasoning, "actions": actions}


# ------------------------------------------------------------------ replies
def _reply(reply, reasoning, actions):
    return {"reply": reply, "reasoning": reasoning, "actions": actions}


def _greeting(ctx, user=None):
    name = (user.full_name or user.username).split()[0] if user else "there"
    return (
        f"Hey {name}! I'm your task agent. Your workspace has {ctx['open_tasks']} open task(s)"
        f"{f', {ctx[chr(100)+chr(117)+chr(101)+chr(95)+chr(116)+chr(111)+chr(100)+chr(97)+chr(121)]} due today' if ctx['due_today'] else ''}. "
        "Try: “add task Fix login bug due tomorrow high priority”, “what should I do next?”, "
        "“plan my week”, or “how am I doing?”."
    )


def _fallback(ctx):
    return (
        "I can manage tasks and coach your workflow. Examples:\n"
        "• “add task Prepare demo slides due friday high priority”\n"
        "• “show my open tasks” / “what should I do next?”\n"
        "• “complete #3” / “mark Prepare demo slides done”\n"
        "• “plan my week” • “evaluate my performance” • “any suggestions?”"
    )


def _compose(intent, results, ctx) -> str:
    if intent == "create_task":
        r = results["create_task"]
        if r.get("created"):
            due = f", due {r['due_date']}" if r.get("due_date") else ""
            who = f", assigned to {r['assignee']}" if r.get("assignee") and r["assignee"] != "unassigned" else ""
            return (f"✅ Created task #{r['task_id']} “{r['title']}” "
                    f"[{r['priority']} priority{due}{who}]. I'll factor it into your next plan.")
        return f"⚠️ Could not create the task: {r.get('error')}"

    if intent == "complete_task":
        r = results["complete_task"]
        if r.get("completed"):
            return (f"🎉 Marked #{r['task_id']} “{r['title']}” as done. "
                    f"{ctx['open_tasks'] - 1} open task(s) remain.")
        return f"⚠️ {r.get('error')} Tell me the task name or its #id."

    if intent == "delete_task":
        r = results["delete_task"]
        return (f"🗑️ Deleted #{r['task_id']} “{r['title']}”." if r.get("deleted")
                else f"⚠️ {r.get('error')}")

    if intent == "reschedule_task":
        r = results["reschedule_task"]
        if r.get("rescheduled"):
            return f"📅 Moved #{r['task_id']} “{r['title']}” to {r['due_date']}."
        return f"⚠️ {r.get('error')}"

    if intent == "update_task":
        r = results["update_task"]
        if r.get("updated"):
            ch = ", ".join(f"{k}={v}" for k, v in r["changes"].items())
            return f"✏️ Updated #{r['task_id']} “{r['title']}”: {ch}."
        return f"⚠️ {r.get('error')}"

    if intent == "list_tasks":
        r = results["list_tasks"]
        if not r["count"]:
            return "Your backlog is empty — add a task and I'll start scheduling it."
        lines = [f"📋 Top {r['count']} task(s) by agent score:"]
        for t in r["tasks"][:8]:
            due = f" · due {t['due_date']}" if t["due_date"] else ""
            lines.append(f"• #{t['id']} {t['title']} [{t['status']} · {t['priority']} · score {t['agent_score']}{due}]")
        return "\n".join(lines)

    if intent in ("next_task", "recommend"):
        recs = results["recommendations"]["recommendations"]
        if not recs:
            return "Nothing needs attention right now — nice."
        lines = ["🤖 Here's what I recommend:"]
        for r in recs[:5]:
            lines.append(f"• [{r['severity'].upper()}] {r['title']} — {r['message']}")
        return "\n".join(lines)

    if intent == "plan":
        p = results["plan"]
        s = p["summary"]
        lines = [f"🗓️ {p['horizon_days']}-day plan ready: {s['tasks_planned']} task(s), "
                 f"{s['total_focus_minutes'] // 60}h of focus work."]
        for day in p["schedule"][:3]:
            if day["blocks"]:
                lines.append(f"• {day['weekday']} {day['date']}: " +
                             ", ".join(b["title"] for b in day["blocks"][:3]))
        if s["unscheduled"]:
            lines.append(f"⚠️ {s['unscheduled']} task(s) couldn't be scheduled — open the Planner tab to review.")
        return "\n".join(lines)

    if intent == "evaluate":
        e = results["evaluate"]
        lines = [f"📊 Performance grade: {e['grade']} ({e['overall_score']}/100), "
                 f"backlog health {e['backlog_health']}/100."]
        for fb in e["feedback"][:3]:
            lines.append(f"• {fb}")
        return "\n".join(lines)

    return _fallback(ctx)


# ------------------------------------------------------------------ LLM mode
def run_llm(db, message: str, user=None) -> dict:
    """LLM-powered variant of the loop (OpenAI-compatible function calling)."""
    api_key = os.environ["OPENAI_API_KEY"]
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    reasoning = [f"LLM mode active (model={model})."]

    tools = [{
        "type": "function",
        "function": {
            "name": name,
            "description": schema["description"],
            "parameters": {
                "type": "object",
                "properties": {k: {"type": "string", "description": v} for k, v in schema["parameters"].items()},
            },
        },
    } for name, schema in zip([s["name"] for s in TOOL_SCHEMAS], TOOL_SCHEMAS)]

    messages = [
        {"role": "system", "content": "You are Taskie's task-management agent. Use tools to act on the user's workspace."},
        {"role": "user", "content": message},
    ]
    actions = []
    for _ in range(6):  # tool-call loop
        req = urllib.request.Request(
            f"{base}/chat/completions",
            data=json.dumps({"model": model, "messages": messages, "tools": tools}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        choice = data["choices"][0]["message"]
        calls = choice.get("tool_calls") or []
        if not calls:
            reply = choice.get("content") or "Done."
            log_action(db, "chat", f"LLM chat: {message[:80]}", {"actions": [a["tool"] for a in actions]})
            return {"reply": reply, "reasoning": reasoning, "actions": actions}
        messages.append(choice)
        for call in calls:
            name = call["function"]["name"]
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            reasoning.append(f"LLM chose {name}({args}).")
            result = TOOLS.get(name, lambda *_a, **_k: {"error": "unknown tool"})(db, **args)
            actions.append({"tool": name, "args": args, "result": result})
            messages.append({"role": "tool", "tool_call_id": call["id"],
                             "content": json.dumps(result, default=str)[:4000]})
    return {"reply": "I've completed a series of actions — see the list.", "reasoning": reasoning, "actions": actions}


def chat(db, message: str, user=None) -> dict:
    if llm_configured():
        try:
            return run_llm(db, message, user)
        except Exception as exc:  # fall back to built-in engine
            fallback = run(db, message, user)
            fallback["reasoning"].insert(0, f"LLM call failed ({exc}); used built-in engine.")
            return fallback
    return run(db, message, user)
