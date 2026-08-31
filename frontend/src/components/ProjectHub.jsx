import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, fmtBytes, mediaUrl } from '../api.js';
import Avatar from './Avatar.jsx';

function fmtTime(iso) {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------- Files tab */
function FilesTab({ project, onPreview, notify }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [upload, setUpload] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(() => {
    api.projectFiles(project.id)
      .then(setFiles)
      .catch((e) => notify(e.message, 'err'))
      .finally(() => setLoading(false));
  }, [project.id, notify]);

  useEffect(() => { load(); }, [load]);

  const doUpload = async (list) => {
    for (const file of list) {
      try {
        setUpload({ name: file.name, pct: 0 });
        await api.uploadProjectFile(project.id, file, (p) => setUpload({ name: file.name, pct: p }));
        notify(`Shared ${file.name} with the project`);
      } catch (e) { notify(e.message, 'err'); }
      setUpload(null);
    }
    load();
  };

  const remove = async (f) => {
    if (!confirm(`Delete “${f.filename}”?`)) return;
    try { await api.deleteFile(f.id); load(); } catch (e) { notify(e.message, 'err'); }
  };

  return (
    <div>
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
          : <span>⬆ Drop files here to share with <strong>{project.name}</strong> — everyone on the project can see them</span>}
      </div>

      {loading && <div className="skeleton skeleton-rec" style={{ marginTop: 14 }} />}

      <ul className="file-list" style={{ marginTop: 14 }}>
        {files.map((f) => (
          <li key={f.id}>
            <button className="file-open" onClick={() => onPreview(f.id)} title="Open preview">
              <span className="file-ext">{(f.extension || '').replace('.', '').toUpperCase() || 'FILE'}</span>
              <span className="file-name">
                {f.filename}
                <span className="muted small" style={{ marginLeft: 8 }}>
                  {f.task_title ? `📌 ${f.task_title}` : '🌐 shared with project'}
                  {f.uploaded_by_name ? ` · by ${f.uploaded_by_name}` : ''}
                </span>
              </span>
              <span className="muted small">{fmtBytes(f.size)}</span>
            </button>
            <a className="btn btn-ghost btn-sm" href={mediaUrl(`/api/files/${f.id}/download`)} title="Download">⬇</a>
            <button className="btn btn-ghost btn-sm danger" title="Delete" onClick={() => remove(f)}>✕</button>
          </li>
        ))}
        {!loading && files.length === 0 && (
          <li className="muted" style={{ cursor: 'default', justifyContent: 'center' }}>
            No shared files yet — drop the first one above
          </li>
        )}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- Chat tab */
function ChatTab({ project, me, notify }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const lastId = useRef(0);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const fresh = await api.projectMessages(project.id, lastId.current);
        if (!alive || !fresh.length) return;
        lastId.current = Math.max(lastId.current, ...fresh.map((m) => m.id));
        setMessages((prev) => [...prev, ...fresh]);
      } catch { /* transient — next poll retries */ }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [project.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const msg = await api.postProjectMessage(project.id, body);
      setInput('');
      if (msg.id > lastId.current) {
        lastId.current = msg.id;
        setMessages((prev) => [...prev, msg]);
      }
    } catch (err) { notify(err.message, 'err'); }
    setBusy(false);
  };

  return (
    <div className="project-chat">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
            No messages yet — say hi to the team 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = m.user?.id === me.id;
          return (
            <div key={m.id} className={`msg ${mine ? 'msg-user' : 'msg-agent'}`}>
              {!mine && <Avatar user={m.user} size={28} />}
              <div className="bubble">
                <div className="chat-meta">
                  <strong>{mine ? 'You' : (m.user?.full_name || m.user?.username || 'Unknown')}</strong>
                  <span className="muted small">{fmtTime(m.created_at)}</span>
                </div>
                <div className="bubble-text">{m.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="chat-input-row" onSubmit={send}>
        <input className="input chat-input" placeholder={`Message #${project.name}…`}
               value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000} />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------- Hub */
export default function ProjectHub({ project, tasks, me, onPreview, notify, onViewTasks }) {
  const [tab, setTab] = useState('files');
  const pt = tasks.filter((t) => t.project_id === project.id);
  const done = pt.filter((t) => t.status === 'done').length;

  return (
    <div className="view">
      <header className="view-header">
        <div className="hub-title">
          <span className="dot" style={{ background: project.color, width: 14, height: 14 }} />
          <div>
            <h1>{project.name}</h1>
            <p className="muted">{pt.length} task(s) · {done} done {project.description && `· ${project.description}`}</p>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onViewTasks}>View tasks →</button>
      </header>

      <div className="hub-tabs">
        <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          📎 Shared files
        </button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
          💬 Team chat
        </button>
      </div>

      <section className="panel">
        {tab === 'files'
          ? <FilesTab project={project} onPreview={onPreview} notify={notify} />
          : <ChatTab project={project} me={me} notify={notify} />}
      </section>
    </div>
  );
}
