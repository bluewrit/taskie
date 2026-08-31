"""Lightweight natural-language understanding for the agent chat.

Deterministic intent + entity parsing (no external LLM required). When an
OpenAI-compatible API key is configured the brain prefers the LLM, but this
module guarantees the assistant always works offline.
"""
import re
from datetime import date, datetime, timedelta

PRIORITIES = ["low", "medium", "high", "critical"]
STATUSES = ["todo", "in_progress", "done", "blocked"]

INTENT_PATTERNS: list[tuple[str, list[str]]] = [
    ("create_task", [
        r"\b(add|create|make|new)\b.*\b(task|todo|to-do|reminder|item)\b",
        r"\b(add|create|schedule|remind me to|remember to)\b.*\b(to|for)\b",
        r"^(add|create|new|remind me to)\b",
    ]),
    ("complete_task", [
        r"\b(complete|complete the|finish|done with|mark.*done|mark.*complete|check off)\b",
    ]),
    ("reschedule_task", [
        r"\b(reschedule|postpone|move|push back|delay|extend)\b",
    ]),
    ("list_tasks", [
        r"\b(show|list|display|what are|whats|what's)\b.*\b(task|todo|backlog|plate|queue)s?\b",
        r"\b(my|open|pending|remaining|incomplete)\b.*\btasks?\b",
        r"^tasks?\??$",
    ]),
    ("next_task", [
        r"\b(what should i do|what('s| is) next|what to do|prioriti[sz]e|"
        r"most (important|urgent)|work on next|focus on)\b",
    ]),
    ("plan", [
        r"\b(plan|schedule|organise|organize|arrange)\b.*\b(my|the)?\s*(day|week|sprint|schedule|agenda)\b",
        r"\bmake (me )?a plan\b",
    ]),
    ("evaluate", [
        r"\b(evaluate|evaluation|how (am|are) i|performance|productivity|"
        r"stats|statistics|metrics|score|report card|review my)\b",
    ]),
    ("recommend", [
        r"\b(recommend|suggestion|suggest|advice|tips?|improve|insight|help me)\b",
    ]),
    ("update_task", [
        r"\b(update|change|edit|set)\b.*\b(task|#\d+)\b",
    ]),
    ("delete_task", [
        r"\b(delete|remove|drop|cancel)\b.*\b(task|#\d+)\b",
    ]),
]

_RELATIVE_DATES = {
    "today": 0, "tonight": 0, "tomorrow": 1, "tmr": 1,
}
_WEEKDAY = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def detect_intent(text: str) -> str:
    low = text.lower().strip()
    for intent, patterns in INTENT_PATTERNS:
        for pat in patterns:
            if re.search(pat, low):
                return intent
    if re.search(r"\b(hi|hello|hey|help|what can you do)\b", low):
        return "greeting"
    return "fallback"


def _resolve_date_phrase(phrase: str) -> date | None:
    phrase = phrase.lower().strip()
    today = date.today()
    if phrase in _RELATIVE_DATES:
        return today + timedelta(days=_RELATIVE_DATES[phrase])
    m = re.match(r"in (\d+) days?", phrase)
    if m:
        return today + timedelta(days=int(m.group(1)))
    m = re.match(r"in (\d+) weeks?", phrase)
    if m:
        return today + timedelta(weeks=int(m.group(1)))
    if phrase.startswith("next week"):
        return today + timedelta(days=(7 - today.weekday()) + 1)
    m = re.match(r"(?:next |on )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)", phrase)
    if m:
        target = _WEEKDAY[m.group(1)]
        delta = (target - today.weekday()) % 7 or 7
        return today + timedelta(days=delta)
    if phrase == "next month":
        month = today.month + 1
        year = today.year + (1 if month > 12 else 0)
        month = 1 if month > 12 else month
        return date(year, month, 1)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", phrase)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    m = re.match(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", phrase)
    if m:
        d, mo, y = m.group(1), m.group(2), m.group(3)
        year = int(y) if y else today.year
        if y and year < 100:
            year += 2000
        try:
            return date(year, int(mo), int(d))
        except ValueError:
            return None
    return None


def extract_entities(text: str) -> dict:
    """Pull task fields out of a free-form sentence."""
    low = text.lower()
    ents: dict = {}

    m = re.search(r"#(\d+)", low)
    if m:
        ents["task_id"] = int(m.group(1))

    for p in reversed(PRIORITIES):
        if re.search(rf"\b{p}\b", low):
            ents["priority"] = p
            break
    if re.search(r"\b(urgent|asap|immediately|critical)\b", low):
        ents["priority"] = "critical"

    for s in STATUSES:
        if re.search(rf"\b{ s.replace('_', ' | ')}\b", low.replace("_", " ")):
            ents["status"] = s
            break
    if re.search(r"\b(in progress|doing|working on)\b", low):
        ents["status"] = "in_progress"
    if re.search(r"\b(blocked|stuck)\b", low):
        ents["status"] = "blocked"
    if re.search(r"\b(done|finished|completed)\b", low):
        ents["status"] = "done"

    m = re.search(r"\bdue\s+(?:on|by|date)?\s*(today|tomorrow|tonight|next\s+\w+|in\s+\d+\s+(?:days?|weeks?)|"
                  r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
                  r"\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)", low)
    if m:
        d = _resolve_date_phrase(m.group(1))
        if d:
            ents["due_date"] = d.isoformat()
    else:
        for phrase in ("today", "tomorrow"):
            if re.search(rf"\b{phrase}\b", low):
                ents["due_date"] = date.today().isoformat() if phrase == "today" else (
                    date.today() + timedelta(days=1)).isoformat()
                break

    m = re.search(r"\b(?:estimate|estimated|est)\D{0,10}?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b", low)
    if m:
        value = float(m.group(1))
        ents["estimated_minutes"] = int(value * 60) if m.group(2)[0] == "h" else int(value)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b", low)
    if "estimated_minutes" not in ents and m:
        value = float(m.group(1))
        ents["estimated_minutes"] = int(value * 60) if m.group(2)[0] == "h" else int(value)

    # Titles: match on the lowercased text but slice from the ORIGINAL so
    # the user's capitalisation survives ("QA pass" stays "QA pass").
    def orig(m, group=1):
        return text[m.start(group):m.end(group)]

    m = re.search(r'\b(?:called|named|titled)\s+["\'](.+?)["\']', low)
    if not m:
        m = re.search(r'["\'](.+?)["\']', low)
    if m:
        ents["title"] = orig(m).strip()
    else:
        m = re.search(
            r"\b(?:add|create|make|new)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?task\s+(?:called|named|titled|for|:)\s*(.+?)"
            r"(?:\s+due\b.*|\s+with\b.*|\s+by\b.*|$)",
            low,
        )
        if m:
            ents["title"] = re.sub(r"[.!?]+$", "", orig(m)).strip()
        else:
            m = re.search(r"\b(?:remind me to|remember to|add|schedule)\s+(.+?)$", low)
            if m:
                title = re.sub(r"[.!?]+$", "", orig(m)).strip()
                title = re.sub(r"\s+(?i:due)\s+.*$", "", title)
                title = re.sub(r"\s+(?i:by|on|before|tomorrow|today|next week)\s*$", "", title)
                if len(title) > 4 and title.lower() not in ("task", "a task", "my tasks"):
                    ents["title"] = title
                else:
                    ents.pop("title", None)

    if "title" in ents:
        ents["title"] = ents["title"][0].upper() + ents["title"][1:]

    m = re.search(r"\b(?:for|in)\s+(?:the\s+)?([a-z][a-z0-9 _-]{2,30}?)\s+project\b", low)
    if m:
        ents["project_name"] = m.group(1).strip().lower()

    m = re.search(r"\bassign(?:ed|ing)?\s+(?:it\s+)?to\s+([a-z][a-z0-9 ._-]{1,40}?)(?:\s+(?:due|by|on|with|and|priority|tomorrow|today|next)\b.*|$)", low)
    if m:
        name = m.group(1).strip().rstrip(".")
        if name not in ("me", "myself", "i"):
            ents["assignee_name"] = name
        else:
            ents["assignee_self"] = True

    return ents


def horizon_days(text: str) -> int:
    low = text.lower()
    if "month" in low:
        return 30
    if "sprint" in low:
        return 14
    if "week" in low:
        return 7
    m = re.search(r"(\d+)\s*days?", low)
    if m:
        return max(1, min(int(m.group(1)), 30))
    return 1
