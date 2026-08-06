import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import {
  apiAdminVerseTokens, apiAdminListStrongsOverrides,
  apiAdminSaveStrongsOverride, apiAdminDeleteStrongsOverride,
} from '../lib/api.js';
import './StrongsOverrides.css';

// /admin/strongs-overrides — browse to a verse, see its tokens with their
// CURRENT effective Strong's # (already reflecting any override in place),
// click one, and pin a corrected or brand-new synthetic Strong's # (e.g.
// H2995a) to that ONE exact occurrence. This is the location-keyed override
// system (book_id:chapter:verse:token_ordinal) — distinct from the older
// surface-strongs-overrides.json, which is keyed by bare spelling and can
// only fill a blank SN, never override one that's already set. See
// server.js's applyLocOverride*/locOverridesTargeting for how this gets
// read back in everywhere it matters (the reader, root/surface search, the
// translit search's root expansion).
export default function StrongsOverrides() {
  const toast = useToast();
  const [isAdmin, setIsAdmin] = useState(null); // null = checking

  const [book, setBook]       = useState('');
  const [chapter, setChapter] = useState('');
  const [verse, setVerse]     = useState('');
  const [verseData, setVerseData] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState(null);

  const [editing, setEditing] = useState(null); // the token object being edited
  const [formSN, setFormSN]   = useState('');
  const [formNote, setFormNote] = useState('');

  const [overrides, setOverrides] = useState([]);
  const [ovBusy, setOvBusy] = useState(false);

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)); }, []);

  const loadOverrides = useCallback(() => {
    setOvBusy(true);
    apiAdminListStrongsOverrides()
      .then(d => setOverrides(d.overrides || []))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setOvBusy(false));
  }, [toast]);

  useEffect(() => { if (isAdmin) loadOverrides(); }, [isAdmin, loadOverrides]);

  const loadVerse = e => {
    e?.preventDefault?.();
    const b = parseInt(book, 10), c = parseInt(chapter, 10), v = parseInt(verse, 10);
    if (!b || !c || !v) { setErr('Enter a book #, chapter, and verse.'); return; }
    setBusy(true); setErr(null); setVerseData(null); setEditing(null);
    apiAdminVerseTokens(b, c, v)
      .then(d => setVerseData(d))
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const startEdit = tok => {
    setEditing(tok);
    setFormSN(tok.strongs || '');
    setFormNote('');
  };

  const saveOverride = async () => {
    if (!editing || !formSN.trim()) { toast('Enter a Strong\'s #', 'err'); return; }
    try {
      await apiAdminSaveStrongsOverride({
        book_id: verseData.book_id,
        chapter: verseData.chapter,
        verse: verseData.verse,
        token_ordinal: editing.token_ordinal,
        strongs: formSN.trim(),
        word_raw: editing.word_raw,
        note: formNote.trim(),
      });
      toast('Saved — indexes rebuilt', 'ok');
      setEditing(null);
      loadVerse();
      loadOverrides();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const removeOverride = async key => {
    try {
      await apiAdminDeleteStrongsOverride(key);
      toast('Removed', 'ok');
      loadOverrides();
      if (verseData) loadVerse();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  if (isAdmin === null) return <div className="page-stub"><p>Checking admin status…</p></div>;
  if (!isAdmin) {
    return (
      <div className="page-stub">
        <h2>Strong's # Overrides</h2>
        <p>Admin only. <Link to="/admin-login" className="txt-btn">Log in</Link></p>
      </div>
    );
  }

  return (
    <div className="so-page">
      <div className="so-topbar">
        <Link to="/landing" className="logo-btn">𐤀𐤁</Link>
        <span className="so-title">Strong's # Overrides</span>
      </div>

      <div className="so-body">
        <p className="so-intro">
          Pin a corrected or new synthetic Strong's # (e.g. <code>H2995a</code>) to
          one exact occurrence — book/chapter/verse/token — without touching every
          other occurrence of the same spelling. Look up the verse, click a token,
          set its #. Takes effect immediately, everywhere: the reader, root/surface
          search, and root-expanded transliteration search.
        </p>

        <form className="so-lookup" onSubmit={loadVerse}>
          <input type="number" placeholder="Book #" value={book} onChange={e => setBook(e.target.value)} />
          <input type="number" placeholder="Chapter" value={chapter} onChange={e => setChapter(e.target.value)} />
          <input type="number" placeholder="Verse" value={verse} onChange={e => setVerse(e.target.value)} />
          <button type="submit" disabled={busy}>{busy ? 'Loading…' : 'Look up'}</button>
        </form>
        {err && <div className="so-err">⚠ {err}</div>}

        {verseData && (
          <div className="so-verse">
            <div className="so-verse-ref">
              {verseData.book_name} {verseData.chapter}:{verseData.verse}
              {verseData.is_heb && <span className="so-badge">HEB edition</span>}
            </div>
            {verseData.tokens.length === 0 && <div className="so-empty">No tokens found for this verse.</div>}
            <div className="so-tokens">
              {verseData.tokens.map(t => (
                <button
                  key={t.token_ordinal}
                  className={`so-token ${editing?.token_ordinal === t.token_ordinal ? 'active' : ''}`}
                  onClick={() => startEdit(t)}
                  title={t.gloss || ''}
                >
                  <span className="so-token-paleo">{t.word_raw}</span>
                  <span className="so-token-sub">
                    {t.strongs || '—'}{t.gloss ? ` · ${t.gloss}` : ''}
                  </span>
                </button>
              ))}
            </div>

            {editing && (
              <div className="so-edit">
                <div className="so-edit-title">
                  Editing token #{editing.token_ordinal}: <span className="so-token-paleo">{editing.word_raw}</span>
                  {' '}(currently {editing.strongs || 'no SN'})
                </div>
                <div className="so-edit-row">
                  <input
                    type="text" placeholder="New Strong's # (e.g. H2995a)"
                    value={formSN} onChange={e => setFormSN(e.target.value)}
                  />
                  <input
                    type="text" placeholder="Note (optional — why)"
                    value={formNote} onChange={e => setFormNote(e.target.value)}
                  />
                  <button className="so-save-btn" onClick={saveOverride}>Save override</button>
                  <button className="so-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
                <p className="so-edit-hint">
                  A brand-new code like <code>H2995a</code> creates a distinct root entry
                  (Root Explorer, search) separate from <code>{editing.strongs || 'the original'}</code> —
                  same spelling, deliberately different sense, only at this one verse.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="so-list">
          <div className="so-list-title">Active overrides {ovBusy && '(refreshing…)'}</div>
          {overrides.length === 0 && <div className="so-empty">None yet.</div>}
          {overrides.map(o => (
            <div className="so-list-row" key={o.key}>
              <span className="so-list-ref">{o.book_name} {o.chapter}:{o.verse} #{o.token_ordinal}</span>
              <span className="so-list-word">{o.word_raw}</span>
              <span className="so-list-sn">{o.strongs}</span>
              <span className="so-list-note">{o.note}</span>
              <button className="so-list-del" onClick={() => removeOverride(o.key)} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
