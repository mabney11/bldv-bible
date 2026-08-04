# Paleo-Hebrew Translation Studio — React (Vite)

A React port of the legacy multi-HTML app. Same backend API, same data, same
glyph engine, same URL surface. Mobile-first layouts. Includes:

- **Snap fix** on the lexicon sidebar (you can jump backwards to earlier
  letters after jumping to a later one — see `src/pages/Lexicon.jsx`).
- **No client-side caching** on the lexicon — each tab fetches from the
  backend on visit. The "All Surfaces" tab goes through `/api/nav/surfaces`
  (the surface DB) directly.
- **3 font sliders** on `/parallel`: English translation,
  Paleo glyphs, and paleo-side translit/English.
- **Mobile-first redesigns**: bottom-sheet display panels, larger tap targets,
  horizontally-scrolling tab bars, stacked parallel columns.

## Routes

| Path | Page |
|------|------|
| `/` | Hebrew Viewer (was `index.html`) |
| `/landing` | Landing page |
| `/parallel` | English↔Hebrew Parallel (3 sliders) |
| `/lexicon-page` (or `/lexicon`) | Lexicon Explorer (snap fix, no cache) |
| `/roots` (or `/root`) | Root Explorer (full) |
| `/surfaces` | Surface Explorer (full) |
| `/cheatsheet` | BHS token cheatsheet (full) |
| `/translate` | Translation Studio (full — edit/view modes, conflict-aware linker, chapter view, overview) |
| `/share` | Share & Export (full — canvas editor, snap guides, paleo keyboard, PNG export) |
| `/glyph-editor` | Glyph Editor (full — per-mode drawing, transform panel, server bake) |

See `SERVER_INTEGRATION.md` for how this connects to your existing
`server.js` and database.

## Setup

```bash
cd paleo-studio
npm install
npm run dev          # http://localhost:5173
```

The Vite dev server proxies `/api`, `/lexicon`, and `/admin` to your
Paleo-Hebrew backend. By default it points at `http://localhost:8080`;
override via environment variable:

```bash
PALEO_API_HOST=http://your-host:8080 npm run dev
```

## Build

```bash
npm run build        # outputs to dist/
npm run preview      # serve the build locally
```

To deploy: drop `dist/` behind any static host that can proxy `/api`,
`/lexicon`, `/admin` to your backend.

## Architecture

```
src/
├── main.jsx                  React entry
├── App.jsx                   Router
├── styles/
│   ├── tokens.css            Theme variables (dark + light)
│   └── globals.css           Resets, base styles, stub-page utility
├── lib/
│   ├── paleoGlyphs.js        Port of /paleo-glyphs.js + paleoWordFlex,
│   │                          paleoCharNoMargin (which were missing from
│   │                          the original lib — lexicon fell back to
│   │                          Unicode), with subscribe() for React reactivity
│   ├── books.js              BOOK_NAMES, PALEO_LETTERS, translit, paleoSortKey
│   ├── tokenLabels.js        BHS field/value dictionaries
│   ├── api.js                Wrappers for all 23 backend endpoints
│   └── morphColors.css       Full morphology color system
├── hooks/
│   ├── useTheme.js           Light/dark
│   ├── usePaleoMode.js       Desktop/mobile glyph mode
│   ├── useLocalStorageNumber.js  Slider state + CSS var
│   ├── useSwipeNav.js        Touch swipe + arrow-key nav
│   ├── useHideOnScroll.js    Top-bar hide-on-scroll
│   └── useIsMobile.js        Breakpoint detection
├── components/
│   ├── TopBar.jsx            Sticky two-row toolbar
│   ├── BookChapterVerseSelects.jsx
│   ├── DisplayPanel.jsx      Bottom-sheet on mobile, dropdown on desktop
│   ├── WordBlock.jsx         Paleo + translit + translation + Strongs
│   ├── PaleoGlyph.jsx        Single glyph component
│   ├── SideNav.jsx           Floating prev/next arrows
│   ├── TranslitGuide.jsx     Modal
│   └── Toast.jsx             Context + provider
└── pages/
    ├── Landing.jsx
    ├── HebrewViewer.jsx      The main reader
    ├── Parallel.jsx          With the 3 sliders
    ├── Lexicon.jsx           With snap-fix + no-cache
    ├── Translate.jsx         (stub)
    ├── Share.jsx             (stub)
    ├── Root.jsx              (stub, wires the API)
    ├── Cheatsheet.jsx        (stub)
    └── GlyphEditor.jsx       (stub)
```

## The lexicon snap bug — root cause + fix

**Bug:** in the original, `jumpToLetter()` did:

```js
lw.scrollTo({ top: lw.scrollTop + anchor.getBoundingClientRect().top
                                 - lw.getBoundingClientRect().top });
```

When you'd jumped to a *later* letter (so that letter's `.letter-anchor` was
currently pinned at `top:0` due to `position:sticky`) and then tried to jump
*back* to an earlier letter, the calculation used the visible (sticky)
position of whatever anchor was currently pinned, which evaluated to
near-zero. Adding zero to `scrollTop` left you where you were.

**Fix:** use `anchor.offsetTop` measured against the scrolling container
(which is now `position:relative`). `offsetTop` is the element's static
layout position — completely independent of any sticky positioning anywhere
in the tree — so it gives the correct target every time, regardless of
which direction you're jumping.

See `src/pages/Lexicon.jsx` → `jumpToLetter` and the `.lex-list { position:
relative; }` rule in `src/pages/Lexicon.css`.

## What's still TODO (next iteration)

- `Translate` — 3-pane editor with rich-text + drag-link grid.
- `Share` — canvas-based text-on-image studio.
- `GlyphEditor` — freehand canvas + transform panel.

These three are the most specialized (drag-link editor, canvas compositing,
freehand drawing). They're routed and have their API hooks ready; only their
UI components remain. Everything else — Landing, Hebrew Viewer, Parallel
(3 sliders), Lexicon (snap-fix + no-cache), Root/Surfaces, and the
Cheatsheet — is fully ported.
