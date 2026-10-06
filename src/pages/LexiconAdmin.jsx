import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import '../components/TopBar.css'; // .logo-btn/.txt-btn/.icon-btn, reused here
import {
  apiAdminListLexiconFiles, apiAdminGetLexiconFile, apiAdminSaveLexiconFile,
  apiAdminListLexiconBackups, apiAdminGetLexiconBackup, apiAdminRestoreLexiconBackup,
  apiAdminLexiconSnIndex, apiSourceLexiconCurated,
} from '../lib/api.js';
import LexiconTable, { parseLexicon, detectScript } from './LexiconTable.jsx';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './Lexicon.css';       // the public lexicon page's layout: rail, tabs, rows, anchors
import './LexiconAdmin.css';

// /admin/lexicon — laid out like the public lexicon page.
//
//   language tabs   Hebrew · Greek · Ge'ez · Latin · Syriac
//   Hebrew's tabs   Lexicon (lexicon.json) · Homographs (homographs.json)
//   every other language has one tab, Lexicon
//   everything else in server/lexicon/ (rules, notes, overrides, the big
//   corpus lexicons…) sits in the "Other files" dropdown.
//
// A JSON object file opens as a table (LexiconTable.jsx: letter rail, one row
// per entry, pencil to edit key/value); "Raw text" — and any file that is not
// a JSON object, like the .md notes — opens the plain editor.
//
// The server side is unchanged: a blunt, format-agnostic mirror of each file
// (GET exact text, POST new text, backups). SAFETY (fieldy: wiping the text and
// hitting Save must never destroy the saved data): the server snapshots a
// file's CURRENT content before every save, including a save that empties it;
// the Backups panel previews/restores any snapshot, and restoring backs up
// whatever was live first — so every step is reversible. Saved content is live
// in the running app within ~300ms (server.js hot-reload).

const NEW_FILE_TEMPLATE = '{\n  \n}\n';
const LAST_FILE_KEY = 'lexAdmin_lastFile';
const VIEW_KEY = 'lexAdmin_view2';  // 'table' (default) | 'raw'  — new key: the old one held 'chips'/'raw' from the previous design
const ZOOM_KEY = 'lexAdmin_zoom';
const ZOOMS = [0.8, 1, 1.25, 1.5, 1.8, 2.2, 2.7, 3.2];

// Language tabs. `src` is the corpus whose transliterations the public page
// shows for that language (Greek/Ge'ez words are transliterated from the
// corpus DB, not stored in the JSON).
const LANGS = [
  { key: 'hebrew', label: 'Hebrew', script: 'paleo', tabs: [
    { key: 'lexicon',    label: 'Lexicon',    file: 'lexicon.json',    sortOnSave: true },
    { key: 'homographs', label: 'Homographs', file: 'homographs.json', sortOnSave: true },
  ] },
  { key: 'greek',  label: 'Greek',  script: 'greek',  src: 'GNT', tabs: [{ key: 'lexicon', label: 'Lexicon', file: 'greek-lexicon.json' }] },
  { key: 'geez',   label: "Ge'ez",  script: 'geez',   src: 'GEZ', tabs: [{ key: 'lexicon', label: 'Lexicon', file: 'geez-lexicon.json' }] },
  { key: 'latin',  label: 'Latin',  script: 'latin',  tabs: [{ key: 'lexicon', label: 'Lexicon', file: 'latin-lexicon.json' }] },
  { key: 'syriac', label: 'Syriac', script: 'syriac', tabs: [{ key: 'lexicon', label: 'Lexicon', file: 'syriac-lexicon.json' }] },
];
const TAB_FILES = new Map(LANGS.flatMap(l => l.tabs.map(t => [t.file, { ...t, lang: l }])));

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

export default function LexiconAdmin() {
  usePageTitle(pageTitle('Lexicon Admin'));
  const toast = useToast();
  const [isAdmin, setIsAdmin] = useState(null); // null = checking

  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [meta, setMeta] = useState(null); // { size, mtime } | null
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [preview, setPreview] = useState(null); // { file, content } | null

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [view, setView] = useState(() => { try { return localStorage.getItem(VIEW_KEY) === 'raw' ? 'raw' : 'table'; } catch { return 'table'; } });
  // text size for the whole table (one base size drives letters, value, rail) — big for presenting, fine on a phone
  const [zoomIdx, setZoomIdx] = useState(() => { try { const i = ZOOMS.indexOf(parseFloat(localStorage.getItem(ZOOM_KEY))); return i >= 0 ? i : 1; } catch { return 1; } });
  useEffect(() => { try { localStorage.setItem(ZOOM_KEY, String(ZOOMS[zoomIdx])); } catch { /* private mode */ } }, [zoomIdx]);
  const [snIndex, setSnIndex] = useState(null);
  const [tlMaps, setTlMaps] = useState({});   // { GNT: {word_norm: translit}, GEZ: {...} }
  const lastTabRef = useRef({});              // language -> last file opened under it

  // Set by confirmNewFile() so the [selected]-driven auto-load effect below
  // doesn't immediately GET a file that doesn't exist on disk yet.
  const skipNextLoadRef = useRef(false);

  const dirty = content !== original;

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)); }, []);

  const loadFiles = useCallback((preferName) => {
    setFilesLoading(true);
    apiAdminListLexiconFiles()
      .then(d => {
        const list = d.files || [];
        setFiles(list);
        if (list.length && !preferName) {
          let remembered = null;
          try { remembered = localStorage.getItem(LAST_FILE_KEY); } catch { /* private mode */ }
          const match = list.find(f => f.name === remembered) || list.find(f => f.name === 'lexicon.json');
          setSelected(match ? match.name : list[0].name);
        }
      })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setFilesLoading(false));
  }, [toast]);

  useEffect(() => { if (isAdmin) loadFiles(); }, [isAdmin, loadFiles]);
  useEffect(() => {
    if (!isAdmin) return;
    apiAdminLexiconSnIndex().then(d => setSnIndex(d.index || {})).catch(() => setSnIndex({}));
  }, [isAdmin]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ } }, [view]);

  const active = TAB_FILES.get(selected) || null;          // { key,label,file,sortOnSave,lang } | null (an "other" file)

  // Transliterations for Greek / Ge'ez come from the corpus (as on the public page).
  const activeSrc = active?.lang.src || null;
  useEffect(() => {
    if (!isAdmin || !activeSrc || tlMaps[activeSrc]) return;
    apiSourceLexiconCurated(activeSrc)
      .then(d => {
        const m = {};
        for (const e of d.entries || []) if (e.tl) m[e.word_norm] = e.tl;
        setTlMaps(prev => ({ ...prev, [activeSrc]: m }));
      })
      .catch(() => setTlMaps(prev => ({ ...prev, [activeSrc]: {} })));
  }, [isAdmin, activeSrc, tlMaps]);

  const loadFile = useCallback((name) => {
    if (!name) return;
    setLoading(true);
    apiAdminGetLexiconFile(name)
      .then(d => {
        setContent(d.content); setOriginal(d.content);
        setMeta({ size: d.size, mtime: d.mtime });
        setPreview(null);
      })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    if (!selected) return;
    try { localStorage.setItem(LAST_FILE_KEY, selected); } catch { /* private mode */ }
    const t = TAB_FILES.get(selected);
    if (t) lastTabRef.current[t.lang.key] = selected;
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }
    loadFile(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const loadBackups = useCallback((name) => {
    if (!name) return;
    setBackupsLoading(true);
    apiAdminListLexiconBackups(name)
      .then(d => setBackups(d.backups || []))
      .catch(e => toast(e.message, 'err'))
      .finally(() => setBackupsLoading(false));
  }, [toast]);

  useEffect(() => { if (backupsOpen && selected) loadBackups(selected); }, [backupsOpen, selected, loadBackups]);

  // Warn on tab close / refresh with unsaved changes — the one moment this
  // page can't offer its own safety net (the server never sees the edit at
  // all until Save is hit).
  useEffect(() => {
    const onBeforeUnload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const pickFile = (name) => {
    if (!name || name === selected) return;
    if (dirty && !confirm(`Discard unsaved changes to ${selected}?`)) return;
    setNewFileOpen(false);
    setSelected(name);
  };
  const pickLang = (lang) => pickFile(lastTabRef.current[lang.key] || lang.tabs[0].file);

  const startNewFile = () => {
    if (dirty && !confirm(`Discard unsaved changes to ${selected}?`)) return;
    setNewFileOpen(true);
    setNewFileName('');
  };
  const confirmNewFile = () => {
    const name = newFileName.trim();
    if (!name) { toast('Enter a file name', 'err'); return; }
    if (files.some(f => f.name === name)) {
      toast('A file with that name already exists — pick it from the list instead', 'err');
      return;
    }
    skipNextLoadRef.current = true;
    setSelected(name);
    setContent(name.endsWith('.json') ? NEW_FILE_TEMPLATE : '');
    setOriginal('');   // nothing on disk yet — anything here is unsaved until Save
    setMeta(null);
    setBackups([]);
    setNewFileOpen(false);
  };

  // Advisory only — for .json files, flag invalid JSON so a stray bracket
  // doesn't silently ship, but never blocks Save (mid-edit text is
  // legitimately "invalid" for a moment, e.g. mid-paste).
  const jsonError = useMemo(() => {
    if (!selected || !selected.endsWith('.json')) return null;
    if (!content.trim()) return null; // empty is a deliberate, allowed state
    try { JSON.parse(content); return null; }
    catch (e) { return e.message; }
  }, [selected, content]);

  const parsed = useMemo(
    () => (selected && selected.endsWith('.json') ? parseLexicon(content) : null),
    [selected, content]);
  const tableAvailable = parsed !== null;
  const showTable = tableAvailable && view === 'table';
  const tableScript = active ? active.lang.script : (parsed ? detectScript(parsed.entries) : 'generic');

  const save = useCallback(async () => {
    if (!selected || saving) return;
    if (!content.trim() && original.trim()) {
      const ok = confirm(
        `${selected} currently has content and you're about to save it EMPTY.\n\n` +
        `The current version is always backed up automatically first, so nothing ` +
        `is permanently lost — but confirm you really want to do this.`
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      const r = await apiAdminSaveLexiconFile(selected, content);
      setOriginal(content);
      setMeta({ size: r.size, mtime: Date.now() });
      loadFiles(selected);
      if (backupsOpen) loadBackups(selected);
      toast(r.backup ? `Saved — previous version backed up` : 'Saved', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  }, [selected, content, original, saving, backupsOpen, loadFiles, loadBackups, toast]);

  const revert = () => {
    if (!confirm('Discard unsaved changes and reload from disk?')) return;
    loadFile(selected);
  };

  const openPreview = async (b) => {
    try {
      const d = await apiAdminGetLexiconBackup(selected, b.file);
      setPreview({ file: b.file, content: d.content });
    } catch (e) { toast(e.message, 'err'); }
  };

  const restoreBackup = async (b) => {
    const ok = confirm(
      `Restore ${selected} to the version from ${fmtTime(b.mtime)}?\n\n` +
      `The current on-disk version is backed up first, so this is reversible too.`
    );
    if (!ok) return;
    try {
      const d = await apiAdminRestoreLexiconBackup(selected, b.file);
      setContent(d.content); setOriginal(d.content);
      setMeta({ size: Buffer_byteLength(d.content), mtime: Date.now() });
      setPreview(null);
      loadFiles(selected);
      loadBackups(selected);
      toast('Restored', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  // Ctrl/Cmd+S saves instead of triggering the browser's own Save dialog.
  useEffect(() => {
    const onKeyDown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  // "Other files": everything that is not one of the language tabs. A file
  // just created (not on disk yet) is listed too.
  const otherFiles = useMemo(() => {
    const list = files.filter(f => !TAB_FILES.has(f.name));
    if (selected && !TAB_FILES.has(selected) && !files.some(f => f.name === selected)) {
      return [{ name: selected, size: null, _pending: true }, ...list];
    }
    return list;
  }, [files, selected]);

  if (isAdmin === null) return <div className="page-stub"><p>Checking admin status…</p></div>;
  if (!isAdmin) {
    return (
      <div className="page-stub">
        <h2>Lexicon Admin</h2>
        <p>Admin only. <Link to="/admin-login" className="txt-btn">Log in</Link></p>
      </div>
    );
  }

  const tabs = active ? active.lang.tabs : [];

  return (
    <div className="lex-page lax-page" style={{ '--lax-zoom': ZOOMS[zoomIdx] }}>
      <header className="lex-topbar">
        <div className="lex-topbar-left">
          <Link to="/landing" className="logo-btn" aria-label="Home">𐤀𐤁</Link>
          <div className="nav-divider" />
          <span className="lex-page-title">Lexicon Admin</span>
        </div>
        <div className="lex-topbar-right">
          {meta && <span className="la-meta">{fmtBytes(meta.size)} · saved {fmtTime(meta.mtime)}</span>}
          {dirty && <span className="la-dirty-badge">unsaved changes</span>}
          <button className="txt-btn" onClick={revert} disabled={!dirty || loading}>Revert</button>
          <button className="la-save-btn lax-save" onClick={save} disabled={!dirty || saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {/* ── LANGUAGE TABS ─────────────────────────────────────────────────── */}
      <nav className="lex-langbar" aria-label="Language">
        {LANGS.map(l => (
          <button key={l.key} className={`lex-langtab${active && active.lang.key === l.key ? ' active' : ''}`}
                  onClick={() => pickLang(l)}>{l.label}</button>
        ))}
      </nav>

      {/* ── TABS UNDER THE LANGUAGE (an "other file" has none) ────────────── */}
      <nav className="lex-tabbar" aria-label="Tabs">
        {tabs.map(t => (
          <button key={t.key} className={`lex-tab${selected === t.file ? ' active' : ''}`}
                  onClick={() => pickFile(t.file)}>{t.label}</button>
        ))}
        {!active && <span className="lax-otherfile-label">{selected || '…'}</span>}
        <span className="la-spacer" />
        <div className="lax-tools">
          <select className="lax-select" value={active ? '' : selected}
                  onChange={e => pickFile(e.target.value)} disabled={filesLoading}
                  title="Rules, notes, overrides and the large corpus lexicons">
            <option value="">Other files…</option>
            {otherFiles.map(f => (
              <option key={f.name} value={f.name}>
                {f.name}{f._pending ? ' (new, unsaved)' : ` — ${fmtBytes(f.size)}`}
              </option>
            ))}
          </select>
          <button className="txt-btn" onClick={startNewFile}>+ New file</button>
          <button className="txt-btn" onClick={() => setBackupsOpen(o => !o)}>{backupsOpen ? 'Hide backups' : 'Backups'}</button>
          {showTable && (
            <span className="lax-zoom" title="Text size">
              <button className="txt-btn" onClick={() => setZoomIdx(i => Math.max(0, i - 1))} disabled={zoomIdx === 0} aria-label="Smaller text">A−</button>
              <button className="txt-btn" onClick={() => setZoomIdx(i => Math.min(ZOOMS.length - 1, i + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Bigger text">A+</button>
            </span>
          )}
          {tableAvailable && (
            <button className="txt-btn" onClick={() => setView(v => (v === 'table' ? 'raw' : 'table'))}>
              {view === 'table' ? 'Raw text' : 'Table'}
            </button>
          )}
          <span className="la-charcount">{content.length.toLocaleString()} chars</span>
        </div>
      </nav>

      {newFileOpen && (
        <div className="la-newfile-row">
          <input
            type="text" autoFocus placeholder="e.g. aramaic-lexicon.json"
            value={newFileName} onChange={e => setNewFileName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmNewFile(); if (e.key === 'Escape') setNewFileOpen(false); }}
          />
          <button className="txt-btn" onClick={confirmNewFile}>Create</button>
          <button className="txt-btn" onClick={() => setNewFileOpen(false)}>Cancel</button>
          <span className="la-hint">Nothing is written to disk until you hit Save.</span>
        </div>
      )}

      {jsonError && (
        <div className="la-json-warn">⚠ Not valid JSON: {jsonError} — you can still save, just double check first.</div>
      )}

      <div className="lex-panel lax-body">
        {showTable ? (
          <LexiconTable
            content={content} onChange={setContent} snIndex={snIndex} disabled={loading}
            translits={activeSrc ? tlMaps[activeSrc] : null}
            script={tableScript} sortOnSave={!!active?.sortOnSave}
          />
        ) : (
          <textarea
            className="la-editor"
            value={content}
            onChange={e => setContent(e.target.value)}
            spellCheck={false}
            disabled={loading}
            placeholder={loading ? 'Loading…' : ''}
          />
        )}

        {backupsOpen && (
          <aside className="la-backups">
            <div className="la-backups-title">
              Backups of {selected} {backupsLoading && '(loading…)'}
            </div>
            <p className="la-hint">
              Every save snapshots the previous version here first — including a save
              that empties the file. Nothing is ever lost, only superseded.
            </p>
            {backups.length === 0 && !backupsLoading && (
              <div className="la-empty">No backups yet — none needed until your first save.</div>
            )}
            <div className="la-backup-list">
              {backups.map(b => (
                <div className="la-backup-row" key={b.file}>
                  <span className="la-backup-time">{fmtTime(b.mtime)}</span>
                  <span className="la-backup-size">{fmtBytes(b.size)}</span>
                  <button className="txt-btn" onClick={() => openPreview(b)}>Preview</button>
                  <button className="txt-btn" onClick={() => restoreBackup(b)}>Restore</button>
                </div>
              ))}
            </div>
            {preview && (
              <div className="la-preview">
                <div className="la-backups-title">{preview.file}</div>
                <textarea className="la-editor la-editor-readonly" value={preview.content} readOnly spellCheck={false} />
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// Tiny helper — avoids importing Buffer client-side; UTF-8 byte length is
// what the server reports back too (Buffer.byteLength on its end).
function Buffer_byteLength(str) {
  return new TextEncoder().encode(str).length;
}
