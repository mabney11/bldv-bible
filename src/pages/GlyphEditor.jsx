import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { useToast } from '../components/Toast.jsx';
import {
  getPaleoMode, setRenderMode, getPaleoConfig, setPaleoConfig,
  paleoToSVG, subscribe,
} from '../lib/paleoGlyphs.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './GlyphEditor.css';

const LETTERS = [
  { ch: '𐤀', name: 'Aleph' }, { ch: '𐤁', name: 'Beth'  }, { ch: '𐤂', name: 'Gimel' },
  { ch: '𐤃', name: 'Dalet' }, { ch: '𐤄', name: 'He'    }, { ch: '𐤅', name: 'Waw'   },
  { ch: '𐤆', name: 'Zayin' }, { ch: '𐤇', name: 'Heth'  }, { ch: '𐤈', name: 'Teth'  },
  { ch: '𐤉', name: 'Yod'   }, { ch: '𐤊', name: 'Kaph'  }, { ch: '𐤋', name: 'Lamed' },
  { ch: '𐤌', name: 'Mem'   }, { ch: '𐤍', name: 'Nun'   }, { ch: '𐤎', name: 'Samek' },
  { ch: '𐤏', name: 'Ayin'  }, { ch: '𐤐', name: 'Pe'    }, { ch: '𐤑', name: 'Tsade' },
  { ch: '𐤒', name: 'Qoph'  }, { ch: '𐤓', name: 'Resh'  }, { ch: '𐤔', name: 'Shin'  },
  { ch: '𐤕', name: 'Taw'   },
];
const VBW = 40, VBH = 48;
const LS_DESKTOP = 'paleo_glyphs_desktop';
const LS_MOBILE  = 'paleo_glyphs_mobile';

function loadModeStrokes(mode) {
  const key = mode === 'mobile' ? LS_MOBILE : LS_DESKTOP;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const p = JSON.parse(raw);
    const out = {};
    for (const [ch, arr] of Object.entries(p)) {
      out[ch] = arr.map(s => { const a = [...s.pts]; a._sw = s.sw; return a; });
    }
    return out;
  } catch { return {}; }
}
function persistModeStrokes(mode, strokes) {
  const key = mode === 'mobile' ? LS_MOBILE : LS_DESKTOP;
  const persisted = {};
  for (const [ch, arr] of Object.entries(strokes)) {
    if (arr && arr.length) persisted[ch] = arr.map(s => ({ pts: [...s], sw: s._sw || 3.5 }));
  }
  try { localStorage.setItem(key, JSON.stringify(persisted)); } catch { /* ignore */ }
}
function simplifyStroke(pts) {
  if (pts.length <= 45) return pts;
  const out = [pts[0]];
  const step = Math.ceil(pts.length / 45);
  for (let i = step; i < pts.length - 1; i += step) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}
function normalizeStrokes(strokes) {
  if (!strokes || !strokes.length) return strokes;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  strokes.forEach(s => s.forEach(p => {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }));
  const w = x1 - x0, h = y1 - y0;
  if (w < 0.5 || h < 0.5) return strokes;
  const pad = 3, tw = 34, th = 42;
  const sc = Math.min(tw / w, th / h);
  const ox = pad + (tw - w * sc) / 2;
  const oy = pad + (th - h * sc) / 2;
  return strokes.map(s => {
    const ns = s.map(p => ({ x: (p.x - x0) * sc + ox, y: (p.y - y0) * sc + oy }));
    ns._sw = s._sw;
    return ns;
  });
}
function strokesToSvgPaths(strokes) {
  return normalizeStrokes(strokes).map(pts => {
    if (!pts || pts.length < 2) return '';
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${pts._sw || 3.5}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
}

export default function GlyphEditor() {
  usePageTitle(pageTitle('Glyph Editor'));
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();
  const [mode, setMode] = useState(() => getPaleoMode());
  const [desktopStrokes, setDesktopStrokes] = useState(() => loadModeStrokes('desktop'));
  const [mobileStrokes,  setMobileStrokes]  = useState(() => loadModeStrokes('mobile'));
  const strokes    = mode === 'mobile' ? mobileStrokes : desktopStrokes;
  const setStrokes = mode === 'mobile' ? setMobileStrokes : setDesktopStrokes;
  const [cfg, setCfg] = useState(() => ({
    desktop: getPaleoConfig('desktop'),
    mobile:  getPaleoConfig('mobile'),
  }));
  const modeCfg = cfg[mode];

  const [curIdx, setCurIdx]           = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [strokeWidth, setStrokeWidth] = useState(3.5);
  const [straight, setStraight]       = useState(false);
  const [showRef,  setShowRef]        = useState(true);
  const [bakeOpen, setBakeOpen]       = useState(false);
  const [adminKey, setAdminKey]       = useState('');
  const undoRef = useRef([]);
  const curLetter = LETTERS[curIdx];
  const curStrokes = strokes[curLetter.ch] || [];

  useEffect(() => { persistModeStrokes('desktop', desktopStrokes); }, [desktopStrokes]);
  useEffect(() => { persistModeStrokes('mobile',  mobileStrokes);  }, [mobileStrokes]);
  useEffect(() => { setPaleoConfig(cfg.desktop, 'desktop'); }, [cfg.desktop]);
  useEffect(() => { setPaleoConfig(cfg.mobile,  'mobile');  }, [cfg.mobile]);
  useEffect(() => subscribe(m => setMode(m)), []);

  const switchMode = useCallback(m => { setRenderMode(m); setMode(m); }, []);

  // ─── CANVAS ───────────────────────────────────────────────────────────────
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 320, h: 384 });
  const recalcCanvasSize = useCallback(() => {
    const wrap = canvasRef.current?.parentElement;
    if (!wrap) return;
    const aw = wrap.clientWidth  - 16;
    const ah = wrap.clientHeight - 16;
    let w = aw, h = w * (VBH / VBW);
    if (h > ah) { h = ah; w = h * (VBW / VBH); }
    setCanvasSize({ w: Math.round(Math.max(w, 80)), h: Math.round(Math.max(h, 80)) });
  }, []);
  useEffect(() => {
    if (!overlayOpen) return;
    const t = requestAnimationFrame(recalcCanvasSize);
    const onResize = () => setTimeout(recalcCanvasSize, 80);
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(t); window.removeEventListener('resize', onResize); };
  }, [overlayOpen, recalcCanvasSize]);

  const drawingRef = useRef({ active: false, stroke: [], lastPt: null });
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { w, h } = canvasSize;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = '#181820'; ctx.lineWidth = 0.6;
    for (let i = 0; i <= 10; i++) {
      const x = i * w / 10;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = 0; i <= 12; i++) {
      const y = i * h / 12;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = '#20202e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
    const vb2px = (vx, vy) => ({ x: vx / VBW * w, y: vy / VBH * h });
    const tl = vb2px(3, 3), br = vb2px(37, 45);
    ctx.strokeStyle = '#1a2028'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.setLineDash([]);
    ctx.restore();

    if (showRef) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#4a9eff';
      const fontSize = h * 0.82;
      ctx.font = `${fontSize}px 'Segoe UI Historic','Segoe UI',serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(curLetter.ch, w/2, h * 0.92);
      ctx.restore();
    }

    const paint = (pts, color, lw) => {
      if (!pts || pts.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw / VBW * w;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      const f = vb2px(pts[0].x, pts[0].y);
      ctx.moveTo(f.x, f.y);
      for (let i = 1; i < pts.length; i++) {
        const p = vb2px(pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    };
    curStrokes.forEach(s => paint(s, '#e8e6e0', s._sw || 3.5));
    if (drawingRef.current.active && drawingRef.current.stroke.length > 1) {
      paint(drawingRef.current.stroke, '#4a9eff', strokeWidth);
    }
  }, [canvasSize, showRef, curLetter, curStrokes, strokeWidth]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  const onPointerDown = e => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    const px = { x: Math.max(0, Math.min(canvas.width, e.clientX - r.left)),
                 y: Math.max(0, Math.min(canvas.height, e.clientY - r.top)) };
    const v = { x: px.x / canvas.width * VBW, y: px.y / canvas.height * VBH };
    drawingRef.current = { active: true, stroke: [v], lastPt: v };
    drawCanvas();
  };
  const onPointerMove = e => {
    if (!drawingRef.current.active) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const px = { x: Math.max(0, Math.min(canvas.width, e.clientX - r.left)),
                 y: Math.max(0, Math.min(canvas.height, e.clientY - r.top)) };
    const v = { x: px.x / canvas.width * VBW, y: px.y / canvas.height * VBH };
    const d = drawingRef.current;
    if (straight) d.stroke = [d.stroke[0], v];
    else {
      const dx = v.x - d.lastPt.x, dy = v.y - d.lastPt.y;
      if (dx*dx + dy*dy > 0.025) { d.stroke.push(v); d.lastPt = v; }
    }
    drawCanvas();
  };
  const pushUndoSnapshot = () => {
    const snap = (curStrokes || []).map(s => { const c = [...s]; c._sw = s._sw; return c; });
    undoRef.current.push(snap);
    if (undoRef.current.length > 40) undoRef.current.shift();
  };
  const onPointerUp = e => {
    e.preventDefault();
    const d = drawingRef.current;
    if (!d.active) return;
    d.active = false;
    if (d.stroke.length < 2) { drawingRef.current.stroke = []; drawCanvas(); return; }
    pushUndoSnapshot();
    const pts = straight ? [...d.stroke] : simplifyStroke(d.stroke);
    pts._sw = strokeWidth;
    setStrokes(s => ({ ...s, [curLetter.ch]: [...(s[curLetter.ch] || []), pts] }));
    drawingRef.current.stroke = [];
  };

  const undo = useCallback(() => {
    if (!undoRef.current.length) return;
    const prev = undoRef.current.pop();
    setStrokes(s => ({ ...s, [curLetter.ch]: prev }));
  }, [setStrokes, curLetter.ch]);

  const clearCurrent = () => {
    if (!curStrokes.length) return;
    pushUndoSnapshot();
    setStrokes(s => ({ ...s, [curLetter.ch]: [] }));
    toast('Cleared', 'ok');
  };
  const revertCurrent = () => {
    if (!confirm(`Revert ${curLetter.name} to Unicode for ${mode}?`)) return;
    setStrokes(s => { const { [curLetter.ch]: _, ...rest } = s; return rest; });
    setCfg(c => {
      const next = { ...c[mode] };
      const { [curLetter.ch]: __, ...restChars } = next.chars;
      next.chars = restChars;
      return { ...c, [mode]: next };
    });
    toast(`Reverted (${mode})`, 'ok');
  };
  const revertAll = () => {
    if (!confirm(`Revert ALL ${mode} glyphs to Unicode?`)) return;
    setStrokes({});
    setCfg(c => ({ ...c, [mode]: { ...c[mode], chars: {} } }));
    toast(`All reverted (${mode})`, 'ok');
  };

  const charCfg  = modeCfg.chars[curLetter.ch] || {};
  const tx = charCfg.translateX ?? 0;
  const ty = charCfg.translateY ?? 0;
  const sx = charCfg.scaleX ?? 1;
  const sy = charCfg.scaleY ?? 1;
  // ml/mr — what we EXPOSE to the user is the effective margin (custom + delta),
  // since that's what the original UI showed and what's intuitive ("how much
  // gap will this letter have"). We store the delta internally so changing the
  // global custom gap recomputes the right value automatically.
  const ml = modeCfg.custom + (charCfg.marginL ?? 0);
  const mr = modeCfg.custom + (charCfg.marginR ?? 0);

  const updateCharCfg = (patch) => {
    setCfg(c => {
      const next = { ...c[mode] };
      next.chars = { ...next.chars, [curLetter.ch]: {
        scaleX: sx, scaleY: sy, translateX: tx, translateY: ty,
        marginL: (charCfg.marginL ?? 0), marginR: (charCfg.marginR ?? 0),
        ...patch,
      }};
      return { ...c, [mode]: next };
    });
  };
  const resetTransform = () => {
    setCfg(c => {
      const next = { ...c[mode] };
      const { [curLetter.ch]: _, ...rest } = next.chars;
      next.chars = rest;
      return { ...c, [mode]: next };
    });
    toast(`Transform reset (${mode})`, 'ok');
  };

  const tightCtx = useMemo(() => {
    const prev1 = curIdx > 0 ? LETTERS[curIdx-1].ch : '';
    const next1 = curIdx < LETTERS.length-1 ? LETTERS[curIdx+1].ch : '';
    return prev1 + curLetter.ch + next1;
  }, [curIdx, curLetter, cfg, strokes]);
  const wideCtx = useMemo(() => {
    const prev2 = curIdx > 1 ? LETTERS[curIdx-2].ch : '';
    const prev1 = curIdx > 0 ? LETTERS[curIdx-1].ch : '';
    const next1 = curIdx < LETTERS.length-1 ? LETTERS[curIdx+1].ch : '';
    const next2 = curIdx < LETTERS.length-2 ? LETTERS[curIdx+2].ch : '';
    return prev2 + prev1 + curLetter.ch + next1 + next2;
  }, [curIdx, curLetter, cfg, strokes]);

  const doneCount = useMemo(
    () => LETTERS.filter(l => (strokes[l.ch] || []).length > 0).length,
    [strokes]
  );

  const openLetter = idx => { setCurIdx(idx); undoRef.current = []; setOverlayOpen(true); };
  const nextLetter = () => { if (curIdx < LETTERS.length-1) { setCurIdx(curIdx + 1); undoRef.current = []; } };
  const prevLetter = () => { if (curIdx > 0)                { setCurIdx(curIdx - 1); undoRef.current = []; } };

  const doServerSave = async () => {
    const key = adminKey.trim();
    if (!key) { toast('Enter admin key', 'err'); return; }
    try {
      const js = makeBakedJs(desktopStrokes, mobileStrokes, cfg);
      const r = await fetch('/api/admin/save-glyphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, js }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || r.status);
      setBakeOpen(false); setAdminKey('');
      toast('Baked to server ✓', 'ok');
    } catch (e) { toast(`Failed: ${e.message}`, 'err'); }
  };

  return (
    <div className="ge-shell">
      <header className="ge-header">
        <Link to="/landing" className="ge-logo">𐤀𐤁</Link>
        <h1 className="ge-title">Glyph Editor</h1>
        <div className="ge-mode-toggle">
          <button className={`ge-mode-btn ${mode === 'desktop' ? 'active' : ''}`} onClick={() => switchMode('desktop')}>🖥 Desktop</button>
          <button className={`ge-mode-btn ${mode === 'mobile'  ? 'active' : ''}`} onClick={() => switchMode('mobile')}>📱 Mobile</button>
        </div>
        <span className="ge-prog">{doneCount}/22</span>
        <span className="ge-spacer" />
        <button className="txt-btn" onClick={revertAll}>Revert all ({mode})</button>
        <button className="txt-btn ge-btn-pri" onClick={() => setBakeOpen(true)}>⬆ Bake to server</button>
        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className="ge-ctrlbar">
        <div className="ge-cr">
          <label>Custom-glyph gap</label>
          <input
            type="range" min={-10} max={10} step={0.5}
            value={modeCfg.custom}
            onChange={e => setCfg(c => ({ ...c, [mode]: { ...c[mode], custom: parseFloat(e.target.value) }}))}
          />
          <span className="ge-cv">{modeCfg.custom}px</span>
        </div>
        <div className="ge-cr">
          <label>Unicode-fallback gap</label>
          <input
            type="range" min={-10} max={10} step={0.5}
            value={modeCfg.unicode}
            onChange={e => setCfg(c => ({ ...c, [mode]: { ...c[mode], unicode: parseFloat(e.target.value) }}))}
          />
          <span className="ge-cv">{modeCfg.unicode}px</span>
        </div>
      </div>

      <div className="ge-prevstrip">
        <span style={{ color: 'var(--text3)', marginRight: 10 }}>Sample:</span>
        <span
          className="ge-prev-sample"
          dangerouslySetInnerHTML={{ __html:
            paleoToSVG('𐤁𐤓𐤀𐤔𐤉𐤕', '24px') + '&nbsp;' +
            paleoToSVG('𐤁𐤓𐤀', '24px') + '&nbsp;' +
            paleoToSVG('𐤀𐤋𐤄𐤉𐤌', '24px')
          }}
        />
      </div>

      <div className="ge-body">
        <div className="ge-grid">
          {LETTERS.map((l, i) => {
            const has = (strokes[l.ch] || []).length > 0;
            return (
              <button key={l.ch} className={`ge-lcard ${has ? 'ge-done' : ''}`} onClick={() => openLetter(i)}>
                {has ? (
                  <svg viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" style={{ color: '#e8e6e0' }}
                       dangerouslySetInnerHTML={{ __html: strokesToSvgPaths(strokes[l.ch]) }} />
                ) : (
                  <div className="ge-ucglyph">{l.ch}</div>
                )}
                <span className="ge-ln">{l.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {overlayOpen && (
        <div className="ge-overlay">
          <div className="ge-ov-hdr">
            <button className="txt-btn" onClick={() => setOverlayOpen(false)}>← Back</button>
            <span className="ge-ov-title">{curLetter.name} · {curLetter.ch}</span>
            <span className="ge-spacer" />
            <button className="txt-btn" onClick={undo}>↶ Undo</button>
            <button className="txt-btn" onClick={clearCurrent}>Clear</button>
            <button className="txt-btn ge-btn-dan" onClick={revertCurrent}>Revert</button>
          </div>
          <div className="ge-ov-tools">
            <label className="ge-tool">
              <span>Stroke</span>
              <input type="range" min={1} max={10} step={0.5}
                value={strokeWidth} onChange={e => setStrokeWidth(parseFloat(e.target.value))} />
              <span className="ge-cv">{strokeWidth}</span>
            </label>
            <label className="ge-checktool">
              <input type="checkbox" checked={straight} onChange={e => setStraight(e.target.checked)} />
              Straight lines
            </label>
            <label className="ge-checktool">
              <input type="checkbox" checked={showRef} onChange={e => setShowRef(e.target.checked)} />
              Reference letter
            </label>
          </div>

          <div className="ge-ov-body">
            <div className="ge-ov-left">
              <canvas
                ref={canvasRef}
                width={canvasSize.w} height={canvasSize.h}
                className="ge-canvas"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onTouchStart={e => e.preventDefault()}
                onTouchMove={e => e.preventDefault()}
              />
            </div>
            <aside className="ge-ov-right">
              <div className="ge-tx-panel">
                <h3>Transform</h3>
                <TxRow label="Move X (left / right)" min={-20} max={20} step={0.5}
                  value={tx} format={v => v} onChange={v => updateCharCfg({ translateX: v })} />
                <TxRow label="Move Y (up / down)" min={-20} max={20} step={0.5}
                  value={ty} format={v => v} onChange={v => updateCharCfg({ translateY: v })} />
                <TxRow label="Scale X (width)" min={0.4} max={1.8} step={0.02}
                  value={sx} format={v => v.toFixed(2) + '×'} onChange={v => updateCharCfg({ scaleX: v })} />
                <TxRow label="Scale Y (height)" min={0.4} max={1.8} step={0.02}
                  value={sy} format={v => v.toFixed(2) + '×'} onChange={v => updateCharCfg({ scaleY: v })} />
                <TxRow label="Left margin (effective)" min={-10} max={10} step={0.5}
                  value={ml} format={v => v + 'px'} onChange={v => updateCharCfg({ marginL: v - modeCfg.custom })} />
                <TxRow label="Right margin (effective)" min={-10} max={10} step={0.5}
                  value={mr} format={v => v + 'px'} onChange={v => updateCharCfg({ marginR: v - modeCfg.custom })} />
                <button className="txt-btn" onClick={resetTransform} style={{ width: '100%', marginTop: 4 }}>
                  Reset transform
                </button>
              </div>
              <div className="ge-ctx">
                <div className="ge-ctx-label">In context (tight):</div>
                <div className="ge-ctx-sample" style={{ fontSize: 36 }}
                  dangerouslySetInnerHTML={{ __html: paleoToSVG(tightCtx, '1em') }} />
                <div className="ge-ctx-label" style={{ marginTop: 8 }}>Wider context:</div>
                <div className="ge-ctx-sample" style={{ fontSize: 28 }}
                  dangerouslySetInnerHTML={{ __html: paleoToSVG(wideCtx, '1em') }} />
              </div>
            </aside>
          </div>
          <div className="ge-ov-ftr">
            <button className="txt-btn" disabled={curIdx === 0} onClick={prevLetter}>◀ Prev</button>
            <span className="ge-spacer" style={{ textAlign: 'center' }}>{curIdx + 1} / {LETTERS.length}</span>
            <button className="txt-btn" disabled={curIdx === LETTERS.length-1} onClick={nextLetter}>Next ▶</button>
          </div>
        </div>
      )}

      {bakeOpen && (
        <div className="ge-modal-bg" onClick={() => setBakeOpen(false)}>
          <div className="ge-modal" onClick={e => e.stopPropagation()}>
            <h2>⬆ Bake to server</h2>
            <p>Writes drawings + spacing to <code>public/paleo-glyphs.js</code> as the default for all users.</p>
            <input type="password" placeholder="Admin key…" value={adminKey}
              onChange={e => setAdminKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doServerSave(); }} />
            <div className="ge-modal-row">
              <button className="txt-btn" onClick={() => setBakeOpen(false)}>Cancel</button>
              <button className="txt-btn ge-btn-suc" onClick={doServerSave}>Save to server</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TxRow({ label, min, max, step, value, format, onChange }) {
  return (
    <div className="ge-tx-row">
      <div className="ge-tx-label">{label}</div>
      <div className="ge-tx-ctrl">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))} />
        <span className="ge-tv">{format(value)}</span>
      </div>
    </div>
  );
}

function makeBakedJs(desktopStrokes, mobileStrokes, cfg) {
  const entries = (store) =>
    LETTERS.map(l => `'${l.ch}':${JSON.stringify(strokesToSvgPaths(store[l.ch] || []))},`).join('\n');
  const dskEntries = entries(desktopStrokes);
  const mobEntries = entries(mobileStrokes);
  const dskCfg = JSON.stringify(cfg.desktop);
  const mobCfg = JSON.stringify(cfg.mobile);
  return `/* paleo-glyphs.js — baked by GlyphEditor */
(function(){
var VB='0 0 40 48';
var LS_DESKTOP='paleo_glyphs_desktop',LS_MOBILE='paleo_glyphs_mobile',LS_CFG='paleo_glyph_config',LS_MODE='paleo_render_mode';
var _mode=(function(){try{var s=localStorage.getItem(LS_MODE);if(s==='desktop'||s==='mobile')return s;}catch(e){}var d=window.innerWidth<=768?'mobile':'desktop';try{localStorage.setItem(LS_MODE,d);}catch(e){}return d;})();
function getMode(){return _mode;}
function setRenderMode(m){if(m!=='desktop'&&m!=='mobile')return;_mode=m;try{localStorage.setItem(LS_MODE,m);}catch(e){}applyCss();refreshPage();}
var SERVER_CFG={desktop:${dskCfg},mobile:${mobCfg}};
var _cfg={desktop:JSON.parse(JSON.stringify(SERVER_CFG.desktop)),mobile:JSON.parse(JSON.stringify(SERVER_CFG.mobile))};
function loadCfg(){try{var r=localStorage.getItem(LS_CFG);if(r){var p=JSON.parse(r);if(p.desktop)_cfg.desktop=Object.assign({custom:0,unicode:0,chars:{}},p.desktop);if(p.mobile)_cfg.mobile=Object.assign({custom:0,unicode:0,chars:{}},p.mobile);}}catch(e){}}
function saveCfg(){try{localStorage.setItem(LS_CFG,JSON.stringify(_cfg));}catch(e){}applyCss();}
function applyCss(){var c=_mode==='mobile'?_cfg.mobile:_cfg.desktop;document.documentElement.style.setProperty('--pg-gap-custom',c.custom+'px');document.documentElement.style.setProperty('--pg-gap-unicode',c.unicode+'px');document.querySelectorAll('.pg-mode-badge').forEach(function(el){el.textContent=_mode==='mobile'?'📱 Mobile':'🖥 Desktop';el.dataset.mode=_mode;});}
function refreshPage(){window.dispatchEvent(new CustomEvent('paleoModeChange',{detail:{mode:_mode}}));}
var SG_DESKTOP={${dskEntries}};
var SG_MOBILE={${mobEntries}};
var UG_DESKTOP={},UG_MOBILE={};
function loadUG(){function load(key,store){try{var r=localStorage.getItem(key);if(!r)return;var p=JSON.parse(r);Object.keys(p).forEach(function(ch){store[ch]=p[ch].map(function(s){var a=s.pts.slice();a._sw=s.sw;return a;});});}catch(e){}}load(LS_DESKTOP,UG_DESKTOP);load(LS_MOBILE,UG_MOBILE);}
function norm(s){if(!s||!s.length)return s;var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;s.forEach(function(k){k.forEach(function(p){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);});});var sw=x1-x0,sh=y1-y0;if(sw<.5||sh<.5)return s;var pad=3,tw=34,th=42,sc=Math.min(tw/sw,th/sh),ox=pad+(tw-sw*sc)/2,oy=pad+(th-sh*sc)/2;return s.map(function(k){var ns=k.map(function(p){return{x:(p.x-x0)*sc+ox,y:(p.y-y0)*sc+oy};});ns._sw=k._sw;return ns;});}
function s2svg(st){return norm(st).map(function(pts){if(!pts||pts.length<2)return'';var d=pts.map(function(p,i){return(i?'L':'M')+p.x.toFixed(2)+','+p.y.toFixed(2);}).join(' ');return'<path d="'+d+'" fill="none" stroke="currentColor" stroke-width="'+(pts._sw||3.5)+'" stroke-linecap="round" stroke-linejoin="round"/>';}).join('');}
function resolve(ch){var UG=_mode==='mobile'?UG_MOBILE:UG_DESKTOP,SG=_mode==='mobile'?SG_MOBILE:SG_DESKTOP;if(UG[ch]&&UG[ch].length)return{body:s2svg(UG[ch])};if(SG[ch])return{body:SG[ch]};return null;}
function paleoToSVG(paleo,size){size=size||'1em';var cfg=_mode==='mobile'?_cfg.mobile:_cfg.desktop;var out='';for(var i=0;i<paleo.length;){var cp=paleo.codePointAt(i),ch=String.fromCodePoint(cp);i+=ch.length;var r=resolve(ch);if(r){var t=cfg.chars[ch]||{},sx=t.scaleX!=null?t.scaleX:1,sy=t.scaleY!=null?t.scaleY:1,txV=t.translateX!=null?t.translateX:0,tyV=t.translateY!=null?t.translateY:0,ml=t.marginL!=null?t.marginL:cfg.custom,mr=t.marginR!=null?t.marginR:cfg.custom;var body=r.body;if(sx!==1||sy!==1||txV!==0||tyV!==0){body='<g transform="translate('+(20+txV)+','+(24+tyV)+') scale('+sx+','+sy+') translate(-20,-24)">'+body+'</g>';}out+='<svg class="pg pg-custom" viewBox="'+VB+'" width="'+size+'" height="'+size+'" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:inline-block;vertical-align:bottom;overflow:visible;flex-shrink:0;margin-left:'+ml+'px;margin-right:'+mr+'px">'+body+'</svg>';}else{out+='<span style="display:inline-block;margin-inline:'+(cfg.unicode||0)+'px">'+ch+'</span>';}}return out;}
window.paleoToSVG=paleoToSVG;window.getPaleoMode=getMode;window.setRenderMode=setRenderMode;
window.getPaleoConfig=function(m){m=m||_mode;return JSON.parse(JSON.stringify(_cfg[m]));};
window.setPaleoConfig=function(c,m){m=m||_mode;_cfg[m]=c;saveCfg();};
window.revertGlyph=function(ch){var key=_mode==='mobile'?LS_MOBILE:LS_DESKTOP,UG=_mode==='mobile'?UG_MOBILE:UG_DESKTOP;delete UG[ch];try{var p=JSON.parse(localStorage.getItem(key)||'{}');delete p[ch];localStorage.setItem(key,JSON.stringify(p));}catch(e){}};
window.revertAllGlyphs=function(){var key=_mode==='mobile'?LS_MOBILE:LS_DESKTOP,UG=_mode==='mobile'?UG_MOBILE:UG_DESKTOP;Object.keys(UG).forEach(function(k){delete UG[k];});try{localStorage.removeItem(key);}catch(e){}};
loadUG();loadCfg();if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){applyCss();});}else{applyCss();}
})();`;
}
