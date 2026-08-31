import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

function Metric({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}{sub && <span className="muted"> · {sub}</span>}</div>
    </div>
  );
}

function ThroughputChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.completed));
  return (
    <div className="chart">
      {data.map((d) => (
        <div key={d.date} className="chart-col" title={`${d.date}: ${d.completed} completed`}>
          <span className="chart-val">{d.completed || ''}</span>
          <div className="chart-bar" style={{ height: `${Math.max(3, (d.completed / max) * 100)}%` }} />
          <span className="chart-label">{d.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Evaluation({ me }) {
  const [ev, setEv] = useState(null);
  const [scope, setScope] = useState('mine');

  useEffect(() => {
    setEv(null);
    api.agentEvaluation(scope).then(setEv).catch(() => {});
  }, [scope]);

  if (!ev) {
    return (
      <div className="view">
        <div className="stat-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton skeleton-stat" />)}
        </div>
        <div className="skeleton skeleton-chart" />
      </div>
    );
  }
  const m = ev.metrics;

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Evaluation</h1>
          <p className="muted">{scope === 'mine' ? 'How your workflow is performing' : 'How the whole team is performing'}, graded by the agent.</p>
        </div>
        <div className="scope-toggle eval-scope">
          <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>Me</button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Whole team</button>
        </div>
        <div className="grade-big" title="Hover the badge to flip">
          <span className="flip-scene flip-scene-lg">
            <span className="flip-card flip-card-lg">
              <span className={`flip-face grade-letter grade-${ev.grade}`}>{ev.grade}</span>
              <span className={`flip-face flip-back grade-letter grade-${ev.grade}`}>{ev.overall_score}</span>
            </span>
          </span>
          <div>
            <div><strong>{ev.overall_score}/100</strong> overall</div>
            <div className="muted small">backlog health {ev.backlog_health}/100</div>
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <Metric label="Completion rate" value={`${m.completion_rate}%`} sub={`${m.completed_tasks}/${m.total_tasks}`} />
        <Metric label="On-time rate" value={m.on_time_rate == null ? '—' : `${m.on_time_rate}%`} sub="dated tasks" />
        <Metric label="Avg cycle time" value={m.avg_cycle_days == null ? '—' : `${m.avg_cycle_days}d`} sub="created → done" />
        <Metric label="Overdue open" value={m.overdue_open} sub="tasks" />
        <Metric label="WIP" value={m.wip} sub={`blocked: ${m.blocked_open}`} />
        <Metric label="Done last 7d" value={m.completed_last_7_days} sub="tasks" />
      </div>

      <section className="panel">
        <h3>Throughput — completed tasks per day (14 days)</h3>
        <ThroughputChart data={ev.throughput} />
      </section>

      <section className="panel">
        <h3>Agent feedback</h3>
        <ul className="feedback-list">
          {ev.feedback.length === 0 && <li className="muted">No feedback — add tasks and complete a few to get a report.</li>}
          {ev.feedback.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </section>

      <section className="panel">
        <h3>By project</h3>
        <table className="table table-compact">
          <thead><tr><th>Project</th><th>Total</th><th>Done</th><th>Overdue</th><th>Completion</th></tr></thead>
          <tbody>
            {Object.entries(ev.projects).map(([name, p]) => (
              <tr key={name}>
                <td>{name}</td><td>{p.total}</td><td>{p.done}</td>
                <td className={p.overdue ? 'due-overdue' : ''}>{p.overdue}</td>
                <td>
                  <div className="progress"><div className="progress-fill" style={{ width: `${p.completion_percent}%` }} /></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
