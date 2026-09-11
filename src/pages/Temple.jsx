/**
 * Temple.jsx — "The House of Yahawah": the bayath (house) Shalamah (Solomon)
 * built (1 Kings 6–7; 2 Chronicles 3–4), its courts and the king's houses,
 * as an interactive model.
 *
 * Route: /models/temple   ?piece=<id>  ?view=3d|2d  ?mode=build|walk
 *
 * - Two stories on ONE model (lib/models/temple.js): BUILD, the chapters in
 *   their own order, the house rising as the scrub bar moves; WALK, in through
 *   the gate of the great court to the ark beneath the wings of the karawab.
 * - Two renderers of it: the WebGL scene (three.js, lazy) and the flat sheet
 *   (a plan and a section, no library, the fallback without WebGL).
 * - The panel opens on the TEXT — 1 Kings 6, 7, then 2 Chronicles 3, 4 — with
 *   every word that names a part of the house clickable; choosing a part by any
 *   route (the model, a chip, a word) lights its words and edges its verses.
 * - The card for a part: its words (transliteration, paleo, meaning), what the
 *   text measures (each measure with its verse), the same thing elsewhere in
 *   scripture, and — plainly — what the text does not say and the model assumed.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { PassageRefs, Glossed } from '../components/PassageRefs.jsx';
import { usePlayer, Section, WordRow, ModelPassage } from '../components/ModelKit.jsx';
import TempleSheet from '../components/TempleSheet.jsx';
import {
  PIECES, WORDS, MODES, SPEEDS, GROUPS, CHIP_ORDER, PASSAGES, ALL_REFS,
  phaseAt, pieceById, pieceForWord, marksFor,
} from '../lib/models/temple.js';
import './Temple.css';

const TempleScene = lazy(() => import('../components/TempleScene.jsx'));

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}
const VIEWS = ['3d', '2d'];
const PIECE_IDS = PIECES.map((p) => p.id);
const TIMELINES = Object.fromEntries(Object.keys(MODES).map((k) => [k, { key: k, duration: MODES[k].duration, phaseAt: (t) => phaseAt(k, t) }]));

// ── Detail card ──────────────────────────────────────────────────────────────
function Card({ id, mode, onClose, onPick }) {
  const item = pieceById(id);
  const onVerses = useMemo(() => new Set(item ? item.on : []), [item]);
  const pieceFor = useCallback((w, p, n) => pieceForWord(w, p.bookId, p.chapter, n), []);
  const titleFor = useCallback((pid) => pieceById(pid)?.title, []);
  return (
    <div className="st-card">
      {item ? (
        <>
          <div className="st-card-h">
            <div className="st-detail-sub"><Glossed text={GROUPS[item.group]} /> · {item.refs}</div>
            <h2 className="st-card-title"><Glossed text={item.title} /></h2>
            <button type="button" className="st-card-x" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="st-words">
            {item.words.map((k) => WORDS[k] && <WordRow key={k} w={WORDS[k]} />)}
          </div>
        </>
      ) : (
        <div className="st-card-h">
          <div className="st-detail-sub">1 Kings 6–7 · 2 Chronicles 3–4</div>
          <h2 className="st-card-title"><Glossed text="The bayath (house) Shalamah (Solomon) banah (built) for Yahawah" /></h2>
          <p className="st-card-p"><Glossed text={mode === 'build' ? 'Play, and the house rises in the order the text gives it: the yasad (foundation), the qayarawath (walls) of aban (stone), araz (cedar) within, zahab (gold) over the araz (cedar), the karawab (cherubim), the doors, the chatzarawath (courts), the malak (king)\'s houses, Chayaram (Hiram)\'s nachashath (brass), and last the arawan (ark).' : 'Play, and walk in: through the gate of the gadawal (great) chatzar (court), past the mazabach (altar) and the yam (sea), between Yakayan (Jachin) and Baiz (Boaz), through the awalam (porch) and the dalathawath (doors), down the hayakal (temple) between the lampstands, through the parakath (veil) into the dabayar (oracle), beneath the kanapay (wings) of the karawab (cherubim).'} /></p>
        </div>
      )}

      <Section id="scripture" title="Scripture" sub="1 Kings 6–7 · 2 Chronicles 3–4 · the text itself" storageKey="tp-sec">
        <ModelPassage passages={PASSAGES} selected={id} onPick={onPick} onVerses={onVerses} pieceFor={pieceFor} titleFor={titleFor} allRefs={ALL_REFS} />
      </Section>

      <Section id="details" title="Details" sub={item ? 'what the text measures · elsewhere in scripture · what is assumed' : 'choose a part'} storageKey="tp-sec">
        {!item && <p className="st-card-p">Tap a part of the house, one of the chips under it, or a marked word in the text for its measures, verse by verse, the same thing elsewhere in scripture, and what the model had to assume where the text is silent.</p>}
        {item && (
          <>
            <div className="st-detail-sub">What the text gives</div>
            <table className="tp-measures">
              <tbody>
                {item.measures.map(([k, v, ref], i) => (
                  <tr key={i}><th><Glossed text={k} /></th><td><Glossed text={v} /></td><td className="tp-measures-ref">{ref}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="st-card-p tp-note"><Glossed text={item.note} /></p>
            <PassageRefs refs={item.refs} size="sm" />

            <div className="st-detail-sub">Elsewhere in scripture</div>
            <div className="st-par">
              <p><Glossed text={item.elsewhere.note} /></p>
              <PassageRefs refs={item.elsewhere.ref} size="sm" />
            </div>

            <div className="st-detail-sub">Not in the text <em>(what the model assumed)</em></div>
            <p className="st-trad"><Glossed text={item.assumed} /></p>
          </>
        )}
      </Section>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
export default function Temple() {
  usePageTitle(pageTitle('The House of Yahawah — Maps & Models'), 'The bayath (house) Shalamah (Solomon) banah (built) for Yahawah (1 Kings 6–7; 2 Chronicles 3–4) as an interactive 3D model, measured in amah (cubits) from the text: the hayakal (temple) and the dabayar (oracle) with the karawab (cherubim), Yakayan (Jachin) and Baiz (Boaz), the yam (sea) on twelve oxen, the makanawath (bases), the chatzarawath (courts) and the malak (king)\'s houses. Watch it rise in the order the text gives, or walk in to the arawan (ark).');
  const [params, setParams] = useSearchParams();
  const canGL = useMemo(webglAvailable, []);
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : (canGL ? '3d' : '2d');
  const mode = MODES[params.get('mode')] ? params.get('mode') : 'walk';
  const [glOk, setGlOk] = useState(true);
  const sel = PIECE_IDS.includes(params.get('piece')) ? params.get('piece') : null;
  const player = usePlayer(TIMELINES[mode]);
  const { clock, playing, speed, setSpeed, loop, setLoop, phase, play, pause, seek, restart, scrubRef, timeRef } = player;
  const [sheetOpen, setSheetOpen] = useState(!!sel);
  const [following, setFollowing] = useState(true);
  const sceneApi = useRef(null);

  const setParam = useCallback((k, v) => {
    const q = new URLSearchParams(params);
    if (v == null || v === '') q.delete(k); else q.set(k, v);
    setParams(q, { replace: true });
  }, [params, setParams]);
  const select = useCallback((id) => { setParam('piece', id); setSheetOpen(!!id); }, [setParam]);

  const panelRef = useRef(null), grip = useRef(null);
  const onGripDown = (e) => { if (e.target.closest('button')) return; grip.current = { y: e.clientY, dy: 0 }; e.currentTarget.setPointerCapture?.(e.pointerId); if (panelRef.current) panelRef.current.style.transition = 'none'; };
  const onGripMove = (e) => { const g = grip.current; if (!g) return; g.dy = Math.max(0, e.clientY - g.y); if (panelRef.current) panelRef.current.style.transform = `translateY(${g.dy}px)`; };
  const onGripUp = () => { const g = grip.current; if (!g) return; grip.current = null; const el = panelRef.current; if (el) { el.style.transition = ''; el.style.transform = ''; } if (g.dy > 70) setSheetOpen(false); };

  useEffect(() => { document.body.classList.add('st-body'); return () => document.body.classList.remove('st-body'); }, []);

  const use3d = view === '3d' && canGL && glOk;
  const D = MODES[mode].duration;
  const onPlayPause = () => (playing ? pause() : play());
  const onScrub = (e) => seek((+e.target.value / 1000) * D);
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
      if (e.key === ' ') { e.preventDefault(); playing ? pause() : play(); }
      else if (e.key === 'ArrowLeft') seek(clock.t - 0.5);
      else if (e.key === 'ArrowRight') seek(clock.t + 0.5);
      else if (e.key === 'Home') seek(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const marks = useMemo(() => marksFor(mode), [mode]);

  return (
    <div className={`st-page tp-page${sheetOpen ? ' st-sheet-open' : ''}`}>
      <header className="st-top">
        <Link to="/models" className="st-back" title="Maps & Models">←</Link>
        <div className="st-h1wrap">
          <h1 className="st-h1">The House of Yahawah</h1>
          <span className="st-h1-paleo" dir="rtl" aria-hidden="true">𐤁𐤉𐤕 𐤉𐤄𐤅𐤄</span>
        </div>
        <div className="st-views tp-modes" role="group" aria-label="Story">
          {Object.keys(MODES).map((k) => <button key={k} type="button" className={`st-view${mode === k ? ' on' : ''}`} onClick={() => setParam('mode', k)} title={k === 'build' ? 'Watch the house rise, 1 Kings 6–7 in order' : 'Walk in, from the gate to the ark'}>{MODES[k].label}</button>)}
        </div>
        <div className="st-views" role="group" aria-label="View">
          <button type="button" className={`st-view${use3d ? ' on' : ''}`} onClick={() => setParam('view', '3d')} disabled={!canGL || !glOk} title={canGL && glOk ? 'Lit 3D model — drag to look around' : 'WebGL is not available in this browser'}>3D</button>
          <button type="button" className={`st-view${!use3d ? ' on' : ''}`} onClick={() => setParam('view', '2d')} title="Plan and section — light, prints, works anywhere">2D</button>
        </div>
      </header>

      <div className="st-main">
        <section className="st-stagewrap">
          <div className="st-stagebox">
            <div className="st-stage tp-stage">
              {use3d
                ? <Suspense fallback={<div className="st-loading">Loading the 3D model…</div>}><TempleScene clock={clock} mode={mode} selected={sel} onSelect={select} onFollow={setFollowing} apiRef={sceneApi} onReady={(ok) => { if (!ok) setGlOk(false); }} /></Suspense>
                : <TempleSheet clock={clock} mode={mode} selected={sel} onSelect={select} />}
              {use3d && !following && <button type="button" className="tp-follow" onClick={() => { select(null); sceneApi.current?.follow?.(); }} title="Hand the camera back to the story">⟲ follow the story</button>}
              <div className="st-strip" role="toolbar" aria-label="Parts of the house">
                {CHIP_ORDER.map((id) => pieceById(id)).filter(Boolean).map((p) => (
                  <button key={p.id} type="button" className={`st-chip${sel === p.id ? ' on' : ''}`} onClick={() => select(sel === p.id ? null : p.id)} title={p.title}>
                    <Glossed text={p.tag.split(' · ')[0]} />
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
              <input ref={scrubRef} id="tp-scrub" type="range" min="0" max="1000" defaultValue="0" step="1" onInput={onScrub} className="st-scrub" aria-label={mode === 'build' ? 'Scrub through the building' : 'Scrub through the walk'} />
              <div className="st-marks tp-marks" aria-hidden="true">
                {marks.map((m) => <span key={m.label + m.at} style={{ left: `${m.at * 100}%` }}>{m.label}</span>)}
              </div>
            </div>
            <span ref={timeRef} className="st-time">0.0 s</span>
            <div className="st-opts">
              <label className="st-speed">
                <span>speed</span>
                <select id="tp-speed" value={speed} onChange={(e) => setSpeed(+e.target.value)}>
                  {SPEEDS.map((s) => <option key={s} value={s}>{s === 0.25 ? '¼×' : s === 0.5 ? '½×' : `${s}×`}</option>)}
                </select>
              </label>
              <label className="st-loop"><input id="tp-loop" type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> repeat</label>
            </div>
          </div>
          <p className="st-hint">{use3d ? 'Drag to look around, scroll to zoom, right-drag to pan; the story takes the camera back when you choose "follow". ' : ''}<Glossed text="Tap a part, a chip under it, or a word in the text for its measures and verses — one amah (cubit) in the text is one unit in the model." /></p>
          <button type="button" className="st-openbtn" onClick={() => setSheetOpen(true)}>Parts &amp; verses ↑</button>
        </section>

        <aside className={`st-panel${sheetOpen ? ' open' : ''}`} ref={panelRef}>
          <div className="st-sheet-bar" onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}>
            <span className="st-sheet-grip" /><button type="button" className="st-sheet-x" onClick={() => setSheetOpen(false)}>Model ×</button>
          </div>
          <Card id={sel} mode={mode} onClose={() => select(null)} onPick={select} />
        </aside>
      </div>
    </div>
  );
}
