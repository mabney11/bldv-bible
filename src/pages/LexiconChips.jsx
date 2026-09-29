import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PALEO_KBD_ROWS } from '../lib/keyboards.js';

// LexiconChips — the chip view of one lexicon JSON file (an object of
// key -> value) for /admin/lexicon.
//
//  * Every entry is a chip, shown in HEBREW ALPHABETICAL order. Paleo code
//    points (U+10900–U+10915) already run 𐤀→𐤕, so a paleo key sorts by its own
//    letters; a Strong's key ("H3915") sorts by the paleo root it names
//    ("𐤋𐤉𐤋", from /api/admin/lexicon-sn-index); a homograph key sorts by its
//    root part ("𐤔𐤌𐤏_H8085" -> 𐤔𐤌𐤏). "_"-prefixed notes stay on top; keys in
//    other scripts (Greek, Latin, Ge'ez, Syriac, verse refs) follow, in their
//    own order.
//  * Click a chip to change its key, its value, or remove the row.
//  * The search box (Ctrl+F lands here instead of the browser's page find)
//    matches keys, values, and — for Strong's keys — the paleo spellings of
//    the root and the dictionary lemma, so typing 𐤋𐤉𐤋𐤄 (Layalah) offers
//    "H3915": "night". Square Hebrew typed from a normal keyboard is read as
//    paleo. The on-screen paleo keyboard types into whichever field was last
//    focused.
//
// The component owns no data: it parses `content`, and every edit hands the
// re-serialized text back through onChange, so the page's existing dirty /
// Save / backup flow is untouched. Serialization keeps the file's own indent
// and writes the entries in the same Hebrew order they are shown in.

const PALEO_RE = /[\u{10900}-\u{1091F}]/u;
const SQUARE = 'אבגדהוזחטיכלמנסעפצקרשת';
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const PAGE = 300;

export function toPaleo(s) {
  let out = '';
  for (const ch of String(s || '')) {
    const c = FINALS[ch] || ch;
    const i = SQUARE.indexOf(c);
    out += i >= 0 ? String.fromCodePoint(0x10900 + i) : ch;
  }
  return out;
}
const onlyPaleo = s => [...String(s || '')].filter(ch => PALEO_RE.test(ch)).join('');

// Parse a lexicon file into entries, or null when it is not a JSON object.
export function parseLexicon(text) {
  if (!text || !text.trim()) return { entries: [], indent: 4 };
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const m = text.match(/\n([ \t]+)"/);
  const indent = m ? (m[1].includes('\t') ? '\t' : m[1].length) : 4;
  return { entries: Object.entries(obj), indent };
}

function sortInfo(key, snIndex) {
  if (key.startsWith('_')) return { group: 0, word: key };
  const k = toPaleo(key);
  const sn = /^H\d+[a-z]?$/.test(key) ? key : (key.match(/_(H\d+[a-z]?)$/) || [])[1];
  const head = onlyPaleo(k.split('_')[0]);
  if (head) return { group: 1, word: head };
  if (sn && snIndex && snIndex[sn] && snIndex[sn][0]) return { group: 1, word: snIndex[sn][0] };
  if (/^H\d+/.test(key)) return { group: 2, word: key, num: parseInt(key.slice(1), 10) };
  return { group: 3, word: key };
}

function compareEntries(a, b) {
  const x = a.sort, y = b.sort;
  if (x.group !== y.group) return x.group - y.group;
  if (x.group === 2 && x.num !== y.num) return x.num - y.num;
  if (x.group === 3) {
    const c = x.word.localeCompare(y.word);
    if (c) return c;
  } else if (x.word !== y.word) {
    return x.word < y.word ? -1 : 1;   // code-point order = 𐤀…𐤕
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function serializeLexicon(entries, indent) {
  const obj = {};
  for (const [k, v] of entries) obj[k] = v;
  return JSON.stringify(obj, null, indent) + '\n';
}

const shortVal = v => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 88) + '…' : s;
};

export default function LexiconChips({ content, onChange, snIndex, disabled }) {
  const parsed = useMemo(() => parseLexicon(content), [content]);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState(null);   // { origKey|null, key, value, isJson }
  const [kbdOpen, setKbdOpen] = useState(false);
  const searchRef = useRef(null);
  const lastFieldRef = useRef(null);               // where the paleo keyboard types

  const rows = useMemo(() => {
    if (!parsed) return [];
    return parsed.entries
      .map(([key, value]) => ({ key, value, sort: sortInfo(key, snIndex) }))
      .sort(compareEntries);
  }, [parsed, snIndex]);

  const matches = useMemo(() => {
    const raw = query.trim();
    if (!raw) return rows;
    const q = toPaleo(raw);
    const qp = onlyPaleo(q);
    const ql = raw.toLowerCase();
    return rows.filter(r => {
      const val = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
      if (r.key.toLowerCase().includes(ql) || val.toLowerCase().includes(ql)) return true;
      if (!qp) return false;
      const forms = [onlyPaleo(toPaleo(r.key)), r.sort.group === 1 ? r.sort.word : ''];
      const sn = /^H\d+[a-z]?$/.test(r.key) ? r.key : (r.key.match(/_(H\d+[a-z]?)$/) || [])[1];
      if (sn && snIndex && snIndex[sn]) forms.push(...snIndex[sn]);
      // a form containing what was typed, or — once 2+ letters are in — a
      // form that what was typed begins with (𐤋𐤉𐤋𐤄 still offers root 𐤋𐤉𐤋)
      return forms.some(f => f && (f.includes(qp) || (f.length >= 2 && qp.startsWith(f))));
    });
  }, [rows, query, snIndex]);

  useEffect(() => { setLimit(PAGE); }, [query, content]);

  // Ctrl/Cmd+F: this page's search, not the browser's page find.
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === 'Escape' && editing) setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const commit = useCallback((nextEntries) => {
    const sorted = nextEntries
      .map(([key, value]) => ({ key, value, sort: sortInfo(key, snIndex) }))
      .sort(compareEntries)
      .map(r => [r.key, r.value]);
    onChange(serializeLexicon(sorted, parsed ? parsed.indent : 4));
  }, [onChange, parsed, snIndex]);

  const openChip = r => {
    const isJson = typeof r.value !== 'string';
    setEditing({ origKey: r.key, key: r.key, value: isJson ? JSON.stringify(r.value, null, 2) : r.value, isJson, error: '' });
  };
  const openNew = () => setEditing({ origKey: null, key: query.trim() ? toPaleo(query.trim()) : '', value: '', isJson: false, error: '' });

  const applyEdit = () => {
    const ed = editing;
    const key = ed.key.trim();
    if (!key) { setEditing({ ...ed, error: 'The key cannot be empty.' }); return; }
    let value = ed.value;
    if (ed.isJson) {
      try { value = JSON.parse(ed.value); }
      catch (e) { setEditing({ ...ed, error: `Not valid JSON: ${e.message}` }); return; }
    }
    const entries = parsed.entries.filter(([k]) => k !== ed.origKey);
    if (entries.some(([k]) => k === key)) {
      setEditing({ ...ed, error: `"${key}" already exists — edit that chip, or pick another key.` });
      return;
    }
    entries.push([key, value]);
    commit(entries);
    setEditing(null);
  };
  const removeEdit = () => {
    if (!confirm(`Remove "${editing.origKey}"?`)) return;
    commit(parsed.entries.filter(([k]) => k !== editing.origKey));
    setEditing(null);
  };

  // Paleo keyboard: insert at the caret of the last focused field.
  const typeChar = (ch) => {
    const el = lastFieldRef.current || searchRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + ch + el.value.slice(end);
    const which = el.dataset.field;
    if (which === 'key') setEditing(ed => ({ ...ed, key: next }));
    else if (which === 'value') setEditing(ed => ({ ...ed, value: next }));
    else setQuery(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + (ch ? ch.length : 0);
      try { el.setSelectionRange(pos, pos); } catch { /* number inputs etc. */ }
    });
  };
  const backspace = () => {
    const el = lastFieldRef.current || searchRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
    let next, pos;
    if (start !== end) { next = el.value.slice(0, start) + el.value.slice(end); pos = start; }
    else {
      const before = [...el.value.slice(0, start)];
      const removed = before.pop() || '';
      next = before.join('') + el.value.slice(end); pos = start - removed.length;
    }
    const which = el.dataset.field;
    if (which === 'key') setEditing(ed => ({ ...ed, key: next }));
    else if (which === 'value') setEditing(ed => ({ ...ed, value: next }));
    else setQuery(next);
    requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* ignore */ } });
  };
  const track = e => { lastFieldRef.current = e.target; };

  if (!parsed) return null;
  const shown = matches.slice(0, limit);

  return (
    <div className="lc-wrap">
      <div className="lc-searchbar">
        <input
          ref={searchRef}
          data-field="search"
          className="lc-search"
          type="search"
          dir="auto"
          placeholder="Search keys, values, Strong's… (Ctrl+F) — type paleo or Hebrew letters"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={track}
        />
        <button className={`txt-btn${kbdOpen ? ' lc-on' : ''}`} onClick={() => setKbdOpen(o => !o)} title="Paleo keyboard">𐤀𐤁 keyboard</button>
        <button className="txt-btn" onClick={openNew} disabled={disabled}>+ Add entry</button>
        <span className="lc-count">
          {query.trim() ? `${matches.length.toLocaleString()} of ${rows.length.toLocaleString()}` : `${rows.length.toLocaleString()} entries`}
        </span>
      </div>

      {kbdOpen && (
        <div className="lc-kbd" dir="rtl">
          {PALEO_KBD_ROWS.map((row, i) => (
            <div className="lc-kbd-row" key={i}>
              {row.map(ch => (
                <button key={ch} className="lc-key" onMouseDown={e => e.preventDefault()} onClick={() => typeChar(ch)}>{ch}</button>
              ))}
            </div>
          ))}
          <div className="lc-kbd-row" dir="ltr">
            <button className="lc-key lc-key-wide" onMouseDown={e => e.preventDefault()} onClick={() => typeChar(' ')}>space</button>
            <button className="lc-key lc-key-wide" onMouseDown={e => e.preventDefault()} onClick={backspace}>⌫</button>
            <button className="lc-key lc-key-wide" onMouseDown={e => e.preventDefault()} onClick={() => { setQuery(''); searchRef.current?.focus(); }}>clear search</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="lc-editor">
          <div className="lc-editor-title">{editing.origKey === null ? 'New entry' : 'Edit entry'}</div>
          <label className="lc-field">
            <span>Key</span>
            <input data-field="key" dir="auto" value={editing.key} autoFocus
                   onFocus={track}
                   onChange={e => setEditing({ ...editing, key: e.target.value, error: '' })}
                   onKeyDown={e => { if (e.key === 'Enter') applyEdit(); }} />
          </label>
          <label className="lc-field">
            <span>Value{editing.isJson ? ' (JSON)' : ''}</span>
            <textarea data-field="value" dir="auto" rows={editing.isJson ? 6 : 2} value={editing.value}
                      onFocus={track}
                      onChange={e => setEditing({ ...editing, value: e.target.value, error: '' })}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !editing.isJson) { e.preventDefault(); applyEdit(); } }} />
          </label>
          {editing.error && <div className="lc-error">{editing.error}</div>}
          <div className="lc-editor-actions">
            <button className="la-save-btn" onClick={applyEdit}>{editing.origKey === null ? 'Add' : 'Apply'}</button>
            <button className="txt-btn" onClick={() => setEditing(null)}>Cancel</button>
            <span className="la-spacer" />
            {editing.origKey !== null && <button className="txt-btn lc-danger" onClick={removeEdit}>Remove row</button>}
          </div>
          <div className="la-hint">Applied changes are unsaved until you hit Save.</div>
        </div>
      )}

      <div className="lc-chips">
        {shown.map(r => {
          const sn = /^H\d+[a-z]?$/.test(r.key) ? r.key : null;
          const hint = sn && snIndex && snIndex[sn] ? snIndex[sn][0] : '';
          return (
            <button key={r.key}
                    className={`lc-chip${editing && editing.origKey === r.key ? ' lc-chip-active' : ''}${r.sort.group === 0 ? ' lc-chip-note' : ''}`}
                    onClick={() => openChip(r)} disabled={disabled} title={typeof r.value === 'string' ? r.value : JSON.stringify(r.value)}>
              <span className="lc-chip-key" dir="auto">{r.key}</span>
              {hint && <span className="lc-chip-hint">{hint}</span>}
              <span className="lc-chip-val" dir="auto">{shortVal(r.value)}</span>
            </button>
          );
        })}
        {!shown.length && <div className="la-empty">{query.trim() ? 'No entry matches.' : 'This file has no entries yet.'}</div>}
      </div>
      {matches.length > limit && (
        <button className="txt-btn lc-more" onClick={() => setLimit(l => l + PAGE)}>
          Show {Math.min(PAGE, matches.length - limit).toLocaleString()} more ({(matches.length - limit).toLocaleString()} left)
        </button>
      )}
    </div>
  );
}
