import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStatus } from '../lib/localOverlay.js';
import { useToast } from '../components/Toast.jsx';
import '../components/TopBar.css'; // .logo-btn/.txt-btn/.icon-btn, reused here
import {
  apiAdminListLexiconFiles, apiAdminGetLexiconFile, apiAdminSaveLexiconFile,
  apiAdminListLexiconBackups, apiAdminGetLexiconBackup, apiAdminRestoreLexiconBackup,
} from '../lib/api.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './LexiconAdmin.css';

// /admin/lexicon — a blunt, format-agnostic mirror of every file in
// server/lexicon/: pick one from the list, its exact raw text loads into a
// single editable window, hit Save and it's written straight back to that
// file on disk — no structured form standing between you and the text, so
// this works identically for lexicon.json, homographs.json, any of the
// per-language lexicons (greek-/geez-/latin-/syriac-lexicon.json), or the
// .md curation notes. Deliberately NOT what Gloss Studio or
// StrongsOverrides are (Gloss Studio only ever READS lexicon.json; this
// page is the one place that writes the raw files themselves).
//
// Saved content is live in the running app within ~300ms — server.js
// already watches lexicon.json/homographs.json/the two override files for
// hot-reload, and the other per-language lexicons re-read on next request
// keyed off mtime. See server.js's "Lexicon Admin: raw-file mirror editor"
// section for the write + cache-busting side of this.
//
// SAFETY (per fieldy: wiping the text and hitting Save must never destroy
// the saved data): the server snapshots a file's CURRENT content to a
// timestamped backup before every save, including a save that empties it.
// The Backups panel here lets you preview or restore any prior snapshot,
// and restoring itself backs up whatever was live first — so every step is
// reversible, nothing is a one-way door.

const NEW_FILE_TEMPLATE = '{\n  \n}\n';
const LAST_FILE_KEY = 'lexAdmin_lastFile';

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
          const remembered = localStorage.getItem(LAST_FILE_KEY);
          const match = list.find(f => f.name === remembered);
          setSelected(match ? match.name : list[0].name);
        }
      })
      .catch(e => toast(e.message, 'err'))
      .finally(() => setFilesLoading(false));
  }, [toast]);

  useEffect(() => { if (isAdmin) loadFiles(); }, [isAdmin, loadFiles]);

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
    localStorage.setItem(LAST_FILE_KEY, selected);
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
    if (dirty && !confirm(`Discard unsaved changes to ${selected}?`)) return;
    setNewFileOpen(false);
    setSelected(name);
  };

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
      setMeta(m => ({ size: Buffer_byteLength(d.content), mtime: Date.now() }));
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

  const selectOptions = useMemo(() => {
    if (selected && !files.some(f => f.name === selected)) {
      return [{ name: selected, size: null, _pending: true }, ...files];
    }
    return files;
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

  return (
    <div className="la-page">
      <div className="la-topbar">
        <Link to="/landing" className="logo-btn">𐤀𐤁</Link>
        <span className="la-title">Lexicon Admin</span>
        <span className="la-spacer" />
        {meta && (
          <span className="la-meta">{fmtBytes(meta.size)} · saved {fmtTime(meta.mtime)}</span>
        )}
        {dirty && <span className="la-dirty-badge">unsaved changes</span>}
      </div>

      <div className="la-toolbar">
        <select
          className="la-select"
          value={selected}
          onChange={e => pickFile(e.target.value)}
          disabled={filesLoading}
        >
          {selectOptions.map(f => (
            <option key={f.name} value={f.name}>
              {f.name}{f._pending ? ' (new, unsaved)' : ` — ${fmtBytes(f.size)}`}
            </option>
          ))}
        </select>
        <button className="txt-btn" onClick={startNewFile}>+ New file</button>
        <button className="txt-btn" onClick={() => setBackupsOpen(o => !o)}>
          {backupsOpen ? 'Hide backups' : 'Backups'}
        </button>
        <span className="la-spacer" />
        <span className="la-charcount">{content.length.toLocaleString()} chars</span>
        <button className="txt-btn" onClick={revert} disabled={!dirty || loading}>Revert</button>
        <button className="la-save-btn" onClick={save} disabled={!dirty || saving || loading}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

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

      <div className="la-body">
        <textarea
          className="la-editor"
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          disabled={loading}
          placeholder={loading ? 'Loading…' : ''}
        />

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
