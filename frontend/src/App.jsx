import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './components/Dashboard.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import TaskList from './components/TaskList.jsx';
import TaskModal from './components/TaskModal.jsx';
import FilePreview from './components/FilePreview.jsx';
import AgentChat from './components/AgentChat.jsx';
import Recommendations from './components/Recommendations.jsx';
import Planner from './components/Planner.jsx';
import Evaluation from './components/Evaluation.jsx';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [modalTask, setModalTask] = useState(null); // null | 'new' | task object
  const [previewFileId, setPreviewFileId] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const notify = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([api.listTasks(), api.listProjects()]);
      setTasks(t);
      setProjects(p);
    } catch (e) {
      notify(e.message, 'err');
    }
  }, [notify]);

  useEffect(() => { refresh(); }, [refresh, refreshTick]);

  const onTasksChanged = () => setRefreshTick((x) => x + 1);

  const filtered = projectFilter ? tasks.filter((t) => t.project_id === Number(projectFilter)) : tasks;

  const views = {
    dashboard: <Dashboard tasks={tasks} projects={projects} onOpenTask={setModalTask} onNavigate={setView} />,
    board: <TaskBoard tasks={filtered} projects={projects} onChanged={onTasksChanged}
                      onOpenTask={setModalTask} onNew={() => setModalTask('new')} notify={notify} />,
    list: <TaskList tasks={filtered} projects={projects} onChanged={onTasksChanged}
                    onOpenTask={setModalTask} onNew={() => setModalTask('new')} notify={notify} />,
    agent: <AgentChat onTasksChanged={onTasksChanged} />,
    recommendations: <Recommendations onTasksChanged={onTasksChanged} notify={notify} />,
    planner: <Planner />,
    evaluation: <Evaluation />,
  };

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} projects={projects}
               projectFilter={projectFilter} setProjectFilter={setProjectFilter}
               onNewTask={() => setModalTask('new')} taskCount={tasks.filter((t) => t.status !== 'done').length} />
      <main className="main">{views[view]}</main>

      {modalTask && (
        <TaskModal
          task={modalTask === 'new' ? null : modalTask}
          projects={projects}
          onClose={() => setModalTask(null)}
          onSaved={() => { setModalTask(null); onTasksChanged(); }}
          onPreview={setPreviewFileId}
          notify={notify}
        />
      )}

      {previewFileId != null && (
        <FilePreview fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      )}

      {toast && <div className={`toast ${toast.kind === 'err' ? 'toast-err' : ''}`}>{toast.msg}</div>}
    </div>
  );
}
