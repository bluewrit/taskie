import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPE_ICONS = {
  overdue: '⏰', at_risk: '⚠️', quick_win: '⚡', stale: '🕸', wip_limit: '🚦',
  priority: '🎯', hygiene: '🧹', momentum: '🔥', empty: '🌤',
};

export default function Recommendations({ onTasksChanged, notify }) {
  const [recs, setRecs] = useState([]);
  const [applied, setApplied] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.agentRecommendations()
      .then((r) => setRecs(r.recommendations))
      .catch((e) => notify(e.message, 'err'))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const autoApply = async () => {
    try {
      const r = await api.agentRecommendations(true);
      setRecs(r.recommendations);
      setApplied(r.applied);
      onTasksChanged();
      notify(`Agent applied ${r.applied.length} action(s)`);
    } catch (e) { notify(e.message, 'err'); }
  };

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Recommendations</h1>
          <p className="muted">The agent continuously analyses your backlog and suggests the highest-leverage moves.</p>
        </div>
        <div className="row-gap">
          <button className="btn btn-ghost" onClick={load}>↻ Refresh</button>
          <button className="btn btn-primary" onClick={autoApply}>🤖 Auto-apply safe actions</button>
        </div>
      </header>

      {applied.length > 0 && (
        <div className="panel applied-panel">
          <h3>Actions just applied by the agent</h3>
          <ul>{applied.map((a, i) => <li key={i}>✓ {a.recommendation} → <code>{a.action}</code></li>)}</ul>
        </div>
      )}

      {loading && <p className="muted">Analysing your workspace…</p>}
      {!loading && recs.length === 0 && <p className="muted">No recommendations — everything looks healthy.</p>}

      <div className="rec-grid">
        {recs.map((r) => (
          <div key={r.id} className={`rec-card rec-${r.severity}`}>
            <div className="rec-head">
              <span className="rec-icon">{TYPE_ICONS[r.type] || '✦'}</span>
              <span className={`sev sev-${r.severity}`}>{r.severity}</span>
            </div>
            <h4>{r.title}</h4>
            <p className="muted">{r.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
