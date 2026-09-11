/**
 * Statue.jsx — "The Statue of the Dream": Nebuchadnezzar's image (Daniel
 * 2:31–45) and the stone cut without hands, as an interactive model.
 *
 * Route: /models/statue   ?piece=head|chest|belly|legs|feet|stone  ?view=3d|2d
 *
 * - Two renderers of ONE timeline (lib/models/statue.js): the WebGL scene
 *   (three.js, lazy — the demonstrative view) and the flat SVG sheet (the
 *   practical view, and the fallback wherever WebGL is missing).
 * - The player: Play (one run), Repeat (loops), a scrub bar over the whole
 *   animation, speed ¼×–2×. Time lives in a tiny clock object that both
 *   renderers read every frame — never React state, so playing costs no
 *   re-renders; only the phase caption and the "what is selectable" state
 *   go through React, and only when they change.
 * - Tap a piece → the card: the text's own words for it (transliteration,
 *   paleo, meaning), the dream verses and the interpretation verses inline
 *   (PassageRefs, the app's Novel English), what scripture NAMES for it, the
 *   parallel vision of Daniel 7/8, and the common reading labeled as such.
 *   Once a piece is shattered it can no longer be selected; at the end only
 *   the stone (now the mountain) can — the point of the vision, made visible.
 * - Phone: the stage on top, the player under it, the card as a bottom sheet.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { PassageRefs, Glossed } from '../components/PassageRefs.jsx';
import { apiTransChapter } from '../lib/api.js';
import StatueSheet from '../components/StatueSheet.jsx';
import {
  PIECES, STONE, WORDS, DURATION, SPEEDS, HIT, MOUNTAIN_FROM,
  phaseAt, selectableAt, pieceById, ALL_REFS, PASSAGE, pieceForWord,
} from '../lib/models/statue.js';
import './Statue.css';

const StatueScene = lazy(() => import('../components/StatueScene.jsx'));

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}

const VIEWS = ['3d', '2d'];
const PIECE_IDS = [...PIECES.map((p) => p.id), 'stone'];

// ── The player ───────────────────────────────────────────────────────────────
function usePlayer() {
  const clock = useRef({ t: 0 }).current;
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [phase, setPhase] = useState(() => phaseAt(0));
  const [selectable, setSelectable] = useState(() => selectableAt(0));
  const [ended, setEnded] = useState(false);
  const scrubRef = useRef(null), timeRef = useRef(null);
  const state = useRef({ playing: false, speed: 1, loop: false, last: 0, raf: 0 });
  state.current.playing = playing; state.current.speed = speed; state.current.loop = loop;

  const show = useCallback((t) => {
    clock.t = t;
    if (scrubRef.current) scrubRef.current.value = String(Math.round((t / DURATION) * 1000));
    if (timeRef.current) timeRef.current.textContent = `${t.toFixed(1)} s`;
    const ph = phaseAt(t); setPhase((cur) => (cur.key === ph.key ? cur : ph));
    const sel = selectableAt(t); setSelectable((cur) => (cur.length === sel.length ? cur : sel));
    setEnded(t >= DURATION - 1e-6);
  }, [clock]);

  useEffect(() => {
    let alive = true;
    const tick = (now) => {
      if (!alive) return;
      state.current.raf = requestAnimationFrame(tick);
      const st = state.current;
      if (!st.playing) { st.last = now; return; }
      let t = clock.t + ((now - st.last) / 1000) * st.speed; st.last = now;
      if (t >= DURATION) { if (st.loop) t -= DURATION; else { t = DURATION; setPlaying(false); } }
      show(t);
    };
    state.current.raf = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(state.current.raf); };
  }, [clock, show]);

  const play = () => { if (clock.t >= DURATION - 1e-6) show(0); state.current.last = performance.now(); setPlaying(true); };
  const pause = () => setPlaying(false);
  const seek = (t) => { setPlaying(false); show(Math.max(0, Math.min(DURATION, t))); };
  const restart = () => { show(0); state.current.last = performance.now(); setPlaying(true); };
  return { clock, playing, speed, setSpeed, loop, setLoop, phase, selectable, ended, play, pause, seek, restart, scrubRef, timeRef, show };
}

// ── Detail card ──────────────────────────────────────────────────────────────
function Word({ k }) {
  const w = WORDS[k];
  return (
    <span className="st-word">
      <b>{w.translit}</b> <span dir="rtl" className="st-word-paleo">{w.paleo}</span> <small>{w.en}</small>
      <Link to={`/roots?sn=${w.sn}`} className="st-word-sn" title="Explore this root">{w.sn}</Link>
    </span>
  );
}

// ── The story: Daniel 2:31–45, the text the model is drawn from ─────────────
// Every "translit (gloss)" word that belongs to a piece is a button: tap "dahab
// (gold)" and the head is selected. When a piece is selected its words light up
// and its verses get a gold edge — the proof that the text is the source.
let _passagePromise = null;
function loadPassage() {
  if (!_passagePromise) _passagePromise = apiTransChapter(PASSAGE.bookId, PASSAGE.chapter)
    .then((d) => (d?.verses || []).filter((v) => +v.verse >= PASSAGE.from && +v.verse <= PASSAGE.to))
    .catch(() => []);
  return _passagePromise;
}
// Every "heb (gloss)" pair in the text becomes a part — the ones that name a
// piece of the image carry `piece` and render as buttons; the rest render as
// plain text. Both are shown the way the Reader shows them: the transliterated
// Hebrew/Aramaic word gold (.st-root), the English gloss white beside it.
const WORD_RE = /\b([A-Za-z][A-Za-z-]*)\s*\(([^)]*)\)/g;
function verseParts(text, verse) {
  const out = []; let last = 0, seenRagal = false, m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) {
    const piece = pieceForWord(m[1], verse, seenRagal);
    if (m[1].toLowerCase().startsWith('ragal')) seenRagal = true;
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], heb: m[1], gloss: m[2], piece });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
const GlossPair = ({ heb, gloss }) => <><span className="st-root">{heb}</span> ({gloss})</>;

function Passage({ selected, selectable, onPick }) {
  const [verses, setVerses] = useState(null);
  const box = useRef(null);
  useEffect(() => { let live = true; loadPassage().then((vs) => { if (live) setVerses(vs); }); return () => { live = false; }; }, []);
  const item = pieceById(selected);
  const onVerses = item ? new Set(item.verses) : new Set();
  useEffect(() => {
    const first = box.current?.querySelector('.st-v.on');
    if (first) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected, verses]);
  return (
    <div className="st-passage" ref={box}>
      <div className="st-passage-h">
        <span className="st-passage-links">
          <Link to={`/passage?ref=${encodeURIComponent(ALL_REFS)}`} className="st-passage-open">Open the passage →</Link>
          <Link to={`/bible?book=${PASSAGE.bookId}&chapter=${PASSAGE.chapter}&verse=${PASSAGE.from}&verseEnd=${PASSAGE.to}`} className="st-passage-open">Reader →</Link>
        </span>
      </div>
      {verses === null && <div className="st-passage-wait">Loading the text…</div>}
      {verses && verses.length === 0 && <div className="st-passage-wait">No English text for Daniel 2 yet.</div>}
      {verses && verses.map((v) => {
        const n = +v.verse;
        return (
          <p key={n} className={`st-v${onVerses.has(n) ? ' on' : ''}`}>
            <sup>{n}</sup>
            {verseParts(String(v.text || ''), n).map((part, i) => part.piece
              ? <button key={i} type="button" className={`st-w${part.piece === selected ? ' hl' : ''}`} onClick={() => onPick(part.piece)} title={pieceById(part.piece)?.title}><GlossPair heb={part.heb} gloss={part.gloss} /></button>
              : part.heb ? <GlossPair key={i} heb={part.heb} gloss={part.gloss} /> : <span key={i}>{part.t}</span>)}
          </p>
        );
      })}
    </div>
  );
}

function Card({ id, selectable, ended, onClose, onPick }) {
  const item = pieceById(id);
  const isStone = id === 'stone';
  const gone = item && !isStone && !selectable.includes(id);
  return (
    <div className="st-card">
      {item ? (
        <>
          <div className="st-card-h">
            <div className="st-detail-sub">{isStone ? 'The aban (stone)' : `Piece ${item.order} of 5 · ${WORDS[item.materialWord].translit.toLowerCase()} (${WORDS[item.materialWord].en})`}</div>
            <h2 className="st-card-title"><Glossed text={item.title} /></h2>
            <button type="button" className="st-card-x" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="st-words">
            {[...new Set([...item.words, item.materialWord, ...(isStone ? ['yashapah', 'tawar', 'har', 'arach', 'rawach'] : [])])].map((k) => <Word key={k} k={k} />)}
          </div>
          {gone && <p className="st-gone"><Glossed text="This piece is daqaq (broken) in pieces at this moment of the vision — scrub back to see it whole." /> <span className="st-gone-ref">Daniel 2:35</span></p>}
          {ended && isStone && <p className="st-only"><Glossed text={'Only the aban (stone) remains. The tzalam (likeness) is gone — "no athar (place) was shakach (found) for them" — and the aban (stone) has become a rab (great) tawar (mountain) that malaa (fills) the kal (every) arai (earth).'} /></p>}
        </>
      ) : (
        <div className="st-card-h">
          <div className="st-detail-sub">The dream Nabawakadanaatzar (Nebuchadnezzar) saw</div>
          <h2 className="st-card-title"><Glossed text="The tzalam (likeness), and the aban (stone) that struck it" /></h2>
          {ended && <p className="st-only"><Glossed text="Only the aban (stone) remains — the tzalam (likeness) is gone, and the tawar (mountain) malaa (fills) the arai (earth)." /></p>}
        </div>
      )}

      <Section id="scripture" title="Scripture" sub="Daniel 2:31–45 · the text itself">
        <Passage selected={id} selectable={selectable} onPick={onPick} />
      </Section>

      <Section id="details" title="Details" sub={item ? 'what scripture names · the parallel vision · the common reading' : 'choose a piece'}>
      {!item && <p className="st-card-p">Tap a piece of the image, a tag on it, or one of the marked words in the text for what scripture names it, the parallel vision in Daniel 7–8, and the common reading.</p>}
      {item && (
        <>
          <div className="st-detail-sub">What scripture names</div>
          <div className="st-named">
            <div className="st-named-k"><Glossed text={item.named.kingdom} /></div>
            <div className="st-named-who"><Glossed text={item.named.who} /></div>
            <p><Glossed text={item.named.note} /></p>
            <PassageRefs refs={item.named.ref} size="sm" />
          </div>

          <div className="st-detail-sub">{isStone ? <Glossed text="The same aban (stone) elsewhere" /> : 'The parallel vision'}</div>
          <div className="st-par">
            <p><Glossed text={item.parallel.note} /></p>
            <PassageRefs refs={item.parallel.ref} size="sm" />
          </div>

          <div className="st-detail-sub">Common reading <em>(interpretation, not the text)</em></div>
          <p className="st-trad"><Glossed text={item.traditional} /></p>
          {item.mountain && (
            <>
              <div className="st-detail-sub"><Glossed text="The tawar (mountain) it becomes" /></div>
              <div className="st-par">
                <p><Glossed text={item.mountain.note} /></p>
                <PassageRefs refs={item.mountain.ref} size="sm" />
              </div>
            </>
          )}
          {item.colour && (
            <>
              <div className="st-detail-sub">Why it is jasper</div>
              <div className="st-par">
                <p><Glossed text={item.colour.note} /></p>
                <PassageRefs refs={item.colour.ref} size="sm" />
              </div>
            </>
          )}
        </>
      )}
      </Section>
    </div>
  );
}

// A collapsible band of the panel — "Scripture" and "Details" sit one above the
// other like vertical tabs; either or both can be folded to a single bar. The
// fold is remembered per band across visits.
function Section({ id, title, sub, children }) {
  const key = `st-sec-${id}`;
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

// ── The page ─────────────────────────────────────────────────────────────────
export default function Statue() {
  usePageTitle(pageTitle('The Statue of the Dream — Maps & Models'), 'Nabawakadanaatzar (Nebuchadnezzar)\'s tzalam (likeness) of Daniel 2 and the aban (stone) gazar (cut) out laa (without) yadayan (hands) — an interactive model: tap the dahab (gold), the kasap (silver), the nachash (brass), the parazal (iron) and the chasap (clay) for their verses, and play the aban (stone) striking it to pieces.');
  const [params, setParams] = useSearchParams();
  const canGL = useMemo(webglAvailable, []);
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : (canGL ? '3d' : '2d');
  const [glOk, setGlOk] = useState(true);
  const sel = PIECE_IDS.includes(params.get('piece')) ? params.get('piece') : null;
  const player = usePlayer();
  const { clock, playing, speed, setSpeed, loop, setLoop, phase, selectable, ended, play, pause, seek, restart, scrubRef, timeRef } = player;
  const [sheetOpen, setSheetOpen] = useState(!!sel);

  const setParam = useCallback((k, v) => {
    const q = new URLSearchParams(params);
    if (v == null || v === '') q.delete(k); else q.set(k, v);
    setParams(q, { replace: true });
  }, [params, setParams]);
  const select = useCallback((id) => { setParam('piece', id); setSheetOpen(!!id); }, [setParam]);
  // Phone: the grip bar can be pulled down to put the sheet away (or up to keep it).
  const panelRef = useRef(null), grip = useRef(null);
  const onGripDown = (e) => { if (e.target.closest('button')) return; grip.current = { y: e.clientY, dy: 0 }; e.currentTarget.setPointerCapture?.(e.pointerId); if (panelRef.current) panelRef.current.style.transition = 'none'; };
  const onGripMove = (e) => {
    const g = grip.current; if (!g) return;
    g.dy = Math.max(0, e.clientY - g.y);
    if (panelRef.current) panelRef.current.style.transform = `translateY(${g.dy}px)`;
  };
  const onGripUp = () => {
    const g = grip.current; if (!g) return; grip.current = null;
    const el = panelRef.current; if (el) { el.style.transition = ''; el.style.transform = ''; }
    if (g.dy > 70) setSheetOpen(false);
  };

  // A shattered piece stays selectable — its card says it is broken at this moment
  // and the text still shows where it comes from; only the model has nothing to glow.
  const shownSel = sel;

  useEffect(() => { document.body.classList.add('st-body'); return () => document.body.classList.remove('st-body'); }, []);

  const use3d = view === '3d' && canGL && glOk;
  const onPlayPause = () => (playing ? pause() : play());
  const onScrub = (e) => seek((+e.target.value / 1000) * DURATION);
  // Keyboard: space plays/pauses, ← → step a quarter second, Home rewinds (not while typing in a control).
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
      if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
      else if (e.key === 'ArrowLeft') seek(clock.t - 0.25);
      else if (e.key === 'ArrowRight') seek(clock.t + 0.25);
      else if (e.key === 'Home') seek(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={`st-page${sheetOpen ? ' st-sheet-open' : ''}`}>
      <header className="st-top">
        <Link to="/models" className="st-back" title="Maps & Models">←</Link>
        <div className="st-h1wrap">
          <h1 className="st-h1">The Statue of the Dream</h1>
          <span className="st-h1-paleo" dir="rtl" aria-hidden="true">𐤑𐤋𐤌 · 𐤀𐤁𐤍</span>
        </div>
        <div className="st-views" role="group" aria-label="View">
          <button type="button" className={`st-view${use3d ? ' on' : ''}`} onClick={() => setParam('view', '3d')} disabled={!canGL || !glOk} title={canGL && glOk ? 'Lit 3D model — drag to look around' : 'WebGL is not available in this browser'}>3D</button>
          <button type="button" className={`st-view${!use3d ? ' on' : ''}`} onClick={() => setParam('view', '2d')} title="Flat sheet — light, prints, works anywhere">2D</button>
        </div>
      </header>

      <div className="st-main">
        <section className="st-stagewrap">
          <div className="st-stagebox">
            <div className="st-stage">
              {use3d
                ? <Suspense fallback={<div className="st-loading">Loading the 3D model…</div>}><StatueScene clock={clock} selected={shownSel} onSelect={select} onReady={(ok) => { if (!ok) setGlOk(false); }} /></Suspense>
                : <StatueSheet clock={clock} selected={shownSel} onSelect={select} />}
              {/* One row of pieces along the bottom of the stage, the stone first:
                  tap one and the view flies to it; tap it again to let go. */}
              <div className="st-strip" role="toolbar" aria-label="Pieces">
                {[STONE, ...PIECES].map((p) => (
                  <button key={p.id} type="button" className={`st-chip${shownSel === p.id ? ' on' : ''}`} onClick={() => select(shownSel === p.id ? null : p.id)}>
                    <Glossed text={p.id === 'stone' && phase.key === 'mountain' ? 'tawar (mountain)' : p.tag.split(' · ')[0]} />
                  </button>
                ))}
              </div>
            </div>
            <div className="st-caption" aria-live="polite">
              <span className="st-caption-text"><Glossed text={phase.caption} /></span>
              <span className="st-caption-ref">{phase.ref}</span>
            </div>
          </div>

          <div className="st-player">
            <button type="button" className="st-play" onClick={onPlayPause} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
            <button type="button" className="st-restart" onClick={restart} aria-label="Play from the beginning" title="From the beginning">↺</button>
            <div className="st-scrubwrap">
              <input ref={scrubRef} id="st-scrub" type="range" min="0" max="1000" defaultValue="0" step="1" onInput={onScrub} className="st-scrub" aria-label="Scrub through the vision" />
              <div className="st-marks" aria-hidden="true">
                <span style={{ left: `${(HIT / DURATION) * 100}%` }} title="The strike">strike</span>
            <span style={{ left: `${(MOUNTAIN_FROM / DURATION) * 100}%` }} title="The mountain">mountain</span>
              </div>
            </div>
            <span ref={timeRef} className="st-time">0.0 s</span>
            <div className="st-opts">
              <label className="st-speed">
                <span>speed</span>
                <select id="st-speed" value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                  {SPEEDS.map((s) => <option key={s} value={s}>{s === 0.25 ? '¼×' : s === 0.5 ? '½×' : `${s}×`}</option>)}
                </select>
              </label>
              <label className="st-loop"><input id="st-loop" type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> repeat</label>
            </div>
          </div>
          <p className="st-hint">{use3d ? 'Drag to look around, pinch or scroll to zoom. ' : ''}<Glossed text="Tap a piece, one of the chips below it, or a word in the text for its verses — the view flies to it. At the end only the aban (stone) remains." /></p>
          <button type="button" className="st-openbtn" onClick={() => setSheetOpen(true)}>Pieces &amp; verses ↑</button>
        </section>

        <aside className={`st-panel${sheetOpen ? ' open' : ''}`} ref={panelRef}>
          <div className="st-sheet-bar" onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}>
            <span className="st-sheet-grip" /><button type="button" className="st-sheet-x" onClick={() => { setSheetOpen(false); }}>Model ×</button>
          </div>
          <Card id={shownSel} selectable={selectable} ended={ended} onClose={() => select(null)} onPick={select} />
        </aside>
      </div>
    </div>
  );
}
