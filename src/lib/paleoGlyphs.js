/* paleoGlyphs.js
 * Port of the original /paleo-glyphs.js for the React app.
 *
 * What's the same:
 *   - Same SVG viewBox (0 0 40 48), same stroke renderer, same localStorage keys
 *     (paleo_glyphs_desktop / paleo_glyphs_mobile / paleo_glyph_config / paleo_render_mode)
 *     so user-drawn glyphs from the old app carry over.
 *   - paleoToSVG(text, size?) returns the same HTML strings.
 *
 * What's added (lexicon.html depended on these):
 *   - paleoWordFlex(str, size)     — per-char SVGs with NO margins, joined.
 *                                    Caller's flex container handles spacing.
 *   - paleoCharNoMargin(ch, size)  — single-char SVG with no margins,
 *                                    for sidebar buttons / anchor headers.
 *
 * What's new for React:
 *   - subscribe(fn) — fires whenever the render mode or user-glyph store
 *     changes. The hooks use this so SVG output re-renders automatically
 *     when the user toggles mobile/desktop or saves a new glyph.
 */

const VB = '0 0 40 48';
const LS_DESKTOP = 'paleo_glyphs_desktop';
const LS_MOBILE  = 'paleo_glyphs_mobile';
const LS_CFG     = 'paleo_glyph_config';
const LS_MODE    = 'paleo_render_mode';

// ──────────────────────────────────────────────────────────────────────────────
// MODE: desktop vs mobile (controls which glyph set + per-char tweaks apply)
// ──────────────────────────────────────────────────────────────────────────────
let _mode = (() => {
  try {
    const s = localStorage.getItem(LS_MODE);
    if (s === 'desktop' || s === 'mobile') return s;
  } catch (e) { /* ignore */ }
  const d = typeof window !== 'undefined' && window.innerWidth <= 768 ? 'mobile' : 'desktop';
  try { localStorage.setItem(LS_MODE, d); } catch (e) { /* ignore */ }
  return d;
})();

export function getPaleoMode() { return _mode; }

export function setRenderMode(m) {
  if (m !== 'desktop' && m !== 'mobile') return;
  _mode = m;
  try { localStorage.setItem(LS_MODE, m); } catch (e) { /* ignore */ }
  notify();
}

// ──────────────────────────────────────────────────────────────────────────────
// CONFIG (per-char margins + transforms, both per mode)
// ──────────────────────────────────────────────────────────────────────────────
const SERVER_CFG = {
  desktop: { custom: 0, unicode: 0, chars: {} },
  mobile:  {
    custom: 0, unicode: 0,
    chars: {
      '𐤅': { scaleX: 0.7, scaleY: 1, translateX: 0, translateY: 0, marginL: -3.5, marginR: -3.5 },
      '𐤃': { scaleX: 1,   scaleY: 1, translateX: 1, translateY: 0, marginL: -3.5, marginR: -3.5 },
    },
  },
};

const _cfg = {
  desktop: JSON.parse(JSON.stringify(SERVER_CFG.desktop)),
  mobile:  JSON.parse(JSON.stringify(SERVER_CFG.mobile)),
};

function loadCfg() {
  try {
    const raw = localStorage.getItem(LS_CFG);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.desktop) _cfg.desktop = Object.assign({ custom: 0, unicode: 0, chars: {} }, p.desktop);
    if (p.mobile)  _cfg.mobile  = Object.assign({ custom: 0, unicode: 0, chars: {} }, p.mobile);
  } catch (e) { /* ignore */ }
}

function saveCfg() {
  try { localStorage.setItem(LS_CFG, JSON.stringify(_cfg)); } catch (e) { /* ignore */ }
  applyCss();
  notify();
}

export function getPaleoConfig(mode) {
  mode = mode || _mode;
  return JSON.parse(JSON.stringify(_cfg[mode]));
}
export function setPaleoConfig(c, mode) {
  mode = mode || _mode;
  _cfg[mode] = c;
  saveCfg();
}

function applyCss() {
  if (typeof document === 'undefined') return;
  const c = _mode === 'mobile' ? _cfg.mobile : _cfg.desktop;
  document.documentElement.style.setProperty('--pg-gap-custom',  c.custom  + 'px');
  document.documentElement.style.setProperty('--pg-gap-unicode', c.unicode + 'px');
}

// ──────────────────────────────────────────────────────────────────────────────
// BUILT-IN GLYPH STORES (server-side / hardcoded)
// Same as paleo-glyphs.js: most are empty strings (Unicode fallback) except the
// two mobile overrides for 𐤃 and 𐤅.
// ──────────────────────────────────────────────────────────────────────────────
const SG_DESKTOP = {
  '𐤀':'', '𐤁':'', '𐤂':'', '𐤃':'', '𐤄':'', '𐤅':'', '𐤆':'', '𐤇':'',
  '𐤈':'', '𐤉':'', '𐤊':'', '𐤋':'', '𐤌':'', '𐤍':'', '𐤎':'', '𐤏':'',
  '𐤐':'', '𐤑':'', '𐤒':'', '𐤓':'', '𐤔':'', '𐤕':'',
};

const SG_MOBILE = {
  '𐤀':'', '𐤁':'', '𐤂':'',
  '𐤃':'<path d="M20.24,11.89 L3.16,34.76" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.00,36.11 L37.00,35.72" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M37.00,35.72 L20.87,13.08" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  '𐤄':'',
  '𐤅':'<path d="M3.00,8.04 L20.03,25.71" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.09,25.71 L37.00,9.44" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.91,25.01 L20.09,39.96" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  '𐤆':'', '𐤇':'', '𐤈':'', '𐤉':'', '𐤊':'', '𐤋':'', '𐤌':'', '𐤍':'',
  '𐤎':'', '𐤏':'', '𐤐':'', '𐤑':'', '𐤒':'', '𐤓':'', '𐤔':'', '𐤕':'',
};

// ──────────────────────────────────────────────────────────────────────────────
// USER GLYPH STORE (drawn in the glyph editor)
// ──────────────────────────────────────────────────────────────────────────────
const UG_DESKTOP = {};
const UG_MOBILE  = {};

function loadUG() {
  const load = (key, store) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const p = JSON.parse(raw);
      Object.keys(p).forEach(ch => {
        store[ch] = p[ch].map(s => {
          const a = s.pts.slice();
          a._sw = s.sw;
          return a;
        });
      });
    } catch (e) { /* ignore */ }
  };
  load(LS_DESKTOP, UG_DESKTOP);
  load(LS_MOBILE,  UG_MOBILE);
}

export function revertGlyph(ch) {
  const key = _mode === 'mobile' ? LS_MOBILE : LS_DESKTOP;
  const UG  = _mode === 'mobile' ? UG_MOBILE  : UG_DESKTOP;
  delete UG[ch];
  try {
    const p = JSON.parse(localStorage.getItem(key) || '{}');
    delete p[ch];
    localStorage.setItem(key, JSON.stringify(p));
  } catch (e) { /* ignore */ }
  notify();
}

export function revertAllGlyphs() {
  const key = _mode === 'mobile' ? LS_MOBILE : LS_DESKTOP;
  const UG  = _mode === 'mobile' ? UG_MOBILE  : UG_DESKTOP;
  Object.keys(UG).forEach(k => { delete UG[k]; });
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  notify();
}

// Used by GlyphEditor: persist current strokes for a given char in current mode.
export function saveUserGlyph(ch, strokes) {
  const key = _mode === 'mobile' ? LS_MOBILE : LS_DESKTOP;
  const UG  = _mode === 'mobile' ? UG_MOBILE  : UG_DESKTOP;
  UG[ch] = strokes;
  try {
    const persisted = {};
    Object.keys(UG).forEach(c => {
      persisted[c] = UG[c].map(s => ({ pts: Array.from(s), sw: s._sw }));
    });
    localStorage.setItem(key, JSON.stringify(persisted));
  } catch (e) { /* ignore */ }
  notify();
}

// ──────────────────────────────────────────────────────────────────────────────
// STROKE → SVG (normalize bounding box, then build path strings)
// ──────────────────────────────────────────────────────────────────────────────
function norm(strokes) {
  if (!strokes || !strokes.length) return strokes;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  strokes.forEach(k => {
    k.forEach(p => {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    });
  });
  const sw = x1 - x0, sh = y1 - y0;
  if (sw < 0.5 || sh < 0.5) return strokes;
  const pad = 3, tw = 34, th = 42;
  const sc = Math.min(tw / sw, th / sh);
  const ox = pad + (tw - sw * sc) / 2;
  const oy = pad + (th - sh * sc) / 2;
  return strokes.map(k => {
    const ns = k.map(p => ({ x: (p.x - x0) * sc + ox, y: (p.y - y0) * sc + oy }));
    ns._sw = k._sw;
    return ns;
  });
}

function s2svg(st) {
  return norm(st).map(pts => {
    if (!pts || pts.length < 2) return '';
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
    return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${pts._sw || 3.5}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
}

function resolveBody(ch) {
  const UG = _mode === 'mobile' ? UG_MOBILE : UG_DESKTOP;
  const SG = _mode === 'mobile' ? SG_MOBILE : SG_DESKTOP;
  if (UG[ch] && UG[ch].length) return s2svg(UG[ch]);
  if (SG[ch])                   return SG[ch];
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN PUBLIC RENDERERS
// ──────────────────────────────────────────────────────────────────────────────

// A custom hand-drawn glyph renders as an <svg aria-hidden="true"> of <path>
// strokes — no text node anywhere in it. That's correct for sighted users (the
// art IS the letter) but it means the real Unicode character never appears in
// the DOM as text whenever a custom body exists: screen readers get nothing
// (aria-hidden), and — the bigger miss — neither does Google. Confirmed via a
// live AI Overview + search result for a genuine Paleo phrase from Malachi 4:2
// ("Tzedaqah Shemesh"): bldbible.com didn't appear at all, despite being (per
// the user) the only site with this exact rendering — "no other site has text
// like it so there is no reason for other sites to have a higher ranking."
// Googlebot executes JS and indexes the post-render DOM, so this isn't a
// server/prerender-only problem — every client hydration re-render hits it
// too. SR_ONLY appends the real character as a normal (non-aria-hidden) text
// node, visually clipped to nothing via the standard accessibility "visually
// hidden" technique (inline, so it works regardless of which page's CSS is
// loaded) — screen readers and crawlers both see the real letter; sighted
// users still see only the custom art.
const SR_ONLY = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';

/**
 * paleoToSVG: original drop-in. Iterates code points, emits per-char inline-SVG
 * with the per-char margin/transform config applied. Unicode fallback if no
 * glyph body exists for a char.
 */
export function paleoToSVG(paleo, size) {
  size = size || '1em';
  const cfg = _mode === 'mobile' ? _cfg.mobile : _cfg.desktop;
  let out = '';
  for (let i = 0; i < paleo.length;) {
    const cp = paleo.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    i += ch.length;
    const body = resolveBody(ch);
    if (body !== null) {
      const t = cfg.chars[ch] || {};
      const sx  = t.scaleX     != null ? t.scaleX     : 1;
      const sy  = t.scaleY     != null ? t.scaleY     : 1;
      const txV = t.translateX != null ? t.translateX : 0;
      const tyV = t.translateY != null ? t.translateY : 0;
      const ml  = t.marginL    != null ? t.marginL    : cfg.custom;
      const mr  = t.marginR    != null ? t.marginR    : cfg.custom;
      let svgBody = body;
      if (sx !== 1 || sy !== 1 || txV !== 0 || tyV !== 0) {
        svgBody = `<g transform="translate(${20+txV},${24+tyV}) scale(${sx},${sy}) translate(-20,-24)">${body}</g>`;
      }
      out += `<svg class="pg pg-custom" viewBox="${VB}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:inline-block;vertical-align:bottom;overflow:visible;flex-shrink:0;margin-left:${ml}px;margin-right:${mr}px">${svgBody}</svg><span style="${SR_ONLY}">${ch}</span>`;
    } else {
      out += `<span style="display:inline-block;margin-inline:${cfg.unicode || 0}px">${ch}</span>`;
    }
  }
  return out;
}

/**
 * paleoCharNoMargin: a single character rendered as one SVG with NO horizontal
 * margins and NO transforms. Caller controls all spacing. Used for sidebar
 * letter-jump buttons and sticky anchor headers in the lexicon.
 *
 * If no SVG body exists for the char, we return a fallback span that the lexicon
 * code can detect (it does `unicode-mode` styling instead).
 */
export function paleoCharNoMargin(ch, size) {
  size = size || '1em';
  const body = resolveBody(ch);
  if (body === null) {
    // Fallback to plain unicode; lexicon CSS handles direction.
    return `<span class="pg-fallback">${ch}</span>`;
  }
  // Real-text fallback for screen readers/crawlers — see SR_ONLY above.
  return `<svg class="pg" viewBox="${VB}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:inline-block;vertical-align:bottom;overflow:visible;flex-shrink:0">${body}</svg><span style="${SR_ONLY}">${ch}</span>`;
}

/**
 * paleoWordFlex: every code point becomes one SVG with no margin. Suitable for
 * a flex `row-reverse` container with a CSS `gap` controlling spacing.
 */
export function paleoWordFlex(str, size) {
  size = size || '1em';
  if (!str) return '';
  let out = '';
  for (let i = 0; i < str.length;) {
    const cp = str.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    i += ch.length;
    out += paleoCharNoMargin(ch, size);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// SUBSCRIBERS (for React re-renders on mode/glyph change)
// ──────────────────────────────────────────────────────────────────────────────
const _subs = new Set();
export function subscribe(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}
function notify() {
  applyCss();
  _subs.forEach(fn => { try { fn(_mode); } catch (e) { /* ignore */ } });
}

// ──────────────────────────────────────────────────────────────────────────────
// INIT (run once on import)
// ──────────────────────────────────────────────────────────────────────────────
loadUG();
loadCfg();
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCss);
  } else {
    applyCss();
  }
}
