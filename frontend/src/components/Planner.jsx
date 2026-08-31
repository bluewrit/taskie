import React, { useCallback, useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';

export default function Planner() {
  const [horizon, setHorizon] = useState(7);
  const [capacity, setCapacity] = useState(6);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.agentPlan(horizon, capacity * 60)
      .then(setPlan)
      .finally(() => setLoading(false));
  }, [horizon, capacity]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h1>Planner</h1>
          <p className="muted">The agent schedules your backlog day-by-day around due dates, priority scores and focus capacity.</p>
        </div>
        <div className="row-gap">
          <label className="inline-label">Horizon
            <select className="input input-sm" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              <option value={1}>Today</option>
              <option value={3}>3 days</option>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
              <option value={30}>1 month</option>
            </select>
          </label>
          <label className="inline-label">Focus / day
            <select className="input input-sm" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
              <option value={3}>3h</option>
              <option value={4}>4h</option>
              <option value={6}>6h</option>
              <option value={8}>8h</option>
            </select>
          </label>
          <button className="btn btn-ghost" onClick={load}>↻ Replan</button>
        </div>
      </header>

      {loading && <p className="muted">Building schedule…</p>}

      {plan && (
        <>
          <div className="plan-summary">
            <span>🗓 {plan.summary.tasks_planned} tasks planned</span>
            <span>⏱ {Math.round(plan.summary.total_focus_minutes / 60)}h focus work</span>
            {plan.summary.unscheduled > 0 && <span className="due-overdue">⚠ {plan.summary.unscheduled} unscheduled</span>}
          </div>

          <div className="plan-days">
            {plan.schedule.map((day) => (
              <div key={day.date} className={`plan-day ${day.is_today ? 'plan-day-today' : ''}`}>
                <div className="plan-day-head">
                  <strong>{day.is_today ? 'Today' : day.weekday}</strong>
                  <span className="muted small">{fmtDate(day.date)}</span>
                  <div className="load-bar"><span style={{ width: `${Math.min(100, day.load_percent)}%` }} /></div>
                  <span className="muted small">{Math.round(day.load_minutes / 60 * 10) / 10}h · {day.load_percent}%</span>
                </div>
                <div className="plan-blocks">
                  {day.blocks.map((b, i) => (
                    <div key={i} className={`plan-block pb-${b.priority}`}>
                      <span className="plan-time">{b.time}</span>
                      <span className="plan-title">{b.title}</span>
                      <span className="muted small">{Math.round(b.estimated_minutes / 6) / 10}h</span>
                    </div>
                  ))}
                  {day.blocks.length === 0 && <div className="muted small plan-empty">Free day — deep work or slack</div>}
                </div>
              </div>
            ))}
          </div>

          {plan.unscheduled.length > 0 && (
            <div className="panel">
              <h3>Couldn't be scheduled</h3>
              <ul>
                {plan.unscheduled.map((u) => (
                  <li key={u.task_id}>#{u.task_id} {u.title} — <span className="muted">{u.reason}</span></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
