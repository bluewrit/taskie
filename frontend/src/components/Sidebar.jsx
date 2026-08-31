import React from 'react';
import Avatar from './Avatar.jsx';
import BrandCube from './BrandCube.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'board', label: 'Board', icon: '▦' },
  { id: 'list', label: 'Tasks', icon: '☰' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'recommendations', label: 'Recommendations', icon: '✦' },
  { id: 'planner', label: 'Planner', icon: '🗓' },
  { id: 'evaluation', label: 'Evaluation', icon: '📊' },
  { id: 'agent', label: 'AI Agent', icon: '🤖' },
];

export default function Sidebar({
  view, setView, projects, users, me,
  projectFilter, setProjectFilter, assigneeFilter, setAssigneeFilter,
  onNewTask, taskCount,
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandCube size={36} />
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
        <div className="sidebar-label">People</div>
        <button className={`filter-item ${assigneeFilter === '' ? 'active' : ''}`} onClick={() => setAssigneeFilter('')}>
          <span className="dot" style={{ background: '#64748b' }} /> Everyone
          <span className="count">{taskCount}</span>
        </button>
        <button className={`filter-item ${assigneeFilter === 'me' ? 'active' : ''}`} onClick={() => setAssigneeFilter('me')}>
          <Avatar user={me} size={16} /> My tasks
        </button>
        <button className={`filter-item ${assigneeFilter === 'unassigned' ? 'active' : ''}`} onClick={() => setAssigneeFilter('unassigned')}>
          <span className="dot" style={{ background: '#334155' }} /> Unassigned
        </button>
        {users.filter((u) => u.id !== me.id).map((u) => (
          <button key={u.id} className={`filter-item ${assigneeFilter === String(u.id) ? 'active' : ''}`}
                  onClick={() => setAssigneeFilter(String(u.id))}>
            <Avatar user={u} size={16} /> {u.full_name || u.username}
          </button>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Projects</div>
        {projects.map((p) => (
          <button key={p.id} className={`filter-item ${String(projectFilter) === String(p.id) ? 'active' : ''}`}
                  onClick={() => setProjectFilter(String(projectFilter) === String(p.id) ? '' : p.id)}>
            <span className="dot" style={{ background: p.color }} /> {p.name}
          </button>
        ))}
        {projects.length === 0 && <div className="muted small" style={{ padding: '2px 12px' }}>No projects yet</div>}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <Avatar user={me} size={28} />
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{me.full_name || me.username}</div>
            <div className="muted small">@{me.username}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
