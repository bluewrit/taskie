/** iOS-style light/dark switch. */
export default function ThemeToggle({ theme, onToggle }) {
  return (
    <div className="theme-switch-wrap" title="Switch between light and dark mode">
      <span className="theme-icon" aria-hidden="true">{theme === 'light' ? '☀️' : '🌙'}</span>
      <button type="button"
              className={`ios-switch ${theme === 'light' ? 'on' : ''}`}
              onClick={onToggle} role="switch"
              aria-checked={theme === 'light'}
              aria-label="Toggle light mode">
        <span className="ios-switch-knob" />
      </button>
    </div>
  );
}
