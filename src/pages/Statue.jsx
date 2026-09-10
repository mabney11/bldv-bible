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
import { PassageRefs } from '../components/PassageRefs.jsx';
import StatueSheet from '../components/StatueSheet.jsx';
import {
  PIECES, STONE, WORDS, MATERIALS, DURATION, SPEEDS, HIT,
  phaseAt, selectableAt, pieceById, ALL_REFS,
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

function Card({ id, selectable, ended, onClose, onPick }) {
  const item = pieceById(id);
  if (!item) {
    return (
      <div className="st-card">
        <div className="st-card-h"><div className="st-detail-sub">The statue of the dream</div><h2 className="st-card-title">Tap a piece of the image, or the stone</h2></div>
        <p className="st-card-p">The king saw a great image: a head of gold, breast and arms of silver, belly and thighs of bronze, legs of iron, feet part iron and part clay — and a stone cut out without hands that struck it on its feet. Each piece answers with the text's own words for it and the verses that explain it.</p>
        <ul className="st-legend">
          {PIECES.map((p) => (
            <li key={p.id}>
              <button type="button" className={`st-legend-btn${selectable.includes(p.id) ? '' : ' gone'}`} onClick={() => onPick(p.id)} disabled={!selectable.includes(p.id)}>
                <i style={{ background: MATERIALS[p.material].color }} /> <span>{p.title}</span> <small>{WORDS[p.materialWord].translit}</small>
              </button>
            </li>
          ))}
          <li><button type="button" className="st-legend-btn" onClick={() => onPick('stone')}><i style={{ background: MATERIALS.stone.color }} /> <span>{STONE.title}</span> <small>Aban</small></button></li>
        </ul>
        {ended && <p className="st-only">Only the stone remains — the image is gone, and the mountain fills the earth. <PassageRefs refs="Daniel 2:35, 44–45" size="sm" /></p>}
        <PassageRefs refs={ALL_REFS} size="sm" />
      </div>
    );
  }
  const isStone = id === 'stone';
  const gone = !selectable.includes(id);
  return (
    <div className="st-card">
      <div className="st-card-h">
        <div className="st-detail-sub">{isStone ? 'The stone' : `Piece ${item.order} of 5 · ${WORDS[item.materialWord].en}`}</div>
        <h2 className="st-card-title">{item.title}</h2>
        <button type="button" className="st-card-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="st-words">
        {[...new Set([...item.words, item.materialWord, ...(isStone ? ['tawar', 'rawach'] : [])])].map((k) => <Word key={k} k={k} />)}
      </div>
      {gone && !isStone && <p className="st-gone">This piece is broken to pieces at this moment of the vision — scrub back to see it whole. <span className="st-gone-ref">Daniel 2:35</span></p>}
      {ended && isStone && <p className="st-only">Only the stone remains. The image is gone — "no place was found for them" — and the stone has become a great mountain that fills the whole earth.</p>}

      <div className="st-detail-sub">In the dream</div>
      <PassageRefs refs={item.dreamRef} autoOpen size="md" />
      <div className="st-detail-sub">The interpretation</div>
      <PassageRefs refs={item.meaningRef} autoOpen size="md" />

      <div className="st-detail-sub">What scripture names</div>
      <div className="st-named">
        <div className="st-named-k">{item.named.kingdom}</div>
        <div className="st-named-who">{item.named.who}</div>
        <p>{item.named.note}</p>
        <PassageRefs refs={item.named.ref} size="sm" />
      </div>

      <div className="st-detail-sub">{isStone ? 'The same stone elsewhere' : 'The parallel vision'}</div>
      <div className="st-par">
        <p>{item.parallel.note}</p>
        <PassageRefs refs={item.parallel.ref} size="sm" />
      </div>

      <div className="st-detail-sub">Common reading <em>(interpretation, not the text)</em></div>
      <p className="st-trad">{item.traditional}</p>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
export default function Statue() {
  usePageTitle(pageTitle('The Statue of the Dream — Maps & Models'), 'Nebuchadnezzar\'s image of Daniel 2 and the stone cut without hands — an interactive model: tap the head of gold, the silver, the bronze, the iron and the clay for their verses, and play the stone striking it to pieces.');
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

  // A shattered piece cannot stay selected: the card falls back to the overview
  // (the selection itself is kept in the URL so scrubbing back restores it).
  const shownSel = sel && (selectable.includes(sel) || sel === 'stone') ? sel : null;

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
            </div>
            <div className="st-caption" aria-live="polite">
              <span className="st-caption-text">{phase.caption}</span>
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
          <p className="st-hint">{use3d ? 'Drag to look around, pinch or scroll to zoom. ' : ''}Tap a piece for its verses; once it is shattered it cannot be chosen — at the end only the stone remains.</p>
          <button type="button" className="st-openbtn" onClick={() => setSheetOpen(true)}>Pieces &amp; verses ↑</button>
        </section>

        <aside className={`st-panel${sheetOpen ? ' open' : ''}`}>
          <div className="st-sheet-bar"><span className="st-sheet-grip" /><button type="button" className="st-sheet-x" onClick={() => { setSheetOpen(false); }}>Model ×</button></div>
          <Card id={shownSel} selectable={selectable} ended={ended} onClose={() => select(null)} onPick={select} />
        </aside>
      </div>
    </div>
  );
}
