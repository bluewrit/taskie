import React, { useEffect, useMemo, useState } from 'react';
import Avatar from './Avatar.jsx';
import CountUp from './CountUp.jsx';

const STATUS_META = [
  { key: 'todo', label: 'To do', color: '#8e8e93' },
  { key: 'in_progress', label: 'In progress', color: '#0a84ff' },
  { key: 'blocked', label: 'Blocked', color: '#ff9f0a' },
  { key: 'done', label: 'Done', color: '#30d158' },
];
const PRIORITY_META = [
  { key: 'critical', label: 'Critical', color: '#ff453a' },
  { key: 'high', label: 'High', color: '#ff9f0a' },
  { key: 'medium', label: 'Medium', color: '#0a84ff' },
  { key: 'low', label: 'Low', color: '#8e8e93' },
];

/* ---------------------------------------------------------- chart primitives */
function useMountAnim() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 60);
    return () => clearTimeout(t);
  }, []);
  return on;
}

function Donut({ data, total, caption }) {
  const on = useMountAnim();
  const R = 54, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={caption}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--panel-2)" strokeWidth="15" />
        {total > 0 && data.filter((d) => d.value > 0).map((d, i) => {
          const frac = d.value / total;
          const len = frac * C;
          const off = acc * C;
          acc += frac;
          return (
            <circle key={d.key} cx="70" cy="70" r={R} fill="none"
                    stroke={d.color} strokeWidth="15" strokeLinecap="butt"
                    strokeDasharray={`${on ? Math.max(len - 2, 0) : 0} ${C}`}
                    strokeDashoffset={-off}
                    transform="rotate(-90 70 70)"
                    className="donut-seg"
                    style={{ transitionDelay: `${i * 0.12}s` }} />
          );
        })}
      </svg>
      <div className="donut-center">
        <div className="donut-total"><CountUp to={total} /></div>
        <div className="muted small">{caption}</div>
      </div>
    </div>
  );
}

function Legend({ data, total }) {
  return (
    <ul className="chart-legend">
      {data.map((d) => (
        <li key={d.key}>
          <span className="dot" style={{ background: d.color }} />
          <span className="legend-label">{d.label}</span>
          <span className="legend-value">{d.value}</span>
          <span className="muted small">{total ? Math.round((d.value / total) * 100) : 0}%</span>
        </li>
      ))}
    </ul>
  );
}

function Bars({ data, caption }) {
  const on = useMountAnim();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart-bars" role="img" aria-label={caption}>
      {data.map((d, i) => (
        <div key={d.key} className="chart-bar-col" style={{ '--i': i }}>
          <div className="chart-bar-value">{d.value}</div>
          <div className="chart-bar-track">
            <div className="chart-bar"
                 style={{ height: on ? `${(d.value / max) * 100}%` : '0%', background: d.color }} />
          </div>
          <div className="chart-bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function HBars({ rows, emptyText }) {
  const on = useMountAnim();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div key={r.id ?? r.label} className="hbar-row" style={{ '--i': i }}>
          <div className="hbar-label">{r.avatar ? <Avatar user={r.avatar} size={20} /> : null}{r.label}</div>
          <div className="hbar-track">
            <div className="hbar-fill"
                 style={{ width: on ? `${(r.value / max) * 100}%` : '0%',
                          background: r.color || 'var(--accent)' }} />
          </div>
          <div className="hbar-value">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- analytics view */
export default function Analytics({ tasks, me }) {
  const [scope, setScope] = useState('mine');
  const scoped = useMemo(
    () => (scope === 'mine' ? tasks.filter((t) => t.assignee?.id === me.id) : tasks),
    [scope, tasks, me.id]);

  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  const byStatus = STATUS_META.map((m) => ({ ...m, value: scoped.filter((t) => t.status === m.key).length }));
  const byPriority = PRIORITY_META.map((m) => ({ ...m, value: scoped.filter((t) => t.priority === m.key).length }));

  const byProject = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      const key = t.project?.name || 'No project';
      const e = map.get(key) || { id: key, label: key, value: 0, color: t.project?.color || '#8e8e93' };
      e.value += 1;
      map.set(key, e);
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [scoped]);

  const byMember = useMemo(() => {
    const map = new Map();
    for (const t of scoped) {
      const u = t.assignee;
      const key = u ? u.id : 0;
      const e = map.get(key) || { id: key, label: u ? (u.full_name || u.username) : 'Unassigned', value: 0, avatar: u || null };
      if (t.status !== 'done') e.value += 1;
      map.set(key, e);
    }
    return [...map.values()].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  }, [scoped]);

  const dueBuckets = [
    { key: 'over', label: 'Overdue', color: '#ff453a',
      value: scoped.filter((t) => t.due_date && t.due_date < today && t.status !== 'done').length },
    { key: 'week', label: 'Next 7 days', color: '#ff9f0a',
      value: scoped.filter((t) => t.due_date && t.due_date >= today && t.due_date <= week && t.status !== 'done').length },
    { key: 'later', label: 'Later', color: '#0a84ff',
      value: scoped.filter((t) => t.due_date && t.due_date > week && t.status !== 'done').length },
    { key: 'none', label: 'No date', color: '#8e8e93',
      value: scoped.filter((t) => !t.due_date && t.status !== 'done').length },
  ];
  const dueTotal = dueBuckets.reduce((s, d) => s + d.value, 0);
  const donePct = scoped.length ? Math.round((scoped.filter((t) => t.status === 'done').length / scoped.length) * 100) : 0;

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Visual breakdown of task statuses, priorities and load.</p>
        </div>
        <div className="scope-toggle">
          <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>My tasks</button>
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Overall</button>
        </div>
      </header>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {STATUS_META.map((m, i) => (
          <div className="stat-card" key={m.key} style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="stat-value" style={{ color: m.color }}>
              <CountUp to={byStatus[i].value} />
            </div>
            <div className="stat-label"><span className="dot" style={{ background: m.color }} /> {m.label}</div>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <section className="panel">
          <h3>Status distribution</h3>
          <div className="chart-flex">
            <Donut data={byStatus} total={scoped.length} caption={scope === 'mine' ? 'my tasks' : 'all tasks'} />
            <Legend data={byStatus} total={scoped.length} />
          </div>
        </section>

        <section className="panel">
          <h3>Open work by due date <span className="muted small">({donePct}% completed)</span></h3>
          <div className="chart-flex">
            <Donut data={dueBuckets} total={dueTotal} caption="open" />
            <Legend data={dueBuckets} total={dueTotal} />
          </div>
        </section>

        <section className="panel">
          <h3>By priority</h3>
          <Bars data={byPriority} caption="tasks by priority" />
        </section>

        <section className="panel">
          <h3>By project</h3>
          <HBars rows={byProject} emptyText="No projects yet." />
        </section>

        <section className="panel analytics-wide">
          <h3>{scope === 'all' ? 'Open workload per member' : 'Your open workload'}</h3>
          <HBars rows={byMember} emptyText="Nothing open — nice. 🌤" />
        </section>
      </div>
    </div>
  );
}
