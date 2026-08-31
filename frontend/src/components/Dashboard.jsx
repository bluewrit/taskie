import React, { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';

function Sparkbars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.completed));
  return (
    <div className="sparkbars" title="Completed per day (last 14 days)">
      {data.map((d) => (
        <div key={d.date} className="sparkbar-col">
          <div className="sparkbar" style={{ height: `${(d.completed / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ tasks, projects, onOpenTask, onNavigate }) {
  const [evalData, setEvalData] = useState(null);
  const [recs, setRecs] = useState([]);

  useEffect(() => {
    api.agentEvaluation().then(setEvalData).catch(() => {});
    api.agentRecommendations().then((r) => setRecs(r.recommendations.slice(0, 4))).catch(() => {});
  }, [tasks.length]);

  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const dueToday = open.filter((t) => t.due_date === today);
  const doneWeek = tasks.filter((t) => t.status === 'done' && t.completed_at &&
    (Date.now() - new Date(t.completed_at + 'Z').getTime()) / 86400000 <= 7);
  const top = [...open].sort((a, b) => b.agent_score - a.agent_score).slice(0, 5);

  const stats = [
    { label: 'Open tasks', value: open.length, cls: '' },
    { label: 'Due today', value: dueToday.length, cls: dueToday.length ? 'stat-warn' : '' },
    { label: 'Overdue', value: overdue.length, cls: overdue.length ? 'stat-danger' : '' },
    { label: 'Done (7d)', value: doneWeek.length, cls: 'stat-ok' },
  ];

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Your workspace at a glance — powered by the agent.</p>
        </div>
        {evalData && (
          <div className="grade-chip" title={`Overall score ${evalData.overall_score}/100`}>
            Grade <strong>{evalData.grade}</strong>
          </div>
        )}
      </header>

      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.label} className={`stat-card ${s.cls}`}>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="dash-cols">
        <section className="panel">
          <h3>Focus next <span className="muted">(by agent score)</span></h3>
          {top.length === 0 && <p className="muted">No open tasks. Enjoy the calm 🌤</p>}
          <ul className="mini-list">
            {top.map((t) => (
              <li key={t.id} onClick={() => onOpenTask(t)}>
                <span className={`pill pill-${t.priority}`}>{t.priority}</span>
                <span className="mini-title">{t.title}</span>
                <span className="muted small">{t.due_date ? `due ${fmtDate(t.due_date)}` : 'no date'}</span>
                <span className="score-chip">{Math.round(t.agent_score)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>Agent recommendations</h3>
          {recs.length === 0 && <p className="muted">Nothing needs attention right now.</p>}
          <ul className="mini-list">
            {recs.map((r) => (
              <li key={r.id} onClick={() => onNavigate('recommendations')} className="rec-line">
                <span className={`sev sev-${r.severity}`}>{r.severity}</span>
                <span className="mini-title">{r.title}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('recommendations')}>
            Open recommendations →
          </button>
        </section>

        <section className="panel">
          <h3>Throughput <span className="muted">(14 days)</span></h3>
          {evalData ? <Sparkbars data={evalData.throughput} /> : <p className="muted">Loading…</p>}
          <div className="panel-foot">
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('planner')}>Plan my week →</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('evaluation')}>Full evaluation →</button>
          </div>
        </section>
      </div>

      <section className="panel">
        <h3>Projects</h3>
        <div className="project-grid">
          {projects.map((p) => {
            const pt = tasks.filter((t) => t.project_id === p.id);
            const pd = pt.filter((t) => t.status === 'done').length;
            const pct = pt.length ? Math.round((pd / pt.length) * 100) : 0;
            return (
              <div key={p.id} className="project-card">
                <span className="dot" style={{ background: p.color }} />
                <div>
                  <div className="project-name">{p.name}</div>
                  <div className="muted small">{pd}/{pt.length} done</div>
                  <div className="progress"><div className="progress-fill" style={{ width: `${pct}%`, background: p.color }} /></div>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && <p className="muted">No projects yet.</p>}
        </div>
      </section>
    </div>
  );
}
