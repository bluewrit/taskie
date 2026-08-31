import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import BrandCube from './BrandCube.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'board', label: 'Board', icon: '▦' },
  { id: 'list', label: 'Tasks', icon: '☰' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'recommendations', label: 'Recommendations', icon: '✦' },
  { id: 'planner', label: 'Planner', icon: '🗓' },
  { id: 'evaluation', label: 'Evaluation', icon: '📊' },
  { id: 'agent', label: 'AI Agent', icon: '🤖' },
];

const PROJECT_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff', '#ff375f', '#ffd60a', '#6e6e73'];

export default function Sidebar({
  view, setView, projects, users, me,
  projectFilter, setProjectFilter, assigneeFilter, setAssigneeFilter,
  onNewTask, onOpenProject, hubProjectId, taskCount, onCreateProject,
}) {
  const [adding, setAdding] = useState(false);
  const [pname, setPname] = useState('');
  const [pcolor, setPcolor] = useState(PROJECT_COLORS[0]);

  const submitProject = async () => {
    const name = pname.trim();
    if (!name) return;
    await onCreateProject?.(name, pcolor);
    setPname('');
    setAdding(false);
  };
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
          <div key={p.id} className="project-item">
            <button className={`filter-item ${view === 'project' && hubProjectId === p.id ? 'active' : ''}`}
                    onClick={() => onOpenProject(p)} title="Open project hub (shared files & chat)">
              <span className="dot" style={{ background: p.color }} /> {p.name}
            </button>
            <button className={`filter-dot-btn ${String(projectFilter) === String(p.id) ? 'active' : ''}`}
                    title="Filter tasks by this project"
                    onClick={() => setProjectFilter(String(projectFilter) === String(p.id) ? '' : p.id)}>⌖</button>
          </div>
        ))}
        {projects.length === 0 && !adding && (
          <div className="muted small" style={{ padding: '2px 12px' }}>No projects yet</div>
        )}
        <button className="new-project-btn" onClick={() => setAdding((a) => !a)}>
          ＋ New project
        </button>
        {adding && (
          <div className="new-project-form">
            <input className="input input-sm" placeholder="Project name" value={pname}
                   onChange={(e) => setPname(e.target.value)} autoFocus
                   onKeyDown={(e) => e.key === 'Enter' && submitProject()} />
            <div className="color-row">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button"
                        className={`color-dot ${pcolor === c ? 'sel' : ''}`}
                        style={{ background: c }}
                        onClick={() => setPcolor(c)} aria-label={`Color ${c}`} />
              ))}
            </div>
            <div className="new-project-actions">
              <button className="btn btn-primary btn-sm" onClick={submitProject}>Create</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
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
