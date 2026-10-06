import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, useDeferredValue, memo } from 'react';
import { translit, LETTER_NAMES } from '../lib/books.js';
import { paleoWordFlex, paleoCharNoMargin } from '../lib/paleoGlyphs.js';
import { SCRIPTS } from '../lib/keyboards.js';
import { letterSet, firstLetter, stripMarks } from '../lib/lexScripts.js';

// LexiconTable — the table view of one lexicon JSON file (an object of
// key -> value) for /admin/lexicon. Laid out like the public /lexicon-page:
// a letter rail that snaps to each letter, sticky letter headers, one row per
// entry —
//
//     raw letters (the key)  |  my lexicon value  |  transliteration  |  ✎
//
// * KEYS ARE ALWAYS SHOWN LEFT-TO-RIGHT, exactly as they sit in the file.
//   Paleo letters are strong right-to-left characters, so a key like
//   "𐤀𐤃𐤌_H121" in a dir="auto" box flips to "H121_𐤀𐤃𐤌". Every key box,
//   search box and edit field here is dir="ltr", so what you see — and type —
//   is the file's own text, in the file's own order.
// * The pencil opens the entry in place (key + value). Apply hands the
//   re-serialized text back through onChange, so the page's own dirty / Save /
//   backup flow is untouched. Hebrew files (sortOnSave) are written back in
//   Hebrew order; every other file keeps the order it already has.
// * Search matches keys, values, transliterations and — for Strong's keys —
//   the paleo spellings of the root. Square Hebrew typed from a normal
//   keyboard is read as paleo. The on-screen keyboard types into whichever
//   field was focused last.
// * Big files (Syriac is ~67k entries) render in windows that grow as you
//   scroll; jumping to a letter widens the window first.

const PALEO_RUN = /[\u{10900}-\u{1091F}]+/u;
const SQUARE = 'אבגדהוזחטיכלמנסעפצקרשת';
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const PAGE = 400;

export function toPaleo(s) {
  let out = '';
  for (const ch of String(s || '')) {
    const c = FINALS[ch] || ch;
    const i = SQUARE.indexOf(c);
    out += i >= 0 ? String.fromCodePoint(0x10900 + i) : ch;
  }
  return out;
}
const onlyPaleo = s => [...String(s || '')].filter(ch => PALEO_RUN.test(ch)).join('');

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

export function serializeLexicon(entries, indent) {
  const obj = {};
  for (const [k, v] of entries) obj[k] = v;
  return JSON.stringify(obj, null, indent) + '\n';
}

// Guess a file's script from its keys (used for files that are not one of the
// language tabs): mostly paleo keys -> 'paleo', anything else -> 'generic'.
export function detectScript(entries) {
  const sample = entries.slice(0, 200);
  if (!sample.length) return 'generic';
  const n = sample.filter(([k]) => PALEO_RUN.test(toPaleo(k))).length;
  return n / sample.length > 0.5 ? 'paleo' : 'generic';
}

const snOf = key => /^H\d+[a-z]?$/.test(key) ? key : (key.match(/(?:^|_)(H\d+[a-z]?)(?:_|$)/) || [])[1];

// How one key files and displays. `head` is the word in the file's script the
// letters column shows (for a homograph key, its paleo part); `derived` means
// it was looked up from a Strong's number rather than written in the key.
function describeKey(key, script, snIndex) {
  if (key.startsWith('_')) return { group: 0, head: '', derived: false, word: key };
  if (script === 'paleo') {
    const p = (toPaleo(key).match(PALEO_RUN) || [])[0] || '';
    if (p) return { group: 1, head: p, derived: false, word: p };
    const sn = snOf(key);
    const r = sn && snIndex && snIndex[sn] && snIndex[sn][0];
    if (r) return { group: 1, head: r, derived: true, word: r };
    if (/^H\d+/.test(key)) return { group: 2, head: '', derived: false, word: key, num: parseInt(key.slice(1), 10) };
    return { group: 3, head: '', derived: false, word: key };
  }
  if (script === 'generic') return { group: 1, head: '', derived: false, word: key };
  return { group: 1, head: key, derived: false, word: key };
}

function makeComparer(script) {
  const strip = w => stripMarks(w).toLowerCase().replace(/ς/g, 'σ');
  return (a, b) => {
    const x = a.d, y = b.d;
    if (x.group !== y.group) return x.group - y.group;
    if (x.group === 2 && x.num !== y.num) return x.num - y.num;
    let c = 0;
    if (script === 'greek' || script === 'latin') c = strip(x.word).localeCompare(strip(y.word));
    else if (x.group >= 2) c = x.word.localeCompare(y.word);
    else c = x.word < y.word ? -1 : x.word > y.word ? 1 : 0;   // code-point order (𐤀…𐤕 for paleo)
    if (c) return c;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  };
}

const valText = v => typeof v === 'string' ? v : JSON.stringify(v);

// Type into (or backspace in) a React-controlled field from outside React:
// set the value through the native setter and fire an input event so the
// field's own onChange runs.
function editField(el, text, back) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
  let next, pos;
  if (back) {
    if (start !== end) { next = el.value.slice(0, start) + el.value.slice(end); pos = start; }
    else {
      const before = [...el.value.slice(0, start)];
      const removed = before.pop() || '';
      next = before.join('') + el.value.slice(end); pos = start - removed.length;
    }
  } else {
    next = el.value.slice(0, start) + text + el.value.slice(end);
    pos = start + text.length;
  }
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* ignore */ } });
}

// ── pieces ────────────────────────────────────────────────────────────────
function Letters({ text, script, dim }) {
  const html = useMemo(() => script === 'paleo' && text ? paleoWordFlex(text, 'var(--glyph-word)') : null, [text, script]);
  if (!text) return <div className="lex-row-paleo lax-letters lax-letters-none">—</div>;
  if (script === 'paleo') {
    return <div className={`lex-row-paleo lax-letters${dim ? ' lax-letters-dim' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <div className={`lex-row-paleo lax-letters lax-text lax-text-${script}`} dir="auto">{text}</div>;
}

const Pencil = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

function LetterBtn({ letter, script, active, disabled, onClick }) {
  const html = useMemo(() => script === 'paleo' ? paleoCharNoMargin(letter, 'var(--glyph-btn)') : null, [letter, script]);
  const common = { className: `lex-letter-btn${script === 'greek' || script === 'geez' ? ` lex-letter-btn-${script}` : ''}${active ? ' active' : ''}`, disabled, onClick };
  if (script === 'paleo' && letter !== '_' && letter !== '#') {
    return <button {...common} title={LETTER_NAMES[letter] || translit(letter)} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <button {...common} title={letter === '_' ? 'Notes' : letter === '#' ? 'Everything else' : letter}>{letter}</button>;
}

function EntryEditor({ initial, isNew, script, onApply, onCancel, onRemove, track, inline }) {
  const [key, setKey] = useState(initial.key);
  const [value, setValue] = useState(initial.value);
  const [error, setError] = useState('');
  const apply = () => {
    const err = onApply(key, value, initial.isJson);
    if (err) setError(err);
  };
  const previewHead = useMemo(() => script === 'paleo' ? (toPaleo(key).match(PALEO_RUN) || [])[0] || '' : '', [key, script]);
  return (
    <div className={`lax-editor${inline ? ' lax-editor-inline' : ''}`}>
      <div className="lax-editor-title">{isNew ? 'New entry' : 'Edit entry'}</div>
      <label className="lax-field">
        <span>Key</span>
        <input dir="ltr" className="lax-ltr" spellCheck={false} autoFocus value={key} onFocus={track}
               onChange={e => { setKey(script === 'paleo' ? toPaleo(e.target.value) : e.target.value); setError(''); }}
               onKeyDown={e => { if (e.key === 'Enter') apply(); }} />
      </label>
      {previewHead && (
        <div className="lax-preview">
          <Letters text={previewHead} script="paleo" />
          <span className="lax-preview-tl">{translit(previewHead)}</span>
        </div>
      )}
      <label className="lax-field">
        <span>Value{initial.isJson ? ' (JSON)' : ''}</span>
        <textarea dir="ltr" className="lax-ltr" spellCheck={false} rows={initial.isJson ? 6 : 2} value={value} onFocus={track}
                  onChange={e => { setValue(e.target.value); setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !initial.isJson) { e.preventDefault(); apply(); } }} />
      </label>
      {error && <div className="lax-error">{error}</div>}
      <div className="lax-editor-actions">
        <button className="la-save-btn" onClick={apply}>{isNew ? 'Add' : 'Apply'}</button>
        <button className="txt-btn" onClick={onCancel}>Cancel</button>
        <span className="la-spacer" />
        {!isNew && <button className="txt-btn lax-danger" onClick={onRemove}>Remove row</button>}
      </div>
      <div className="la-hint">Applied changes are unsaved until you hit Save.</div>
    </div>
  );
}

const Row = memo(function Row({ r, script, flash, onEdit, disabled }) {
  const showKey = r.key !== r.d.head;
  return (
    <div className={`lax-row${flash ? ' lax-flash' : ''}${r.d.group === 0 ? ' lax-note' : ''}`} data-lkey={r.key}>
      <div className="lax-c-letters">
        {r.d.head ? <Letters text={r.d.head} script={script} dim={r.d.derived} /> : null}
        {(showKey || !r.d.head) && <div className="lax-key" dir="ltr" title="the key, exactly as in the file">{r.key}</div>}
      </div>
      <div className={`lax-c-value${r.value === '' ? ' lax-blank' : ''}`} dir="ltr">
        {r.value === '' ? 'blank' : valText(r.value)}
      </div>
      <div className="lax-c-tl">{r.tl}</div>
      <button className="lax-pencil" onClick={() => onEdit(r)} disabled={disabled} title="Edit key / value" aria-label={`Edit ${r.key}`}><Pencil /></button>
    </div>
  );
});

// ── main ──────────────────────────────────────────────────────────────────
export default function LexiconTable({ content, onChange, snIndex, translits, script = 'generic', sortOnSave = false, disabled }) {
  const parsed = useMemo(() => parseLexicon(content), [content]);
  const [query, setQuery] = useState('');
  const dq = useDeferredValue(query);
  const [start, setStart] = useState(0);            // the window into `grouped` that is rendered: [start, start+limit)
  const [limit, setLimit] = useState(PAGE);
  const [editKey, setEditKey] = useState(null);       // origKey of the row being edited, or '' for a new entry
  const [kbdOpen, setKbdOpen] = useState(false);
  const [kbdScript, setKbdScript] = useState(script === 'generic' ? 'paleo' : script);
  const [activeLetter, setActiveLetter] = useState(null);
  const [flashKey, setFlashKey] = useState(null);
  const [focusKey, setFocusKey] = useState(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const lastFieldRef = useRef(null);
  const pendingJump = useRef(null);
  const keepScroll = useRef(null);                 // scrollHeight before entries were added above the window
  const hasRail = script !== 'generic';

  useEffect(() => { setKbdScript(script === 'generic' ? 'paleo' : script); }, [script]);

  const rows = useMemo(() => {
    if (!parsed) return [];
    const list = parsed.entries.map(([key, value], i) => {
      const d = describeKey(key, script, snIndex);
      const tl = script === 'paleo' ? (d.head ? translit(d.head) : '') : ((translits && translits[key]) || '');
      const letter = d.group === 0 ? '_' : d.group >= 2 ? '#' : (hasRail ? firstLetter(script, d.head) : null);
      return { key, value, d, tl, letter, i };
    });
    if (hasRail) list.sort(makeComparer(script));
    return list;
  }, [parsed, script, snIndex, translits, hasRail]);

  const blankCount = useMemo(() => rows.reduce((n, r) => n + (r.value === '' ? 1 : 0), 0), [rows]);

  const matches = useMemo(() => {
    const raw = dq.trim();
    if (!raw) return rows;
    const ql = raw.toLowerCase();
    const qp = onlyPaleo(toPaleo(raw));
    return rows.filter(r => {
      if (r.key.toLowerCase().includes(ql) || valText(r.value).toLowerCase().includes(ql) || r.tl.toLowerCase().includes(ql)) return true;
      if (!qp) return false;
      const forms = [onlyPaleo(toPaleo(r.key)), r.d.head];
      const sn = snOf(r.key);
      if (sn && snIndex && snIndex[sn]) forms.push(...snIndex[sn]);
      // a form containing what was typed, or — once 2+ letters are in — a
      // form that what was typed begins with (𐤋𐤉𐤋𐤄 still offers root 𐤋𐤉𐤋)
      return forms.some(f => f && (f.includes(qp) || (f.length >= 2 && qp.startsWith(f))));
    });
  }, [rows, dq, snIndex]);

  // Rows with a letter header wherever the letter changes. A row with no
  // letter of its own files under the previous one; each letter heads once.
  const { grouped, anchorAt } = useMemo(() => {
    const out = [], at = {}, seen = new Set();
    let last = null;
    for (const r of matches) {
      if (hasRail) {
        const L = r.letter || last || '#';
        if (L !== last && !seen.has(L)) { at[L] = out.length; out.push({ kind: 'anchor', letter: L }); seen.add(L); }
        last = L;
      }
      out.push({ kind: 'row', r });
    }
    return { grouped: out, anchorAt: at };
  }, [matches, hasRail]);

  const rail = useMemo(() => {
    if (!hasRail) return [];
    const base = [...letterSet(script)];
    if (anchorAt['_'] != null) base.unshift('_');
    if (anchorAt['#'] != null) { if (anchorAt['#'] === 0) base.unshift('#'); else base.push('#'); }   // '#' sits where its header sits
    return base;
  }, [script, hasRail, anchorAt]);

  useEffect(() => { setStart(0); setLimit(PAGE); }, [dq, script]);

  // Window starts line up with a letter header, so the first rows shown always
  // sit under their letter. anchorBefore(i) = the last header at or before i.
  const anchorPos = useMemo(() => Object.values(anchorAt).sort((a, b) => a - b), [anchorAt]);
  const anchorBefore = useCallback(i => {
    let best = 0;
    for (const p of anchorPos) { if (p <= i) best = p; else break; }
    return anchorPos.length ? best : Math.max(0, i);
  }, [anchorPos]);
  useEffect(() => { setEditKey(null); setActiveLetter(null); setQuery(''); }, [script]);

  // ── letter snapping — same technique as the public page: anchors are
  // position:sticky, so measure each one's REAL offsetTop with stickiness
  // switched off for a moment, otherwise jumping back up reads the stuck
  // position and goes nowhere.
  const jumpNow = useCallback(letter => {
    const list = listRef.current;
    if (!list) return;
    const anchors = list.querySelectorAll('.lex-anchor');
    anchors.forEach(a => a.classList.add('lex-unstick'));
    void list.offsetHeight;
    let target = null;
    for (const a of anchors) if (a.dataset.letter === letter) { target = a.offsetTop; break; }
    anchors.forEach(a => a.classList.remove('lex-unstick'));
    if (target != null) list.scrollTo({ top: target, behavior: 'auto' });
  }, []);

  const jumpToLetter = useCallback(letter => {
    setActiveLetter(letter);
    const idx = anchorAt[letter];
    if (idx == null) return;
    if (idx >= start && idx < start + limit) jumpNow(letter);
    else { pendingJump.current = letter; setStart(idx); setLimit(PAGE); }   // far away: re-window from that letter
  }, [anchorAt, start, limit, jumpNow]);

  useEffect(() => {
    if (pendingJump.current) { const l = pendingJump.current; pendingJump.current = null; jumpNow(l); }
  }, [start, limit, jumpNow]);

  // active-letter highlight + grow the window as the list nears its end
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (list.scrollTop + list.clientHeight > list.scrollHeight - 900) setLimit(l => (start + l < grouped.length ? l + PAGE : l));
        if (!hasRail) return;
        const top = list.getBoundingClientRect().top;
        let cur = null;
        for (const a of list.querySelectorAll('.lex-anchor')) {
          if (a.getBoundingClientRect().top <= top + 4) cur = a.dataset.letter; else break;
        }
        if (cur) setActiveLetter(c => (c === cur ? c : cur));
      });
    };
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => { list.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [grouped.length, hasRail, start]);

  // after an Apply / Add: bring the entry (wherever it now sorts) into view
  useEffect(() => {
    if (focusKey == null) return;
    const idx = grouped.findIndex(g => g.kind === 'row' && g.r.key === focusKey);
    if (idx < 0) { setFocusKey(null); return; }
    if (idx < start || idx >= start + limit) { setStart(anchorBefore(Math.max(0, idx - 40))); setLimit(PAGE); return; }
    const el = listRef.current?.querySelector(`[data-lkey="${CSS.escape(focusKey)}"]`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      setFlashKey(focusKey);
      setTimeout(() => setFlashKey(k => (k === focusKey ? null : k)), 2200);
    }
    setFocusKey(null);
  }, [focusKey, grouped, start, limit, anchorBefore]);

  // Ctrl/Cmd+F lands in this page's search; Escape closes the editor.
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select();
      }
      if (e.key === 'Escape') setEditKey(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const track = useCallback(e => { lastFieldRef.current = e.target; }, []);

  const commit = useCallback(nextEntries => {
    let entries = nextEntries;
    if (sortOnSave) {
      const cmp = makeComparer(script);
      entries = nextEntries
        .map(([key, value]) => ({ key, value, d: describeKey(key, script, snIndex) }))
        .sort(cmp).map(r => [r.key, r.value]);
    }
    onChange(serializeLexicon(entries, parsed ? parsed.indent : 4));
  }, [onChange, parsed, script, snIndex, sortOnSave]);

  const openEdit = useCallback(r => setEditKey(r.key), []);
  const openNew = () => { setEditKey(''); };

  const onApply = (origKey) => (rawKey, rawValue, isJson) => {
    const key = rawKey.trim();
    if (!key) return 'The key cannot be empty.';
    let value = rawValue;
    if (isJson) { try { value = JSON.parse(rawValue); } catch (e) { return `Not valid JSON: ${e.message}`; } }
    if (key !== origKey && parsed.entries.some(([k]) => k === key)) return `"${key}" already exists — edit that entry, or pick another key.`;
    let entries;
    if (origKey) entries = parsed.entries.map(([k, v]) => (k === origKey ? [key, value] : [k, v]));
    else entries = [...parsed.entries, [key, value]];
    commit(entries);
    setEditKey(null);
    if (!origKey) setQuery('');
    setFocusKey(key);
    return null;
  };
  const onRemove = origKey => () => {
    if (!confirm(`Remove "${origKey}"?`)) return;
    commit(parsed.entries.filter(([k]) => k !== origKey));
    setEditKey(null);
  };

  const initialFor = useCallback(key => {
    const e = parsed.entries.find(([k]) => k === key);
    const v = e ? e[1] : '';
    const isJson = typeof v !== 'string';
    return { key, value: isJson ? JSON.stringify(v, null, 2) : v, isJson };
  }, [parsed]);

  const kb = SCRIPTS.find(s => s.id === kbdScript) || SCRIPTS[0];
  const typeChar = ch => editField(lastFieldRef.current || searchRef.current, ch, false);
  const backspace = () => editField(lastFieldRef.current || searchRef.current, '', true);

  // Entries added above the window push the view down — put it back where it was.
  const showEarlier = () => {
    keepScroll.current = listRef.current ? listRef.current.scrollHeight - listRef.current.scrollTop : null;
    const to = start <= PAGE ? 0 : anchorBefore(start - PAGE);
    setLimit(l => l + (start - to));
    setStart(to);
  };
  useLayoutEffect(() => {
    if (keepScroll.current != null && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight - keepScroll.current;
      keepScroll.current = null;
    }
  }, [start]);

  if (!parsed) return null;
  const shown = grouped.slice(start, start + limit);

  return (
    <>
      {hasRail && (
        <aside className="lex-sidebar" aria-label="Letter index">
          {rail.map(l => (
            <LetterBtn key={l} letter={l} script={script} active={activeLetter === l}
                       disabled={anchorAt[l] == null} onClick={() => jumpToLetter(l)} />
          ))}
          <div className="lex-sidebar-spacer" />
          <button className="lex-back-top" onClick={() => { listRef.current?.scrollTo({ top: 0 }); }} title="Back to top" aria-label="Back to top">↑</button>
        </aside>
      )}

      <div className="lex-rightcol">
        <div className="lex-search lax-search">
          <input ref={searchRef} type="search" dir="ltr" className="lax-ltr" value={query} onFocus={track}
                 onChange={e => setQuery(e.target.value)} autoComplete="off" spellCheck="false"
                 placeholder="Search keys, values, transliteration, Strong's… (Ctrl+F) — type paleo or Hebrew letters" aria-label="Search" />
          <button className={`txt-btn${kbdOpen ? ' lax-on' : ''}`} onClick={() => setKbdOpen(o => !o)} title="On-screen keyboard">⌨ keyboard</button>
          <button className="txt-btn" onClick={openNew} disabled={disabled}>+ Add entry</button>
          <span className="lax-count">
            {dq.trim() ? `${matches.length.toLocaleString()} of ${rows.length.toLocaleString()}` : `${rows.length.toLocaleString()} entries`}
            {!dq.trim() && blankCount > 0 ? ` · ${blankCount.toLocaleString()} blank` : ''}
          </span>
        </div>

        {kbdOpen && (
          <div className="lax-kbd">
            <div className="lax-kbd-tabs">
              {SCRIPTS.map(s => (
                <button key={s.id} className={`txt-btn${s.id === kbdScript ? ' lax-on' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => setKbdScript(s.id)}>{s.label}</button>
              ))}
            </div>
            <div className="lax-kbd-keys" dir={kb.dir}>
              {kb.rows.map((row, i) => (
                <div className="lax-kbd-row" key={i}>
                  {row.map(ch => (
                    <button key={ch} className="lax-kbd-key" onMouseDown={e => e.preventDefault()} onClick={() => typeChar(ch)}>{ch}</button>
                  ))}
                </div>
              ))}
            </div>
            <div className="lax-kbd-row" dir="ltr">
              <button className="lax-kbd-key lax-kbd-key-wide" onMouseDown={e => e.preventDefault()} onClick={() => typeChar(' ')}>space</button>
              <button className="lax-kbd-key lax-kbd-key-wide" onMouseDown={e => e.preventDefault()} onClick={() => typeChar('_')}>_</button>
              <button className="lax-kbd-key lax-kbd-key-wide" onMouseDown={e => e.preventDefault()} onClick={backspace}>⌫</button>
              <button className="lax-kbd-key lax-kbd-key-wide" onMouseDown={e => e.preventDefault()} onClick={() => { setQuery(''); searchRef.current?.focus(); }}>clear search</button>
            </div>
          </div>
        )}

        {editKey === '' && (
          <EntryEditor key="__new" isNew initial={{ key: query.trim() && script === 'paleo' ? toPaleo(query.trim()) : '', value: '', isJson: false }}
                       script={script} onApply={onApply('')} onCancel={() => setEditKey(null)} track={track} />
        )}

        <div className="lax-head" aria-hidden="true">
          <div>Letters</div><div>Lexicon value</div><div>Transliteration</div><div />
        </div>

        <div className="lex-list" ref={listRef}>
          {start > 0 && (
            <button className="txt-btn lax-more lax-earlier" onClick={showEarlier}>
              ↑ Show earlier entries ({start.toLocaleString()} above)
            </button>
          )}
          {shown.map((g, i) => {
            if (g.kind === 'anchor') {
              return (
                <div key={`a-${g.letter}`} className="lex-anchor lax-anchor" data-letter={g.letter}>
                  <AnchorLetter letter={g.letter} script={script} />
                </div>
              );
            }
            const r = g.r;
            if (editKey !== null && editKey !== '' && editKey === r.key) {
              return <EntryEditor key={`e-${r.key}`} inline initial={initialFor(r.key)} script={script}
                                  onApply={onApply(r.key)} onCancel={() => setEditKey(null)} onRemove={onRemove(r.key)} track={track} />;
            }
            return <Row key={`r-${r.key}`} r={r} script={script} flash={flashKey === r.key} onEdit={openEdit} disabled={disabled} />;
          })}
          {!grouped.length && <div className="lex-state-msg">{dq.trim() ? 'No entry matches.' : 'This file has no entries yet.'}</div>}
          {start + limit < grouped.length && (
            <button className="txt-btn lax-more" onClick={() => setLimit(l => l + PAGE)}>
              Show {Math.min(PAGE, grouped.length - start - limit).toLocaleString()} more ({(grouped.length - start - limit).toLocaleString()} left)
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function AnchorLetter({ letter, script }) {
  const html = useMemo(() => script === 'paleo' && letter !== '_' && letter !== '#' ? paleoCharNoMargin(letter, 'var(--glyph-anchor)') : null, [letter, script]);
  if (html) return <span className="lax-anchor-glyph" dangerouslySetInnerHTML={{ __html: html }} />;
  return <span className={`lax-anchor-text lax-text-${script}`}>{letter === '_' ? 'notes' : letter === '#' ? 'other' : letter}</span>;
}
