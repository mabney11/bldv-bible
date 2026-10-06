import { useEffect, useState } from 'react';
import { getAdminStatus } from '../lib/localOverlay.js';
import { apiAdminGetLexiconFile, apiAdminSaveLexiconFile, apiAdminLexiconSnIndex } from '../lib/api.js';
import './RootAdminEdit.css';

// Admin-only: set the value for the root being viewed — either as the root's
// main lexicon value (lexicon.json, key = the root's letters) or as a
// homograph value for this Strong's number (homographs.json, key = letters_Hnnn).
// Writes go through the same backed-up admin file API as /admin/lexicon.
export default function RootAdminEdit({ root, sn, current, onSaved }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current || '');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [existing, setExisting] = useState({ lex: undefined, homo: undefined, homoKey: '' });
  const letters = (root || '').replace(/-/g, '');

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)).catch(() => {}); }, []);
  useEffect(() => { setOpen(false); setMsg(null); }, [root, sn]);

  useEffect(() => {
    if (!open) return;
    setText(current || '');
    let live = true;
    Promise.all([apiAdminGetLexiconFile('lexicon.json'), apiAdminGetLexiconFile('homographs.json')]).then(([a, b]) => {
      if (!live) return;
      let lex, homo; const hk = [`${letters}_${sn}`, sn];
      try { lex = JSON.parse(a.content)[letters]; } catch { /* ignore */ }
      let homoKey = hk[0];
      try { const o = JSON.parse(b.content); const f = hk.find(k => k in o); if (f) homoKey = f; homo = o[homoKey]; } catch { /* ignore */ }
      setExisting({ lex, homo, homoKey });
    }).catch(() => {});
    return () => { live = false; };
  }, [open, letters, sn, current]);

  if (!isAdmin || !letters) return null;

  const save = async (file, key) => {
    const value = text.trim();
    if (!value) { setMsg({ err: 'Type a value first.' }); return; }
    setBusy(file); setMsg(null);
    try {
      const [{ upsertEntry }, f, snIndex] = await Promise.all([
        import('../pages/LexiconTable.jsx'),
        apiAdminGetLexiconFile(file),
        apiAdminLexiconSnIndex().catch(() => ({})),
      ]);
      const next = upsertEntry(f.content, key, value, snIndex);
      if (next == null) throw new Error(`${file} isn't a JSON object — fix it in /admin/lexicon first`);
      await apiAdminSaveLexiconFile(file, next);
      setMsg({ ok: `Saved to ${file} as ${key}` });
      setExisting(e => file === 'lexicon.json' ? { ...e, lex: value } : { ...e, homo: value, homoKey: key });
      onSaved && onSaved(value);
    } catch (e) {
      setMsg({ err: e.message || 'Save failed' });
    } finally { setBusy(''); }
  };

  const hKey = existing.homoKey || `${letters}_${sn}`;
  return (
    <span className="rae">
      <button type="button" className="rae-toggle" onClick={() => setOpen(o => !o)} title="Set this root's value (admin)">
        {open ? '✕' : '✎ set value'}
      </button>
      {open && (
        <div className="rae-panel">
          <textarea className="rae-input" rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Value…" autoFocus />
          <div className="rae-btns">
            <button type="button" className="rae-btn" disabled={!!busy} onClick={() => save('lexicon.json', letters)}>
              {busy === 'lexicon.json' ? 'Saving…' : 'Set as main root value'}
              <small>lexicon.json · {existing.lex !== undefined ? `now “${existing.lex}”` : 'not set'}</small>
            </button>
            <button type="button" className="rae-btn" disabled={!!busy} onClick={() => save('homographs.json', hKey)}>
              {busy === 'homographs.json' ? 'Saving…' : `Set as homograph value (${sn})`}
              <small>homographs.json · <span dir="ltr" className="rae-key">{hKey}</span> · {existing.homo !== undefined ? `now “${existing.homo}”` : 'not set'}</small>
            </button>
          </div>
          {msg && <div className={msg.err ? 'rae-err' : 'rae-ok'}>{msg.err || msg.ok}</div>}
        </div>
      )}
    </span>
  );
}
