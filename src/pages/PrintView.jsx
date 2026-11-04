/**
 * PrintView — /print?book=<slug>[&chapter=N[&verse=V | &verses=1-3,7]]
 *
 * The PDF of a book, a chapter, or a verse, in the novel reader's own style
 * (fieldy, 2026-11-04: "for every verse, chapter, and book to download as
 * PDF -- keeping same style of my main reader").
 *
 * This page IS the reader, laid out for paper: the same English
 * (/api/translate/book → buildEnglishChapter, what the Reader shows), the same
 * book-wide quote scan (parseQuoteMarks / sliceQuoteTree / renderQuoteTree, so
 * a quotation that spans verses is still one block with one bar), the same
 * "root (gloss)" gold, headings, superscriptions and acrostic letters, the same
 * typeface and gloss mode the reader has saved. "Save as PDF" is the browser's
 * print → PDF, so the file holds real text, not a screenshot.
 *
 * Paper: a <table> whose thead/tfoot repeat on every printed page gives each
 * page its top/bottom margin AND a running head ("Genesis · BLD Bible") and
 * foot ("bldbible.com") while @page margin stays 0 — that is what lets the
 * Night and Parchment papers run to the edge of the sheet.
 */
import { chapterName } from '../lib/bookName.js';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { apiBookOrder, apiTransBookText, apiHeadings } from '../lib/api.js';
import { buildBookSlugs, resolveBookParam, bookToParam } from '../lib/bookSlug.js';
import { TYPEFACES } from '../lib/typefaces.js';
import { parseVerseList, readerPrefs } from '../lib/readerExport.js';
import {
  sanitizeText, parseQuoteMarks, sliceQuoteTree, dissolveOverlongQuotes, renderQuoteTree,
  splitScriptureQuote, renderScriptureQuote, ReaderPaleoText, LETTER_MEANING,
} from './Reader.jsx';
import { usePaleoMode } from '../hooks/usePaleoMode.js';
import '@fontsource/alegreya/400.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/ysabeau/400.css';
import '@fontsource/ysabeau/600.css';
import '@fontsource/opendyslexic/400.css';
import '@fontsource/opendyslexic/700.css';
import '../lib/morphColors.css';
import './Reader.css';
import './PrintView.css';

const idOf = m => m.id ?? m.book_id ?? m.canon_id;
const HL = { PART: 1, SECTION: 2, CHAPTER: 3, PERICOPE: 4 };
const hVerse = h => (Number.isFinite(h.verse) && h.verse > 0 ? h.verse : 1);
const headingSort = (a, b) => a.level - b.level || (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id;

const PAPERS = [
  { id: 'parchment', label: 'Parchment' },
  { id: 'night',     label: 'Night' },
  { id: 'white',     label: 'White', note: 'saves ink' },
];
const SIZES = [
  { id: 's', label: 'Small',  pt: 10.5 },
  { id: 'm', label: 'Medium', pt: 12 },
  { id: 'l', label: 'Large',  pt: 14 },
];
const GLOSSES = [
  { id: 'both',   label: 'Both' },
  { id: 'hebrew', label: 'Hebrew only' },
  { id: 'gloss',  label: 'English only' },
];
const PREF_KEY = 'print-prefs';

// The reader's heading rules (Reader.jsx, "Four nesting levels"), for one chapter.
function headingsForChapter(list, chapter) {
  const startAt = level => list.filter(h => h.level === level && h.chapter === chapter && hVerse(h) <= 1).sort(headingSort);
  const activeFor = level => {
    let best = null;
    for (const h of list) {
      if (h.level !== level || h.chapter >= chapter) continue;
      if (!best || h.chapter > best.chapter
          || (h.chapter === best.chapter && hVerse(h) > hVerse(best))
          || (h.chapter === best.chapter && hVerse(h) === hVerse(best) && h.sort_order >= best.sort_order)) best = h;
    }
    return best;
  };
  const startParts = startAt(HL.PART), startSections = startAt(HL.SECTION);
  const mids = new Map(), peris = new Map();
  for (const h of list) {
    if (h.chapter !== chapter) continue;
    const target = h.level === HL.PERICOPE ? peris : (hVerse(h) > 1 ? mids : null);
    if (!target) continue;
    if (!target.has(h.verse)) target.set(h.verse, []);
    target.get(h.verse).push(h);
  }
  for (const arr of mids.values()) arr.sort(headingSort);
  for (const arr of peris.values()) arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
  return {
    startParts, startSections,
    continuedPart: startParts.length ? null : activeFor(HL.PART),
    continuedSection: startSections.length ? null : activeFor(HL.SECTION),
    chapterTitles: startAt(HL.CHAPTER),
    mids, peris,
  };
}

// Reader.jsx's bookQuoteScan, over every chapter of the book (no chapter is
// "active" here — every one is rendered from the same fetch), with ranges for
// every verse keyed "chapter:verse".
function buildQuoteScan(chapters) {
  let acc = '';
  const ranges = {};
  const boundaries = [];
  const starts = new Set(), ends = new Set();
  for (const ch of chapters) {
    for (const v of ch.verses) {
      if (v.verse === 0) continue;
      const raw = sanitizeText((v.text || '').trim());
      const key = `${ch.chapter}:${v.verse}`;
      if (!raw) { ranges[key] = { start: acc.length, end: acc.length, q: null }; continue; }
      const q = splitScriptureQuote(raw);
      const contribute = q ? `${q.before || ''} ${q.after || ''}` : raw;
      const start = acc.length;
      acc += contribute;
      starts.add(start); ends.add(acc.length);
      ranges[key] = { start, end: acc.length, q, beforeLen: q ? (q.before || '').length : 0, raw };
      acc += ' ';
    }
    acc += ' ';
    boundaries.push(acc.length);
  }
  return { tree: dissolveOverlongQuotes(parseQuoteMarks(acc, boundaries, { starts, ends })), ranges };
}

const notMarked = () => false;
function verseNodes(scan, chapter, vnum, glossMode, idToSlug) {
  const r = scan.ranges[`${chapter}:${vnum}`];
  if (!r || !r.raw) return '·';
  if (!r.q) return renderQuoteTree(sliceQuoteTree(scan.tree, r.start, r.end, notMarked), glossMode, `p${chapter}-${vnum}-`);
  const beforeEnd = r.start + r.beforeLen;
  const out = [];
  if (r.q.before) out.push(...renderQuoteTree(sliceQuoteTree(scan.tree, r.start, beforeEnd, notMarked), glossMode, `p${chapter}-${vnum}b-`));
  out.push(renderScriptureQuote(r.q, glossMode, `sq${chapter}-${vnum}`, null, idToSlug));
  if (r.q.after) out.push(...renderQuoteTree(sliceQuoteTree(scan.tree, beforeEnd + 1, r.end, notMarked), glossMode, `p${chapter}-${vnum}a-`));
  return out;
}
const lastClass = (nodes) => {
  const last = Array.isArray(nodes) ? nodes[nodes.length - 1] : nodes;
  return last?.props?.className || '';
};

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; }
}

export default function PrintView() {
  usePaleoMode();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const reader = useMemo(() => readerPrefs(), []);
  const saved = useMemo(() => loadPrefs(), []);

  const [paper, setPaper] = useState(() => PAPERS.some(p => p.id === saved.paper) ? saved.paper : (reader.theme === 'light' ? 'parchment' : 'night'));
  const [size, setSize] = useState(() => SIZES.some(s => s.id === saved.size) ? saved.size : 'm');
  const [glossMode, setGlossMode] = useState(reader.glossMode);
  // the typeface, chosen right here (fieldy, 2026-11-04) — starts from the reader's, then remembered
  const [typeface, setTypeface] = useState(() => {
    const want = saved.font || reader.typeface;
    return TYPEFACES.some(f => f.id === want) ? want : TYPEFACES[0].id;
  });
  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ paper, size, font: typeface })); } catch { /* non-fatal */ }
  }, [paper, size, typeface]);

  const typefaceStack = (TYPEFACES.find(f => f.id === typeface) || TYPEFACES[0]).stack;

  // ── what to print ───────────────────────────────────────────────────────
  const [books, setBooks] = useState(null);
  useEffect(() => { apiBookOrder().then(b => setBooks(b || [])).catch(() => setBooks([])); }, []);
  const { slugToId, idToSlug } = useMemo(
    () => buildBookSlugs((books || []).map(mb => ({ id: idOf(mb), name: mb.name }))),
    [books]
  );
  const bookParam = sp.get('book');
  const book = books ? resolveBookParam(bookParam, slugToId, null) : null;
  const meta = (books || []).find(m => idOf(m) === book) || null;
  const bookName = meta?.name || '';
  const chapterParam = sp.get('chapter');
  const onlyChapter = /^\d+$/.test(chapterParam || '') ? +chapterParam : null;
  const verseSet = useMemo(() => {
    if (onlyChapter == null) return null;
    const v = sp.get('verse');
    if (/^\d+$/.test(v || '')) return new Set([+v]);
    return parseVerseList(sp.get('verses'));
  }, [sp, onlyChapter]);
  const scope = onlyChapter == null ? 'book' : verseSet ? 'verses' : 'chapter';

  const [data, setData] = useState(null);    // { chapters: [{chapter, verses}] }
  const [headingsList, setHeadingsList] = useState([]);
  const [psHeads, setPsHeads] = useState({}); // public/headings.json (superscriptions, acrostics)
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!book) return;
    let live = true;
    setData(null); setFailed(false);
    apiTransBookText(book)
      .then(d => {
        if (!live) return;
        const chapters = (d?.chapters || []).slice().sort((a, b) => a.chapter - b.chapter)
          .map(c => ({ chapter: c.chapter, verses: (c.verses || []).slice().sort((a, b) => a.verse - b.verse) }));
        setData({ chapters });
        if (!chapters.length) setFailed(true);
      })
      .catch(() => { if (live) setFailed(true); });
    apiHeadings(book).then(h => { if (live) setHeadingsList(h || []); }).catch(() => {});
    fetch('/headings.json').then(r => (r.ok ? r.json() : {})).then(j => { if (live) setPsHeads(j || {}); }).catch(() => {});
    return () => { live = false; };
  }, [book]);

  const scan = useMemo(() => (data ? buildQuoteScan(data.chapters) : null), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    if (onlyChapter == null) return data.chapters;
    return data.chapters.filter(c => c.chapter === onlyChapter);
  }, [data, onlyChapter]);

  const chapterBookName = chapterName(bookName);
  const titleRef = !bookName ? 'Print'
    : scope === 'book' ? bookName
    : scope === 'chapter' ? `${chapterBookName} ${onlyChapter}`
    : `${chapterBookName} ${onlyChapter}:${sp.get('verse') || sp.get('verses')}`;

  // The PDF's file name comes from the document title in every browser.
  useEffect(() => {
    const prev = document.title;
    document.title = `${titleRef} — BLD Bible`;
    return () => { document.title = prev; };
  }, [titleRef]);

  // Paper colour reaches the edge of every printed sheet: html/body take it too.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('pp-html');
    root.setAttribute('data-pp-paper', paper);
    return () => { root.classList.remove('pp-html'); root.removeAttribute('data-pp-paper'); };
  }, [paper]);

  const ready = !!(scan && shown.length);
  const sizePt = (SIZES.find(s => s.id === size) || SIZES[1]).pt;
  const runHead = scope === 'book' ? bookName : titleRef;
  const bookSlugHere = book ? bookToParam(book, idToSlug) : bookParam;
  const backHref = scope === 'book' || !onlyChapter
    ? `/bible?book=${bookSlugHere}&chapter=${meta?.first || 1}`
    : scope === 'verses' && verseSet?.size === 1
      ? `/${bookSlugHere}/${onlyChapter}/${[...verseSet][0]}`
      : `/bible?book=${bookSlugHere}&chapter=${onlyChapter}`;

  const renderChapter = (ch, { showHead }) => {
    const hd = headingsForChapter(headingsList, ch.chapter);
    const head = psHeads[`${book}:${ch.chapter}`] || null;
    const verses = ch.verses.filter(v => v.verse !== 0 && (!verseSet || verseSet.has(v.verse)));
    const v0 = ch.verses.find(v => v.verse === 0);
    const v0Text = !verseSet && v0 && sanitizeText((v0.text || '').trim());
    const continued = scope !== 'book';
    return (
      <section className="rd-chapter pp-chapter" key={ch.chapter}>
        {showHead && (
          <>
            {continued && hd.continuedPart && (
              <div className="rd-part-heading rd-heading-continued"><div className="rd-part-title">{hd.continuedPart.title}</div></div>
            )}
            {hd.startParts.map(h => (
              <div className="rd-part-heading rd-heading-start" key={`part-${h.id}`}>
                <div className="rd-part-title">{h.title}</div>
                {h.subtitle && <div className="rd-part-subtitle">{h.subtitle}</div>}
              </div>
            ))}
            {continued && hd.continuedSection && <div className="rd-section-heading rd-heading-continued">{hd.continuedSection.title}</div>}
            {hd.startSections.map(h => <div className="rd-section-heading rd-heading-start" key={`sec-${h.id}`}>{h.title}</div>)}
            <header className="rd-chapter-head pp-chapter-head">
              {(scope !== 'book') && <div className="rd-book-name">{chapterBookName}</div>}
              <div className="rd-chapter-num">{ch.chapter}</div>
              {hd.chapterTitles.map(h => h.title && <div className="rd-chapter-title" key={`ct-${h.id}`}>{h.title}</div>)}
            </header>
            {(head?.super || v0Text) && (
              <div className="rd-super">
                {head?.super && (
                  <>
                    <ReaderPaleoText text={head.super.paleo} className="rd-super-paleo" dir="rtl" block />
                    <div className="rd-super-translit">{head.super.translit}</div>
                  </>
                )}
                {v0Text && <div className="rd-super-en">{renderQuoteTree(parseQuoteMarks(v0Text), glossMode, `s${ch.chapter}-`)}</div>}
              </div>
            )}
          </>
        )}
        <div className="rd-body pp-body">
          {verses.map(v => {
            const nodes = verseNodes(scan, ch.chapter, v.verse, glossMode, idToSlug);
            const cls = lastClass(nodes);
            const endsInBlock = cls.includes('rd-quote-block');
            const endsInCont = cls.includes('rd-quote-cont-end');
            const acro = !verseSet && head?.acrostics?.[v.verse];
            const mids = !verseSet && hd.mids.get(v.verse);
            const peris = !verseSet && hd.peris.get(v.verse);
            return (
              <Fragment key={v.verse}>
                {mids && mids.map((h, i) => (
                  h.level === HL.PART ? (
                    <div className="rd-part-heading rd-heading-start rd-heading-mid" key={`m${i}`}>
                      <div className="rd-part-title">{h.title}</div>
                      {h.subtitle && <div className="rd-part-subtitle">{h.subtitle}</div>}
                    </div>
                  ) : h.level === HL.SECTION
                    ? <div className="rd-section-heading rd-heading-start rd-heading-mid" key={`m${i}`}>{h.title}</div>
                    : <div className="rd-chapter-title rd-heading-mid" key={`m${i}`}>{h.title}</div>
                ))}
                {peris && peris.map((p, i) => (
                  <div className="rd-pericope" key={`p${i}`}>
                    <div className="rd-pericope-title">{p.title}</div>
                    {p.subtitle && <div className="rd-pericope-subtitle">{p.subtitle}</div>}
                  </div>
                ))}
                {acro && (
                  <div className="rd-acrostic">
                    <span className="rd-acrostic-glyph">{acro.letter}</span>
                    <span className="rd-acrostic-name">
                      {acro.label}
                      {LETTER_MEANING[acro.letter[0]] && ` (${LETTER_MEANING[acro.letter[0]]})`}
                      {acro.spelled && <>{' – '}<span className="rd-acrostic-spelled">{acro.spelled}</span></>}
                    </span>
                  </div>
                )}
                <span className={`rd-verse pp-verse ${endsInCont ? 'rd-verse-cont-after' : ''}`}>
                  <sup className="rd-vnum pp-vnum">{v.verse}</sup>
                  <span className="rd-vtext">{nodes}</span>{!endsInBlock && ' '}
                </span>
              </Fragment>
            );
          })}
        </div>
      </section>
    );
  };

  // One verse: the Detailed Verse page's own layout (book name, big 28:9, the verse).
  const renderSingleVerse = () => {
    const ch = shown[0];
    const vnum = [...verseSet][0];
    const v = ch?.verses.find(x => x.verse === vnum);
    if (!v) return <div className="rd-state">{titleRef} has no English text yet.</div>;
    return (
      <div className="pp-single">
        <div className="rd-book-name">{chapterBookName}</div>
        <h1 className="vp-heading pp-single-ref">{ch.chapter}:{vnum}</h1>
        <div className="rd-body pp-body pp-single-body">
          <span className="rd-verse"><span className="rd-vtext">{verseNodes(scan, ch.chapter, vnum, glossMode, idToSlug)}</span></span>
        </div>
      </div>
    );
  };

  const single = scope === 'verses' && verseSet?.size === 1;

  return (
    <div className={`reader-root pp-root`} data-pp-paper={paper} data-typeface={typeface}
         style={{ '--pr-reading': typefaceStack, '--pp-size': `${sizePt}pt` }}>
      <div className="pp-toolbar" role="toolbar" aria-label="PDF options">
        <button className="pp-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(backHref))}>‹ Back</button>
        <div className="pp-tb-title">
          <span className="pp-tb-ref">{titleRef}</span>
          <span className="pp-tb-hint">{scope === 'book' ? 'Whole book' : scope === 'chapter' ? 'Chapter' : single ? 'Verse' : 'Selected verses'} · PDF</span>
        </div>
        <div className="pp-tb-group" aria-label="Paper">
          {PAPERS.map(p => (
            <button key={p.id} className={`pp-chip ${paper === p.id ? 'on' : ''}`} onClick={() => setPaper(p.id)} title={p.note || ''}>{p.label}</button>
          ))}
        </div>
        <div className="pp-tb-group" aria-label="Text size">
          {SIZES.map(s => (
            <button key={s.id} className={`pp-chip ${size === s.id ? 'on' : ''}`} onClick={() => setSize(s.id)}>{s.label}</button>
          ))}
        </div>
        <select className="pp-select" value={typeface} onChange={e => setTypeface(e.target.value)} aria-label="Typeface">
          {TYPEFACES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <div className="pp-tb-group" aria-label="Glosses">
          {GLOSSES.map(g => (
            <button key={g.id} className={`pp-chip ${glossMode === g.id ? 'on' : ''}`} onClick={() => setGlossMode(g.id)}>{g.label}</button>
          ))}
        </div>
        <button className="pp-save" disabled={!ready} onClick={() => window.print()}>Save as PDF</button>
        <p className="pp-tb-note">In the print window, choose <b>Save as PDF</b> as the destination. Turn off “Headers and footers” for a clean page.</p>
      </div>

      <table className="pp-sheet">
        <thead><tr><td><div className="pp-runhead"><span>{runHead}</span><span>BLD Bible</span></div></td></tr></thead>
        <tfoot><tr><td><div className="pp-runfoot">BLDBIBLE.COM</div></td></tr></tfoot>
        <tbody><tr><td>
          <article className="pp-page" data-scope={scope} style={{ fontSize: 'var(--pp-size)' }}>
            {!books || (book && !data && !failed) ? (
              <div className="rd-state">Preparing {titleRef}…</div>
            ) : !book ? (
              <div className="rd-state">That book isn't recognized. <Link to="/bible">Open the reader</Link></div>
            ) : failed || !shown.length ? (
              <div className="rd-state">{titleRef} has no English text yet.</div>
            ) : single ? renderSingleVerse() : (
              <>
                {scope === 'book' && (
                  <div className="pp-title-page">
                    <div className="pp-title-mark">BLD Bible</div>
                    <h1 className="pp-title-book">{bookName}</h1>
                    <div className="pp-title-rule" />
                    <div className="pp-title-site">BLDBIBLE.COM</div>
                  </div>
                )}
                {shown.map(ch => renderChapter(ch, { showHead: true }))}
              </>
            )}
          </article>
        </td></tr></tbody>
      </table>
    </div>
  );
}
