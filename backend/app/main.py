"""Taskie backend — FastAPI application entry point."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import agent, auth, files, tasks, users

init_db()

app = FastAPI(title="Taskie API", version="1.0.0",
              description="Agentic task management with file upload & preview.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(tasks.router)
app.include_router(files.router)
app.include_router(agent.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "taskie"}
