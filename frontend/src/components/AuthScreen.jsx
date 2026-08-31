import React, { useState } from 'react';
import { api, setToken } from '../api.js';

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', full_name: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = mode === 'login'
        ? await api.login({ username: form.username, password: form.password })
        : await api.register(form);
      setToken(r.token);
      onAuth(r.user);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const useDemo = () => {
    setForm({ username: 'demo', password: 'taskie123', full_name: '' });
    setMode('login');
  };

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="auth-logo">✓</div>
        <h1>Taskie</h1>
        <p className="auth-tagline">Agentic task management for teams.<br />Your AI plans, recommends and evaluates — you ship.</p>
        <ul className="auth-features">
          <li><span>📎</span> Upload & preview <strong>any file type</strong> — docs, sheets, decks, PDFs, media, archives</li>
          <li><span>🤖</span> An <strong>agent that acts</strong>: chat it into creating, prioritising and completing tasks</li>
          <li><span>✦</span> Personalised <strong>recommendations, plans & grades</strong> for every teammate</li>
        </ul>
      </div>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-tabs">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(null); }}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(null); }}>Create account</button>
          </div>

          {mode === 'register' && (
            <label className="field">
              <span>Full name</span>
              <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="Ada Lovelace" />
            </label>
          )}
          <label className="field">
            <span>Username</span>
            <input className="input" value={form.username} onChange={set('username')} placeholder="ada" autoFocus required />
          </label>
          <label className="field">
            <span>Password</span>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account & sign in'}
          </button>

          <div className="auth-demo">
            <span className="muted small">Demo account: <code>demo</code> / <code>taskie123</code></span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={useDemo}>Fill demo</button>
          </div>
        </form>
      </div>
    </div>
  );
}
