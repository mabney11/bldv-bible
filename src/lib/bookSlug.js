// bookSlug.js — stable, human-readable book identifiers for URLs.
//
// The app's master identity is still canon_id + book-order.json; this layer just
// maps a readable slug (?book=john, ?book=book-of-jasher) to/from that canon_id
// so URLs don't carry raw numbers and survive reordering. Numbers still resolve
// too, so every existing ?book=43 link keeps working.
//
// Both readers build these maps from the SAME /api/book-order list with the SAME
// slugify, so a given book gets the same slug everywhere — which is what makes
// the Parallel ↔ Hebrew Viewer cross-links line up.

export function slugify(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/['".,:;!?()[\]]/g, '')   // drop punctuation
    .replace(/&/g, 'and')
    .replace(/[_\s]+/g, '-')           // spaces / underscores → hyphen
    .replace(/[^a-z0-9-]/g, '')        // strip anything else
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// entries: [{ id, name }] in any order. Returns { slugToId, idToSlug }.
// On a name collision (e.g. the Gospel of John vs a work named "John"), the
// LOWER canon_id wins the clean slug and later ones get -2, -3… — so the
// canonical book gets `john` and the work gets `john-2`. Deterministic and
// identical across readers regardless of the input order.
export function buildBookSlugs(entries) {
  const slugToId = {}, idToSlug = {}, used = {};
  const sorted = [...(entries || [])].filter(e => e && e.id != null).sort((a, b) => a.id - b.id);
  for (const e of sorted) {
    const base = slugify(e.name) || `book-${e.id}`;
    let slug = base, n = 1;
    while (used[slug] != null && used[slug] !== e.id) { n += 1; slug = `${base}-${n}`; }
    used[slug] = e.id;
    if (idToSlug[e.id] == null) idToSlug[e.id] = slug;
    slugToId[slug] = e.id;
  }
  return { slugToId, idToSlug };
}

// A URL ?book value → canon_id. Numeric passes through (back-compat); a slug is
// looked up; anything unresolved returns the fallback.
export function resolveBookParam(param, slugToId, fallback = 1) {
  if (param == null || param === '') return fallback;
  if (/^\d+$/.test(param)) return parseInt(param, 10);
  const id = slugToId ? slugToId[String(param).toLowerCase()] : null;
  return id != null ? id : fallback;
}

// canon_id → the string to put in the URL (slug when known, else the number).
export function bookToParam(id, idToSlug) {
  const s = idToSlug ? idToSlug[id] : null;
  return s || String(id);
}

// canon_id + chapter (+ optional verse, optional non-default source lang) →
// the Parallel view's clean path URL: /parallel/<slug>/<chapter> or
// /parallel/<slug>/<chapter>-<verse> (chapter and verse joined by a hyphen
// in one path segment, matching the reference interlinear sites this app's
// Parallel view is modeled on — e.g. biblehub.com/interlinear/deuteronomy/
// 13-3.htm), with ?lang= appended only when it isn't the BHS default.
// Shared by every page that links INTO Parallel (Reader, HebrewViewer,
// MultiViewer, Translate, VersePage, Landing) and by Parallel.jsx itself
// when it rewrites its own address bar to match its current book/chapter/
// verse/lang, so all of them always agree on the exact same URL shape.
export function parallelHref(id, idToSlug, chapter, verse, lang) {
  let path = `/parallel/${bookToParam(id, idToSlug)}/${chapter}`;
  if (verse != null) path += `-${verse}`;
  if (lang && lang !== 'BHS') path += `?lang=${encodeURIComponent(lang)}`;
  return path;
}
