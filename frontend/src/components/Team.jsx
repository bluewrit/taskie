import React, { useMemo, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import Tilt from './Tilt.jsx';

const DAY_CAPACITY = 6 * 60; // minutes of focus time assumed per person per day

export default function Team({ users, tasks, me, onOpenTask, onChanged, notify, onNavigate }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '', password: '' });
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return users.map((u) => {
      const owned = tasks.filter((t) => t.assignee?.id === u.id);
      const open = owned.filter((t) => t.status !== 'done');
      return {
        user: u,
        open: open.length,
        overdue: open.filter((t) => t.due_date && t.due_date < today).length,
        inProgress: open.filter((t) => t.status === 'in_progress').length,
        done7d: owned.filter((t) => t.status === 'done' && t.completed_at &&
          (Date.now() - new Date(t.completed_at + 'Z').getTime()) / 86400000 <= 7).length,
        loadMinutes: open.reduce((s, t) => s + (t.estimated_minutes || 60), 0),
        top: [...open].sort((a, b) => b.agent_score - a.agent_score).slice(0, 4),
      };
    });
  }, [users, tasks]);

  const unassigned = tasks.filter((t) => !t.assignee && t.status !== 'done');

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createUser(form);
      setForm({ full_name: '', username: '', password: '' });
      setShowForm(false);
      onChanged();
      notify('Teammate created — they can sign in now');
    } catch (err) { notify(err.message, 'err'); }
    setBusy(false);
  };

  const remove = async (u) => {
    if (!confirm(`Remove ${u.full_name || u.username}? Their tasks become unassigned.`)) return;
    try { await api.deleteUser(u.id); onChanged(); } catch (e) { notify(e.message, 'err'); }
  };

  const assignToMe = async (t) => {
    try { await api.updateTask(t.id, { assignee_id: me.id }); onChanged(); notify(`“${t.title}” is yours now`); }
    catch (e) { notify(e.message, 'err'); }
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Team</h1>
          <p className="muted">People, workloads and task assignment.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? '✕ Close' : '＋ Add teammate'}
        </button>
      </header>

      {showForm && (
        <form className="panel teammate-form" onSubmit={create}>
          <input className="input" placeholder="Full name" value={form.full_name} required
                 onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className="input" placeholder="username" value={form.username} required pattern="[a-zA-Z0-9_.-]{3,}"
                 onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input className="input" type="password" placeholder="Temporary password" value={form.password} required minLength={4}
                 onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create teammate'}</button>
        </form>
      )}

      <div className="team-grid">
        {stats.map((s) => {
          const loadPct = Math.min(100, Math.round((s.loadMinutes / (DAY_CAPACITY * 3)) * 100));
          return (
            <Tilt key={s.user.id} max={5} className={`team-card ${s.user.id === me.id ? 'team-card-me' : ''}`}>
              <div className="team-card-head">
                <Avatar user={s.user} size={44} />
                <div className="team-card-id">
                  <div className="team-card-name">
                    {s.user.full_name || s.user.username}
                    {s.user.id === me.id && <span className="you-badge">you</span>}
                  </div>
                  <div className="muted small">@{s.user.username} · {s.user.role}</div>
                </div>
                {s.user.id !== me.id && (
                  <button className="btn btn-ghost btn-sm danger" title="Remove teammate" onClick={() => remove(s.user)}>✕</button>
                )}
              </div>

              <div className="team-stats">
                <span title="Open tasks">📋 {s.open}</span>
                <span title="In progress">▶ {s.inProgress}</span>
                <span title="Overdue" className={s.overdue ? 'due-overdue' : ''}>⏰ {s.overdue}</span>
                <span title="Completed last 7 days">✓ {s.done7d}</span>
              </div>

              <div className="team-load">
                <div className="team-load-row">
                  <span className="muted small">Focus load</span>
                  <span className="muted small">{(s.loadMinutes / 60).toFixed(1)}h</span>
                </div>
                <div className="load-bar"><span style={{ width: `${loadPct}%` }} /></div>
              </div>

              <ul className="mini-list">
                {s.top.map((t) => (
                  <li key={t.id} onClick={() => onOpenTask(t)}>
                    <span className={`pill pill-${t.priority}`}>{t.priority}</span>
                    <span className="mini-title">{t.title}</span>
                  </li>
                ))}
                {s.top.length === 0 && <li className="muted" style={{ cursor: 'default' }}>No open tasks 🎉</li>}
              </ul>
            </Tilt>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <section className="panel">
          <h3>Unassigned open tasks <span className="muted">({unassigned.length})</span></h3>
          <ul className="mini-list">
            {unassigned.map((t) => (
              <li key={t.id}>
                <span className={`pill pill-${t.priority}`}>{t.priority}</span>
                <span className="mini-title" onClick={() => onOpenTask(t)}>{t.title}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => assignToMe(t)}>Assign to me</button>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('recommendations')}>
            Let the agent suggest owners →
          </button>
        </section>
      )}
    </div>
  );
}
