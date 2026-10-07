import { useEffect, useState } from 'react';
import { getAdminStatus } from '../lib/localOverlay.js';
import { apiAdminGetLexiconFile, apiAdminSaveLexiconFile } from '../lib/api.js';
import './RootAdminEdit.css';

// Admin-only: set the lexicon value of a non-Hebrew word (Greek / Ge'ez / Latin /
// Syriac) straight from its surface page. `file` and `lexKey` come from
// /api/concordance/surface (`lex`): the per-language lexicon file and the exact
// key the reader resolves glosses with. Writes go through the same backed-up
// admin file API as /admin/lexicon, and a new key is appended — these files
// keep the order they already have.
export default function LexiconSurfaceEdit({ file, lexKey, current, onSaved }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [existing, setExisting] = useState(undefined);   // value now on disk, undefined = no entry

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)).catch(() => {}); }, []);
  useEffect(() => { setOpen(false); setMsg(null); }, [file, lexKey]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    apiAdminGetLexiconFile(file).then(f => {
      if (!live) return;
      let v;
      try { const o = JSON.parse(f.content); if (o && typeof o[lexKey] === 'string') v = o[lexKey]; } catch { /* ignore */ }
      setExisting(v);
      setText(v !== undefined ? v : (current || ''));
    }).catch(() => { if (live) setText(current || ''); });
    return () => { live = false; };
  }, [open, file, lexKey, current]);

  if (!isAdmin || !file || !lexKey) return null;

  const save = async () => {
    const value = text.trim();
    if (!value) { setMsg({ err: 'Type a value first.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const [{ upsertEntry }, f] = await Promise.all([
        import('../pages/LexiconTable.jsx'),
        apiAdminGetLexiconFile(file),
      ]);
      const next = upsertEntry(f.content, lexKey, value, {}, false);
      if (next == null) throw new Error(`${file} isn't a JSON object — fix it in /admin/lexicon first`);
      await apiAdminSaveLexiconFile(file, next);
      setExisting(value);
      setMsg({ ok: `Saved to ${file}` });
      onSaved && onSaved(value);
    } catch (e) {
      setMsg({ err: e.message || 'Save failed' });
    } finally { setBusy(false); }
  };

  return (
    <span className="rae">
      <button type="button" className="rae-toggle" onClick={() => setOpen(o => !o)} title="Set this word's lexicon value (admin)">
        {open ? '✕' : '✎ set value'}
      </button>
      {open && (
        <div className="rae-panel">
          <textarea className="rae-input" rows={2} dir="ltr" value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }}
                    placeholder="Value…" autoFocus />
          <div className="rae-btns">
            <button type="button" className="rae-btn" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save value'}
              <small>{file} · <span dir="ltr" className="rae-key">{lexKey}</span> · {existing !== undefined ? `now “${existing}”` : 'not set'}</small>
            </button>
          </div>
          {msg && <div className={msg.err ? 'rae-err' : 'rae-ok'}>{msg.err || msg.ok}</div>}
        </div>
      )}
    </span>
  );
}
