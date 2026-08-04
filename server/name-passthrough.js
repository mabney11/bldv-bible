'use strict';
// English-baseline name/place passthrough. Every proper noun/place is spelled
// via the app's own transliteration (getTranslit of the Hebrew), sourced from
// name-map-expanded.json. Theonyms are matched case-sensitively (so capitalized
// deity words differ from lowercase generic "gods"); names case-insensitively
// with hyphenated compounds split and each part transliterated.
// Title-cases each space/hyphen-separated part: first letter up, REST forced lower —
// not just "leave the rest as-is". Without the .toLowerCase(), an all-caps stylistic
// word ("JESUS", used at the start of speaking-turn paragraphs in some translations)
// title-cases to "JESUS" (unchanged) instead of "Jesus", so it never matches a
// `single` map key and silently passes through unsanitized. Found 2026-07-30 via
// Pistis Sophia: "JOHN also came forward..." stayed "JOHN" while "John" elsewhere in
// the same text correctly became "Yawachanan".
const tc = s => s ? s.split(/([ \-])/).map(p=>/^[a-z]/i.test(p)?p[0].toUpperCase()+p.slice(1).toLowerCase():p).join('') : s;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

function makePassthrough(map, { gloss=false, theonymGloss=false } = {}) {
  const single = map.single||{}, phrases = map.phrases||{}, theonyms = map.theonyms||{};
  const theoKeys   = Object.keys(theonyms).sort((a,b)=>b.length-a.length);
  const phraseKeys = Object.keys(phrases).sort((a,b)=>b.length-a.length);
  const G = (r,orig)=> gloss ? `${r} (${orig})` : r;

  // Single-word divine titles, used to build the literal word-for-word reading
  // of a compound title (Almighty God → Shaday Alahayam).
  const singleTheo = {};
  for (const [k,v] of Object.entries(theonyms)) if (!/\s/.test(k)) singleTheo[k] = v;

  // Divine titles keep all forms in one gloss: canonical (literal / original) —
  // e.g. "Al Shaday (Shaday Alahayam / Almighty God)". The literal is shown only
  // when every word of the title is itself a known title and it differs from the
  // canonical form; otherwise just "Canonical (Original)".
  function theonymRender(phrase) {
    const canon = theonyms[phrase];
    if (!theonymGloss) return canon;
    const litParts = phrase.split(/\s+/).map(w => singleTheo[w] || null);
    const literal = litParts.every(Boolean) ? litParts.join(' ') : null;
    return (literal && literal !== canon)
      ? `${canon} (${literal} / ${phrase})`
      : `${canon} (${phrase})`;
  }

  return function pass(text){
    if(!text) return text;
    // replaced spans are stashed as \x00N\x00 placeholders (no letters) so later
    // steps never re-scan an already-transliterated name.
    const store=[]; const stash=r=>{ store.push(r); return '\x00'+(store.length-1)+'\x00'; };
    // 1) theonyms — case-SENSITIVE, longest first (God→Alahayam, but "gods" untouched)
    for(const k of theoKeys){
      text = text.replace(new RegExp(`\\b${esc(k)}\\b`,'g'), ()=>stash(theonymRender(k)));
    }
    // 2) multi-word phrase names — case-insensitive, longest first
    for(const k of phraseKeys){
      text = text.replace(new RegExp(`\\b${esc(k)}\\b`,'gi'), m=>stash(G(phrases[k],m)));
    }
    // 3) single words (+ hyphen compounds). Capitalized standalone words match;
    //    inside a hyphen-compound every part is transliterated regardless of case.
    // Guard against creating a self-referential gloss like "Aman (Amen)" ->
    // "Aman (Aman)" or "Idah (Adah)" -> "Idah (Idah)". This app's OWN canonical
    // Strong's rendering already bakes "TRANSLITERATION (English gloss)" pairs; if
    // this word is wrapped in parens directly after a word that's ALREADY the
    // replacement about to be produced, it's that same gloss pattern repeating,
    // not ordinary prose to sanitize — leave the gloss's English word alone. A
    // genuine editorial parenthetical elsewhere ("he (JESUS) might come down" ->
    // "he (Yashawai)...") has a DIFFERENT word before the "(", so this only ever
    // fires on the true collision. Matches [A-Za-z'] only (not \S), so adjacent
    // punctuation like an opening quote (`"Idah (`) doesn't get swept into the
    // comparison and silently break the match.
    const isSelfGloss = (full, offset, replacement) => {
      const before = full.slice(0, offset);
      const m = before.match(/([A-Za-z][A-Za-z']*)\s*\($/);
      return !!(m && m[1] === replacement);
    };
    text = text.replace(/[A-Za-z][A-Za-z']*(?:-[A-Za-z][A-Za-z']*)*/g, (w, offset, full)=>{
      if(w.includes('-')){
        let hit=false;
        const out=w.split('-').map(p=>{ const r=single[tc(p)]; if(r){hit=true; return G(r,p);} return p; });
        if(!hit) return w;
        const composed = out.join('-');
        return isSelfGloss(full, offset, composed) ? w : stash(composed);
      }
      if(/^[A-Z]/.test(w)){
        const r=single[tc(w)];
        if(r) return isSelfGloss(full, offset, r) ? w : stash(G(r,w));
      }
      return w;
    });
    return text.replace(/\x00(\d+)\x00/g,(_,i)=>store[+i]);
  };
}
module.exports = { makePassthrough };
