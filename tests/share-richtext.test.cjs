/**
 * share-richtext.test.cjs — verifies the Share page's rich-text export
 * pipeline (extractStyledRuns + layoutLines + measureLine). These functions
 * are responsible for turning a contenteditable's HTML into per-segment
 * canvas-drawing instructions that preserve color, bold/italic/underline,
 * and word-wrap.
 *
 * Run: node tests/share-richtext.test.cjs
 *
 * We can't easily import the React component, so we mirror the helpers here.
 * If the originals change, this test should be updated to stay in sync — and
 * the test failing on a real change is a feature, not a bug.
 */
'use strict';

const assert = require('assert');
const { JSDOM } = require('jsdom');

// Install DOMParser globally so the extraction helper works the same way as
// it does in the browser. JSDOM gives us a real DOM with quirks-correct
// HTML parsing — exactly what we want for round-trip testing.
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;

// ── COPIED FROM Share.jsx ── (must match the production helpers verbatim) ──

function extractStyledRuns(html, baseStyle) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.querySelector('div');
  const runs = [];
  const walk = (node, style) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        if (child.textContent) runs.push({ text: child.textContent, ...style });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') { runs.push({ text: '\n', ...style }); continue; }
      let next = style;
      if (tag === 'b' || tag === 'strong') next = { ...next, bold: true };
      if (tag === 'i' || tag === 'em')     next = { ...next, italic: true };
      if (tag === 'u')                     next = { ...next, underline: true };
      if (child.style?.color) next = { ...next, color: child.style.color };
      const fontColor = child.getAttribute?.('color');
      if (fontColor) next = { ...next, color: fontColor };
      walk(child, next);
    }
  };
  walk(root, baseStyle);
  return runs;
}

// A super-cheap measureText stub for layoutLines. Each character is the same
// width regardless of font — enough to test that wrapping happens at the right
// boundary without pulling in a real canvas.
function mockCtx(charWidth = 10) {
  return {
    font: '',
    measureText: (s) => ({ width: s.length * charWidth }),
  };
}

function layoutLines(ctx, runs, maxWidth) {
  const setFont = (s) => {
    ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : ''}${s.size}px ${s.font}`;
  };
  const lines = [];
  let current = [];
  let curWidth = 0;
  const pushLine = () => { lines.push(current); current = []; curWidth = 0; };
  const append = (seg) => {
    if (!seg.text) return;
    setFont(seg);
    const w = ctx.measureText(seg.text).width;
    current.push({ ...seg });
    curWidth += w;
  };
  for (const run of runs) {
    if (run.text === '\n') { pushLine(); continue; }
    const pieces = run.text.split(/(\s+)/).filter(p => p !== '');
    for (const piece of pieces) {
      setFont(run);
      const pw = ctx.measureText(piece).width;
      if (curWidth + pw > maxWidth && current.length) {
        pushLine();
        if (/^\s+$/.test(piece)) continue;
      }
      append({ ...run, text: piece });
    }
  }
  if (current.length) pushLine();
  return lines;
}

// ── TESTS ──────────────────────────────────────────────────────────────────

const BASE = { color: '#ffffff', bold: false, italic: false, underline: false, font: 'serif', size: 20 };

console.log('=== TEST 1: extractStyledRuns — plain text ==='); {
  const runs = extractStyledRuns('hello world', BASE);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].text, 'hello world');
  assert.strictEqual(runs[0].color, '#ffffff');
  assert.strictEqual(runs[0].bold, false);
  console.log('  ✓ plain text → single run with base style');
}

console.log('=== TEST 2: extractStyledRuns — <b>, <i>, <u> ==='); {
  const runs = extractStyledRuns('a <b>B</b> <i>I</i> <u>U</u> z', BASE);
  const find = (t) => runs.find(r => r.text.trim() === t);
  assert.strictEqual(find('B').bold,      true,  '<b> sets bold');
  assert.strictEqual(find('B').italic,    false, '<b> doesn\'t set italic');
  assert.strictEqual(find('I').italic,    true,  '<i> sets italic');
  assert.strictEqual(find('U').underline, true,  '<u> sets underline');
  assert.strictEqual(find('a').bold,      false, 'plain text retains base style');
  console.log('  ✓ tag → style mapping works for b/i/u');
}

console.log('=== TEST 3: extractStyledRuns — inline color from <span style> ==='); {
  const runs = extractStyledRuns(
    'a <span style="color: rgb(232, 170, 85);">gold</span> z', BASE
  );
  const gold = runs.find(r => r.text === 'gold');
  assert.ok(gold, 'gold run found');
  assert.match(gold.color, /rgb\(232, ?170, ?85\)/, 'color picked up from span style');
  const a = runs.find(r => r.text === 'a ');
  assert.strictEqual(a.color, '#ffffff', 'plain runs keep base color');
  console.log('  ✓ inline color survives DOM round-trip');
}

console.log('=== TEST 4: extractStyledRuns — nested tags inherit ==='); {
  const runs = extractStyledRuns(
    '<b>bold <i>both</i></b>', BASE
  );
  const both = runs.find(r => r.text === 'both');
  assert.strictEqual(both.bold,   true, 'nested <i> inside <b> is also bold');
  assert.strictEqual(both.italic, true, 'and italic');
  console.log('  ✓ nested tags compose styles');
}

console.log('=== TEST 5: extractStyledRuns — <br> emits paragraph break ==='); {
  const runs = extractStyledRuns('line one<br>line two', BASE);
  const brIdx = runs.findIndex(r => r.text === '\n');
  assert.ok(brIdx > 0, '<br> produces a paragraph break run');
  console.log('  ✓ <br> → newline run');
}

console.log('=== TEST 6: layoutLines — wraps long text ==='); {
  // 10px per char, line width 50 → fits 5 chars per line
  const ctx = mockCtx(10);
  const runs = [{ text: 'one two three four five', ...BASE }];
  const lines = layoutLines(ctx, runs, 50);
  // "one two" (7) too wide for 50; "one" (3) fits, " " strip on wrap, "two" next line
  // Actually: "one" pushes width to 30; " " pushes to 40; "two" would be 30 more = 70 > 50 → wrap
  // After wrap: " " skipped (leading whitespace), "two" starts new line
  assert.ok(lines.length >= 4, `should wrap into multiple lines, got ${lines.length}`);
  const totalText = lines.flat().map(s => s.text).join('');
  // The first run gets split across many segments; concatenation should
  // include all original characters (perhaps with whitespace dropped at wraps).
  assert.match(totalText, /one.*two.*three.*four.*five/);
  console.log(`  ✓ wraps into ${lines.length} lines, all words preserved`);
}

console.log('=== TEST 7: layoutLines — \\n forces line break ==='); {
  const ctx = mockCtx(10);
  const runs = [
    { text: 'A', ...BASE },
    { text: '\n', ...BASE },
    { text: 'B', ...BASE },
  ];
  const lines = layoutLines(ctx, runs, 1000);
  assert.strictEqual(lines.length, 2, 'two lines from explicit \\n');
  assert.strictEqual(lines[0][0].text, 'A');
  assert.strictEqual(lines[1][0].text, 'B');
  console.log('  ✓ \\n forces a line break');
}

console.log('=== TEST 8: layoutLines — preserves per-segment style across wrap ==='); {
  const ctx = mockCtx(10);
  // "AAAAA BBBBB" with B bold, line width 60. "AAAAA " = 60, then bold "BBBBB" wraps.
  const runs = [
    { text: 'AAAAA ', ...BASE },
    { text: 'BBBBB', ...BASE, bold: true },
  ];
  const lines = layoutLines(ctx, runs, 60);
  // Find the segment containing 'BBBBB' and confirm it's bold
  const flat = lines.flat();
  const bSeg = flat.find(s => s.text === 'BBBBB');
  assert.ok(bSeg, 'bold segment present');
  assert.strictEqual(bSeg.bold, true, 'bold preserved through layout');
  console.log('  ✓ per-segment style preserved');
}

console.log('\n✅ ALL SHARE RICH-TEXT TESTS PASSED');
