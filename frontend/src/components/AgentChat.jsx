import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const SUGGESTIONS = [
  'What should I do next?',
  'Plan my week',
  'How am I doing?',
  'Add task "Review PRs" due tomorrow high priority',
  'Assign "Record demo video" to Ava',
];

function ActionChips({ actions }) {
  if (!actions?.length) return null;
  return (
    <div className="action-chips">
      {actions.map((a, i) => (
        <span key={i} className="chip">
          ⚙ {a.tool}
          <span className="chip-result">
            {a.result?.created && `created #${a.result.task_id}`}
            {a.result?.completed && `completed #${a.result.task_id}`}
            {a.result?.updated && `updated #${a.result.task_id}`}
            {a.result?.rescheduled && `rescheduled #${a.result.task_id}`}
            {a.result?.deleted && `deleted #${a.result.task_id}`}
            {a.result?.error && `⚠ ${a.result.error}`}
            {!a.result?.error && (a.result?.count != null) && `${a.result.count} item(s)`}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function AgentChat({ onTasksChanged }) {
  const [messages, setMessages] = useState([
    { role: 'agent', text: "Hi! I'm your task agent. Ask me to add, prioritise, plan or evaluate — e.g. “what should I do next?”" },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState('builtin');
  const endRef = useRef(null);

  useEffect(() => {
    api.agentStatus().then((s) => setEngine(s.engine)).catch(() => {});
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setBusy(true);
    try {
      const r = await api.agentChat(msg);
      setMessages((m) => [...m, { role: 'agent', text: r.reply, reasoning: r.reasoning, actions: r.actions }]);
      if (r.actions?.length) onTasksChanged();
    } catch (e) {
      setMessages((m) => [...m, { role: 'agent', text: `⚠️ ${e.message}` }]);
    }
    setBusy(false);
  };

  return (
    <div className="view chat-view">
      <header className="view-header">
        <div>
          <h1>AI Agent</h1>
          <p className="muted">
            Agentic loop: perceive → reason → act → reflect · engine: <code>{engine}</code>
            {engine === 'builtin' && ' (set OPENAI_API_KEY to use an LLM)'}
          </p>
        </div>
      </header>

      <div className="chat">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              <div className="bubble">
                <div className="bubble-text">{m.text}</div>
                <ActionChips actions={m.actions} />
                {m.reasoning?.length > 0 && (
                  <details className="reasoning">
                    <summary>reasoning trace ({m.reasoning.length} steps)</summary>
                    <ol>{m.reasoning.map((r, j) => <li key={j}>{r}</li>)}</ol>
                  </details>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="msg msg-agent"><div className="bubble typing">thinking…</div></div>}
          <div ref={endRef} />
        </div>

        <div className="chat-input-row">
          <input
            className="input chat-input"
            placeholder="Ask the agent… (add / complete / prioritise / plan / evaluate)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={busy}
          />
          <button className="btn btn-primary btn-shine" onClick={() => send()} disabled={busy}>Send</button>
        </div>
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="btn btn-ghost btn-sm" onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
