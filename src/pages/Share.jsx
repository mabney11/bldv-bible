import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { useToast } from '../components/Toast.jsx';
import { paleoToSVG } from '../lib/paleoGlyphs.js';
import {
  apiBooks, apiTransChapter, apiTransVerse,
} from '../lib/api.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './Share.css';

const FONT_OPTIONS = [
  { value: "'Segoe UI Historic','Segoe UI',serif", label: 'System (Paleo-aware)' },
  { value: 'Georgia,serif',                        label: 'Georgia' },
  { value: '"Times New Roman",serif',              label: 'Times' },
  { value: '"Helvetica Neue",sans-serif',          label: 'Helvetica' },
  { value: 'Courier,monospace',                    label: 'Courier' },
];

const COLOR_PALETTE = [
  '#ffffff', '#e8aa55', '#4a9eff', '#3ecfb0', '#e07070',
  '#c47edb', '#f0d060', '#a0c8a0', '#888888', '#000000',
];

const CANVAS_PRESETS = [
  { label: 'Square (1080)', w: 1080, h: 1080 },
  { label: 'Story (1080×1920)', w: 1080, h: 1920 },
  { label: 'Post (1200×630)', w: 1200, h: 630 },
  { label: 'Wide (1920×1080)', w: 1920, h: 1080 },
];

// Paleo-Hebrew keyboard layout — 5 rows in the original (matches the standard
// alefbet grouping). RTL display, so the visual order in each row reads
// right-to-left when rendered with direction:rtl.
const PALEO_ROWS = [
  ['𐤀','𐤁','𐤂','𐤃','𐤄','𐤅'],
  ['𐤆','𐤇','𐤈'],
  ['𐤉','𐤊','𐤋','𐤌','𐤍'],
  ['𐤎','𐤏','𐤐','𐤑','𐤒'],
  ['𐤓','𐤔','𐤕'],
];

// ─────────────────────────────────────────────────────────────────────────────
// SHARE PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function Share() {
  usePageTitle(pageTitle('Share & Export'));
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();

  // ── verse picker ──────────────────────────────────────────────────────────
  const [books, setBooks] = useState([]);
  const [tree, setTree]   = useState({}); // bookId → { chapters: { ch: { verses } } }
  const [openBook, setOpenBook] = useState(null);
  const [openCh, setOpenCh] = useState({}); // "book:chapter" → bool
  const [search, setSearch] = useState('');
  const [selectedVerses, setSelectedVerses] = useState([]); // [{book, chapter, verse, text, ref}]

  useEffect(() => {
    apiBooks().then(setBooks).catch(e => toast('Books load failed: ' + e.message, 'err'));
  }, [toast]);

  const toggleBook = async (bookId) => {
    const open = openBook === bookId ? null : bookId;
    setOpenBook(open);
  };

  const toggleChapter = async (book, chapter) => {
    const key = `${book.book_id}:${chapter}`;
    setOpenCh(o => ({ ...o, [key]: !o[key] }));
    if (!tree[book.book_id]?.chapters?.[chapter]) {
      try {
        const data = await apiTransChapter(book.book_id, chapter);
        setTree(t => ({
          ...t,
          [book.book_id]: {
            ...(t[book.book_id] || {}),
            chapters: { ...(t[book.book_id]?.chapters || {}), [chapter]: data.verses || [] },
          },
        }));
      } catch (e) { toast('Chapter load failed', 'err'); }
    }
  };

  const toggleVerse = async (book, ch, v, checked) => {
    const key = `${book.book_id}:${ch}:${v.verse}`;
    const ref = `${book.name} ${ch}:${v.verse}`;
    if (!checked) {
      setSelectedVerses(s => s.filter(x => x.key !== key));
      return;
    }
    // Need the text — fetch verse if not present
    let text = v.text || '';
    if (!text) {
      try {
        const vd = await apiTransVerse(book.book_id, ch, v.verse);
        text = vd?.text || '';
      } catch { /* ignore */ }
    }
    setSelectedVerses(s => [...s, { key, book: book.book_id, chapter: ch, verse: v.verse, text, ref }]);
  };

  const filteredBooks = useMemo(() => {
    if (!search.trim()) return books;
    const q = search.trim().toLowerCase();
    return books.filter(b => b.name?.toLowerCase().includes(q));
  }, [books, search]);

  // ── canvas ────────────────────────────────────────────────────────────────
  const stageRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 1080, h: 1080 });
  const [bgColor, setBgColor] = useState('#1a1612');
  const [bgImage, setBgImage] = useState(null); // data URL

  // Text boxes — React state, each box is { id, x, y, w, h, text, font, size, color, align, rotation, bold, italic, underline }
  const [boxes, setBoxes] = useState([]);
  const [selId, setSelId] = useState(null);
  const nextIdRef = useRef(1);
  const dragRef = useRef(null); // { id, kind:'move'|'resize', handle, startX, startY, origBox }
  const [editingId, setEditingId] = useState(null);
  // Snap guide lines while dragging — one horizontal (top/center/bottom) and one
  // vertical (left/center/right). Values are in canvas units (px) or null when
  // hidden. The stage renders them as 1-px lines overlaying the canvas.
  const [snapGuides, setSnapGuides] = useState({ h: null, v: null });
  // Brief info banner (e.g. "✓ Centered horizontally" after alignment click)
  const [snapInfo, setSnapInfo] = useState('');
  const snapInfoTimerRef = useRef(null);
  // Paleo keyboard popover
  const [kbdOpen, setKbdOpen] = useState(false);
  // ContentEditable ref to the actively-editing box's text node — set on edit-enter
  // so the paleo keyboard knows where to insert characters.
  const editingTextRef = useRef(null);

  // Compute pixel scale (stage display size vs canvas resolution)
  const stageScale = useMemo(() => {
    const stage = stageRef.current;
    if (!stage) return { sx: 1, sy: 1 };
    const r = stage.getBoundingClientRect();
    return { sx: canvasSize.w / r.width, sy: canvasSize.h / r.height };
  }, [canvasSize.w, canvasSize.h, /* re-eval after layout */ boxes.length]);

  // ── HTML escape — needed because we render box content via dangerouslySetInnerHTML
  // and a new box's text may contain user-supplied verse content with characters
  // that would otherwise be parsed as HTML. We escape on seeding, then trust the
  // contenteditable's output (which is HTML by definition) on edits.
  const escapeHTML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Insert selected verses as a text box.
  // `text`     — plain-text snapshot used for export word-wrapping and as a fallback.
  // `richText` — HTML rendition shown in the box and edited via contenteditable.
  //              Newlines become <br> so the rich rendering matches the plain layout.
  const insertSelectedVerses = () => {
    if (!selectedVerses.length) { toast('Select verses first', 'err'); return; }
    const text = selectedVerses.map(v => `${v.ref}\n${v.text}`).join('\n\n');
    const richText = escapeHTML(text).replace(/\n/g, '<br>');
    const id = nextIdRef.current++;
    setBoxes(b => [...b, {
      id, x: canvasSize.w * 0.1, y: canvasSize.h * 0.1,
      w: canvasSize.w * 0.8, h: canvasSize.h * 0.5,
      text, richText, font: FONT_OPTIONS[0].value,
      size: Math.round(canvasSize.h * 0.04),
      color: '#ffffff', align: 'center',
      rotation: 0, bold: false, italic: false, underline: false,
    }]);
    setSelId(id);
  };

  const addBlankBox = () => {
    const id = nextIdRef.current++;
    setBoxes(b => [...b, {
      id, x: canvasSize.w * 0.2, y: canvasSize.h * 0.4,
      w: canvasSize.w * 0.6, h: canvasSize.h * 0.2,
      text: 'New text', richText: 'New text', font: FONT_OPTIONS[0].value,
      size: Math.round(canvasSize.h * 0.04),
      color: '#ffffff', align: 'center',
      rotation: 0, bold: false, italic: false, underline: false,
    }]);
    setSelId(id);
  };

  const updateBox = (id, patch) =>
    setBoxes(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b));

  const deleteSelected = () => {
    if (selId == null) return;
    setBoxes(bs => bs.filter(b => b.id !== selId));
    setSelId(null);
  };

  const duplicateSelected = () => {
    const src = boxes.find(b => b.id === selId);
    if (!src) return;
    const id = nextIdRef.current++;
    setBoxes(b => [...b, { ...src, id, x: src.x + 20, y: src.y + 20 }]);
    setSelId(id);
  };

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────
  // Page-level shortcuts for the selected box. Skip when the user is editing
  // a contenteditable (we don't want Delete to fight the user's typing) or
  // when focus is on a form element like the canvas-size number input.
  //
  // Captured shortcuts:
  //   Delete / Backspace → remove the selected box
  //   Arrow keys         → nudge by 1 canvas-pixel (Shift = 10px)
  //   Escape             → deselect everything
  //   Ctrl/Cmd+D         → duplicate the selected box
  useEffect(() => {
    const onKeyDown = (e) => {
      const ae = document.activeElement;
      const tag = ae?.tagName?.toLowerCase();
      const inEditable =
        editingId != null ||
        ae?.isContentEditable ||
        tag === 'input' || tag === 'textarea' || tag === 'select';
      if (inEditable) {
        // Still allow Escape inside boxes (handled by the box itself), and
        // allow Cmd+D nowhere — return early so the user can keep typing.
        if (e.key === 'Escape' && editingId != null) setEditingId(null);
        return;
      }
      if (selId == null) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelId(null);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const nudge = e.shiftKey ? 10 : 1;
        const dxy = {
          ArrowLeft:  { x: -nudge, y: 0 },
          ArrowRight: { x:  nudge, y: 0 },
          ArrowUp:    { x: 0, y: -nudge },
          ArrowDown:  { x: 0, y:  nudge },
        }[e.key];
        if (dxy) {
          const box = boxes.find(b => b.id === selId);
          if (box) updateBox(selId, { x: box.x + dxy.x, y: box.y + dxy.y });
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, editingId, boxes]);

  // ── alignment ─────────────────────────────────────────────────────────────
  // Snap the selected box to a canvas edge or center, then briefly show a
  // confirmation banner. Pure state mutation — no DOM touching.
  const alignBox = (mode) => {
    if (!selId) return;
    const box = boxes.find(b => b.id === selId);
    if (!box) return;
    const cw = canvasSize.w, ch = canvasSize.h;
    const patch = {};
    switch (mode) {
      case 'left':    patch.x = 0; break;
      case 'right':   patch.x = cw - box.w; break;
      case 'hcenter': patch.x = (cw - box.w) / 2; break;
      case 'top':     patch.y = 0; break;
      case 'bottom':  patch.y = ch - box.h; break;
      case 'vcenter': patch.y = (ch - box.h) / 2; break;
      case 'center':  patch.x = (cw - box.w) / 2; patch.y = (ch - box.h) / 2; break;
      default: return;
    }
    updateBox(selId, patch);
    const labels = {
      left: 'Left edge', right: 'Right edge', hcenter: 'Centered horizontally',
      top: 'Top edge', bottom: 'Bottom edge', vcenter: 'Centered vertically',
      center: 'True center',
    };
    setSnapInfo('✓ ' + labels[mode]);
    if (snapInfoTimerRef.current) clearTimeout(snapInfoTimerRef.current);
    snapInfoTimerRef.current = setTimeout(() => setSnapInfo(''), 1800);
  };

  // ── paleo keyboard insertion ──────────────────────────────────────────────
  // Inserts a glyph at the caret of the currently editing box. If no box is
  // in edit mode, opens edit mode on the selected box first so the next click
  // works. Uses execCommand insertText which preserves browser undo history.
  const insertPaleoChar = (ch) => {
    const el = editingTextRef.current;
    if (el && document.activeElement === el) {
      el.focus();
      document.execCommand('insertText', false, ch);
      // Sync React state — both fields, since the contenteditable owns both.
      updateBox(selId, { text: el.innerText, richText: el.innerHTML });
      return;
    }
    // Fall back: append to selected box's text + richText
    if (selId == null) return;
    const box = boxes.find(b => b.id === selId);
    if (!box) return;
    const newText = (box.text || '') + ch;
    updateBox(selId, { text: newText, richText: escapeHTML(newText).replace(/\n/g, '<br>') });
  };

  const paleoBackspace = () => {
    const el = editingTextRef.current;
    if (el && document.activeElement === el) {
      el.focus();
      document.execCommand('delete', false);
      updateBox(selId, { text: el.innerText, richText: el.innerHTML });
      return;
    }
    if (selId == null) return;
    const box = boxes.find(b => b.id === selId);
    if (!box || !box.text) return;
    // Remove the last code point (handles 2-UTF-16-unit Paleo chars correctly)
    const arr = [...box.text];
    arr.pop();
    const newText = arr.join('');
    updateBox(selId, { text: newText, richText: escapeHTML(newText).replace(/\n/g, '<br>') });
  };

  // ── style toggle (bold / italic / underline) ─────────────────────────────
  // Like applyColor: when editing with a non-empty selection, toggle just that
  // selection via execCommand (preserved in richText). Otherwise toggle the
  // whole-box property — which is how most users interact with the buttons.
  const toggleStyle = (prop, execName) => {
    const el = editingTextRef.current;
    const sel = window.getSelection();
    if (el && document.activeElement === el && sel && !sel.isCollapsed) {
      el.focus();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(execName, false);
      updateBox(selId, { text: el.innerText, richText: el.innerHTML });
      return;
    }
    if (selId == null) return;
    const box = boxes.find(b => b.id === selId);
    if (!box) return;
    updateBox(selId, { [prop]: !box[prop] });
  };

  // ── color application ─────────────────────────────────────────────────────
  // If a box is being edited AND text is currently selected, foreColor only the
  // selection (the colored <span> survives into richText because the displayed
  // div uses dangerouslySetInnerHTML). Otherwise, set the whole-box color
  // (the typical case for "click swatch, see whole box change").
  const applyColor = (hex) => {
    const el = editingTextRef.current;
    const sel = window.getSelection();
    if (el && document.activeElement === el && sel && !sel.isCollapsed) {
      el.focus();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, hex);
      updateBox(selId, { text: el.innerText, richText: el.innerHTML });
      return;
    }
    if (selId == null) return;
    updateBox(selId, { color: hex });
  };

  const selectedBox = boxes.find(b => b.id === selId);

  // ── drag/resize handlers ──────────────────────────────────────────────────
  const onBoxMouseDown = (e, id) => {
    if (editingId === id) return; // editing — let the textarea handle it
    e.stopPropagation();
    const stage = stageRef.current; if (!stage) return;
    const r = stage.getBoundingClientRect();
    const sx = canvasSize.w / r.width;
    const sy = canvasSize.h / r.height;
    const box = boxes.find(b => b.id === id);
    if (!box) return;
    setSelId(id);
    dragRef.current = {
      id, kind: 'move',
      startX: e.clientX, startY: e.clientY,
      origBox: { ...box }, sx, sy,
    };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragUp);
  };

  const onHandleMouseDown = (e, id, handle) => {
    e.stopPropagation();
    const stage = stageRef.current; if (!stage) return;
    const r = stage.getBoundingClientRect();
    const sx = canvasSize.w / r.width;
    const sy = canvasSize.h / r.height;
    const box = boxes.find(b => b.id === id);
    if (!box) return;
    dragRef.current = {
      id, kind: 'resize', handle,
      startX: e.clientX, startY: e.clientY,
      origBox: { ...box }, sx, sy,
    };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragUp);
  };

  const onDragMove = useCallback((e) => {
    const d = dragRef.current; if (!d) return;
    const dx = (e.clientX - d.startX) * d.sx;
    const dy = (e.clientY - d.startY) * d.sy;
    if (d.kind === 'move') {
      const nx = d.origBox.x + dx;
      const ny = d.origBox.y + dy;
      updateBox(d.id, { x: nx, y: ny });

      // Snap guides — show horizontal/vertical lines when the box's center or
      // an edge lines up with the canvas center/edges. We don't snap to the
      // guide (no position rounding) — just show the visual cue. SNAP threshold
      // is in canvas pixels, so it scales with the export resolution rather
      // than the displayed stage size.
      const SNAP = 6;
      const cw = canvasSize.w, ch = canvasSize.h;
      const cx = nx + d.origBox.w / 2;
      const cy = ny + d.origBox.h / 2;
      let h = null, v = null;
      if      (Math.abs(cy - ch / 2) < SNAP) h = ch / 2;
      else if (Math.abs(ny) < SNAP)          h = 0;
      else if (Math.abs(ny + d.origBox.h - ch) < SNAP) h = ch;
      if      (Math.abs(cx - cw / 2) < SNAP) v = cw / 2;
      else if (Math.abs(nx) < SNAP)          v = 0;
      else if (Math.abs(nx + d.origBox.w - cw) < SNAP) v = cw;
      setSnapGuides({ h, v });
    } else if (d.kind === 'resize') {
      const o = d.origBox;
      const patch = {};
      const h = d.handle;
      if (h.includes('e')) patch.w = Math.max(40, o.w + dx);
      if (h.includes('w')) { patch.w = Math.max(40, o.w - dx); patch.x = o.x + dx; }
      if (h.includes('s')) patch.h = Math.max(30, o.h + dy);
      if (h.includes('n')) { patch.h = Math.max(30, o.h - dy); patch.y = o.y + dy; }
      updateBox(d.id, patch);
    }
  }, [canvasSize.w, canvasSize.h]);

  const onDragUp = useCallback(() => {
    dragRef.current = null;
    setSnapGuides({ h: null, v: null });
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragUp);
  }, [onDragMove]);

  // Click stage background — deselect
  const onStageClick = (e) => {
    if (e.target === e.currentTarget) {
      setSelId(null);
      setEditingId(null);
    }
  };

  // ── background image upload ───────────────────────────────────────────────
  const onUploadImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = ev => {
      const img = new Image();
      img.onload = () => {
        setCanvasSize({ w: img.width, h: img.height });
        setBgImage(ev.target.result);
      };
      img.src = ev.target.result;
    };
    fr.readAsDataURL(file);
  };

  // ── export ────────────────────────────────────────────────────────────────
  const exportImage = useCallback(async () => {
    // Render to a fresh canvas — drawing the bg + each text box.
    // We don't use html2canvas because we want bit-exact control + no deps.
    const c = document.createElement('canvas');
    c.width = canvasSize.w; c.height = canvasSize.h;
    const ctx = c.getContext('2d');
    // Background
    if (bgImage) {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res; img.onerror = rej;
        img.src = bgImage;
      });
      ctx.drawImage(img, 0, 0, c.width, c.height);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    // Text boxes — render with per-segment styling extracted from richText.
    // Each box's richText is parsed into "runs": chunks of text sharing a style.
    // Runs flow word-by-word into lines, wrapping at the box width. The export
    // mirrors what the user sees in the live preview as closely as canvas can.
    for (const box of boxes) {
      ctx.save();
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      if (box.rotation) ctx.rotate(box.rotation * Math.PI / 180);
      ctx.translate(-box.w / 2, -box.h / 2);

      const baseStyle = {
        color:     box.color,
        bold:      box.bold,
        italic:    box.italic,
        underline: box.underline,
        font:      box.font,
        size:      box.size,
      };

      // Extract runs: legacy boxes (no richText) treat the whole thing as one run.
      // Newline characters in the plain text become paragraph breaks. <br> inside
      // richText is also a paragraph break.
      const runs = box.richText
        ? extractStyledRuns(box.richText, baseStyle)
        : [{ text: box.text || '', ...baseStyle }];

      // Lay out runs into wrapped lines.
      const lines = layoutLines(ctx, runs, box.w);
      const lineH = box.size * 1.25;
      let y = 0;
      for (const line of lines) {
        const lineWidth = measureLine(ctx, line);
        let x = box.align === 'left'  ? 0
              : box.align === 'right' ? box.w - lineWidth
              : (box.w - lineWidth) / 2;
        for (const seg of line) {
          ctx.font = `${seg.italic ? 'italic ' : ''}${seg.bold ? '700 ' : ''}${seg.size}px ${seg.font}`;
          ctx.fillStyle = seg.color;
          ctx.textBaseline = 'top';
          ctx.fillText(seg.text, x, y);
          if (seg.underline) {
            const w = ctx.measureText(seg.text).width;
            const lineY = y + seg.size + 2;
            ctx.fillRect(x, lineY, w, Math.max(1, seg.size / 20));
          }
          x += ctx.measureText(seg.text).width;
        }
        y += lineH;
      }
      ctx.restore();
    }
    // Trigger download
    const url = c.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `paleo-share-${Date.now()}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('Exported ✓', 'ok');
  }, [canvasSize, bgColor, bgImage, boxes, toast]);

  return (
    <div className="sh-shell">
      <header className="sh-topbar">
        <Link to="/landing" className="sh-logo">𐤀𐤁</Link>
        <h1 className="sh-title">Share &amp; Export</h1>
        <span className="sh-spacer" />
        <button className="txt-btn primary" onClick={exportImage}>⇩ Export PNG</button>
        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className="sh-body">
        {/* SIDEBAR: verse picker */}
        <aside className="sh-sidebar">
          <div className="sh-sidebar-header">
            <h2>Pick verses</h2>
            <input
              type="text"
              className="sh-search-bar"
              placeholder="Search books…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="sh-book-tree">
            {filteredBooks.map(b => {
              const isOpen = openBook === b.book_id;
              const chapters = [];
              for (let c = b.first_chapter; c <= b.last_chapter; c++) chapters.push(c);
              return (
                <div key={b.book_id}>
                  <button className={`sh-book-row ${isOpen ? 'open' : ''}`} onClick={() => toggleBook(b.book_id)}>
                    <span className="sh-caret">▶</span>
                    <span className="sh-bname">{b.name}</span>
                  </button>
                  {isOpen && (
                    <div className="sh-book-chapters">
                      {chapters.map(c => {
                        const key = `${b.book_id}:${c}`;
                        const chOpen = openCh[key];
                        const verses = tree[b.book_id]?.chapters?.[c];
                        return (
                          <div key={c}>
                            <button className={`sh-ch-row ${chOpen ? 'open' : ''}`}
                                    onClick={() => toggleChapter(b, c)}>
                              <span className="sh-caret">▶</span>
                              <span>Ch {c}</span>
                            </button>
                            {chOpen && (
                              <div className="sh-verse-rows">
                                {!verses ? <div className="sh-loading">Loading…</div> :
                                 verses.length === 0 ? <div className="sh-loading">No translated verses</div> :
                                 verses.map(v => {
                                   const vk = `${b.book_id}:${c}:${v.verse}`;
                                   const checked = selectedVerses.some(s => s.key === vk);
                                   return (
                                     <label key={v.verse} className="sh-verse-row">
                                       <input type="checkbox"
                                              checked={checked}
                                              onChange={e => toggleVerse(b, c, v, e.target.checked)} />
                                       <span className="sh-vnum">{v.verse}</span>
                                       <span className="sh-vtext">{v.text ? v.text.slice(0, 40) : '—'}</span>
                                     </label>
                                   );
                                 })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sh-sidebar-footer">
            <button className="txt-btn primary" disabled={!selectedVerses.length} onClick={insertSelectedVerses}>
              + Add {selectedVerses.length ? `(${selectedVerses.length})` : ''} to canvas
            </button>
          </div>
        </aside>

        {/* CANVAS AREA */}
        <main className="sh-canvas-area">
          <div className="sh-canvas-wrap">
            <div
              ref={stageRef}
              className="sh-stage"
              onClick={onStageClick}
              style={{
                width: 'min(100%, 800px)',
                aspectRatio: `${canvasSize.w} / ${canvasSize.h}`,
                background: bgImage ? `url(${bgImage}) center/cover no-repeat` : bgColor,
              }}
            >
              {/* SNAP GUIDES — rendered above boxes, below handles. Lines are
                  1px in stage-space; positioned by canvas-unit percentages so
                  they scale with the stage. Visible only while dragging.    */}
              {snapGuides.h != null && (
                <div className="sh-snap-guide sh-snap-h"
                     style={{ top: `${snapGuides.h / canvasSize.h * 100}%` }} />
              )}
              {snapGuides.v != null && (
                <div className="sh-snap-guide sh-snap-v"
                     style={{ left: `${snapGuides.v / canvasSize.w * 100}%` }} />
              )}

              {boxes.map(b => (
                <TextBox
                  key={b.id}
                  box={b}
                  canvasSize={canvasSize}
                  isSel={selId === b.id}
                  isEditing={editingId === b.id}
                  editingTextRef={editingId === b.id ? editingTextRef : null}
                  onMouseDown={onBoxMouseDown}
                  onDoubleClick={() => setEditingId(b.id)}
                  onHandleMouseDown={onHandleMouseDown}
                  onExitEdit={(text, html) => {
                    updateBox(b.id, { text, richText: html });
                    setEditingId(null);
                  }}
                />
              ))}
              {snapInfo && <div className="sh-snap-info">{snapInfo}</div>}
            </div>
          </div>

          {/* Paleo keyboard popover — anchored above the toolbar. Hidden by
              default; opens via the keyboard toggle button.                 */}
          {kbdOpen && (
            <div className="sh-paleo-kbd">
              <div className="sh-paleo-kbd-header">
                <span>Paleo Keyboard</span>
                <button className="txt-btn" onClick={paleoBackspace}>⌫ Delete</button>
                <button className="txt-btn" onClick={() => setKbdOpen(false)}>✕</button>
              </div>
              {PALEO_ROWS.map((row, ri) => (
                <div key={ri} className="sh-paleo-kbd-row">
                  {row.map(ch => (
                    <button
                      key={ch}
                      className="sh-paleo-key"
                      // mousedown prevents focus loss before insertion
                      onMouseDown={e => { e.preventDefault(); insertPaleoChar(ch); }}
                    >{ch}</button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* TOOLBAR */}
          <div className="sh-toolbar">
            <div className="sh-tb-section">
              <span className="sh-tb-label">Canvas</span>
              <select onChange={e => {
                const p = CANVAS_PRESETS[+e.target.value];
                if (p) setCanvasSize({ w: p.w, h: p.h });
              }} defaultValue="">
                <option value="" disabled>Preset…</option>
                {CANVAS_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
              </select>
              <input type="number" value={canvasSize.w} min={100}
                     onChange={e => setCanvasSize(s => ({ ...s, w: Math.max(100, +e.target.value || 100) }))} />
              <span style={{ color: 'var(--text3)' }}>×</span>
              <input type="number" value={canvasSize.h} min={100}
                     onChange={e => setCanvasSize(s => ({ ...s, h: Math.max(100, +e.target.value || 100) }))} />
              <label className="sh-tb-color">
                <span style={{ background: bgColor }} />
                <input type="color" value={bgColor} onChange={e => { setBgColor(e.target.value); setBgImage(null); }} />
              </label>
              <label className="txt-btn">
                ⇧ Image
                <input type="file" accept="image/*" onChange={onUploadImage} style={{ display: 'none' }} />
              </label>
              <button className="txt-btn" onClick={() => { setBgImage(null); }}>Clear bg</button>
            </div>

            <div className="sh-tb-section">
              <button className="txt-btn" onClick={addBlankBox}>+ Text</button>
              <button className="txt-btn" disabled={!selectedBox} onClick={duplicateSelected}>Duplicate</button>
              <button className="txt-btn" disabled={!selectedBox} onClick={deleteSelected}>Delete</button>
              <button
                className={`txt-btn ${kbdOpen ? 'sh-active' : ''}`}
                disabled={!selectedBox}
                title="Toggle Paleo-Hebrew keyboard"
                onClick={() => setKbdOpen(o => !o)}>⌨ Paleo</button>
            </div>

            {/* Canvas-alignment buttons (only relevant when a box is selected) */}
            {selectedBox && (
              <div className="sh-tb-section sh-tb-align-buttons">
                <span className="sh-tb-label">Align</span>
                <button className="sh-tb-btn" title="Align to canvas left" onClick={() => alignBox('left')}>⬱</button>
                <button className="sh-tb-btn" title="Center horizontally"  onClick={() => alignBox('hcenter')}>↔</button>
                <button className="sh-tb-btn" title="Align to canvas right" onClick={() => alignBox('right')}>⬰</button>
                <button className="sh-tb-btn" title="Align to canvas top"    onClick={() => alignBox('top')}>↑</button>
                <button className="sh-tb-btn" title="Center vertically"      onClick={() => alignBox('vcenter')}>↕</button>
                <button className="sh-tb-btn" title="Align to canvas bottom" onClick={() => alignBox('bottom')}>↓</button>
                <button className="sh-tb-btn" title="True center"           onClick={() => alignBox('center')}>⊕</button>
              </div>
            )}

            {/* Per-box controls */}
            {selectedBox && (
              <div className="sh-tb-section sh-tb-box-controls">
                <select value={selectedBox.font} onChange={e => updateBox(selId, { font: e.target.value })}>
                  {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <input type="number" value={selectedBox.size} min={8} max={400}
                       onChange={e => updateBox(selId, { size: Math.max(8, +e.target.value || 8) })}
                       style={{ width: 64 }} />
                <label className="sh-tb-color">
                  <span style={{ background: selectedBox.color }} />
                  <input type="color" value={selectedBox.color}
                         onChange={e => applyColor(e.target.value)} />
                </label>
                <div className="sh-tb-swatches">
                  {COLOR_PALETTE.map(c => (
                    <button key={c} className="sh-swatch" style={{ background: c }}
                            // mousedown not click — preserve selection before applying
                            onMouseDown={e => { e.preventDefault(); applyColor(c); }} />
                  ))}
                </div>
                <button className={`sh-tb-btn ${selectedBox.bold ? 'active' : ''}`}
                        onMouseDown={e => { e.preventDefault(); toggleStyle('bold', 'bold'); }}><b>B</b></button>
                <button className={`sh-tb-btn ${selectedBox.italic ? 'active' : ''}`}
                        onMouseDown={e => { e.preventDefault(); toggleStyle('italic', 'italic'); }}><i>I</i></button>
                <button className={`sh-tb-btn ${selectedBox.underline ? 'active' : ''}`}
                        onMouseDown={e => { e.preventDefault(); toggleStyle('underline', 'underline'); }}><u>U</u></button>
                <div className="sh-tb-align">
                  {['left','center','right'].map(a => (
                    <button key={a} className={`sh-tb-btn ${selectedBox.align === a ? 'active' : ''}`}
                            onClick={() => updateBox(selId, { align: a })}>{a[0].toUpperCase()}</button>
                  ))}
                </div>
                <label className="sh-tb-rot">
                  Rotate
                  <input type="range" min={-180} max={180} step={1}
                         value={selectedBox.rotation}
                         onChange={e => updateBox(selId, { rotation: +e.target.value })} />
                  <span>{selectedBox.rotation}°</span>
                </label>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT RENDERER — rich-text aware
// ─────────────────────────────────────────────────────────────────────────────

// Walk the richText HTML and emit a flat list of styled "runs" plus paragraph
// breaks (marked with text === '\n' so the layout pass treats them as forced
// line breaks). Inherits the box's base style, then overrides per-tag:
//   <b>/<strong>            → bold
//   <i>/<em>                → italic
//   <u>                     → underline
//   <span style="color:…">  → color
//   <br>                    → paragraph break
// Other tags are recursed-into without altering style.
function extractStyledRuns(html, baseStyle) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.querySelector('div');
  const runs = [];
  const walk = (node, style) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) { // text
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
      // Inline style="color: ..." — execCommand foreColor produces this shape
      if (child.style?.color) next = { ...next, color: child.style.color };
      // Some browsers emit <font color="...">  — older execCommand output
      const fontColor = child.getAttribute?.('color');
      if (fontColor) next = { ...next, color: fontColor };
      walk(child, next);
    }
  };
  walk(root, baseStyle);
  return runs;
}

// Lay out a list of styled runs into wrapped lines for a given pixel width.
// Returns an array of lines; each line is an array of segments
// `{ text, color, bold, italic, underline, font, size }`. Word-wraps within
// each run, breaks lines at the run-emitted '\n' paragraph markers, and never
// orphans whitespace at the start of a wrapped line.
function layoutLines(ctx, runs, maxWidth) {
  const setFont = (s) => {
    ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : ''}${s.size}px ${s.font}`;
  };
  const lines = [];
  let current = []; // segments on the current line
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
    // Split the run into chunks: words and whitespace separators
    const pieces = run.text.split(/(\s+)/).filter(p => p !== '');
    for (const piece of pieces) {
      setFont(run);
      const pw = ctx.measureText(piece).width;
      if (curWidth + pw > maxWidth && current.length) {
        pushLine();
        if (/^\s+$/.test(piece)) continue; // skip leading whitespace on wrapped line
      }
      append({ ...run, text: piece });
    }
  }
  if (current.length) pushLine();
  return lines;
}

// Measure a laid-out line. Each segment carries its own font; we sum widths
// with the appropriate font set on the context.
function measureLine(ctx, line) {
  let w = 0;
  for (const seg of line) {
    ctx.font = `${seg.italic ? 'italic ' : ''}${seg.bold ? '700 ' : ''}${seg.size}px ${seg.font}`;
    w += ctx.measureText(seg.text).width;
  }
  return w;
}

// ─────────────────────────────────────────────────────────────────────────────
// TextBox — single text-box on the canvas. Lives in its own component so React
// can give the contenteditable the correct lifecycle:
//   - not editing → render via dangerouslySetInnerHTML from props.richText
//   - on edit-enter → set innerHTML ONCE from props.richText, then leave the DOM
//     alone so the browser's caret/selection survives. React MUST NOT replace
//     children during editing, or every keystroke would blow away the cursor.
//   - on edit-exit (blur) → read innerText + innerHTML out of the DOM and bubble
//     both back to the parent as the new text/richText fields.
// ─────────────────────────────────────────────────────────────────────────────
function TextBox({
  box, canvasSize, isSel, isEditing, editingTextRef,
  onMouseDown, onDoubleClick, onHandleMouseDown, onExitEdit,
}) {
  const internalRef = useRef(null);
  // Bridge external ref (used by parent for caret-aware actions like paleo-insert)
  // and internal ref (used by this component to set initial innerHTML on edit).
  const setRefs = useCallback((el) => {
    internalRef.current = el;
    if (editingTextRef) editingTextRef.current = el;
  }, [editingTextRef]);

  // One-shot effect on edit-enter: copy the current richText into the
  // contenteditable's DOM, focus it, and place the caret at the end so typing
  // appends naturally. Re-runs only when editing toggles or box id changes —
  // crucially NOT on richText changes during editing.
  useEffect(() => {
    if (!isEditing) return;
    const el = internalRef.current;
    if (!el) return;
    el.innerHTML = box.richText || (box.text ? box.text.replace(/\n/g, '<br>') : '');
    el.focus();
    // Place caret at the end
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, box.id]);

  const sx = canvasSize.w, sy = canvasSize.h;

  const innerStyle = {
    fontFamily: box.font,
    fontSize: `min(${box.size}px, ${box.size / canvasSize.h * 100}cqh)`,
    color: box.color,
    textAlign: box.align,
    fontWeight: box.bold ? 700 : 400,
    fontStyle: box.italic ? 'italic' : 'normal',
    textDecoration: box.underline ? 'underline' : 'none',
  };

  return (
    <div
      className={`sh-box ${isSel ? 'sel' : ''} ${isEditing ? 'editing' : ''}`}
      style={{
        left: `${box.x / sx * 100}%`,
        top: `${box.y / sy * 100}%`,
        width: `${box.w / sx * 100}%`,
        height: `${box.h / sy * 100}%`,
        transform: box.rotation ? `rotate(${box.rotation}deg)` : null,
      }}
      onMouseDown={e => onMouseDown(e, box.id)}
      onDoubleClick={onDoubleClick}
    >
      {isEditing ? (
        <div
          ref={setRefs}
          className="sh-box-text"
          style={innerStyle}
          contentEditable
          suppressContentEditableWarning
          onBlur={e => onExitEdit(e.target.innerText, e.target.innerHTML)}
          onKeyDown={e => { if (e.key === 'Escape') e.currentTarget.blur(); }}
        />
      ) : (
        <div
          className="sh-box-text"
          style={innerStyle}
          dangerouslySetInnerHTML={{ __html: box.richText || (box.text ? escapeHTMLOuter(box.text).replace(/\n/g, '<br>') : '') }}
        />
      )}
      {isSel && !isEditing && (
        <>
          {['nw','n','ne','e','se','s','sw','w'].map(h => (
            <div key={h} className={`sh-handle sh-h-${h}`}
                 onMouseDown={e => onHandleMouseDown(e, box.id, h)} />
          ))}
        </>
      )}
    </div>
  );
}

// Module-scope HTML escape (the parent component also has one, kept here so
// TextBox can render legacy boxes that only have `text` and no `richText`).
function escapeHTMLOuter(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
