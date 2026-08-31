import React, { useCallback, useEffect, useState } from 'react';
import { api, setToken } from './api.js';
import AuthScreen from './components/AuthScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Dashboard from './components/Dashboard.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import TaskList from './components/TaskList.jsx';
import TaskModal from './components/TaskModal.jsx';
import FilePreview from './components/FilePreview.jsx';
import AgentChat from './components/AgentChat.jsx';
import Recommendations from './components/Recommendations.jsx';
import Planner from './components/Planner.jsx';
import Evaluation from './components/Evaluation.jsx';
import Team from './components/Team.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(!!localStorage.getItem('taskie_token'));
  const [users, setUsers] = useState([]);

  const [view, setView] = useState('dashboard');
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState(''); // '' | 'me' | 'unassigned' | userId
  const [modalTask, setModalTask] = useState(null); // null | 'new' | task object
  const [previewFileId, setPreviewFileId] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const notify = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // session bootstrap + forced sign-out on 401
  useEffect(() => {
    const unauth = () => { setMe(null); setUsers([]); };
    window.addEventListener('taskie:unauthorized', unauth);
    if (localStorage.getItem('taskie_token')) {
      api.me().then((u) => { setMe(u); setBooting(false); })
        .catch(() => { setMe(null); setBooting(false); });
    }
    return () => window.removeEventListener('taskie:unauthorized', unauth);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [t, p, u] = await Promise.all([api.listTasks(), api.listProjects(), api.listUsers()]);
      setTasks(t);
      setProjects(p);
      setUsers(u);
    } catch (e) {
      if (e.message && !e.message.startsWith('401')) notify(e.message, 'err');
    }
  }, [notify]);

  useEffect(() => { if (me) refresh(); }, [me, refresh, refreshTick]);

  const onTasksChanged = () => setRefreshTick((x) => x + 1);

  const logout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setToken(null);
    setMe(null);
  };

  if (booting) {
    return <div className="boot-splash"><div className="boot-logo">✓</div><div className="muted">Loading your workspace…</div></div>;
  }
  if (!me) {
    return <AuthScreen onAuth={(u) => { setMe(u); setView('dashboard'); }} />;
  }

  const filtered = tasks.filter((t) => {
    if (projectFilter && t.project_id !== Number(projectFilter)) return false;
    if (assigneeFilter === 'me') return t.assignee?.id === me.id;
    if (assigneeFilter === 'unassigned') return !t.assignee;
    if (assigneeFilter) return t.assignee?.id === Number(assigneeFilter);
    return true;
  });

  const views = {
    dashboard: <Dashboard tasks={tasks} projects={projects} users={users} me={me}
                          onOpenTask={setModalTask} onNavigate={setView} />,
    board: <TaskBoard tasks={filtered} onOpenTask={setModalTask}
                      onNew={() => setModalTask('new')} notify={notify} onChanged={onTasksChanged} />,
    list: <TaskList tasks={filtered} projects={projects} onOpenTask={setModalTask}
                    onNew={() => setModalTask('new')} notify={notify} onChanged={onTasksChanged} />,
    team: <Team users={users} tasks={tasks} me={me} onOpenTask={setModalTask}
                onChanged={onTasksChanged} notify={notify} onNavigate={setView} />,
    recommendations: <Recommendations onTasksChanged={onTasksChanged} notify={notify} />,
    planner: <Planner me={me} />,
    evaluation: <Evaluation me={me} />,
    agent: <AgentChat onTasksChanged={onTasksChanged} me={me} />,
  };

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} projects={projects} users={users} me={me}
               projectFilter={projectFilter} setProjectFilter={setProjectFilter}
               assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter}
               onNewTask={() => setModalTask('new')}
               taskCount={tasks.filter((t) => t.status !== 'done').length} />
      <div className="main-wrap">
        <Topbar me={me} onLogout={logout} />
        <main className="main">{views[view]}</main>
      </div>

      {modalTask && (
        <TaskModal
          task={modalTask === 'new' ? null : modalTask}
          projects={projects}
          users={users}
          me={me}
          onClose={() => setModalTask(null)}
          onSaved={() => { setModalTask(null); onTasksChanged(); }}
          onPreview={setPreviewFileId}
          notify={notify}
        />
      )}

      {previewFileId != null && (
        <FilePreview fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      )}

      {toast && (
        <div className={`toast ${toast.kind === 'err' ? 'toast-err' : ''}`}>
          <span className="toast-icon">{toast.kind === 'err' ? '⚠' : '✓'}</span>{toast.msg}
        </div>
      )}
    </div>
  );
}
