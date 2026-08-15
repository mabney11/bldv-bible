import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import BookChapterVerseSelects from '../components/BookChapterVerseSelects.jsx';
import '../components/TopBar.css'; // .nav-group/.nav-sel-wrap layout, reused here
import {
  apiBookOrder, apiTokens,
  apiAdminVerseTokens, apiAdminListStrongsOverrides,
  apiAdminSaveStrongsOverride, apiAdminDeleteStrongsOverride,
} from '../lib/api.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './StrongsOverrides.css';

// /admin/strongs-overrides — browse to a verse by NAME (book/chapter/verse
// dropdowns, same component the reader uses — nobody should have to know a
// book id), see its tokens with their CURRENT effective Strong's # (already
// reflecting any override in place), click one, and pin a corrected or
// brand-new synthetic Strong's # (e.g. H2995a) to that ONE exact occurrence.
// This is the location-keyed override system (book_id:chapter:verse:
// token_ordinal) — distinct from the older surface-strongs-overrides.json,
// which is keyed by bare spelling and can only fill a blank SN, never
// override one that's already set. See server.js's applyLocOverride*/
// locOverridesTargeting for how this gets read back in everywhere it
// matters (the reader, root/surface search, the translit search's root
// expansion).
export default function StrongsOverrides() {
  usePageTitle(pageTitle('Strong’s Overrides'));
  const toast = useToast();
  const [isAdmin, setIsAdmin] = useState(null); // null = checking

  const [books, setBooks] = useState([]);
  const [book, setBook]       = useState(null);
  const [chapter, setChapter] = useState(null);
  const [verse, setVerse]     = useState(null);
  const [chapterTokens, setChapterTokens] = useState([]);
  const [verseData, setVerseData] = useState(null);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState(null);

  const [editing, setEditing] = useState(null); // the token object being edited
  const [formMode, setFormMode] = useState('single'); // 'single' | 'compound'
  const [formSN, setFormSN]   = useState('');
  const [formParts, setFormParts] = useState([{ paleo: '', strongs: '', gloss: '' }, { paleo: '', strongs: '', gloss: '' }]);
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

  // Book list — /api/books is BHS (OT) only, which is why the dropdown was
  // missing the whole NT. /api/book-order is the cross-source list (every
  // book, tagged with which source(s) carry it); filter to BHS + HEB, the
  // only two sources this Strong's-#-override system covers (LXX/GNT/GEZ/
  // etc. use the separate normalized-surface concordance system instead,
  // with no Strong's # at all to override).
  useEffect(() => {
    if (!isAdmin) return;
    apiBookOrder().then(list => {
      const covered = (list || [])
        .filter(b => (b.sources || []).some(s => s === 'BHS' || s === 'HEB'))
        .map(b => ({ book_id: b.id, label: b.name, first_chapter: b.first, last_chapter: b.last }));
      setBooks(covered);
      if (covered.length && book == null) {
        setBook(covered[0].book_id);
        setChapter(covered[0].first_chapter);
      }
    }).catch(e => toast(e.message, 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Chapter changes (or book changes) → fetch that chapter's tokens just to
  // learn which verse numbers exist, for the verse dropdown. Same technique
  // HebrewViewer uses for its own book/chapter/verse selects.
  useEffect(() => {
    if (book == null || chapter == null) return;
    let cancelled = false;
    apiTokens(book, chapter).then(tokens => {
      if (cancelled) return;
      setChapterTokens(Array.isArray(tokens) ? tokens : []);
    }).catch(() => { if (!cancelled) setChapterTokens([]); });
    return () => { cancelled = true; };
  }, [book, chapter]);

  const verseNums = useMemo(
    () => [...new Set(chapterTokens.map(t => t.verse))].sort((a, b) => a - b),
    [chapterTokens]
  );

  const onPickBook = id => {
    const meta = books.find(b => b.book_id === id);
    setBook(id);
    setChapter(meta ? meta.first_chapter : 1);
    setVerse(null);
    setVerseData(null);
    setEditing(null);
  };
  const onPickChapter = c => { setChapter(c); setVerse(null); setVerseData(null); setEditing(null); };
  const onPickVerse = v => {
    setVerse(v);
    setEditing(null);
    if (v == null) { setVerseData(null); return; }
    setBusy(true); setErr(null); setVerseData(null);
    apiAdminVerseTokens(book, chapter, v)
      .then(d => setVerseData(d))
      .catch(e => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const reloadVerse = () => { if (verse != null) onPickVerse(verse); };

  const startEdit = tok => {
    setEditing(tok);
    setFormMode('single');
    setFormSN(tok.strongs || '');
    setFormParts([{ paleo: '', strongs: '', gloss: '' }, { paleo: '', strongs: '', gloss: '' }]);
    setFormNote('');
  };

  const updatePart = (i, field, value) => {
    setFormParts(parts => parts.map((p, pi) => pi === i ? { ...p, [field]: value } : p));
  };
  const addPart = () => setFormParts(parts => [...parts, { paleo: '', strongs: '', gloss: '' }]);
  const removePart = i => setFormParts(parts => parts.filter((_, pi) => pi !== i));

  const saveOverride = async () => {
    if (!editing) return;
    const payload = {
      book_id: verseData.book_id,
      chapter: verseData.chapter,
      verse: verseData.verse,
      token_ordinal: editing.token_ordinal,
      word_raw: editing.word_raw,
      note: formNote.trim(),
    };
    if (formMode === 'compound') {
      const cleanParts = formParts.filter(p => p.paleo.trim() && p.strongs.trim());
      if (cleanParts.length < 2) { toast('Enter at least two parts (paleo + Strong\'s #)', 'err'); return; }
      payload.parts = cleanParts.map(p => ({ paleo: p.paleo.trim(), strongs: p.strongs.trim(), gloss: p.gloss.trim() }));
    } else {
      if (!formSN.trim()) { toast('Enter a Strong\'s #', 'err'); return; }
      payload.strongs = formSN.trim();
    }
    try {
      await apiAdminSaveStrongsOverride(payload);
      toast('Saved — indexes rebuilt', 'ok');
      setEditing(null);
      reloadVerse();
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
      reloadVerse();
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
          other occurrence of the same spelling. Pick the verse, click a token,
          set its #. Takes effect immediately, everywhere: the reader, root/surface
          search, and root-expanded transliteration search.
        </p>

        <div className="so-lookup">
          <BookChapterVerseSelects
            books={books}
            book={book}
            chapter={chapter}
            verse={verse}
            verses={verseNums}
            onBook={onPickBook}
            onChapter={onPickChapter}
            onVerse={onPickVerse}
          />
          {busy && <span className="so-loading">Loading…</span>}
        </div>
        {err && <div className="so-err">⚠ {err}</div>}

        {verseData && (
          <div className="so-verse">
            <div className="so-verse-ref">
              {verseData.book_name} {verseData.chapter}:{verseData.verse}
              {verseData.is_heb && <span className="so-badge">HEB edition</span>}
            </div>
            {verseData.blocks.length === 0 && <div className="so-empty">No tokens found for this verse.</div>}
            {/* Grouped by READER WORD — a word you see fused in the reader (e.g.
                "Yabanaal") can be built from more than one raw source token (a
                prefix/preformative morpheme plus the content root, each its own
                token_ordinal). Multi-piece words show their pieces side by side
                inside one card so nothing looks "missing" — click the SPECIFIC
                piece you mean; the override targets that piece's exact token. */}
            <div className="so-blocks">
              {verseData.blocks.map((b, bi) => (
                <div className="so-block" key={bi}>
                  <div className="so-block-surface">{b.surface}</div>
                  <div className="so-block-pieces">
                    {b.sourceTokens.map(t => (
                      <button
                        key={t.token_ordinal}
                        className={`so-token ${editing?.token_ordinal === t.token_ordinal ? 'active' : ''}`}
                        onClick={() => startEdit(t)}
                        title={b.gloss || ''}
                      >
                        <span className="so-token-paleo">{t.word_raw}</span>
                        <span className="so-token-sub">
                          {t.strongs || '—'}{t.pos ? ` · ${t.pos}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                  {b.gloss && <div className="so-block-gloss">{b.gloss}</div>}
                </div>
              ))}
            </div>

            {editing && (
              <div className="so-edit">
                <div className="so-edit-title">
                  Editing token #{editing.token_ordinal}: <span className="so-token-paleo">{editing.word_raw}</span>
                  {' '}(currently {editing.strongs || 'no SN'})
                </div>

                <div className="so-mode-toggle" role="tablist">
                  <button
                    className={`so-mode-btn ${formMode === 'single' ? 'active' : ''}`}
                    onClick={() => setFormMode('single')} role="tab" aria-selected={formMode === 'single'}
                  >One corrected/new #</button>
                  <button
                    className={`so-mode-btn ${formMode === 'compound' ? 'active' : ''}`}
                    onClick={() => setFormMode('compound')} role="tab" aria-selected={formMode === 'compound'}
                  >Split into two known #s</button>
                </div>

                {formMode === 'single' ? (
                  <div className="so-edit-row">
                    <input
                      type="text" placeholder="New Strong's # (e.g. H2995a)"
                      value={formSN} onChange={e => setFormSN(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="so-parts">
                    <p className="so-edit-hint">
                      For a real compound (e.g. <code>{editing.word_raw}</code> = a "son" root + an
                      "El/God" root fused into one word) — split the paleo characters between the
                      parts below, each with its own real Strong's #. The word's tag becomes both
                      numbers joined (e.g. <code>H1121＋H410</code>), the app's existing convention
                      for a two-root compound — every root/surface search already understands it.
                    </p>
                    {formParts.map((p, i) => (
                      <div className="so-part-row" key={i}>
                        <input
                          type="text" placeholder="Paleo slice (e.g. 𐤁𐤍)"
                          value={p.paleo} onChange={e => updatePart(i, 'paleo', e.target.value)}
                          className="so-part-paleo"
                        />
                        <input
                          type="text" placeholder="Strong's # (e.g. H1121)"
                          value={p.strongs} onChange={e => updatePart(i, 'strongs', e.target.value)}
                        />
                        <input
                          type="text" placeholder="Gloss (optional)"
                          value={p.gloss} onChange={e => updatePart(i, 'gloss', e.target.value)}
                        />
                        {formParts.length > 2 && (
                          <button className="so-part-del" onClick={() => removePart(i)} aria-label="Remove part">✕</button>
                        )}
                      </div>
                    ))}
                    <button className="so-cancel-btn" onClick={addPart}>+ Add part</button>
                  </div>
                )}

                <div className="so-edit-row">
                  <input
                    type="text" placeholder="Note (optional — why)"
                    value={formNote} onChange={e => setFormNote(e.target.value)}
                  />
                  <button className="so-save-btn" onClick={saveOverride}>Save override</button>
                  <button className="so-cancel-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
                {formMode === 'single' && (
                  <p className="so-edit-hint">
                    A brand-new code like <code>H2995a</code> creates a distinct root entry
                    (Root Explorer, search) separate from <code>{editing.strongs || 'the original'}</code> —
                    same spelling, deliberately different sense, only at this one verse.
                  </p>
                )}
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
              <span className="so-list-sn">
                {o.parts
                  ? o.parts.map((p, i) => `${p.paleo} ${p.strongs}`).join(' + ')
                  : o.strongs}
              </span>
              <span className="so-list-note">{o.note}</span>
              <button className="so-list-del" onClick={() => removeOverride(o.key)} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
