/**
 * ModelKit.jsx — what every animated model page shares (the statue, the
 * temple, whatever comes next): the player, the folding panel bands, the
 * passage-as-panel with its clickable words, and the word rows of a card.
 * Lifted out of pages/Statue.jsx when the temple was built; the page CSS
 * they rely on is ModelPage.css (the `st-` classes).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadChapter } from '../lib/passages.js';
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
      let t = clock.t + ((now - st.last) / 1000) * st.speed; st.last = now;
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
  return { clock, playing, speed, setSpeed, loop, setLoop, pace, setPace, hold, continueNow, captionRef, phase, selectable, ended, play, pause, seek, restart, scrubRef, timeRef, show };
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
        <span className="st-caption-ref">{phase.ref}</span>
        {waiting && hold.tap && <span className="st-caption-tap">tap to go on ▸</span>}
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
