"""File upload / download / preview endpoints.

- POST /api/tasks/{id}/files      multipart upload (any file type)
- GET  /api/files/{id}/raw        inline stream with HTTP Range support (video/audio seeking)
- GET  /api/files/{id}/download   forced download (Content-Disposition: attachment)
- GET  /api/files/{id}/preview    JSON preview payload for the frontend renderer
- DELETE /api/files/{id}
"""
import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from ..database import UPLOAD_DIR, get_db
from ..deps import get_current_user
from ..models import AuthToken, FileAttachment, Task, User
from ..schemas import FileOut
from ..services import preview as preview_service

router = APIRouter(prefix="/api", tags=["files"])


def _stream_user(request, token: str | None, db: Session) -> User:
    """Auth for <img>/<video>/<iframe>/download links that cannot set headers.

    Accepts the session cookie (sent automatically) or ?token=... as a
    fallback (session tokens are short-lived; URLs are per-render).
    """
    from datetime import datetime

    from ..deps import extract_token

    token = extract_token(request, None) or token
    if not token:
        raise HTTPException(401, "Not authenticated")
    record = db.query(AuthToken).filter(AuthToken.token == token).first()
    if not record or (record.expires_at and record.expires_at < datetime.utcnow()):
        raise HTTPException(401, "Invalid or expired session")
    user = db.get(User, record.user_id)
    if not user:
        raise HTTPException(401, "User no longer exists")
    return user

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB


def _stored_path(att: FileAttachment) -> Path:
    return UPLOAD_DIR / att.stored_name


def _get_attachment(db: Session, file_id: int) -> FileAttachment:
    att = db.get(FileAttachment, file_id)
    if not att:
        raise HTTPException(404, "File not found")
    path = _stored_path(att)
    if not path.exists():
        raise HTTPException(410, "Stored file missing")
    return att


@router.post("/tasks/{task_id}/files", response_model=FileOut, status_code=201)
async def upload_file(task_id: int, file: UploadFile, db: Session = Depends(get_db),
                      _: User = Depends(get_current_user)):
    if not db.get(Task, task_id):
        raise HTTPException(404, "Task not found")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds the 100 MB limit")
    if not content:
        raise HTTPException(422, "Empty file")

    filename = Path(file.filename or "upload.bin").name
    ext = Path(filename).suffix.lower()[:20]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOAD_DIR / stored_name
    dest.write_bytes(content)

    att = FileAttachment(
        task_id=task_id,
        filename=filename,
        stored_name=stored_name,
        mime_type=file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream",
        extension=ext,
        size=len(content),
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


@router.get("/files/{file_id}/raw")
def raw_file(request: Request, file_id: int, token: str | None = None,
             range_header: str | None = Header(default=None, alias="Range"),
             db: Session = Depends(get_db)):
    """Inline stream; honours Range requests so <video>/<audio> can seek."""
    _stream_user(request, token, db)
    request_range = range_header
    att = _get_attachment(db, file_id)
    path = _stored_path(att)
    size = path.stat().st_size
    mime = att.mime_type or "application/octet-stream"

    start, end = 0, size - 1
    status = 200
    if request_range:
        m = re.match(r"bytes=(\d*)-(\d*)", request_range)
        if m:
            if m.group(1):
                start = int(m.group(1))
            if m.group(2):
                end = int(m.group(2))
            if start >= size or end >= size or start > end:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
            status = 206

    length = end - start + 1

    def iter_chunks():
        with open(path, "rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{att.filename}"',
    }
    if status == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(iter_chunks(), status_code=status, media_type=mime,
                             headers=headers)


@router.get("/files/{file_id}/download")
def download_file(request: Request, file_id: int, token: str | None = None,
                  db: Session = Depends(get_db)):
    _stream_user(request, token, db)
    from fastapi.responses import FileResponse

    att = _get_attachment(db, file_id)
    return FileResponse(
        str(_stored_path(att)),
        media_type=att.mime_type or "application/octet-stream",
        filename=att.filename,
    )


@router.get("/files/{file_id}/preview")
def preview_file(file_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    att = _get_attachment(db, file_id)
    payload = preview_service.build_preview(_stored_path(att), att.filename, att.mime_type)
    payload["file_id"] = att.id
    payload["size"] = att.size
    payload["mime_type"] = att.mime_type
    payload["raw_url"] = f"/api/files/{att.id}/raw"
    payload["download_url"] = f"/api/files/{att.id}/download"
    return payload


@router.delete("/files/{file_id}", status_code=204)
def delete_file(file_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    att = _get_attachment(db, file_id)
    try:
        _stored_path(att).unlink()
    except OSError:
        pass
    db.delete(att)
    db.commit()
