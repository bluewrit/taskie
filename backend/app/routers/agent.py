"""Agentic AI endpoints: chat, recommendations, planning, evaluation."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AgentAction
from ..schemas import AgentActionOut, ChatMessage, ChatReply
from ..services.agent import brain
from ..services.agent.evaluator import evaluate
from ..services.agent.planner import build_plan
from ..services.agent.recommender import generate_recommendations
from ..services.agent.tools import TOOLS, log_action

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/chat", response_model=ChatReply)
def agent_chat(payload: ChatMessage, db: Session = Depends(get_db)):
    return brain.chat(db, payload.message)


@router.get("/recommendations")
def agent_recommendations(apply: bool = False, db: Session = Depends(get_db)):
    """Get ranked recommendations; with ?apply=true the agent auto-executes
    the safe, high-confidence actions itself (agentic mode)."""
    recs = generate_recommendations(db)
    applied = []
    if apply:
        for rec in recs:
            action = rec.get("action")
            if not action or rec["severity"] not in ("high", "critical"):
                continue
            kind = action.pop("kind")
            if kind == "status":
                result = TOOLS["update_task"](db, status=action["status"], task_id=action["task_id"])
            elif kind == "reschedule":
                result = TOOLS["reschedule_task"](db, task_id=action["task_id"], due_date=action["due_date"])
            elif kind == "priority":
                result = TOOLS["update_task"](db, priority=action["priority"], task_id=action["task_id"])
            elif kind == "start":
                result = TOOLS["update_task"](db, status="in_progress", task_id=action["task_id"])
            else:
                continue
            applied.append({"recommendation": rec["title"], "action": kind, "result": result})
            log_action(db, "proactive", f"Auto-applied '{kind}' for: {rec['title']}",
                       {"action": action, "result": result})
    return {"recommendations": recs, "applied": applied}


@router.get("/plan")
def agent_plan(horizon: int = 7, capacity_minutes: int | None = None, db: Session = Depends(get_db)):
    horizon = max(1, min(horizon, 30))
    kwargs = {"horizon_days": horizon}
    if capacity_minutes:
        kwargs["capacity_minutes"] = max(60, min(capacity_minutes, 16 * 60))
    return build_plan(db, **kwargs)


@router.get("/evaluation")
def agent_evaluation(db: Session = Depends(get_db)):
    return evaluate(db)


@router.get("/actions", response_model=list[AgentActionOut])
def agent_actions(limit: int = 30, db: Session = Depends(get_db)):
    return (
        db.query(AgentAction).order_by(AgentAction.id.desc()).limit(max(1, min(limit, 100))).all()
    )


@router.get("/status")
def agent_status(db: Session = Depends(get_db)):
    return {
        "engine": "llm" if brain.llm_configured() else "builtin",
        "tools": list(TOOLS.keys()),
    }
