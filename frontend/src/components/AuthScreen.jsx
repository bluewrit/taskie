import React, { Suspense, useState } from 'react';
import { api, setToken } from '../api.js';
import BrandCube from './BrandCube.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { celebrate } from '../confetti.js';

// three.js is heavy — lazy-load the 3D scene only on the auth screen.
// Any failure (chunk 404/504, no WebGL, GPU blocklist) degrades to nothing:
// the login form must never be taken down by decoration.
const AuthScene = React.lazy(() =>
  import('./AuthScene.jsx').catch(() => ({ default: () => null }))
);

const FEATURES = [
  { icon: '📎', text: <>Upload & preview <strong>any file type</strong> — docs, sheets, decks, PDFs, media, archives</> },
  { icon: '🤖', text: <>An <strong>agent that acts</strong>: chat it into creating, prioritising and completing tasks</> },
  { icon: '✦', text: <>Personalised <strong>recommendations, plans & grades</strong> for every teammate</> },
];

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', full_name: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy || success) return;
    setError(null);
    setBusy(true);
    try {
      const r = mode === 'login'
        ? await api.login({ username: form.username, password: form.password })
        : await api.register(form);
      // play the success animation, then enter the app
      setSuccess(true);
      celebrate();
      setTimeout(() => {
        setToken(r.token);
        onAuth(r.user);
      }, 500);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const useDemo = () => {
    setForm({ username: 'demo', password: 'taskie123', full_name: '' });
    setMode('login');
    setError(null);
  };

  return (
    <div className="auth">
      {/* ------------------------------------------------ left: brand + 3D */}
      <div className="auth-brand">
        <div className="aurora" aria-hidden="true"><span /><span /><span /></div>
        <div className="auth-canvas">
          <ErrorBoundary fallback={null}>
            <Suspense fallback={null}><AuthScene /></Suspense>
          </ErrorBoundary>
        </div>
        <div className="auth-brand-content">
          <div className="anim-in" style={{ '--d': '0.05s' }}><BrandCube size={54} /></div>
          <h1 className="anim-in animated-title" style={{ '--d': '0.18s' }}>Taskie</h1>
          <p className="auth-tagline anim-in" style={{ '--d': '0.3s' }}>
            Agentic task management for teams.<br />Your AI plans, recommends and evaluates — you ship.
          </p>
          <ul className="auth-features">
            {FEATURES.map((f, i) => (
              <li key={i} className="anim-in" style={{ '--d': `${0.42 + i * 0.12}s` }}>
                <span className="feature-icon">{f.icon}</span>{f.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ------------------------------------------------ right: form */}
      <div className="auth-form-side">
        <div className="auth-particles" aria-hidden="true">
          <span className="p1" /><span className="p2" /><span className="p3" /><span className="p4" />
        </div>

        <form className={`auth-card anim-card ${success ? 'auth-success' : ''}`} onSubmit={submit}>
          {success && <div className="auth-check">✓</div>}

          <div className="auth-tabs">
            <span className={`tab-pill ${mode === 'register' ? 'right' : ''}`} />
            <button type="button" className={mode === 'login' ? 'active' : ''}
                    onClick={() => { setMode('login'); setError(null); }}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''}
                    onClick={() => { setMode('register'); setError(null); }}>Create account</button>
          </div>

          <div className={`auth-fields ${mode === 'register' ? 'with-name' : ''}`}>
            <label className="field anim-field" style={{ '--d': '0.1s' }}>
              <span>Full name</span>
              <input className="input" value={form.full_name} onChange={set('full_name')}
                     placeholder="Ada Lovelace" tabIndex={mode === 'register' ? 0 : -1} />
            </label>
            <label className="field anim-field" style={{ '--d': '0.18s' }}>
              <span>Username</span>
              <input className="input" value={form.username} onChange={set('username')}
                     placeholder="ada" autoFocus required />
            </label>
            <label className="field anim-field" style={{ '--d': '0.26s' }}>
              <span>Password</span>
              <input className="input" type="password" value={form.password} onChange={set('password')}
                     placeholder="••••••••" required />
            </label>
          </div>

          {error && <div key={error} className="auth-error">⚠ {error}</div>}

          <button className="btn btn-primary btn-block btn-shine" disabled={busy || success}>
            {success ? '✓ Welcome aboard!'
              : busy ? <><span className="spinner" /> Signing in…</>
              : mode === 'login' ? 'Sign in →' : 'Create account & sign in →'}
          </button>

          <div className="auth-demo">
            <span className="muted small">Demo account: <code>demo</code> / <code>taskie123</code></span>
            <button type="button" className="btn btn-ghost btn-sm pulse-soft" onClick={useDemo}>Fill demo</button>
          </div>
        </form>
      </div>
    </div>
  );
}
