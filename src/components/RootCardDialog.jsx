/**
 * RootCardDialog — the Root page's card as a trading-card picture (lib/rootCard.js): Front, Back
 * (the verse in English + its Paleo word blocks) or Both sides in one image; Night / Parchment;
 * any reader typeface; the back can show the first usage or the verse open on the page.
 * Download PNG / Share / Copy, like the verse image. fieldy, 2026-11-05.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { drawRootCard, rootCardFileName } from '../lib/rootCard.js';
import { loadCardFonts } from '../lib/verseCard.js';
import { TYPEFACES } from '../lib/typefaces.js';
import { readerPrefs } from '../lib/readerExport.js';
import '@fontsource/alegreya/600.css';
import '@fontsource/alegreya/800.css';
import '@fontsource/ysabeau/800.css';
import './VerseImageDialog.css';

const PREF_KEY = 'root-card-prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; } };
const SUFFIX_PREFIX = ['nme-', 'prs-', 'vbe-', 'uvf-'];
const isSuffix = css => SUFFIX_PREFIX.some(p => css && css.startsWith(p));

// The page's own morpheme colours, read from its stylesheet (morphColors.css: --mc, and the darker
// --mb for the parchment card), with the same alternating rule RootWordBlock uses.
function colourReader(dark) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  document.body.appendChild(host);
  const cache = new Map();
  const get = (css, alt) => {
    const k = `${css}|${alt}`;
    if (cache.has(k)) return cache.get(k);
    const el = document.createElement('span');
    el.className = css || '';
    if (alt) el.setAttribute('data-alt', '1');
    host.appendChild(el);
    const cs = getComputedStyle(el);
    const v = (cs.getPropertyValue(dark ? '--mc' : '--mb') || '').trim();
    const bad = !v || v === 'transparent' || css === 'root';
    cache.set(k, bad ? null : v);
    return cache.get(k);
  };
  return { get, done: () => host.remove() };
}

function wordsFor(tokens, dark) {
  const col = colourReader(dark);
  const out = (tokens || []).map(t => {
    const comps = t.components || [];
    const rootIdx = comps.findIndex(c => c.css === 'root');
    let p = 0, s = 0, rootSeen = false;
    const cs = comps.map((c, i) => {
      let alt = 0;
      if (c.css !== 'root' && !isSuffix(c.css) && !rootSeen && (rootIdx < 0 || i < rootIdx)) alt = p++;
      else if (isSuffix(c.css)) alt = s++;
      if (c.css === 'root') rootSeen = true;
      return { paleo: c.paleo || '', translit: c.translit || '', isMark: !!c.isMark, color: col.get(c.css, alt % 2 === 1), hit: !!(t.hitComp || [])[i] };
    });
    const rootComp = comps.find(c => c.css === 'root') || comps[0];
    const clean = (rootComp?.translation || '').replace(/^\[|\]$/g, '');
    const mods = comps.filter(c => c.css !== 'root' && !c.isMark).map(c => (c.translation || '').replace(/^\[|\]$/g, '')).filter(Boolean);
    const gloss = clean || mods.length ? `(${clean}${mods.length ? `${clean ? ' ' : ''}[${mods.join('-')}]` : ''})` : '';
    return { comps: cs, gloss, isHit: !!t.isHit };
  });
  col.done();
  return out;
}

export default function RootCardDialog({ open, onClose, summary, backChoices = [] }) {
  const canvasRef = useRef(null);
  const saved = useRef(loadPrefs()).current;
  const [side, setSide] = useState(['front', 'back', 'both'].includes(saved.side) ? saved.side : 'front');
  const [theme, setTheme] = useState(saved.theme === 'parchment' ? 'parchment' : 'night');
  const [fontId, setFontId] = useState(() => {
    const want = saved.font || readerPrefs().typeface;
    return TYPEFACES.some(f => f.id === want) ? want : TYPEFACES[0].id;
  });
  const [backKey, setBackKey] = useState(backChoices[0]?.key || null);
  useEffect(() => { if (!backChoices.some(c => c.key === backKey)) setBackKey(backChoices[0]?.key || null); }, [backChoices, backKey]);
  const family = (TYPEFACES.find(f => f.id === fontId) || TYPEFACES[0]).stack;
  const [fontsReady, setFontsReady] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { try { localStorage.setItem(PREF_KEY, JSON.stringify({ side, theme, font: fontId })); } catch { /* non-fatal */ } }, [side, theme, fontId]);
  useEffect(() => {
    if (!open) return; let live = true; setFontsReady(false);
    loadCardFonts(family).then(() => { if (live) setFontsReady(true); });
    return () => { live = false; };
  }, [open, family]);

  const back = backChoices.find(c => c.key === backKey) || backChoices[0] || null;
  const data = useMemo(() => {
    if (!summary) return null;
    const verse = back ? { label: back.label, sn: back.sn, ref: back.ref, text: back.text, isHitWord: back.isHitWord, words: wordsFor(back.tokens, theme === 'night') } : null;
    return { ...summary, verse };
  }, [summary, back, theme]);

  useEffect(() => {
    if (!open || !canvasRef.current || !data) return;
    drawRootCard(canvasRef.current, { side, theme, family, data });
  }, [open, fontsReady, side, theme, family, data]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const blob = useCallback(() => new Promise(res => canvasRef.current.toBlob(res, 'image/png')), []);
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 2200); };
  const fileName = rootCardFileName(side === 'front' ? summary?.sn : (back?.sn || summary?.sn), side === 'back' ? 'first-usage' : side === 'both' ? 'card' : 'front');
  const download = async () => {
    const b = await blob(); if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const share = async () => {
    const b = await blob(); if (!b) return;
    const file = new File([b], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `${summary.sn} ${summary.translit || ''}`, text: summary.url || '' }); }
      catch (e) { if (e?.name !== 'AbortError') flash('Sharing failed — use Download instead.'); }
    } else download();
  };
  const copy = async () => {
    try { const b = await blob(); await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': b })]); flash('Image copied'); }
    catch { flash('This browser cannot copy images — use Download.'); }
  };
  if (!open || !summary) return null;

  return (
    <div className="vi-scrim" onClick={onClose}>
      <div className="vi-dialog vi-dialog-root" role="dialog" aria-label={`Card image of ${summary.sn}`} onClick={e => e.stopPropagation()}>
        <div className="vi-head">
          <span className="vi-title">Card image · {summary.sn}</span>
          <button className="vi-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="vi-preview"><canvas ref={canvasRef} className="vi-canvas" /></div>
        <div className="vi-opts">
          <div className="vi-row"><span className="vi-label">Side</span>
            <div className="vi-group">
              {[['front', 'Card'], ['back', 'First usage'], ['both', 'Both']].map(([id, l]) => (
                <button key={id} className={`vi-chip ${side === id ? 'on' : ''}`} onClick={() => setSide(id)}>{l}</button>
              ))}
            </div>
          </div>
          {backChoices.length > 1 && side !== 'front' && (
            <div className="vi-row"><span className="vi-label">Which</span>
              <select className="vi-select" value={back?.key || ''} onChange={e => setBackKey(e.target.value)}>
                {backChoices.map(c => <option key={c.key} value={c.key}>{c.short}</option>)}
              </select>
            </div>
          )}
          <div className="vi-row"><span className="vi-label">Paper</span>
            <div className="vi-group">
              <button className={`vi-chip ${theme === 'night' ? 'on' : ''}`} onClick={() => setTheme('night')}>Night</button>
              <button className={`vi-chip ${theme === 'parchment' ? 'on' : ''}`} onClick={() => setTheme('parchment')}>Parchment</button>
            </div>
          </div>
          <div className="vi-row"><span className="vi-label">Font</span>
            <select className="vi-select" value={fontId} onChange={e => setFontId(e.target.value)}>
              {TYPEFACES.map(f => <option key={f.id} value={f.id}>{f.label} — {f.note}</option>)}
            </select>
          </div>
        </div>
        <div className="vi-actions">
          <button className="vi-btn vi-primary" onClick={download}>Download PNG</button>
          {typeof navigator !== 'undefined' && navigator.canShare && <button className="vi-btn" onClick={share}>Share…</button>}
          {typeof window !== 'undefined' && window.ClipboardItem && <button className="vi-btn" onClick={copy}>Copy</button>}
          {msg && <span className="vi-msg">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
