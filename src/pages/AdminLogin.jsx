import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { refreshAdminStatus } from '../lib/localOverlay.js';

/**
 * AdminLogin — the one page that proves you're the admin.
 *
 * POSTs a password to server/server.js's /admin/login, which checks it
 * against the ADMIN_KEY env var and, on success, sets a signed httpOnly
 * session cookie. From then on every write endpoint on this server treats
 * requests from this browser as admin — same as running the app locally,
 * even on a public READ_ONLY=1 deployment. Everyone else's edits stay local
 * to their own browser (see src/lib/localOverlay.js).
 *
 * Not linked prominently anywhere — bookmark this URL (/admin-login).
 */
export default function AdminLogin() {
  const [status, setStatus] = useState(null); // { isAdmin, configured } | null
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  const refresh = useCallback(() => {
    fetch('/admin/session').then(r => r.json()).then(setStatus).catch(() => setStatus({ isAdmin: false, configured: false }));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setOk(false);
    try {
      const r = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `${r.status} ${r.statusText}`);
      setOk(true);
      setPassword('');
      await refreshAdminStatus();
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/admin/logout', { method: 'POST' });
    await refreshAdminStatus();
    refresh();
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24,
      fontFamily: 'inherit', color: 'var(--text, #eee)', background: 'var(--bg, #111)',
    }}>
      <Link to="/landing" style={{ fontSize: 32, textDecoration: 'none', color: 'inherit' }} aria-label="Home">𐤀𐤁</Link>
      <h1 style={{ fontSize: 20, margin: 0 }}>Admin</h1>

      {status === null && <p>Checking…</p>}

      {status && !status.configured && (
        <p style={{ maxWidth: 360, textAlign: 'center', opacity: 0.8 }}>
          Admin login isn't configured on this server — set the <code>ADMIN_KEY</code> environment
          variable (and, if this is a public deployment, <code>READ_ONLY=1</code>) and restart the server.
        </p>
      )}

      {status && status.configured && status.isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <p>✓ You're logged in as admin. Writes on this server go straight through, same as running it locally.</p>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8, width: 260,
            padding: 16, borderRadius: 8, border: '1px solid #333', background: 'rgba(255,255,255,0.03)',
          }}>
            <span style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin tools</span>
            <Link to="/admin/strongs-overrides" style={{ color: 'inherit' }}>Strong's # overrides</Link>
            <Link to="/book-manager" style={{ color: 'inherit' }}>Book manager</Link>
            <Link to="/gloss-studio" style={{ color: 'inherit' }}>Gloss Studio</Link>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/landing" style={{ color: 'inherit' }}>← Back to the app</Link>
            <button onClick={logout} style={{ cursor: 'pointer' }}>Log out</button>
          </div>
        </div>
      )}

      {status && status.configured && !status.isAdmin && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            autoComplete="current-password"
            style={{ padding: '10px 12px', fontSize: 15, borderRadius: 6, border: '1px solid #444', background: 'transparent', color: 'inherit' }}
          />
          <button type="submit" disabled={busy || !password} style={{ padding: '10px 12px', fontSize: 15, cursor: 'pointer' }}>
            {busy ? 'Checking…' : 'Log in'}
          </button>
          {error && <p style={{ color: '#e66', margin: 0, fontSize: 13 }}>⚠ {error}</p>}
          {ok && <p style={{ color: '#6c6', margin: 0, fontSize: 13 }}>✓ Logged in.</p>}
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
            Everyone else visiting this site can read everything but can't write to it —
            their edits save only in their own browser.
          </p>
        </form>
      )}
    </div>
  );
}
