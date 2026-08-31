import React, { useState } from 'react';
import { api, STATUS_LABELS, fmtDate } from '../api.js';
import Avatar from './Avatar.jsx';
import ImportModal from './ImportModal.jsx';
import { celebrate } from '../confetti.js';

const COLUMNS = ['todo', 'in_progress', 'blocked', 'done'];

function TaskCard({ task, onOpen, onDragStart, index = 0 }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date && task.due_date < today && task.status !== 'done';
  return (
    <div className={`card card-${task.priority}`} style={{ '--i': index }}
         draggable onDragStart={(e) => onDragStart(e, task)} onClick={() => onOpen(task)}>
      <div className="card-top">
        <span className={`pill pill-${task.priority}`}>{task.priority}</span>
        {task.files?.length > 0 && <span className="clip" title={`${task.files.length} file(s)`}>📎{task.files.length}</span>}
      </div>
      <div className="card-title">{task.title}</div>
      <div className="card-meta">
        <Avatar user={task.assignee} size={20} />
        <span className={`due ${overdue ? 'due-overdue' : ''}`}>{task.due_date ? fmtDate(task.due_date) : '—'}</span>
        {task.progress > 0 && task.status !== 'done' && (
          <span className="progress-mini"><span style={{ width: `${task.progress}%` }} /></span>
        )}
        <span className="score-chip" title={`Agent score: ${task.agent_note}`}>{Math.round(task.agent_score)}</span>
      </div>
    </div>
  );
}

export default function TaskBoard({ tasks, onChanged, onOpenTask, onNew, notify }) {
  const [dragOver, setDragOver] = useState(null);
  const [importing, setImporting] = useState(false);

  const move = async (task, status) => {
    if (task.status === status) return;
    try {
      await api.updateTask(task.id, { status });
      if (status === 'done' && task.status !== 'done') celebrate();
      onChanged();
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Board</h1>
          <p className="muted">Drag cards between columns to update status.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(true)}>⇪ Import Excel</button>
          <button className="btn btn-primary" onClick={onNew}>＋ New task</button>
        </div>
      </header>
      {importing && <ImportModal onClose={() => setImporting(false)}
                                 onImported={onChanged} notify={notify} />}

      <div className="board">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col)
            .sort((a, b) => b.agent_score - a.agent_score);
          return (
            <div key={col}
                 className={`column ${dragOver === col ? 'column-over' : ''}`}
                 onDragOver={(e) => { e.preventDefault(); setDragOver(col); }}
                 onDragLeave={() => setDragOver(null)}
                 onDrop={(e) => {
                   e.preventDefault();
                   setDragOver(null);
                   const id = Number(e.dataTransfer.getData('text/task-id'));
                   const task = tasks.find((t) => t.id === id);
                   if (task) move(task, col);
                 }}>
              <div className="column-head">
                <span className={`col-dot col-${col}`} />
                {STATUS_LABELS[col]}
                <span className="count">{items.length}</span>
              </div>
              <div className="column-body">
                {items.map((t, i) => (
                  <TaskCard key={t.id} task={t} index={i} onOpen={onOpenTask}
                            onDragStart={(e, task) => e.dataTransfer.setData('text/task-id', String(task.id))} />
                ))}
                {items.length === 0 && <div className="empty-col">Drop tasks here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
