"""End-to-end API tests: tasks, file upload/preview, agent chat/plan/eval."""
import json
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

import pytest

# isolate the database before importing the app
_TMP = tempfile.mkdtemp()
os.environ["TASKIE_DATA_DIR"] = _TMP
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def _auth_headers(username="tester", password="secret123"):
    r = client.post("/api/auth/register", json={
        "username": username, "password": password, "full_name": "Test User"})
    if r.status_code == 409:  # already registered (repeat runs)
        r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]


AUTH, ME = _auth_headers()
client.headers.update(AUTH)
TOKEN = AUTH["Authorization"].removeprefix("Bearer ")


def _create_task(title="Test task", **kw):
    payload = {"title": title, "priority": kw.pop("priority", "medium"),
               "due_date": kw.pop("due_date", None), **kw}
    r = client.post("/api/tasks", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


# ------------------------------------------------------------------ tasks
def test_health():
    assert client.get("/api/health").json()["status"] == "ok"


def test_task_crud():
    t = _create_task("Write tests", priority="high")
    tid = t["id"]
    assert client.get(f"/api/tasks/{tid}").json()["title"] == "Write tests"

    r = client.put(f"/api/tasks/{tid}", json={"status": "in_progress", "progress": 50})
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"

    r = client.post(f"/api/tasks/{tid}/complete")
    assert r.json()["status"] == "done"
    assert r.json()["progress"] == 100
    assert r.json()["completed_at"] is not None

    assert client.delete(f"/api/tasks/{tid}").status_code == 204
    assert client.get(f"/api/tasks/{tid}").status_code == 404


def test_task_validation():
    assert client.post("/api/tasks", json={"title": ""}).status_code == 422
    assert client.post("/api/tasks", json={"title": "x", "status": "bogus"}).status_code == 422


# ------------------------------------------------------------------ files
def test_upload_and_text_preview():
    t = _create_task("Files task")
    r = client.post(f"/api/tasks/{t['id']}/files",
                    files={"file": ("hello.txt", b"hello world", "text/plain")})
    assert r.status_code == 201, r.text
    fid = r.json()["id"]
    assert r.json()["size"] == 11

    prev = client.get(f"/api/files/{fid}/preview").json()
    assert prev["kind"] == "text"
    assert prev["content"] == "hello world"

    raw = client.get(f"/api/files/{fid}/raw", params={"token": TOKEN})
    assert raw.status_code == 200
    assert raw.content == b"hello world"
    assert raw.headers["accept-ranges"] == "bytes"


def test_upload_csv_preview_is_table():
    t = _create_task("CSV task")
    csv_bytes = b"name,qty\napple,3\npear,7\n"
    fid = client.post(f"/api/tasks/{t['id']}/files",
                      files={"file": ("stock.csv", csv_bytes, "text/csv")}).json()["id"]
    prev = client.get(f"/api/files/{fid}/preview").json()
    assert prev["kind"] == "table"
    assert prev["columns"] == ["name", "qty"]
    assert prev["rows"][1] == ["pear", "7"]


def test_upload_docx_preview_extracts_text():
    import io
    import docx
    doc = docx.Document()
    doc.add_paragraph("Alpha content marker")
    buf = io.BytesIO()
    doc.save(buf)

    t = _create_task("Docx task")
    fid = client.post(f"/api/tasks/{t['id']}/files",
                      files={"file": ("doc.docx", buf.getvalue(),
                                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
                      ).json()["id"]
    prev = client.get(f"/api/files/{fid}/preview").json()
    assert prev["kind"] == "document"
    assert "Alpha content marker" in prev["content"]


def test_upload_xlsx_preview_is_sheets():
    import io
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "S1"
    ws.append(["a", "b"])
    ws.append([1, 2])
    buf = io.BytesIO()
    wb.save(buf)

    t = _create_task("Xlsx task")
    fid = client.post(f"/api/tasks/{t['id']}/files",
                      files={"file": ("book.xlsx", buf.getvalue(),
                                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                      ).json()["id"]
    prev = client.get(f"/api/files/{fid}/preview").json()
    assert prev["kind"] == "sheets"
    assert prev["sheets"][0]["name"] == "S1"
    assert prev["sheets"][0]["columns"] == ["a", "b"]


def test_upload_zip_preview_lists_entries():
    import io
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("inner/a.txt", "hi")
    t = _create_task("Zip task")
    fid = client.post(f"/api/tasks/{t['id']}/files",
                      files={"file": ("bundle.zip", buf.getvalue(), "application/zip")}).json()["id"]
    prev = client.get(f"/api/files/{fid}/preview").json()
    assert prev["kind"] == "archive"
    assert any(e["name"].startswith("inner/") for e in prev["entries"])


def test_range_request_returns_206():
    t = _create_task("Range task")
    fid = client.post(f"/api/tasks/{t['id']}/files",
                      files={"file": ("blob.bin", bytes(range(256)), "application/octet-stream")}).json()["id"]
    r = client.get(f"/api/files/{fid}/raw", headers={"Range": "bytes=10-19"},
                     params={"token": TOKEN})
    assert r.status_code == 206
    assert r.content == bytes(range(10, 20))
    assert r.headers["content-range"] == "bytes 10-19/256"


def test_download_forces_attachment():
    t = _create_task("Download task")
    fid = client.post(f"/api/tasks/{t['id']}/files",
                      files={"file": ("data.bin", b"\x00\x01", "application/octet-stream")}).json()["id"]
    r = client.get(f"/api/files/{fid}/download", params={"token": TOKEN})
    assert "attachment" in r.headers["content-disposition"]


def test_delete_file():
    t = _create_task("Delete file task")
    fid = client.post(f"/api/tasks/{t['id']}/files",
                      files={"file": ("x.txt", b"x", "text/plain")}).json()["id"]
    assert client.delete(f"/api/files/{fid}").status_code == 204
    assert client.get(f"/api/files/{fid}/preview").status_code == 404


# ------------------------------------------------------------------ agent
def test_agent_create_task_via_chat():
    r = client.post("/api/agent/chat", json={
        "message": 'add task "Prepare investor deck" due tomorrow high priority'})
    assert r.status_code == 200, r.text
    body = r.json()
    created = [a for a in body["actions"] if a["tool"] == "create_task"]
    assert created and created[0]["result"]["created"]
    assert created[0]["result"]["priority"] == "high"
    assert created[0]["result"]["due_date"] == (date.today() + timedelta(days=1)).isoformat()


def test_agent_create_task_bare_weekday_due_date():
    from datetime import date as _date, timedelta as _td
    r = client.post("/api/agent/chat", json={
        "message": 'add task "Prepare keynote slides" due friday critical priority'})
    created = [a for a in r.json()["actions"] if a["tool"] == "create_task"][0]["result"]
    assert created["created"] and created["priority"] == "critical"
    # resolve the expected next Friday the same way the NLU does
    today = _date.today()
    expected = today + _td(days=(4 - today.weekday()) % 7 or 7)
    assert created["due_date"] == expected.isoformat()
    client.delete(f"/api/tasks/{created['task_id']}")  # cleanup


def test_chat_preserves_title_casing():
    r = client.post("/api/agent/chat", json={
        "message": 'add task "QA pass on Previews" due tomorrow'})
    created = [a for a in r.json()["actions"] if a["tool"] == "create_task"][0]["result"]
    assert created["title"] == "QA pass on Previews"
    client.delete(f"/api/tasks/{created['task_id']}")


def test_agent_complete_task_via_chat():
    t = _create_task("Finish the quarterly report")
    r = client.post("/api/agent/chat", json={"message": f"mark task #{t['id']} done"})
    assert any(a["tool"] == "complete_task" and a["result"].get("completed") for a in r.json()["actions"])
    assert client.get(f"/api/tasks/{t['id']}").json()["status"] == "done"


def test_agent_recommendations_and_apply():
    _create_task("Overdue urgent thing", priority="critical",
                 due_date=(date.today() - timedelta(days=3)).isoformat())
    r = client.get("/api/agent/recommendations")
    recs = r.json()["recommendations"]
    assert any(rec["type"] == "overdue" for rec in recs)
    # scores were persisted
    tasks = client.get("/api/tasks", params={"status": "todo"}).json()
    assert any(t["agent_score"] > 0 for t in tasks)

    r2 = client.get("/api/agent/recommendations", params={"apply": True})
    assert r2.status_code == 200
    assert isinstance(r2.json()["applied"], list)


def test_agent_plan():
    r = client.get("/api/agent/plan", params={"horizon": 5})
    plan = r.json()
    assert plan["horizon_days"] == 5
    assert len(plan["schedule"]) == 5
    assert plan["summary"]["tasks_planned"] >= 1


def test_agent_evaluation():
    r = client.get("/api/agent/evaluation")
    ev = r.json()
    assert ev["grade"] in list("ABCDF")
    assert 0 <= ev["overall_score"] <= 100
    assert "metrics" in ev and "throughput" in ev
    assert len(ev["throughput"]) == 14


def test_agent_actions_logged():
    r = client.get("/api/agent/actions")
    kinds = {a["kind"] for a in r.json()}
    assert "chat" in kinds


# ------------------------------------------------------------------ auth & users
def test_unauthenticated_requests_rejected():
    anon = TestClient(app)
    assert anon.get("/api/tasks").status_code == 401
    assert anon.get("/api/agent/recommendations").status_code == 401
    assert anon.post("/api/tasks", json={"title": "nope"}).status_code == 401


def test_login_wrong_password():
    anon = TestClient(app)
    r = anon.post("/api/auth/login", json={"username": "tester", "password": "wrong"})
    assert r.status_code == 401


def test_login_and_me_roundtrip():
    anon = TestClient(app)
    r = anon.post("/api/auth/login", json={"username": "tester", "password": "secret123"})
    assert r.status_code == 200
    token = r.json()["token"]
    me = anon.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["username"] == "tester"
    assert me["color"].startswith("#")


def test_register_duplicate_username():
    anon = TestClient(app)
    r = anon.post("/api/auth/register", json={"username": "tester", "password": "abcd1234"})
    assert r.status_code == 409


def test_users_list_and_stats():
    users = client.get("/api/users").json()
    assert any(u["username"] == "tester" for u in users)
    stats = client.get("/api/users/stats").json()
    assert any(s["username"] == "tester" for s in stats)
    assert all({"open", "overdue", "done_7d", "load_minutes"} <= set(s) for s in stats)


def test_create_teammate_and_delete():
    r = client.post("/api/users", json={"username": "temp.mate", "password": "temp1234",
                                        "full_name": "Temp Mate"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.delete(f"/api/users/{uid}").status_code == 204


def test_task_assignment_and_filters():
    mate = client.post("/api/users", json={"username": "assignee1", "password": "temp1234"}).json()
    t = _create_task("Assigned work", assignee_id=mate["id"])
    assert t["assignee"]["username"] == "assignee1"

    mine = client.get("/api/tasks", params={"mine": True}).json()
    assert all(x["assignee"] and x["assignee"]["id"] == ME["id"] for x in mine if x["assignee"])

    theirs = client.get("/api/tasks", params={"assignee_id": mate["id"]}).json()
    assert [x["id"] for x in theirs] == [t["id"]]

    # unassign
    r = client.put(f"/api/tasks/{t['id']}", json={"assignee_id": None})
    assert r.json()["assignee"] is None

    # invalid assignee rejected
    assert client.post("/api/tasks", json={"title": "x", "assignee_id": 99999}).status_code == 422
    client.delete(f"/api/users/{mate['id']}")


def test_chat_assigns_to_me_by_default():
    r = client.post("/api/agent/chat", json={"message": 'add task "My personal errand" due tomorrow'})
    created = [a for a in r.json()["actions"] if a["tool"] == "create_task"][0]["result"]
    assert created["created"]
    task = client.get(f"/api/tasks/{created['task_id']}").json()
    assert task["assignee"]["id"] == ME["id"]
    client.delete(f"/api/tasks/{created['task_id']}")


def test_chat_assign_to_teammate_by_name():
    mate = client.post("/api/users", json={"username": "zoe", "password": "temp1234",
                                           "full_name": "Zoe Quinn"}).json()
    r = client.post("/api/agent/chat",
                    json={"message": 'add task "Design review" assign to Zoe Quinn due tomorrow'})
    created = [a for a in r.json()["actions"] if a["tool"] == "create_task"][0]["result"]
    task = client.get(f"/api/tasks/{created['task_id']}").json()
    assert task["assignee"]["username"] == "zoe"
    client.delete(f"/api/tasks/{created['task_id']}")
    client.delete(f"/api/users/{mate['id']}")


def test_cookie_only_auth_survives_header_stripping_proxy():
    """The preview proxy strips Authorization headers — cookies must work alone."""
    anon = TestClient(app)
    r = anon.post("/api/auth/login", json={"username": "demo", "password": "taskie123"})
    assert r.status_code == 200
    assert "taskie_token" in r.cookies

    # simulate the proxy: strip every Authorization header, keep the cookie jar
    anon.headers.pop("Authorization", None)
    assert anon.get("/api/tasks").status_code == 200
    assert anon.get("/api/agent/recommendations").status_code == 200
    assert anon.get("/api/auth/me").json()["username"] == "demo"

    # media endpoints work via cookie too (no ?token= needed)
    tasks = anon.get("/api/tasks").json()
    fid = next(f["id"] for t in tasks for f in t["files"])
    assert anon.get(f"/api/files/{fid}/raw").status_code == 200

    # logout clears the cookie and the DB record
    assert anon.post("/api/auth/logout").status_code == 204
    assert anon.get("/api/tasks").status_code == 401


def test_token_query_param_auth():
    """?token= works when headers AND cookies are stripped (preview proxy)."""
    anon = TestClient(app)
    r = anon.post("/api/auth/login", json={"username": "demo", "password": "taskie123"})
    token = r.json()["token"]
    # simulate proxy: drop cookies and headers, keep only the query param
    anon.cookies.clear()
    anon.headers.pop("Authorization", None)
    assert anon.get("/api/tasks", params={"token": token}).status_code == 200
    assert anon.get("/api/agent/recommendations", params={"token": token}).status_code == 200
    assert anon.get("/api/tasks").status_code == 401  # without it: rejected


def test_project_shared_files():
    proj = client.post("/api/projects", json={"name": "HubProj", "color": "#10b981"}).json()
    task = _create_task("Hub task", project_id=proj["id"])
    tf = client.post(f"/api/tasks/{task['id']}/files",
                     files={"file": ("task-notes.md", b"# notes", "text/markdown")}).json()

    sf = client.post(f"/api/projects/{proj['id']}/files",
                     files={"file": ("brief.pdf", b"%PDF-1.4 fake", "application/pdf")})
    assert sf.status_code == 201
    assert sf.json()["task_id"] is None
    assert sf.json()["uploaded_by_name"]

    listing = client.get(f"/api/projects/{proj['id']}/files").json()
    names = {f["filename"] for f in listing}
    assert names == {"task-notes.md", "brief.pdf"}
    shared = next(f for f in listing if f["filename"] == "brief.pdf")
    assert shared["task_title"] is None
    from_task = next(f for f in listing if f["filename"] == "task-notes.md")
    assert from_task["task_title"] == "Hub task"

    # another project must not see these files
    other = client.post("/api/projects", json={"name": "OtherProj"}).json()
    assert client.get(f"/api/projects/{other['id']}/files").json() == []

    assert client.delete(f"/api/files/{sf.json()['id']}").status_code == 204
    assert len(client.get(f"/api/projects/{proj['id']}/files").json()) == 1


def test_project_chat():
    proj = client.post("/api/projects", json={"name": "ChatProj"}).json()
    assert client.get(f"/api/projects/{proj['id']}/messages").json() == []

    m1 = client.post(f"/api/projects/{proj['id']}/messages", json={"body": "hello team"})
    assert m1.status_code == 201
    assert m1.json()["body"] == "hello team"
    assert m1.json()["user"]["username"] == "tester"

    client.post(f"/api/projects/{proj['id']}/messages", json={"body": "second message"})
    msgs = client.get(f"/api/projects/{proj['id']}/messages").json()
    assert [m["body"] for m in msgs] == ["hello team", "second message"]

    # incremental fetch with cursor
    tail = client.get(f"/api/projects/{proj['id']}/messages", params={"after": m1.json()["id"]}).json()
    assert [m["body"] for m in tail] == ["second message"]

    # validation
    assert client.post(f"/api/projects/{proj['id']}/messages", json={"body": ""}).status_code == 422


def test_evaluation_scope_mine_vs_all():
    mine = client.get("/api/agent/evaluation", params={"scope": "mine"}).json()
    everything = client.get("/api/agent/evaluation", params={"scope": "all"}).json()
    assert mine["metrics"]["total_tasks"] <= everything["metrics"]["total_tasks"]
