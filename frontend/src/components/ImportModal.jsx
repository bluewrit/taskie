import React, { useRef, useState } from 'react';
import { api } from '../api.js';

export default function ImportModal({ onClose, onImported, notify }) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const r = await api.importTasks(file, setProgress);
      setResult(r);
      onImported?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pick = () => inputRef.current?.click();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Import tasks from Excel</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <p className="muted small" style={{ margin: '4px 0 12px' }}>
          Drop an <strong>.xlsx</strong> or <strong>.csv</strong> file — tasks are created
          automatically. The first row must be a header; recognised columns:
          <span className="import-cols">Title · Description · Status · Priority · Due date ·
          Assignee · Project · Hours · Progress · Tags</span>
        </p>

        <div
          className={`import-drop ${dragOver ? 'over' : ''} ${busy ? 'busy' : ''}`}
          onClick={pick}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}>
          {busy ? (
            <div className="import-progress">
              <div className="import-progress-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <div className="muted small">Importing… {Math.round(progress * 100)}%</div>
            </div>
          ) : (
            <>
              <div className="import-drop-icon">📊</div>
              <div>Drop your spreadsheet here, or <strong>browse</strong></div>
              <div className="muted small">Unknown projects are created automatically</div>
            </>
          )}
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv" hidden
                 onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>

        {error && <div className="auth-error" style={{ marginTop: 12 }}>⚠ {error}</div>}

        {result && (
          <div className="import-result">
            <div className="import-result-head">
              <span className="import-ok">✓ {result.created} task(s) created</span>
              {result.projects_created.length > 0 && (
                <span className="muted small"> + new project(s): {result.projects_created.join(', ')}</span>
              )}
            </div>
            {result.skipped.length > 0 && (
              <ul className="import-skipped">
                {result.skipped.slice(0, 8).map((s, i) => (
                  <li key={i} className="muted small">Row {s.row}: {s.reason}</li>
                ))}
                {result.skipped.length > 8 && <li className="muted small">…and {result.skipped.length - 8} more</li>}
              </ul>
            )}
            <div className="muted small" style={{ marginTop: 6 }}>
              Columns matched: {result.columns_found.join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
