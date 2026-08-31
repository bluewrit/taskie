import React, { useMemo, useState } from 'react';
import { api, STATUS_LABELS, fmtDate } from '../api.js';
import Avatar from './Avatar.jsx';
import { celebrate } from '../confetti.js';

export default function TaskList({ tasks, projects, onChanged, onOpenTask, onNew, notify }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('score');

  const rows = useMemo(() => {
    const out = tasks.filter((t) =>
      (!status || t.status === status) &&
      (!query || t.title.toLowerCase().includes(query.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(query.toLowerCase())));
    const by = {
      score: (a, b) => b.agent_score - a.agent_score,
      due: (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'),
      created: (a, b) => b.created_at.localeCompare(a.created_at),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return out.sort(by[sort]);
  }, [tasks, query, status, sort]);

  const projectOf = (id) => projects.find((p) => p.id === id);
  const today = new Date().toISOString().slice(0, 10);

  const toggleDone = async (t) => {
    try {
      if (t.status === 'done') await api.updateTask(t.id, { status: 'todo' });
      else { await api.completeTask(t.id); celebrate(); }
      onChanged();
    } catch (e) { notify(e.message, 'err'); }
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Tasks</h1>
          <p className="muted">{rows.length} task(s)</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>＋ New task</button>
      </header>

      <div className="toolbar">
        <input className="input" placeholder="Search tasks…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input input-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input input-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="score">Sort: agent score</option>
          <option value="due">Sort: due date</option>
          <option value="created">Sort: newest</option>
          <option value="title">Sort: title</option>
        </select>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th></th><th>Task</th><th>Assignee</th><th>Project</th><th>Status</th><th>Priority</th>
            <th>Due</th><th>Progress</th><th>Score</th><th>Files</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const p = projectOf(t.project_id);
            const overdue = t.due_date && t.due_date < today && t.status !== 'done';
            return (
              <tr key={t.id} className={t.status === 'done' ? 'row-done' : ''} onClick={() => onOpenTask(t)}>
                <td onClick={(e) => { e.stopPropagation(); toggleDone(t); }}>
                  <span className={`checkbox ${t.status === 'done' ? 'checked' : ''}`}>✓</span>
                </td>
                <td className="td-title">{t.title}</td>
                <td>
                  <span className="assignee-cell">
                    <Avatar user={t.assignee} size={22} />
                    <span className="assignee-name">{t.assignee ? (t.assignee.full_name || t.assignee.username) : <span className="muted">Unassigned</span>}</span>
                  </span>
                </td>
                <td>{p ? <><span className="dot" style={{ background: p.color }} /> {p.name}</> : <span className="muted">—</span>}</td>
                <td><span className={`status-chip st-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                <td><span className={`pill pill-${t.priority}`}>{t.priority}</span></td>
                <td className={overdue ? 'due-overdue' : ''}>{t.due_date ? fmtDate(t.due_date) : '—'}</td>
                <td>
                  <div className="progress"><div className="progress-fill" style={{ width: `${t.progress}%` }} /></div>
                </td>
                <td><span className="score-chip" title={t.agent_note}>{Math.round(t.agent_score)}</span></td>
                <td>{t.files?.length ? `📎 ${t.files.length}` : ''}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={10} className="muted empty-row">No tasks match. Try clearing filters or create one.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
