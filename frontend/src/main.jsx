import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

// Last-resort boundary: any unexpected crash shows a recovery screen
// instead of a blank page.
function CrashScreen({ error }) {
  return (
    <div className="boot-splash">
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div><strong>Something went wrong.</strong></div>
      <div className="muted small">{String(error?.message || error || '')}</div>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>
        Reload Taskie
      </button>
    </div>
  );
}

class RootBoundary extends ErrorBoundary {
  render() {
    if (this.state.failed) return <CrashScreen />;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootBoundary>
      <App />
    </RootBoundary>
  </React.StrictMode>
);
