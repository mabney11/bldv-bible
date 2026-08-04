// localOverlay.js — "only affects their machine" storage for public (non-admin)
// visitors.
//
// THE MODEL
//   The server is always the single source of truth for what everyone SEES by
//   default: your published lexicons (/lexicon/*.json) and your published
//   translations (/api/translate/*) never change because of anything a visitor
//   does. Admin (you, logged in — see adminStatus() below) still writes straight
//   through to the server, exactly like before this existed.
//
//   Everyone else's edits — retranslating a verse, adding/removing a link,
//   uploading a replacement lexicon file — are saved ONLY in their own browser,
//   in IndexedDB, as an overlay layered on top of whatever the server currently
//   returns. Nothing a visitor does ever reaches your server. Clearing their
//   browser storage (or using a different browser/device) loses their local
//   edits — that's the "only affects their machine" contract.
//
//   "Pull latest" = re-fetch the server's current data. Since GET requests are
//   never cached beyond normal HTTP by this app, that's automatic for anything
//   NOT locally overridden. For something a visitor HAS locally overridden,
//   "pull latest" means discarding their local override so the server's current
//   version shows through again — resetLocalVerse / resetLocalLexicon /
//   resetAllLocal below do exactly that, per-item or all at once.
//
// WHAT'S STORED
//   translations      — one row per (book, chapter, verse, lang): local text /
//                        rich_text / status, overlaid on the server's verse.
//   links             — one row per (book, chapter, verse, lang): the full local
//                        link list for that verse (replaces the server's list
//                        entirely once a visitor touches links for that verse,
//                        same as how the Studio UI already treats a verse's link
//                        set as one unit).
//   lexiconOverrides  — one row per lexicon name ('lexicon' | 'homographs' |
//                        'definitions' | 'hebrew-extra-lexicon' | a custom
//                        uploaded name): a full or partial JSON object, in the
//                        SAME shape as the published file, merged key-by-key
//                        over the base (an uploaded entry replaces the base
//                        entry with the same key; everything else in the base
//                        still shows through).

const DB_NAME = 'paleo-studio-local';
const DB_VERSION = 1;
const STORES = ['translations', 'links', 'lexiconOverrides'];

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(store, key) {
  const db = await openDb();
  try { return await tx(db, store, 'readonly', s => reqToPromise(s.get(key))); }
  finally { db.close(); }
}
async function idbSet(store, key, value) {
  const db = await openDb();
  try { return await tx(db, store, 'readwrite', s => reqToPromise(s.put(value, key))); }
  finally { db.close(); }
}
async function idbDelete(store, key) {
  const db = await openDb();
  try { return await tx(db, store, 'readwrite', s => reqToPromise(s.delete(key))); }
  finally { db.close(); }
}
async function idbGetAllKeys(store) {
  const db = await openDb();
  try { return await tx(db, store, 'readonly', s => reqToPromise(s.getAllKeys())); }
  finally { db.close(); }
}
async function idbClear(store) {
  const db = await openDb();
  try { return await tx(db, store, 'readwrite', s => reqToPromise(s.clear())); }
  finally { db.close(); }
}

// ── admin status ─────────────────────────────────────────────────────────────
// Cached in memory for the life of the tab. Call refreshAdminStatus() right
// after a login/logout round-trip so the UI updates without a full reload.
let _adminStatus = null; // { isAdmin, configured } | null (not yet checked)
let _adminStatusPromise = null;

export async function getAdminStatus() {
  if (_adminStatus) return _adminStatus;
  if (!_adminStatusPromise) {
    _adminStatusPromise = fetch('/admin/session')
      .then(r => r.ok ? r.json() : { isAdmin: false, configured: false })
      .catch(() => ({ isAdmin: false, configured: false }))
      .then(s => { _adminStatus = s; return s; });
  }
  return _adminStatusPromise;
}
export function refreshAdminStatus() {
  _adminStatus = null;
  _adminStatusPromise = null;
  return getAdminStatus();
}
/** Sync read of the last-known status (false/undefined until getAdminStatus()
 *  has resolved at least once — callers that need a definite answer before
 *  rendering should await getAdminStatus() instead). */
export function isAdminCached() {
  return !!(_adminStatus && _adminStatus.isAdmin);
}

// ── translations: local verse text/status ───────────────────────────────────
// The English translation is ONE per (book, chapter, verse) — shared across
// every source language/edition, exactly like the server's `translations`
// table (primary key book_id/chapter/verse, no lang column). No lang in this
// key: saving while viewing one source edition and switching to another must
// keep showing the same local edit, not a different one per picker value.
const verseKey = (book, chapter, verse) => `${book}:${chapter}:${verse}`;

export async function getLocalVerse(book, chapter, verse) {
  return (await idbGet('translations', verseKey(book, chapter, verse))) || null;
}
export async function saveLocalVerse(book, chapter, verse, { text, rich_text, status }) {
  const value = {
    book_id: book, chapter, verse,
    text: text || '', rich_text: rich_text || '', status: status || 'in_progress',
    updated_at: new Date().toISOString(),
  };
  await idbSet('translations', verseKey(book, chapter, verse), value);
  return value;
}
export async function resetLocalVerse(book, chapter, verse) {
  await idbDelete('translations', verseKey(book, chapter, verse));
}
/** All local verse overrides for one chapter, as an array of the same shape
 *  saveLocalVerse stores ({ book_id, chapter, verse, text, rich_text, status }).
 *  Lets a whole-chapter view (Reader, Parallel, Share) merge in one pass
 *  instead of one IndexedDB lookup per verse — so a local edit shows up
 *  everywhere the translation is displayed, not just in Translate Studio. */
export async function getLocalVersesForChapter(book, chapter) {
  const db = await openDb();
  try {
    return await tx(db, 'translations', 'readonly', s => new Promise((resolve, reject) => {
      const out = [];
      const cursorReq = s.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const v = cursor.value;
          if (v.book_id === book && String(v.chapter) === String(chapter)) out.push(v);
          cursor.continue();
        } else resolve(out);
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    }));
  } finally { db.close(); }
}
/** Overlay a chapter's worth of local verse edits on top of a server
 *  GET /api/translate/chapter response's `verses` array (or any array of
 *  objects with a `verse` field). */
export function mergeChapterVersesWithLocal(verses, localOverrides) {
  if (!localOverrides || !localOverrides.length) return verses;
  const byVerse = new Map(localOverrides.map(v => [Number(v.verse), v]));
  return (verses || []).map(v => {
    const local = byVerse.get(Number(v.verse));
    if (!local) return v;
    return { ...v, text: local.text, rich_text: local.rich_text, status: local.status, local: true };
  });
}
/** Overlay a local verse edit (if any) on top of the server's GET /api/translate/verse
 *  response shape, so callers can treat the result exactly like a normal server response. */
export function mergeVerseWithLocal(serverVerse, local) {
  if (!local) return serverVerse;
  return {
    ...serverVerse,
    status: local.status,
    text: local.text,
    rich_text: local.rich_text,
    prefilled: false,
    local: true, // lets the UI show "saved locally, not published" instead of a normal saved state
  };
}

// ── translations: local link sets ────────────────────────────────────────────
// A verse's link set is stored as one array once a visitor touches it locally,
// same granularity the Studio UI already edits at (add/update/delete all act on
// "this verse's links"). Local link ids are negative so they can never collide
// with a real server-assigned id if this code path is ever reused against a
// mixed local+server list.
//
// Links ARE per source edition (BHS / HEB / GNT / ...) — but keyed by the
// EDITION THE TOKENS ACTUALLY CAME FROM (Translate.jsx's `tokenSource`, from
// the server's `token_source` field), not the raw language-picker value. The
// server picks the token table by book, not by the picker, so for some books
// the picker can say one thing while the tokens (and thus the link ordinals)
// are from a different edition — callers MUST pass tokenSource here, same as
// the server-side lang argument on /api/translate/link.
const linkKey = (book, chapter, verse, edition) => `${book}:${chapter}:${verse}:${(edition || 'BHS').toUpperCase()}`;

export async function getLocalLinks(book, chapter, verse, edition) {
  const row = await idbGet('links', linkKey(book, chapter, verse, edition));
  return row ? row.links : null; // null = "no local override yet, use the server's list"
}
async function setLocalLinks(book, chapter, verse, edition, links) {
  await idbSet('links', linkKey(book, chapter, verse, edition), { links, updated_at: new Date().toISOString() });
  return links;
}
let _localLinkIdSeq = -1;
export async function addLocalLink(book, chapter, verse, edition, payload, serverLinksIfNoOverrideYet) {
  const existing = await getLocalLinks(book, chapter, verse, edition);
  const base = existing != null ? existing : (serverLinksIfNoOverrideYet || []);
  const link = { ...payload, id: _localLinkIdSeq--, book_id: book, chapter, verse, lang: (edition || 'BHS').toUpperCase() };
  return setLocalLinks(book, chapter, verse, edition, [...base, link]);
}
export async function updateLocalLink(book, chapter, verse, edition, id, payload, serverLinksIfNoOverrideYet) {
  const existing = await getLocalLinks(book, chapter, verse, edition);
  const base = existing != null ? existing : (serverLinksIfNoOverrideYet || []);
  return setLocalLinks(book, chapter, verse, edition, base.map(l => (l.id === id ? { ...l, ...payload, id } : l)));
}
export async function deleteLocalLink(book, chapter, verse, edition, id, serverLinksIfNoOverrideYet) {
  const existing = await getLocalLinks(book, chapter, verse, edition);
  const base = existing != null ? existing : (serverLinksIfNoOverrideYet || []);
  return setLocalLinks(book, chapter, verse, edition, base.filter(l => l.id !== id));
}
export async function clearLocalLinks(book, chapter, verse, edition) {
  return setLocalLinks(book, chapter, verse, edition, []);
}
/** Replace the whole local link list for a verse in one write — used for
 *  operations (like merging overlapping links) that touch several links at
 *  once and shouldn't be expressed as a sequence of add/update/delete calls. */
export async function setLocalLinksOverride(book, chapter, verse, edition, links) {
  return setLocalLinks(book, chapter, verse, edition, links);
}
export async function resetLocalLinksOverride(book, chapter, verse, edition) {
  await idbDelete('links', linkKey(book, chapter, verse, edition)); // back to the server's list
}

// ── lexicon overrides ────────────────────────────────────────────────────────
// One entry per lexicon name. `data` is a full or partial JSON object in the
// same shape as the published file — merged key-by-key over the base, so a
// visitor can override just a handful of entries without re-supplying the
// whole lexicon.
const KNOWN_LEXICONS = ['lexicon', 'homographs', 'definitions', 'hebrew-extra-lexicon'];

export async function listLexiconOverrides() {
  return idbGetAllKeys('lexiconOverrides');
}
export async function getLexiconOverride(name) {
  return (await idbGet('lexiconOverrides', name)) || null;
}
export async function saveLexiconOverride(name, data, meta = {}) {
  const value = { data, filename: meta.filename || null, uploadedAt: new Date().toISOString() };
  await idbSet('lexiconOverrides', name, value);
  return value;
}
export async function resetLexiconOverride(name) {
  await idbDelete('lexiconOverrides', name);
}
/** Shallow key-level merge: any key present in the override replaces the base
 *  entry for that key; every other base key shows through unchanged. */
export function mergeLexicon(base, override) {
  if (!override) return base;
  return { ...(base || {}), ...override };
}
/** Basic shape validation before accepting an uploaded file: must be a JSON
 *  object (not an array/primitive), and if it's meant for a known lexicon name,
 *  spot-check that at least one existing key looks like a lexicon entry (an
 *  object, not a bare string/number) — catches "wrong file" uploads early
 *  without needing to know every lexicon's exact schema. */
export function validateLexiconShape(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'File must be a JSON object of { "key": { ...entry } } pairs, matching lexicon.json / homographs.json.' };
  }
  const keys = Object.keys(data);
  if (keys.length === 0) return { ok: false, error: 'File has no entries.' };
  const sample = data[keys[0]];
  if (sample === null || typeof sample !== 'object') {
    return { ok: false, error: `Entry "${keys[0]}" is not an object — expected each top-level key to map to an entry object, like the published lexicon files.` };
  }
  return { ok: true, count: keys.length };
}
export { KNOWN_LEXICONS };

// ── bulk: pull latest / export / import ──────────────────────────────────────
/** Discard ALL local overrides (translations, links, lexicons) so every page
 *  in this browser reverts to showing exactly what the server publishes. */
export async function resetAllLocal() {
  for (const store of STORES) await idbClear(store);
}
export async function hasAnyLocalOverrides() {
  for (const store of STORES) {
    const keys = await idbGetAllKeys(store);
    if (keys.length) return true;
  }
  return false;
}
/** Export everything a visitor has changed locally, as one downloadable JSON
 *  blob — lets them back up or move their local edits between browsers/devices
 *  (upload it back in via importLocalData). */
export async function exportLocalData() {
  const out = {};
  for (const store of STORES) {
    const db = await openDb();
    try {
      out[store] = await tx(db, store, 'readonly', s => new Promise((resolve, reject) => {
        const entries = [];
        const cursorReq = s.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) { entries.push([cursor.key, cursor.value]); cursor.continue(); }
          else resolve(entries);
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      }));
    } finally { db.close(); }
  }
  return out;
}
export async function importLocalData(dump) {
  for (const store of STORES) {
    for (const [key, value] of dump[store] || []) await idbSet(store, key, value);
  }
}
