import React from 'react';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'board', label: 'Board', icon: '▦' },
  { id: 'list', label: 'Tasks', icon: '☰' },
  { id: 'recommendations', label: 'Recommendations', icon: '✦' },
  { id: 'planner', label: 'Planner', icon: '🗓' },
  { id: 'evaluation', label: 'Evaluation', icon: '📊' },
  { id: 'agent', label: 'AI Agent', icon: '🤖' },
];

export default function Sidebar({ view, setView, projects, projectFilter, setProjectFilter, onNewTask, taskCount }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">✓</span>
        <div>
          <div className="brand-name">Taskie</div>
          <div className="brand-sub">agentic workspace</div>
        </div>
      </div>

      <button className="btn btn-primary btn-block" onClick={onNewTask}>＋ New task</button>

      <nav className="nav">
        {NAV.map((item) => (
          <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
            <span className="nav-icon">{item.icon}</span>{item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-label">Projects</div>
        <button className={`filter-item ${projectFilter === '' ? 'active' : ''}`} onClick={() => setProjectFilter('')}>
          <span className="dot" style={{ background: '#64748b' }} /> All tasks
          <span className="count">{taskCount}</span>
        </button>
        {projects.map((p) => (
          <button key={p.id} className={`filter-item ${String(projectFilter) === String(p.id) ? 'active' : ''}`}
                  onClick={() => setProjectFilter(String(p.id))}>
            <span className="dot" style={{ background: p.color }} /> {p.name}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        Python · FastAPI · React
      </div>
    </aside>
  );
}
