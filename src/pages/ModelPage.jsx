/**
 * ModelPage.jsx — a measured model's page, whatever the model (the bayath of
 * Yahawah, Yachazaqaal's house, the mashakan, a city): its stories as branch
 * pages, the WebGL scene or the flat sheet, the player, the chips, the panel
 * with the text and the card for a part. Everything that names the model comes
 * from its MODEL object (lib/models/*.js): the title, the stories, the card's
 * prose, the passages, the pieces. pages/Temple.jsx is one line on this.
 *
 * Route: <base>/:story   ?piece=<id>  ?view=3d|2d   (<base> itself is the chooser, ModelIndex.jsx)
 *
 * - Stories on ONE model: a guided story (the camera and the captions follow the
 *   text; the scrub bar moves it), and ROAM, no story: the finished model, the
 *   viewer walking where they will (drag to look, keys or the pad to walk, a
 *   door tapped twice opens and lets them through).
 * - Two renderers of it: the WebGL scene (three.js, lazy) and the flat sheet
 *   (a plan and a section, no library, the fallback without WebGL).
 * - The panel opens on the TEXT with every word that names a part clickable;
 *   choosing a part by any route (the model, a chip, a word) lights its words
 *   and edges its verses.
 * - The card for a part: its words (transliteration, paleo, meaning), what the
 *   text measures (each measure with its verse), the same thing elsewhere in
 *   scripture, and — plainly — what the text does not say and the model assumed.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { PassageRefs, Glossed } from '../components/PassageRefs.jsx';
import { usePlayer, Section, WordRow, ModelPassage, Caption, PaceSelect, CanvasSubtitles, SubtitlesToggle, useSubtitles } from '../components/ModelKit.jsx';
import ModelSheet from '../components/ModelSheet.jsx';
import { STORY_ICONS } from '../components/ModelStories.jsx';
import './Temple.css';

const ModelScene = lazy(() => import('../components/ModelScene.jsx'));

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch { return false; }
}
const VIEWS = ['3d', '2d'];
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // a touch screen
const timelinesOf = (model) => Object.fromEntries(Object.keys(model.MODES).map((k) => [k, { key: k, duration: model.MODES[k].duration, phases: model.MODES[k].phases, phaseAt: (t) => model.phaseAt(k, t) }]));

// ── Detail card ──────────────────────────────────────────────────────────────
function Card({ model, id, mode, onClose, onPick }) {
  const { WORDS, GROUPS, pieceById, pieceForWord, passagesFor, refsFor, card } = model;
  const item = pieceById(id);
  const onVerses = useMemo(() => new Set(item ? item.on : []), [item]);
  const pieceFor = useCallback((w, p, n) => pieceForWord(w, p.bookId, p.chapter, n), [pieceForWord]);
  const titleFor = useCallback((pid) => pieceById(pid)?.title, [pieceById]);
  const extras = (!item && card.extras?.(mode)) || [];
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
          <div className="st-detail-sub">{card.subtitle(mode)}</div>
          <h2 className="st-card-title"><Glossed text={card.title} /></h2>
          <p className="st-card-p"><Glossed text={card.intro(mode)} /></p>
        </div>
      )}

      <Section id="scripture" title="Scripture" sub={`${card.subtitle(mode)} · the text itself`} storageKey="tp-sec">
        <ModelPassage passages={passagesFor(mode)} selected={id} onPick={onPick} onVerses={onVerses} pieceFor={pieceFor} titleFor={titleFor} allRefs={refsFor(mode)} />
      </Section>

      <Section id="details" title="Details" sub={item ? 'what the text measures · elsewhere in scripture · what is assumed' : 'choose a part'} storageKey="tp-sec">
        {!item && <p className="st-card-p">{card.choose || 'Tap a part of the model, one of the chips under it, or a marked word in the text for its measures, verse by verse, the same thing elsewhere in scripture, and what the model had to assume where the text is silent.'}</p>}
        {extras.map((x) => (
          <div key={x.heading}>
            <div className="st-detail-sub">{x.heading}</div>
            <div className="st-par">
              <p><Glossed text={x.text} /></p>
              <PassageRefs refs={x.refs} size="sm" />
            </div>
          </div>
        ))}
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
            {item.idealized && (<>
              <div className="st-detail-sub tp-ideal-sub"><span className="tp-ideal-swatch" aria-hidden="true" />Idealized <em>(sketched in, paled and see-through on the model)</em></div>
              <p className="st-trad"><Glossed text={item.idealized} /></p>
            </>)}
          </>
        )}
      </Section>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
export default function ModelPage({ model }) {
  const { MODES, SPEEDS, CHIP_ORDER, pieceById, marksFor, base, strings = {} } = model;
  usePageTitle(pageTitle(`${model.title} — Maps & Models`), model.description);
  const TIMELINES = useMemo(() => timelinesOf(model), [model]);
  const PIECE_IDS = useMemo(() => model.PIECES.map((p) => p.id), [model]);
  const [params] = useSearchParams();
  const { story } = useParams();
  const canGL = useMemo(webglAvailable, []);
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : (canGL ? '3d' : '2d');
  const mode = MODES[story] ? story : model.defaultStory;
  useEffect(() => { if (MODES[story]) { try { sessionStorage.setItem(`${model.id}-story`, story); } catch { /* fine */ } } }, [story, model.id]);
  const [lock, setLock] = useState(null);   // on foot: { on, why } — a word under the view on whether the mouse is taken
  const [glOk, setGlOk] = useState(true);
  const sel = PIECE_IDS.includes(params.get('piece')) ? params.get('piece') : null;
  const sceneApi = useRef(null);
  // "tap to go on" also brings the view back to where the story is: what the next caption tells is then in front of the reader
  const player = usePlayer(TIMELINES[mode], { onContinue: () => sceneApi.current?.follow?.() });
  const { clock, playing, speed, setSpeed, loop, setLoop, phase, play, pause, seek, restart, scrubRef, timeRef, hold, continueNow } = player;
  const [sheetOpen, setSheetOpen] = useState(!!sel);
  const [sheetTall, setSheetTall] = useState(false);   // on foot the sheet stays low so the view stays in sight (fieldy); a drag up on its grip makes it tall
  const [following, setFollowing] = useState(true);
  const subs = useSubtitles();
  const [scrubbed, setScrubbed] = useState(null);   // the pane the reader scrubbed to: its subtitles run though the story is not playing   // the caption spoken into the scene, word by word

  const navigate = useNavigate();
  const setParam = useCallback((k, v) => {
    const q = new URLSearchParams(params);
    if (v == null || v === '') q.delete(k); else q.set(k, v);
    // the story's own absolute path, never a relative "?…" — on foot must stay on foot whatever is picked
    navigate(`${base}/${MODES[story] ? story : model.defaultStory}${q.toString() ? `?${q}` : ''}`, { replace: true });
  }, [params, navigate, story, base, MODES, model.defaultStory]);
  const select = useCallback((id) => { setParam('piece', id); setSheetOpen(!!id); }, [setParam]);

  const panelRef = useRef(null), grip = useRef(null);
  const onGripDown = (e) => { if (e.target.closest('button')) return; grip.current = { y: e.clientY, dy: 0 }; e.currentTarget.setPointerCapture?.(e.pointerId); if (panelRef.current) panelRef.current.style.transition = 'none'; };
  const onGripMove = (e) => { const g = grip.current; if (!g) return; g.dy = e.clientY - g.y; if (panelRef.current) panelRef.current.style.transform = `translateY(${Math.max(0, g.dy)}px)`; };
  const onGripUp = () => { const g = grip.current; if (!g) return; grip.current = null; const el = panelRef.current; if (el) { el.style.transition = ''; el.style.transform = ''; } if (g.dy > 70) { if (sheetTall) setSheetTall(false); else setSheetOpen(false); } else if (g.dy < -40) setSheetTall(true); };

  useEffect(() => { document.body.classList.add('st-body'); return () => document.body.classList.remove('st-body'); }, []);

  const use3d = view === '3d' && canGL && glOk;
  const D = MODES[mode].duration;
  const roam = !!MODES[mode].free;
  const onPlayPause = () => (playing ? pause() : play());
  // Moving the timeline hands the camera back to the story: whatever the viewer
  // had picked or dragged to, a scrub means "show me what happens here". A still
  // slider leaves their selection and free look alone.
  const rejoin = useCallback(() => { if (sel) select(null); if (!following) sceneApi.current?.follow?.(); }, [sel, following, select]);
  const seekAlong = useCallback((t) => { rejoin(); seek(t); setScrubbed(TIMELINES[mode].phaseAt(Math.max(0, Math.min(D, t))).key); }, [rejoin, seek, TIMELINES, mode, D]);
  const onScrub = (e) => seekAlong((+e.target.value / 1000) * D);
  const onRestart = () => { rejoin(); restart(); };
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
      if (roam) return;   // the roam has the keys (walking)
      if (e.key === 'Enter' && hold) { e.preventDefault(); continueNow(); return; }
      if (e.key === ' ') { e.preventDefault(); if (hold) continueNow(); else playing ? pause() : play(); }
      else if (e.key === 'ArrowLeft') seekAlong(clock.t - 0.5);
      else if (e.key === 'ArrowRight') seekAlong(clock.t + 0.5);
      else if (e.key === 'Home') seekAlong(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const marks = useMemo(() => marksFor(mode), [mode, marksFor]);
  const storyOf = model.stories.find((s) => s.modes.includes(mode)) || model.stories[model.stories.length - 1];
  const StoryIcon = STORY_ICONS[storyOf.icon] || STORY_ICONS.walk;
  const walkPair = storyOf.modes.filter((k) => MODES[k]);   // [guided, roam] when the story has both
  if (!MODES[story]) { let last = null; try { last = sessionStorage.getItem(`${model.id}-story`); } catch { /* fine */ } return <Navigate to={MODES[last] ? `${base}/${last}${params.toString() ? `?${params}` : ''}` : `${base}${params.toString() ? `?${params}` : ''}`} replace />; }

  return (
    <div className={`st-page tp-page${sheetOpen ? ' st-sheet-open' : ''}${roam ? ' tp-roam' : ''}${sheetTall ? ' st-sheet-tall' : ''}`}>
      <header className="st-top">
        <Link to={base} className="st-back" title={strings.storiesTitle || 'The model\'s stories'}>←</Link>
        <nav className="tp-nav" aria-label="Elsewhere">
          <Link to="/landing" className="tp-nav-home" title="Home">𐤀𐤁</Link>
          <Link to="/models" title="Maps &amp; Models — the other models">Models</Link>
        </nav>
        <div className="st-h1wrap">
          <h1 className="st-h1">{model.title}</h1>
          <span className="st-h1-paleo" dir="rtl" aria-hidden="true">{model.paleo}</span>
        </div>
        <span className="tp-top-break" aria-hidden="true" />
        <Link to={base} className="tp-story" title={`This story — tap for the others (${model.stories.map((s) => s.label).join(', ')})`}><StoryIcon width="22" height="22" /><span>{storyOf.label}</span></Link>
        {walkPair.length > 1 && (
          <div className="st-views tp-modes" role="group" aria-label="How to walk">
            {walkPair.map((k) => <Link key={k} to={`${base}/${k}${params.toString() ? `?${params}` : ''}`} className={`st-view${mode === k ? ' on' : ''}`} title={MODES[k].free ? 'On your own feet: go where you will' : (strings.guidedTitle || 'Guided: verse by verse')}>{MODES[k].free ? 'On foot' : 'Guided'}</Link>)}
          </div>
        )}
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
                ? <Suspense fallback={<div className="st-loading">Loading the 3D model…</div>}><ModelScene model={model} clock={clock} mode={mode} selected={sel} onSelect={select} onFollow={setFollowing} onLock={(on, why) => setLock({ on, why, at: Date.now() })} apiRef={sceneApi} onReady={(ok) => { if (!ok) setGlOk(false); }} /></Suspense>
                : <ModelSheet model={model} clock={clock} mode={mode} selected={sel} onSelect={select} />}
              {use3d && roam && (
                <div className="tp-pad" aria-label="Walk">
                  {[['forward', '▲', 'Walk forward (W / ↑)'], ['turnL', '◀', 'Turn left (←)'], ['back', '▼', 'Walk back (S / ↓)'], ['turnR', '▶', 'Turn right (→)'], ['jump', '⤒', 'Jump (space)']].map(([k, ch, tt]) => (
                    <button key={k} type="button" className={`tp-pad-${k}`} title={tt} aria-label={tt}
                      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); sceneApi.current?.move?.(k, true); }}
                      onPointerUp={() => sceneApi.current?.move?.(k, false)} onPointerCancel={() => sceneApi.current?.move?.(k, false)} onLostPointerCapture={() => sceneApi.current?.move?.(k, false)}
                      onContextMenu={(e) => e.preventDefault()}>{ch}</button>
                  ))}
                </div>
              )}
              {!roam && <CanvasSubtitles phase={phase} on={subs.on} move={subs.move} rot={subs.rot} playing={playing} scrubbed={scrubbed} report={(v) => { player.subs.current = v; }} />}
              {use3d && !roam && !following && <button type="button" className="tp-follow" onClick={() => sceneApi.current?.refocus?.()} title={sel ? 'Recentre on the chosen part' : 'Recentre on where the story is'}>⌖ refocus</button>}
              <div className="st-strip" role="toolbar" aria-label={strings.parts || 'Parts of the model'}>
                {CHIP_ORDER.map((id) => pieceById(id)).filter((p) => p && (!p.modes || p.modes.includes(mode))).map((p) => (
                  <button key={p.id} type="button" className={`st-chip${sel === p.id ? ' on' : ''}`} onClick={() => select(sel === p.id ? null : p.id)} title={p.title}>
                    <Glossed text={p.tag.split(' · ')[0]} />
                  </button>
                ))}
              </div>
            </div>
            <Caption player={player} phase={phase} render={(t) => <Glossed text={t} />} />
          </div>

          {roam ? (
            <div className="st-player tp-roambar">
              {use3d && <button type="button" className="tp-reset" onClick={() => sceneApi.current?.reset?.()} title="Back to the start, outside the gate, every door and gate as at the first">↺ Start over</button>}
              <span className="tp-roam-hint">{!use3d ? 'The plan and section show the finished model; switch to 3D to walk it.' : COARSE ? 'A thumb in the ring, bottom left: a stick to walk · a finger anywhere else: drag to look · two fingers: pinch to see yourself, spread to look through your eyes · ⤒ jumps · tap a part for its details, a door or a gate twice to open or shut it' : lock?.on ? 'The mouse is yours: move it to look, W A S D or the arrows to walk (Shift to run, space to jump), click what the crosshair is on for its details, a door or a gate twice to open or shut it · the wheel pulls the view back to see yourself, forward again into your eyes · M shows the whole map: tap a place on it and you are walked there · Esc gives the mouse back' : lock?.why ? `The browser would not hand over the mouse (${lock.why}) — drag the view to look instead · W A S D or the arrows to walk · click a part for its details` : 'Click the view once to take the mouse (nothing is chosen by that click) · then move it to look, W A S D or the arrows to walk, ← → turn, Shift to run, space to jump · click what the crosshair is on for its details, a door or a gate twice to open or shut it · the wheel pulls the view back to see yourself · M shows the whole map: tap a place on it and you are walked there · Esc gives the mouse back'}</span>
            </div>
          ) : (
          <div className="st-player">
            <button type="button" className="st-play" onClick={onPlayPause} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
            <button type="button" className="st-restart" onClick={onRestart} aria-label="Play from the beginning" title="From the beginning">↺</button>
            <div className="st-scrubwrap">
              <input ref={scrubRef} id="tp-scrub" type="range" min="0" max="1000" defaultValue="0" step="1" onInput={onScrub} className="st-scrub" aria-label={`Scrub through the ${storyOf.label.toLowerCase()}`} />
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
              <PaceSelect player={player} id="tp-pace" />
              <label className="st-loop"><input id="tp-loop" type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> repeat</label>
              <SubtitlesToggle subs={subs} id="tp-subs" />
            </div>
          </div>
          )}
          <p className="st-hint">{use3d && !roam ? 'Left-drag to orbit, scroll to zoom, right-drag to pan — the view only moves when you move it. A click on a part opens its card where you stand; a chip or a word flies to it; move the timeline, or tap to go on, and the story takes the camera back; "refocus" recentres. ' : ''}<Glossed text="Tap a part, a chip under it, or a word in the text for its measures and verses — one amah (cubit) in the text is one unit in the model." /></p>
          <button type="button" className="st-openbtn" onClick={() => setSheetOpen(true)}>Parts &amp; verses ↑</button>
        </section>

        <aside className={`st-panel${sheetOpen ? ' open' : ''}`} ref={panelRef}>
          <div className="st-sheet-bar" onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}>
            <span className="st-sheet-grip" /><button type="button" className="st-sheet-x" onClick={() => setSheetOpen(false)}>Model ×</button>
          </div>
          <Card model={model} id={sel} mode={mode} onClose={() => select(null)} onPick={select} />
        </aside>
      </div>
    </div>
  );
}
