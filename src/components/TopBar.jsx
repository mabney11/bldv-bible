import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { useHideOnScroll } from '../hooks/useHideOnScroll.js';
import './TopBar.css';

/**
 * TopBar — sticky toolbar at the top of every page.
 *
 * Two slot regions:
 *   - children: row 1 (logo, title, primary controls like book/chapter selects)
 *   - actions:  row 2 (icon buttons — theme, settings, page-specific)
 *
 * Hides on scroll-down, returns on scroll-up. On mobile this drops to two
 * stacked rows automatically.
 */
export default function TopBar({ title, children, actions, hideOnScroll = true }) {
  const { theme, toggle: toggleTheme } = useTheme();
  const hidden = hideOnScroll ? useHideOnScroll(80) : false;

  return (
    <header className={`top-bar ${hidden ? 'bar-hidden' : ''}`}>
      <div className="top-bar-row1">
        <Link to="/landing" className="logo-btn" title="Home">𐤀𐤁</Link>
        {title && <h1 className="bar-title">{title}</h1>}
        {children}
      </div>
      <div className="top-bar-row2">
        {actions}
        <button
          className="icon-btn"
          onClick={toggleTheme}
          title="Toggle light/dark"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}
