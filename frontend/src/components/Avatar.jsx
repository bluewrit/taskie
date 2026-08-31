import React from 'react';
import { initials } from '../api.js';

export default function Avatar({ user, size = 26, title }) {
  if (!user) {
    return (
      <span className="avatar avatar-ghost" style={{ width: size, height: size, fontSize: size * 0.42 }}
            title={title || 'Unassigned'}>?</span>
    );
  }
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42, background: user.color }}
          title={title || user.full_name || user.username}>
      {initials(user)}
    </span>
  );
}
