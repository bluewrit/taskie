import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Topbar({ me, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const first = (me.full_name || me.username).split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <header className="topbar">
      <div className="topbar-greet">
        <div className="topbar-hello">{greeting()}, {first} 👋</div>
        <div className="topbar-date">{today}</div>
      </div>

      <div className="user-menu" ref={ref}>
        <button className="user-chip" onClick={() => setOpen((o) => !o)}>
          <Avatar user={me} size={30} />
          <span className="user-chip-name">{me.full_name || me.username}</span>
          <span className={`role-badge role-${me.role}`}>{me.role}</span>
          <span className="caret">▾</span>
        </button>
        {open && (
          <div className="user-dropdown">
            <div className="user-dropdown-head">
              <Avatar user={me} size={38} />
              <div>
                <div className="user-dropdown-name">{me.full_name || me.username}</div>
                <div className="muted small">@{me.username} · {me.role}</div>
              </div>
            </div>
            {me.email && <div className="user-dropdown-email muted small">{me.email}</div>}
            <button className="user-dropdown-item danger" onClick={onLogout}>⏻ Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
