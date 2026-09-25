/**
 * ModelKit.jsx — what every animated model page shares (the statue, the
 * temple, whatever comes next): the player, the folding panel bands, the
 * passage-as-panel with its clickable words, and the word rows of a card.
 * Lifted out of pages/Statue.jsx when the temple was built; the page CSS
 * they rely on is ModelPage.css (the `st-` classes).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadChapter, verseText, sliceQuote, parseQuotes } from '../lib/passages.js';
import { parseRefs } from '../lib/models/refs.js';
import './ModelPage.css';

// ── The player ───────────────────────────────────────────────────────────────
// `timeline` = { duration, phaseAt(t), selectableAt?(t) }. Time lives in a tiny
// clock object every renderer reads each frame — never React state, so playing
// costs no re-renders; only the phase caption and "what is selectable" go through
// React, and only when they change. Swapping the timeline (the temple's Build /
// Walk) rewinds to 0.
export function usePlayer(timeline, { pace: paceInit = 'tap', onContinue } = {}) {
  const clock = useRef({ t: 0 }).current;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [pace, setPace] = useState(() => { try { const v = localStorage.getItem('model-pace'); return v === 'off' ? 'off' : paceInit; } catch { return paceInit; } });   // 'tap' | 'off' (the old timed 'auto' reads as tap)
  const [hold, setHold] = useState(null);           // { tap: true } while the story waits for the reader to tap
  const [phase, setPhase] = useState(() => timeline.phaseAt(0));
  const [selectable, setSelectable] = useState(() => (timeline.selectableAt ? timeline.selectableAt(0) : null));
  const [ended, setEnded] = useState(false);
  const scrubRef = useRef(null), timeRef = useRef(null), captionRef = useRef(null);
  const state = useRef({ playing: false, speed: 1, loop: false, pace: paceInit, last: 0, raf: 0, timeline, hold: null, phaseKey: null });
  // What the canvas subtitles ask of the story (CanvasSubtitles writes it): the pane on show and how much slower it must run
  // (factor ≤ 1) for every word of its caption to have its time before the pane ends (fieldy: "there needs to be enough time to
  // show the entire verse … by the end of the pane I should have already seen the last word … slow specific panes down").
  const subs = useRef({ key: null, factor: 1 });
  state.current.playing = playing; state.current.speed = speed; state.current.loop = loop; state.current.timeline = timeline; state.current.pace = pace;

  const show = useCallback((t) => {
    const tl = state.current.timeline;
    clock.t = t;
    if (scrubRef.current) scrubRef.current.value = String(Math.round((t / tl.duration) * 1000));
    if (timeRef.current) timeRef.current.textContent = `${t.toFixed(1)} s`;
    const ph = tl.phaseAt(t); setPhase((cur) => (cur && cur.key === ph.key ? cur : ph));
    if (tl.selectableAt) { const sel = tl.selectableAt(t); setSelectable((cur) => (cur && cur.length === sel.length ? cur : sel)); }
    setEnded(t >= tl.duration - 1e-6);
  }, [clock]);

  // Reading pace: when a new caption comes up while playing, the story waits until
  // the reader taps (tap) before moving on — every word carries a gloss, and a timed
  // wait was always too slow for one reader and too fast for another. Tapping also
  // brings the view back to the story's own spot (onContinue: the page's refocus),
  // so what the caption describes is in front of the reader when it moves.
  const onContinueRef = useRef(onContinue); onContinueRef.current = onContinue;
  const clearHold = useCallback(() => { state.current.hold = null; setHold(null); state.current.last = performance.now(); }, []);
  const continueNow = useCallback(() => { if (state.current.hold) { clearHold(); onContinueRef.current?.(); } }, [clearHold]);

  useEffect(() => {
    let alive = true;
    const tick = (now) => {
      if (!alive) return;
      state.current.raf = requestAnimationFrame(tick);
      const st = state.current, D = st.timeline.duration;
      if (!st.playing) { st.last = now; return; }
      if (st.hold) {
        st.last = now;
        if (st.hold.pending) {                       // give the caption a frame or two to render before asking for the tap
          if (--st.hold.pending > 0) return;
          st.hold = { tap: true }; setHold(st.hold);
        }
        return;
      }
      const curKey = st.timeline.phaseAt(clock.t).key, S = subs.current;
      let step = ((now - st.last) / 1000) * st.speed; st.last = now;
      if (S.key === curKey && S.factor < 1) step *= S.factor;   // a pane whose words need longer than its span runs that much slower, so its last word is seen before it ends
      let t = clock.t + step;
      if (t >= D) { if (st.loop) t -= D; else { t = D; setPlaying(false); } }
      const key = st.timeline.phaseAt(t).key;
      const fresh = key !== st.phaseKey; st.phaseKey = key;
      show(t);
      if (fresh && st.pace !== 'off') { st.hold = { pending: 3 }; setHold(st.hold); }   // a new caption: wait for it to be read
    };
    state.current.raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(state.current.raf); };
  }, [clock, show, clearHold]);

  useEffect(() => { try { localStorage.setItem('model-pace', pace); } catch {} if (pace === 'off') continueNow(); }, [pace, continueNow]);

  // A new timeline: rewind and stop.
  const tlKey = timeline.key || timeline.duration;
  const firstTl = useRef(tlKey);
  useEffect(() => { if (firstTl.current === tlKey) return; firstTl.current = tlKey; setPlaying(false); clearHold(); state.current.phaseKey = null; show(0); }, [tlKey, show, clearHold]);

  const play = () => { if (clock.t >= timeline.duration - 1e-6) { show(0); state.current.phaseKey = null; } state.current.last = performance.now(); setPlaying(true); };
  const pause = () => setPlaying(false);
  const seek = (t) => { setPlaying(false); clearHold(); const tt = Math.max(0, Math.min(timeline.duration, t)); state.current.phaseKey = timeline.phaseAt(tt).key; show(tt); };   // scrubbing to a caption: no wait when play resumes — they have it in front of them
  const restart = () => { clearHold(); state.current.phaseKey = null; show(0); state.current.last = performance.now(); setPlaying(true); };
  return { clock, playing, speed, setSpeed, loop, setLoop, pace, setPace, hold, continueNow, captionRef, phase, selectable, ended, play, pause, seek, restart, scrubRef, timeRef, show, subs };
}
/** Where the pane that holds t ends: the next phase's `from` when the timeline lists its phases, else found by stepping. */
export function phaseEndOf(tl, t) {
  if (tl.phases) { for (const p of tl.phases) if (p.from > t + 1e-6) return p.from; return tl.duration; }
  const key = tl.phaseAt(t).key;
  for (let u = t + 0.25; u < tl.duration; u += 0.25) if (tl.phaseAt(u).key !== key) return u;
  return tl.duration;
}

// ── The caption under the stage, with the reading wait shown ─────────────────
// Renders the phase's caption (through `render`, the page's Glossed) and, while the
// story waits for it to be read, a "tap to go on" chip; a tap anywhere on the
// caption goes on (and brings the view back to the story).
export function Caption({ player, phase, render }) {
  const { hold, continueNow, captionRef, playing } = player;
  const waiting = !!hold && playing;
  return (
    <div className={`st-caption${waiting ? ' st-caption-wait' : ''}`} aria-live="polite" onClick={waiting ? continueNow : undefined} role={waiting ? 'button' : undefined} title={waiting ? 'Tap to go on' : undefined}>
      <span ref={captionRef} className="st-caption-text">{render(phase.caption)}</span>
      <span className="st-caption-foot">
        <CaptionRefs refs={phase.ref} />
        {waiting && hold.tap && <span className="st-caption-tap">tap to go on ▸</span>}
      </span>
    </div>
  );
}

/** The caption's verses as links — one a verse (its own page) or a run of verses (the reader) — so the reader can go straight to
 *  what is being quoted (fieldy: "I need access to the displayed verses, I should be able to easily go to them"). */
export function CaptionRefs({ refs }) {
  const links = useMemo(() => {
    const out = []; let lastBook = null;
    for (const r of parseRefs(refs)) {
      const rs = r.ranges.length ? r.ranges : [[null, null]];
      for (const [a, b] of rs) {
        const label = `${r.book === lastBook ? '' : `${r.book} `}${r.chapter}${a ? `:${a}${b !== a ? `–${b}` : ''}` : ''}`;
        const to = a == null ? `/bible?book=${r.bookId}&chapter=${r.chapter}` : a === b ? `/${r.bookId}/${r.chapter}/${a}` : `/bible?book=${r.bookId}&chapter=${r.chapter}&verse=${a}&verseEnd=${b}`;
        out.push({ label, to, title: a == null ? `${r.book} ${r.chapter} in the reader` : a === b ? `${r.book} ${r.chapter}:${a} on its own page` : `${r.book} ${r.chapter}:${a}–${b} in the reader` });
        lastBook = r.book;
      }
    }
    return out;
  }, [refs]);
  if (!links.length) return refs ? <span className="st-caption-ref">{refs}</span> : null;
  return (
    <span className="st-caption-ref st-caption-refs" onClick={(e) => e.stopPropagation()}>
      {links.map((l, i) => <Link key={i} to={l.to} className="st-caption-reflink" title={l.title}>{l.label}</Link>)}
    </span>
  );
}

// ── Canvas subtitles: the caption's words, one by one, inside the stage ──────
// The caption is spoken into the canvas itself: each unit of the text — a plain word, or a "Word (gloss)" pair kept whole — comes
// up in its turn and settles into the line, the transliteration gold, the gloss beside it, laid low over the scene rather than
// boxed on top of it (fieldy: "present the text in a nice way in the canvas so it seems immersive … words one by one … like a
// conversation … in a way that pops and feels inclusive with the canvas"). Quotes are resolved from the live text first, as the
// caption under the stage resolves them. Togglable ("canvas subtitles"), remembered.
const UNIT_RE = /(\S+?\s*\([^)]*\)\S*|\S+)/g;
const GLOSS_UNIT = /^(\S+?)\s*\(([^)]*)\)(\S*)$/;
export function unitsOf(text) {
  const out = []; let m; UNIT_RE.lastIndex = 0;
  while ((m = UNIT_RE.exec(String(text || '')))) {
    const g = GLOSS_UNIT.exec(m[1]);
    if (g) out.push({ w: g[1], gloss: g[2].trim(), tail: g[3] }); else out.push({ w: m[1] });
  }
  return out;
}
/** The caption with its {{quotes}} resolved to the live text, or null while it loads. */
export function useResolvedCaption(text) {
  const parts = useMemo(() => parseQuotes(text), [text]);
  const specs = parts.filter((p) => typeof p === 'object');
  const key = specs.map((p) => `${p.ref}|${p.from}|${p.to}`).join('\n') + '|' + text;
  const [resolved, setResolved] = useState(() => (specs.length ? null : text));
  useEffect(() => {
    if (!specs.length) { setResolved(text); return undefined; }
    let live = true; setResolved(null);
    Promise.all(specs.map(async (p) => sliceQuote(await verseText(p.ref), p.from, p.to)))
      .then((q) => { if (!live) return; let qi = 0; setResolved(parts.map((p) => (typeof p === 'string' ? p : q[qi++])).join('')); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return resolved;
}
const SUB_KEY = 'model-subtitles';
const readFlag = (k, dflt) => { try { const v = localStorage.getItem(k); return v == null ? dflt : v !== '0'; } catch { return dflt; } };
const writeFlag = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };
/** The subtitles' setting, remembered: on or off. (The words keep one spot — fieldy: "keeping the subtitles in one spot works for my purposes".) */
export function useSubtitles() {
  const [on, setOn] = useState(() => readFlag(SUB_KEY, true));
  useEffect(() => { writeFlag(SUB_KEY, on); }, [on]);
  return { on, setOn };
}
export function SubtitlesToggle({ subs, id = 'st-subs' }) {
  const { on, setOn } = subs;
  return <label className="st-loop" title="Speak the caption into the scene, word by word, as it plays"><input id={id} type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> canvas subtitles</label>;
}
/** A pane's title, spoken whole into the scene (`phase.title`, a template like the caption) — the date, the word, the thing
 *  the pane is about — over and above the one-word subtitles (fieldy: "render a title outside of the single word subtitles to
 *  have the full 'In the first month of the second year…'"). Shown as the subtitles are: once the story has played or the pane
 *  was scrubbed to. */
export function CanvasTitle({ phase, on, playing = false, scrubbed = null }) {
  const text = capFirst(useResolvedCaption(phase?.title || ''));
  const armed = useRef(false); if (playing) armed.current = true;
  const show = on && !!phase?.title && !!text && (armed.current || (!!scrubbed && scrubbed === phase?.key));
  if (!show) return null;
  const units = unitsOf(text);
  return (
    <div className="st-ctitle" key={phase.key} aria-hidden="true">
      {units.map((u, i) => (u.gloss != null
        ? <span key={i} className="st-ctitle-pair"><span className="st-ctitle-w">{u.w}</span>{u.gloss ? <span className="st-ctitle-g"> ({u.gloss})</span> : null}{u.tail}</span>
        : <span key={i}>{u.w}</span>))}
    </div>
  );
}

/** The weight of a unit's time on the canvas (ms at the base pace): a plain word — a joining word, a filler — is quick; a glossed
 *  word is the emphasis and holds, and holds longer again for every word of its gloss (fieldy: "filler words can appear and
 *  disappear faster … the glossed words should pop more"). */
export function holdFor(u, pace = 520) {
  const glossWords = u.gloss ? u.gloss.trim().split(/\s+/).length : 0;
  if (u.gloss == null) return pace * 0.5 + Math.min(20, u.w.length) * 12;
  return pace * 1.35 + Math.min(24, u.w.length) * 14 + Math.max(0, glossWords - 1) * 150;
}
/** A sentence begins with a capital, even where the quote is sliced from the middle of a verse ("in the raashawan" → "In the raashawan"). */
export function capFirst(text) { return text ? text.replace(/^(\s*["“'‘(]*)([a-z])/, (m, a, b) => a + b.toUpperCase()) : text; }
/**
 * The caption spoken into the stage one unit at a time, each taking the last one's place, in the subtitle area (centred, toward
 * the bottom). The words are laid along the pane's own time: the story clock decides which word shows, so scrubbing lands on
 * the word for that moment, scrubbing back to the start shows the first word, and the last word is on show by the pane's end
 * (fieldy: "the subtitles need to be aligned to its segment"). A pane too short for its words asks the player to run it
 * slower (`report({key, factor})`). The words keep one spot, low and centred, so the reader's eye need not hunt for them.
 */
export function CanvasSubtitles({ phase, clock, timeline, on, playing = false, scrubbed = null, pace = 520, report }) {
  const text = capFirst(useResolvedCaption(phase?.caption || ''));
  const units = useMemo(() => unitsOf(text), [text]);
  const armed = useRef(false); if (playing) armed.current = true;   // nothing before the play button (or a scrub)
  const show = on && units.length > 0 && (armed.current || (!!scrubbed && scrubbed === phase?.key));
  const [idx, setIdx] = useState(-1);
  // the words' places along the pane: cumulative weights over its span
  const lay = useMemo(() => {
    if (!phase || !timeline || !units.length) return null;
    const from = phase.from ?? 0, end = phaseEndOf(timeline, from + 1e-3), span = Math.max(0.01, end - from);
    const w = units.map((u) => holdFor(u, pace)), total = w.reduce((a, b) => a + b, 0), need = total / 1000;
    // spoken at a sentence's pace (fieldy: "a sentence with multiple words spoken at a good pace"), stretched at most a little
    // to fill a longer pane — never dragged out one word at a time; a pane too short for its words slows the story instead
    const scale = Math.max(1, Math.min(1.35, span / need));
    const at = []; let acc = 0; for (const x of w) { at.push(from + (acc / 1000) * scale); acc += x; }
    const done = from + (acc / 1000) * scale;   // the last word's own time is up: the words are gone until the pane ends
    return { from, end, span, at, done, need, factor: Math.min(1, span / need) };
  }, [phase, timeline, units, pace]);
  useEffect(() => { report?.({ key: phase?.key ?? null, factor: lay ? lay.factor : 1 }); }, [lay, phase?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { report?.({ key: null, factor: 1 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // which word the story clock is on, read every frame (no React state until it changes)
  useEffect(() => {
    if (!show || !lay || !clock) { setIdx(-1); return undefined; }
    let raf = 0, last = -2, alive = true;
    const tick = () => {
      if (!alive) return; raf = requestAnimationFrame(tick);
      const t = clock.t; let i = 0;
      while (i + 1 < lay.at.length && lay.at[i + 1] <= t + 1e-6) i++;
      if (t < lay.from - 1e-6 || t > lay.end + 1e-6 || t > lay.done + 0.6) i = -1;
      if (i !== last) { last = i; setIdx(i); }
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [show, lay, clock]);
  if (idx < 0 || !units[idx]) return null;
  const u = units[idx], key = phase?.key || '';
  return (
    <div className="st-subs" aria-hidden="true">
      <span key={`${key}:${idx}`} className={`st-sub-u ${u.gloss != null ? 'st-sub-pair' : 'st-sub-fill'}`}>
        {u.gloss != null
          ? <><span className="st-sub-w">{u.w}{u.tail ? <span className="st-sub-t">{u.tail}</span> : null}</span>{u.gloss ? <span className="st-sub-g">({u.gloss})</span> : null}</>
          : u.w}
      </span>
    </div>
  );
}

/** The reading-pace control for a player's options row. */
export function PaceSelect({ player, id = 'st-pace' }) {
  const { pace, setPace } = player;
  return (
    <label className="st-speed" title="How the story waits for each caption to be read">
      <span>read</span>
      <select id={id} value={pace} onChange={(e) => setPace(e.target.value)}>
        <option value="tap">tap to go on</option>
        <option value="off">no pause</option>
      </select>
    </label>
  );
}

// ── A folding band of the panel ──────────────────────────────────────────────
// "Scripture" and "Details" sit one above the other like vertical tabs; either or
// both can be folded to a single bar. The fold is remembered per band across visits.
export function Section({ id, title, sub, children, storageKey = 'st-sec' }) {
  const key = `${storageKey}-${id}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== '0'; } catch { return true; } });
  const toggle = () => setOpen((o) => { try { localStorage.setItem(key, o ? '0' : '1'); } catch {} return !o; });
  return (
    <section className={`st-sec st-sec-${id}${open ? ' open' : ''}`}>
      <button type="button" className="st-sec-h" onClick={toggle} aria-expanded={open}>
        <span className="st-sec-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="st-sec-title">{title}</span>
        <span className="st-sec-sub">{sub}</span>
      </button>
      {open && <div className="st-sec-body">{children}</div>}
    </section>
  );
}

// ── A word of the text, in a card ────────────────────────────────────────────
export function WordRow({ w }) {
  return (
    <span className="st-word">
      <b>{w.translit}</b> <span dir="rtl" className="st-word-paleo">{w.paleo}</span> <small>{w.en}</small>
      <Link to={`/roots?sn=${w.sn}`} className="st-word-sn" title="Explore this root">{w.sn}</Link>
    </span>
  );
}

// ── The passage as the panel ─────────────────────────────────────────────────
// Every "heb (gloss)" pair in the text becomes a part — the ones that name a piece
// of the model carry `piece` and render as buttons; the rest render as plain text.
// Both are shown the way the Reader shows them: the transliterated word gold
// (.st-root), the English gloss white beside it.
export const WORD_RE = /\b([A-Za-z][A-Za-z-]*)\s*\(([^)]*)\)/g;
export function verseParts(text, pieceFor) {
  const out = []; let last = 0, m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) {
    const piece = pieceFor(m[1]);
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], heb: m[1], gloss: m[2], piece });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
export const GlossPair = ({ heb, gloss }) => <><span className="st-root">{heb}</span> ({gloss})</>;

/**
 * Several chapters, one after the other, with a heading each.
 *   passages: [{ bookId, chapter, from, to, label }]
 *   pieceFor(word, passage, verseNumber) → piece id | null
 *   onVerses: Set of "bookId:chapter:verse" keys to edge in gold
 *   titleFor(id) → the piece's title (tooltip)
 */
export function ModelPassage({ passages, selected, onPick, onVerses, pieceFor, titleFor, allRefs }) {
  const [chapters, setChapters] = useState({});
  const box = useRef(null);
  useEffect(() => {
    let live = true;
    passages.forEach((p) => loadChapter(p.bookId, p.chapter).then((vs) => {
      if (!live) return;
      setChapters((c) => ({ ...c, [`${p.bookId}:${p.chapter}`]: vs.filter((v) => +v.verse >= p.from && +v.verse <= p.to) }));
    }));
    return () => { live = false; };
  }, [passages]);
  useEffect(() => {
    const first = box.current?.querySelector('.st-v.on');
    if (first) first.scrollIntoView({ block: 'start', behavior: 'smooth' });   // the chosen verse as high as the panel allows (fieldy) — what follows it is then in view, not what precedes
  }, [selected, chapters]);
  return (
    <div className="st-passage" ref={box}>
      {allRefs && (
        <div className="st-passage-h">
          <span className="st-passage-links">
            <Link to={`/passage?ref=${encodeURIComponent(allRefs)}`} className="st-passage-open">Open the passage →</Link>
          </span>
        </div>
      )}
      {passages.map((p) => {
        const verses = chapters[`${p.bookId}:${p.chapter}`];
        return (
          <div key={p.label} className="st-passage-ch">
            <div className="st-passage-chh">
              <b>{p.label}</b>
              <Link to={`/bible?book=${p.bookId}&chapter=${p.chapter}&verse=${p.from}&verseEnd=${p.to}`} className="st-passage-open">Reader →</Link>
            </div>
            {!verses && <div className="st-passage-wait">Loading the text…</div>}
            {verses && verses.length === 0 && <div className="st-passage-wait">No English text for {p.label} yet.</div>}
            {verses && verses.map((v) => {
              const n = +v.verse, key = `${p.bookId}:${p.chapter}:${n}`;
              return (
                <p key={n} className={`st-v${onVerses.has(key) ? ' on' : ''}`} data-ref={key}>
                  {/* as in the reader: hovering the number offers "Go to verse" — the verse's own page (/:book/:chapter/:verse; a numeric book id is accepted there) */}
                  <span className="st-vnum-wrap"><sup className="st-vnum" tabIndex={0}>{n}</sup><Link className="st-vnum-goto" to={`/${p.bookId}/${p.chapter}/${n}`} title={`Open verse ${n} on its own page`}>Go to verse</Link></span>
                  {verseParts(String(v.text || ''), (w) => pieceFor(w, p, n)).map((part, i) => part.piece
                    ? <button key={i} type="button" className={`st-w${part.piece === selected ? ' hl' : ''}`} onClick={() => onPick(part.piece)} title={titleFor?.(part.piece)}><GlossPair heb={part.heb} gloss={part.gloss} /></button>
                    : part.heb ? <GlossPair key={i} heb={part.heb} gloss={part.gloss} /> : <span key={i}>{part.t}</span>)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
