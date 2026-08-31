import React, { useRef, useState } from 'react';
import { api, STATUS_LABELS, fmtBytes, mediaUrl } from '../api.js';
import Avatar from './Avatar.jsx';

const EMPTY = {
  title: '', description: '', project_id: '', assignee_id: '', status: 'todo',
  priority: 'medium', due_date: '', estimated_minutes: 60, progress: 0, tags: '',
};

export default function TaskModal({ task, projects, users, me, onClose, onSaved, onPreview, notify }) {
  const isNew = !task;
  const [form, setForm] = useState(() =>
    task
      ? { ...task, project_id: task.project_id ?? '', assignee_id: task.assignee_id ?? '', due_date: task.due_date ?? '' }
      : { ...EMPTY, assignee_id: me?.id ?? '' }); // new tasks default to me
  const [files, setFiles] = useState(task?.files ?? []);
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState(null); // {name, pct}
  const inputRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const payload = () => ({
    ...form,
    project_id: form.project_id === '' ? null : Number(form.project_id),
    assignee_id: form.assignee_id === '' ? null : Number(form.assignee_id),
    due_date: form.due_date || null,
    estimated_minutes: Number(form.estimated_minutes) || 60,
    progress: Number(form.progress) || 0,
  });

  const save = async () => {
    if (!form.title.trim()) return notify('Title is required', 'err');
    try {
      if (isNew) await api.createTask(payload());
      else await api.updateTask(task.id, payload());
      onSaved();
    } catch (e) { notify(e.message, 'err'); }
  };

  const remove = async () => {
    if (!confirm(`Delete task “${task.title}”?`)) return;
    try { await api.deleteTask(task.id); onSaved(); } catch (e) { notify(e.message, 'err'); }
  };

  const uploadTo = async (taskId, file) => {
    try {
      setUpload({ name: file.name, pct: 0 });
      const att = await api.uploadFile(taskId, file, (p) => setUpload({ name: file.name, pct: p }));
      setFiles((fs) => [...fs, att]);
      notify(`Uploaded ${file.name}`);
    } catch (e) { notify(e.message, 'err'); }
    setUpload(null);
  };

  const doUpload = async (fileList) => {
    if (isNew) {
      if (!form.title.trim()) return notify('Give the task a title before attaching files', 'err');
      try {
        const created = await api.createTask(payload());
        for (const f of fileList) await uploadTo(created.id, f);
        onSaved();
      } catch (e) { notify(e.message, 'err'); }
      return;
    }
    for (const f of fileList) await uploadTo(task.id, f);
  };

  const removeFile = async (fid) => {
    try {
      await api.deleteFile(fid);
      setFiles((fs) => fs.filter((f) => f.id !== fid));
    } catch (e) { notify(e.message, 'err'); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{isNew ? 'New task' : `#${task.id} · Edit task`}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <input className="input input-title" placeholder="Task title" value={form.title} onChange={set('title')} autoFocus />
          <textarea className="input" rows={3} placeholder="Description…" value={form.description} onChange={set('description')} />

          <div className="form-grid">
            <label>Assignee
              <select className="input" value={form.assignee_id} onChange={set('assignee_id')}>
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.username}{u.id === me?.id ? ' (me)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>Project
              <select className="input" value={form.project_id} onChange={set('project_id')}>
                <option value="">— None —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Status
              <select className="input" value={form.status} onChange={set('status')}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Priority
              <select className="input" value={form.priority} onChange={set('priority')}>
                {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>Due date
              <input type="date" className="input" value={form.due_date} onChange={set('due_date')} />
            </label>
            <label>Estimate (min)
              <input type="number" min="5" step="5" className="input" value={form.estimated_minutes} onChange={set('estimated_minutes')} />
            </label>
          </div>

          <label className="range-row">Progress <strong>{form.progress}%</strong>
            <input type="range" min="0" max="100" step="5" value={form.progress} onChange={set('progress')} />
          </label>

          <input className="input" placeholder="tags, comma, separated" value={form.tags} onChange={set('tags')} />

          {!isNew && (
            <div className="agent-note">
              🤖 Agent score <strong>{Math.round(task.agent_score)}/100</strong> — {task.agent_note || 'not scored yet'}
              {task.assignee && <> · assigned to <strong>{task.assignee.full_name || task.assignee.username}</strong></>}
            </div>
          )}

          {/* ---------------------------------------------- files */}
          <div
            className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); doUpload(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}>
            <input ref={inputRef} type="file" multiple hidden
                   onChange={(e) => { doUpload(e.target.files); e.target.value = ''; }} />
            {upload
              ? <div className="upload-progress">Uploading {upload.name}… <div className="progress"><div className="progress-fill" style={{ width: `${Math.round(upload.pct * 100)}%` }} /></div></div>
              : <span>⬆ Drop any file here, or click to browse <span className="muted">(docs, sheets, decks, PDFs, images, video, audio, archives…)</span></span>}
          </div>

          {files.length > 0 && (
            <ul className="file-list">
              {files.map((f) => (
                <li key={f.id}>
                  <button className="file-open" onClick={() => onPreview(f.id)} title="Open preview">
                    <span className="file-ext">{(f.extension || '').replace('.', '').toUpperCase() || 'FILE'}</span>
                    <span className="file-name">{f.filename}</span>
                    <span className="muted small">{fmtBytes(f.size)}</span>
                  </button>
                  <a className="btn btn-ghost btn-sm" href={mediaUrl(`/api/files/${f.id}/download`)} title="Download">⬇</a>
                  <button className="btn btn-ghost btn-sm danger" title="Delete" onClick={() => removeFile(f.id)}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-foot">
          {!isNew && <button className="btn btn-ghost danger" onClick={remove}>Delete task</button>}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{isNew ? 'Create task' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}
