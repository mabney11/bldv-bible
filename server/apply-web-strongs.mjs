// apply-web-strongs.mjs — build english-baseline.jsonl from the Strong's-tagged WEB.
//
//   node apply-web-strongs.mjs --dry-run     inspect first (writes nothing)
//   node apply-web-strongs.mjs               write english-baseline.jsonl
//
// HOW IT WORKS — there is no inference left anywhere in this file.
//   web-strongs.jsonl gives each English phrase with its Strong's:
//       H1697  "in your word."
//   strongs-roots.json turns H1697 into 𐤃𐤁𐤓, and your transliteration turns that
//   into your spelling. So for every phrase we already know the Hebrew. Done.
//
// WHICH WORDS GET REPLACED
//   Not whole phrases — the segment "in your word" is tagged H1697 but only "word"
//   is the Hebrew; "in your" is English connective. So inside each tagged segment we
//   replace the HEAD word, which is whichever word is either
//       * a proper name  (capitalized, and the Strong's is a proper noun), or
//       * one of your sacred terms (sacred-terms.txt)
//   and leave everything else in English. A segment with no such word is untouched.
//
//   names -> bare:      Abaram
//   terms -> glossed:   zarai (seed)
//
// The Strong's is READ, never guessed. If a segment's Strong's has no Paleo root in
// strongs-roots.json, the word stays English and is reported — that is a gap in your
// root table, not something to paper over.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const argv = (f,d) => { const i = args.indexOf(f); return i>=0 ? args[i+1] : d; };
const DRY   = args.includes('--dry-run');
const SRC   = argv('--src', './web-strongs.jsonl');
const TERMS_F = argv('--terms', './sacred-terms.txt');
const OUT   = argv('--out', './english-baseline.jsonl');
// Names render "Paraih (Pharaoh)" by default. --bare-names restores the older behaviour
// where only peoples.txt entries carried a gloss and every other name printed bare.
const BARE_NAMES = args.includes('--bare-names');
// How dominant one OT spelling must be to carry a term to the untagged books.
// 0 (default) = always carry the most common form; 0.9 restores the old strict rule.
const TERM_DOMINANCE = Math.max(0, Math.min(1, parseFloat(argv('--term-dominance','0')) || 0));
const die = m => { console.error('\u2717 ' + m); process.exit(1); };

for (const f of [SRC]) if (!existsSync(f)) die('not found: ' + f);
// HEAD-WORD SELECTION. A segment like "How I love your law" is tagged H8451 (torah).
// Taking the FIRST candidate gave "love" the slot and left "law" in English. The
// Strong's must CHOOSE its word: among the candidates, pick the one this Strong's is
// actually glossed for. The lexicon is used only for that choice — the Strong's still
// comes from the tagged text, so nothing is being inferred.
const LEXF = ['./strongs-hebrew-expanded.json','./strongs-hebrew.json'].find(existsSync);
const GLOSS = new Map();
const KJV_SENSE = new Map();   // sn -> readable first KJV sense, for the gloss fallback
if (LEXF) {
  const LEX = JSON.parse(readFileSync(LEXF,'utf8'));
  const expand = item => {
    const out = new Set();
    item = item.replace(/\[[^\]]*\]/g,' ').trim();
    const pre = [...item.matchAll(/\(([a-zA-Z]+)-\)/g)].map(m=>m[1].toLowerCase());
    const suf = [...item.matchAll(/\(-([a-zA-Z]+)\)/g)].map(m=>m[1].toLowerCase());
    const st = item.replace(/\([^)]*\)/g,'').replace(/[^a-zA-Z \-]/g,' ').trim();
    for (const raw of st.split(/\s+/).filter(w=>w.length>1)) {
      const b = raw.toLowerCase();
      if (b.includes('-')) { out.add(b.replace(/-/g,'')); for (const q of b.split('-')) if (q.length>1) out.add(q); }
      else out.add(b);
      const base = b.replace(/-/g,'');
      for (const q of pre) out.add(q+base);
      for (const q of suf) { out.add(base+q);
        for (let k=Math.max(3,base.length-4); k<base.length; k++) out.add(base.slice(0,k)+q); }
    }
    return out;
  };
  const nrm = w => { w = w.toLowerCase().replace(/[^a-z]/g,'');
    if (/ies$/.test(w)) return w.slice(0,-3)+'y';
    if (/(sses|shes|ches|xes)$/.test(w)) return w.slice(0,-2);
    if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0,-1);
    return w; };
  // English words that can never be the head word of a Hebrew segment, no matter
  // what the lexicon prose happens to contain.
  const GLOSS_STOP = new Set(['to','of','the','a','an','and','or','in','on','at','by','for',
    'with','from','as','that','which','it','is','be','was','are','were','him','his','her',
    'them','their','this','these','not','no','but','so','then','there','here','also','again',
    'moreover','very','more','most','much','many','such','same','other','any','some','one',
    'thing','things','used','use','only','even','yet','still','out','up','down','off','over',
    'under','into','upon','unto','causatively','figuratively','literally','properly','denominative']);
  // INFLECTIONS. kjv_def lists dictionary forms ("promise", "child", "kindle"), but the
  // verse says "promised", "children", "kindled" — so the word never matched its own
  // Strong's and silently went unglossed. Generating the regular forms (plus the handful of
  // irregular plurals English refuses to regularize) only ever ADDS ways for a word to match
  // the Strong's that already glosses it; it can never create a match with a different one.
  const IRREG = { child:'children', man:'men', woman:'women', foot:'feet', tooth:'teeth',
                  goose:'geese', mouse:'mice', ox:'oxen', brother:'brethren', person:'people' };
  // IRREGULAR VERBS. English's commonest verbs don't inflect by rule, and scripture is made
  // of them. kjv_def lists the dictionary form ("say", "go", "bring") while the verse says
  // "said", "went", "brought" — and the regular rules above actively produce NONSENSE for
  // these ("say" -> "saies"/"saied"), so the word never matched its own Strong's. That one
  // gap accounted for the entire top of the unglossed report: said x2767 (H559 amar),
  // went x957, came x920, made x599, brought x547, took x497, spoke x470, sent x446 …
  const IRREG_VERB = {
    say:['said','says'], go:['went','gone','goes'], come:['came'], make:['made'],
    bring:['brought'], take:['took','taken'], speak:['spoke','spoken'], send:['sent'],
    see:['saw','seen'], hear:['heard'], give:['gave','given'], strike:['struck','stricken'],
    stand:['stood'], build:['built'], tell:['told'], find:['found'], do:['did','done','does'],
    eat:['ate','eaten'], drink:['drank','drunk','drunken'], fall:['fell','fallen'],
    know:['knew','known'], write:['wrote','written'], rise:['rose','risen'], sit:['sat'],
    lie:['lay','lain'], lay:['laid'], run:['ran'], become:['became'], begin:['began','begun'],
    bear:['bore','born','borne'], beat:['beaten'], bind:['bound'], blow:['blew','blown'],
    break:['broke','broken'], choose:['chose','chosen'], catch:['caught'], dig:['dug'],
    draw:['drew','drawn'], drive:['drove','driven'], dwell:['dwelt'], feed:['fed'],
    feel:['felt'], fight:['fought'], flee:['fled'], fly:['flew','flown'],
    forget:['forgot','forgotten'], forgive:['forgave','forgiven'], get:['got','gotten'],
    grow:['grew','grown'], hang:['hung'], have:['had','has'], hide:['hid','hidden'],
    hold:['held'], keep:['kept'], kneel:['knelt'], lead:['led'], leave:['left'],
    lend:['lent'], light:['lit'], lose:['lost'], mean:['meant'], meet:['met'], pay:['paid'],
    ride:['rode','ridden'], ring:['rang','rung'], seek:['sought'], sell:['sold'],
    shake:['shook','shaken'], shine:['shone'], shoot:['shot'], show:['showed','shown'],
    sing:['sang','sung'], sink:['sank','sunk'], sleep:['slept'], slay:['slew','slain'],
    smite:['smote','smitten'], sow:['sowed','sown'], spend:['spent'], spin:['spun'],
    spring:['sprang','sprung'], steal:['stole','stolen'], stick:['stuck'], sting:['stung'],
    strive:['strove','striven'], swear:['swore','sworn'], sweep:['swept'],
    swim:['swam','swum'], teach:['taught'], tear:['tore','torn'], think:['thought'],
    throw:['threw','thrown'], tread:['trod','trodden'], understand:['understood'],
    wake:['woke','woken'], wear:['wore','worn'], weave:['wove','woven'], weep:['wept'],
    win:['won'], wind:['wound'], withdraw:['withdrew','withdrawn'],
  };
  // Reverse direction too: the dictionary sometimes lists the PAST form and the verse the
  // present ("smote" in kjv_def vs "smite" in the verse), so every form maps to every other.
  const IRREG_ALL = new Map();
  for (const [base, forms] of Object.entries(IRREG_VERB)) {
    const family = [base, ...forms];
    for (const f of family) IRREG_ALL.set(f, family);
  }
  const inflect = b => {
    const out = new Set([b]);
    // Irregular verb FIRST — before the length guard, because the shortest verbs in English
    // ("go", "do", "be") are irregular, and a length cutoff would silently drop them.
    // Emit the whole family and STOP: running the regular rules on these produces garbage
    // ("say" -> "saies", "go" -> "goed") that can only mismatch.
    if (IRREG_ALL.has(b)) {
      for (const f of IRREG_ALL.get(b)) out.add(f);
      if (/e$/.test(b)) out.add(b.slice(0,-1)+'ing'); else out.add(b+'ing');
      if (/(s|sh|ch|x|z)$/.test(b)) out.add(b+'es'); else out.add(b+'s');
      return out;
    }
    if (b.length < 3) return out;
    if (IRREG[b]) out.add(IRREG[b]);
    if (/y$/.test(b))                     { out.add(b.slice(0,-1)+'ies'); out.add(b.slice(0,-1)+'ied'); }
    else if (/(s|sh|ch|x|z)$/.test(b))    out.add(b+'es');
    else                                  out.add(b+'s');
    if (/e$/.test(b)) { out.add(b+'d');  out.add(b.slice(0,-1)+'ing'); }
    else              { out.add(b+'ed'); out.add(b+'ing');
                        out.add(b+b.slice(-1)+'ed'); out.add(b+b.slice(-1)+'ing'); }  // stop -> stopped
    return out;
  };
  for (const [sn,e] of Object.entries(LEX)) {
    const g = new Set();
    // kjv_def ONLY — the words translators actually chose. strongs_def is prose and
    // its grammar words polluted every entry: "of", "to", "moreover", "here" all
    // became valid glosses, so they won the head-word slot.
    const src = e.kjv_def || '';
    for (const it of String(src).split(/[,;.]/))
      for (const w of expand(it)) for (const f of inflect(w)) { const n = nrm(f); if (n.length > 1 && !GLOSS_STOP.has(n)) g.add(n); }
    GLOSS.set(sn, g);
    // Keep a READABLE first sense too. GLOSS above is a Set of normalized stems, fine for
    // deciding which word a Strong's glosses but unusable as display text ("wrd"). This
    // keeps the translators' own first choice — "word", "anger" — for the gloss fallback.
    // openscriptures marks idioms with × and phrase-renderings with +, which this expanded
    // dictionary spells out as the literal words "idiom"/"phrase" ("idiom at all",
    // "phrase adversary"). Those are markers, not glosses, so senses starting with them are
    // skipped rather than shown.
    const first = String(src).split(/[,;.]/).map(s => s.replace(/\([^)]*\)/g, '')
      .replace(/[^A-Za-z' -]/g, ' ').replace(/\s+/g, ' ').trim())
      .find(s => s && s.length > 1 && !/^(idiom|phrase)\b/i.test(s));
    if (first) KJV_SENSE.set(sn, first.toLowerCase());
  }
  console.log(`gloss lexicon (head-word selection only): ${LEXF}`);
} else console.log('! no strongs-hebrew.json — head-word selection will fall back to first match');

const rootsPath = ['./lexicon/strongs-roots.json','./strongs-roots.json'].find(existsSync);
if (!rootsPath) die('strongs-roots.json not found');
const ROOTS = JSON.parse(readFileSync(rootsPath,'utf8'));

// ── your transliteration — the ONE source of truth ──────────────────────────
// NOT transliteration.cjs: that only handles Greek and Ge'ez, and returns Hebrew
// unchanged. The Paleo->Latin transliteration is translit() exported from books.js,
// which is what build-names-from-hebrew.mjs uses and what the reader renders with.
// We locate and call the SAME function, so the baseline can never drift from the
// reader — that drift is exactly how Aharan and Aharawan both ended up live.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function locate(name, start = process.cwd(), maxUp = 4) {
  let base = resolve(start);
  for (let up = 0; up <= maxUp; up++) {
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (/^(node_modules|\.git|dist|build)$/.test(e.name)) continue;
          stack.push(join(dir, e.name));
        } else if (e.name === name) return join(dir, e.name);
      }
    }
    base = dirname(base);
  }
  return null;
}

const booksPath = locate('books.js');
if (!booksPath) die('could not find books.js under the project — run this from inside the repo');
const mod = await import(pathToFileURL(booksPath).href);
const translit = mod.translit;
if (typeof translit !== 'function') die(`books.js at ${booksPath} has no translit() export`);
console.log('using translit from: ' + booksPath);
// sanity: the function must actually transform paleo, not pass it through
if (translit('\u{10903}\u{10901}\u{10913}') === '\u{10903}\u{10901}\u{10913}')
  die('translit() returned the paleo unchanged \u2014 wrong function or wrong argument shape');

const TERMS = existsSync(TERMS_F)
  ? new Set(readFileSync(TERMS_F,'utf8').split(/\r?\n/).map(l=>l.trim().toLowerCase())
      .filter(l=>l && !l.startsWith('#')))
  : new Set();

// English modals and auxiliaries are never the head word of a Hebrew segment. They
// are grammar the translator added, not a word the Hebrew has. Without this, "that I
// might not sin" (tagged H2398, sin) handed the slot to "might" and left "sin" in
// English. This is a fact about English, not a judgment call about the text.
// Words that can NEVER carry a gloss — pronouns, articles, conjunctions, relatives. These
// are grammar, never the head word of a Hebrew segment. ("I" is capitalized and so was
// passing the NAME test: "So Dabar will have an answer", "Qawam will rise".)
const NEVER_HEAD = new Set([
  'i','we','he','she','it','they','you','me','him','her','them','us','my','your','his',
  'their','our','a','an','the','o','oh','yes','and','or','not','no','so','then','when',
  'if','as','that','which','who','whom','whose']);

// AUXILIARIES and light verbs. Blocked as head words ONLY when the segment's Strong's does
// not actually gloss them — that is the difference between "you didn't build" (the segment
// is H1129 banah/build; "did" is grammar) and "that you might do them" (the segment IS
// H6213 asah, whose kjv_def literally lists "do", so "do" is the verb and deserves its
// gloss). Blanket-blocking these left ishah (do) unglossed everywhere.
const SOFT_HEAD = new Set([
  'might','may','will','shall','can','must','would','should','could','let',
  'do','does','did','have','has','had','be','is','are','was','were','been','am',
  'this','these','those','all']);

const normT = w => { w = w.toLowerCase().replace(/[^a-z]/g,'');
  if (/ies$/.test(w)) return w.slice(0,-3)+'y';
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0,-1);
  return w; };

// The chapter pages append navigation after the last verse ("Online Parallel Study
// Bible", "Compare ... in other Bible versions", ...). It landed in the final verse
// of every chapter. Cut each verse at the first sign of page furniture rather than
// re-scraping 929 chapters.
// Acrostic stanza letters (BET, GIMEL, "SIN AND SHIN") are chapter STRUCTURE, not
// verse text. They were being concatenated into verses and even transliterated as
// words. build-headings.mjs emits them separately for the reader to render.
const ACROSTIC = /\b(ALEPH|BET|BETH|GIMEL|DALED|DALETH|HEY|HE|WAW|VAV|ZAYIN|CHET|HETH|TET|YUD|YOD|KAF|CAPH|LAMED|MEM|NUN|SAMEKH|AYIN|PEY|PE|TZADI|TSADE|KUF|QOPH|RESH|SHIN|SIN|TAV|TAW)(\s+AND\s+(ALEPH|BET|BETH|GIMEL|DALED|DALETH|HEY|HE|WAW|VAV|ZAYIN|CHET|HETH|TET|YUD|YOD|KAF|CAPH|LAMED|MEM|NUN|SAMEKH|AYIN|PEY|PE|TZADI|TSADE|KUF|QOPH|RESH|SHIN|SIN|TAV|TAW))?\b/g;

const FURNITURE = /\b(Online Parallel|Study Bible|Advanced Bible Search|Books of the Bible|Compare\s|Cross References|Ask a question|Select another Bible|Treasury of Scripture|Popular Versions)/;
// A term is a HEBREW word, not an English spelling. Your list says "fear", but WEB
// writes "Don't be afraid" -- so the English word is "afraid", and matching on spelling
// missed it entirely (and let yaraa attach itself to "Don't"). Same for believe/Aman.
// So the list selects STRONG'S NUMBERS, and any segment tagged with one of them gets
// transliterated, whatever word the translator happened to use.
const TERM_SN = new Set();
for (const [sn, g] of GLOSS) {
  for (const t of TERMS) if (g.has(normT(t))) { TERM_SN.add(sn); break; }
}
console.log(`term Strong's (from ${TERMS.size} listed words): ${TERM_SN.size.toLocaleString()}`);

// TERM->STRONG'S PINS. When WEB's word resolved to the wrong root in the OT (glory
// glossed H1984 "praise" instead of H3519 "kabawad"), pin the term to the Strong's
// you want. A pinned term is only rendered on a token carrying that exact Strong's.
// exact-form pins for terms whose Hebrew inflects too much (father->ab, fathers->abawath)
// TERM_FORM_SN: the Strong's each pin was GENERATED FOR, parsed from the trailing
// "# H####" comment build-term-candidates writes on every line. The pin comment said
// "only rendered on a token carrying that exact Strong's" — but the render call site
// below never actually checked that, so a pin fired on ANY segment tagged this English
// word, even one whose real per-verse Strong's is a completely different root ("speak"
// pinned to inaha/H6032=anah "answer", overriding the real H1696=dabar in Isaiah 29:4).
// Root-gating restores the comment's own stated rule: a pin only overrides the spelling
// when it's consistent with (shares a canonical root with) the CURRENT segment's real
// Strong's — i.e. it's still allowed to normalize spelling of the SAME word (ab/abay/
// abathay/abawath, all H1), but never substitutes a different word entirely.
const TERM_FORM = new Map();
const TERM_FORM_SN = new Map();
if (existsSync('./term-forms.txt'))
  for (const line of readFileSync('./term-forms.txt','utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(\S+)\s+(\S+)\s*(#.*)?$/); if (!m) continue;
    const [, w, f, comment] = m;
    TERM_FORM.set(w.toLowerCase(), f);
    const snMatch = comment && comment.match(/H(\d+)/);
    if (snMatch) TERM_FORM_SN.set(w.toLowerCase(), 'H' + snMatch[1]);
  }

const TERM_PIN = new Map();
if (existsSync('./term-strongs.txt'))
  for (const line of readFileSync('./term-strongs.txt','utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const [w, sn] = t.split(/\s+/); if (w && sn) TERM_PIN.set(w.toLowerCase(), sn.toUpperCase());
  }
if (TERM_PIN.size) { console.log(`term->Strong's pins: ${TERM_PIN.size}`); for (const sn of TERM_PIN.values()) TERM_SN.add(sn); }

const rows = readFileSync(SRC,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l))
  .map(r => {
    const segs = [];
    for (const raw of r.segments) {
      // ACROSTIC first: the stanza letters (BET, "SIN AND SHIN") are structure, not
      // verse text. FURNITURE second: the page's navigation trailing the last verse.
      const cleaned = raw.text.replace(ACROSTIC, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!cleaned) continue;
      const sg = { ...raw, text: cleaned };
      const m = FURNITURE.exec(sg.text);
      if (m) { const keep = sg.text.slice(0, m.index).trim(); if (keep) segs.push({ ...sg, text: keep }); break; }
      segs.push(sg);
    }
    return { ...r, segments: segs };
  });

// Words that ever appear lowercase are ordinary English ("In", "How", "The" at the
// start of a sentence). A real name never does. This keeps sentence-initial capitals
// from being mistaken for names without maintaining a stoplist.
const everLower = new Set();
for (const r of rows) for (const m of r.text.matchAll(/\b[a-z]{2,}\b/g)) everLower.add(m[0]);

// Which Strong's are proper nouns? Read it off YOUR corpus, don't guess: a Strong's
// tagged nmpr in tokens_bhs is a name. Falls back to "capitalized in English".
// A NAME is a Strong's your corpus tags nmpr OR adjv. Gentilics ("the Amorite",
// "the Kenizzites") are adjv in OSHB, not nmpr — which is exactly why Kenite came
// out as Qayanay while Amorite, Kenizzite and Kadmonite stayed English.
// Two kinds of name, and they render differently:
//   nmpr  = a person or a place        -> BARE            Abaram, Yasharaal
//   adjv  = a gentilic, i.e. a PEOPLE  -> GLOSSED         Amaray (Amorite)
// The distinction is the corpus's own, not a list I keep: OSHB tags "the Amorite",
// "the Kenizzites", "the Kadmonites" as adjv, and personal names as nmpr. So the
// peoples carry their known English name in the gloss, and personal names stand
// alone, which is what you asked for.
// book code -> canon id, so a verse in web-strongs.jsonl ("PSA 119:9") can be keyed
// against tokens_bhs, which stores book_id. Hebrew books only — the NT has no
// tokens_bhs rows to look a surface form up in.
const CODE2ID = { GEN:1,EXOD:2,LEV:3,NUM:4,DEUT:5,JOSH:6,JUDG:7,RUTH:8,'1SAM':9,'2SAM':10,
  '1KGS':11,'2KGS':12,'1CHR':13,'2CHR':14,EZRA:15,NEH:16,EST:17,JOB:18,PSA:19,PROV:20,
  ECCL:21,SONG:22,ISA:23,JER:24,LAM:25,EZK:26,DAN:27,HOS:28,JOEL:29,AMO:30,OBA:31,
  JONAH:32,MIC:33,NAM:34,HAB:35,ZEP:36,HAG:37,ZEC:38,MAL:39 };

let NMPR = new Set(), ADJV = new Set();
const SURFACE = new Map();   // "canon:ch:v|H####" -> the word as actually written
const OSHB_VERSE_SN = new Map();  // "canon:ch:v" -> Set of Strong's OSHB tags there
const SN_CLASH = [];              // WEB used a Strong's OSHB does not tag in that verse

// OPT-IN ONLY. Default is the ROOT, so the root shines and the English around it
// carries the grammar. Surface forms are used for the handful of words where the
// inflection is a different word in practice — goy vs goyim being the case in hand.
const SURFACE_SN = new Set();
if (existsSync('./surface-forms.txt'))
  for (const line of readFileSync('./surface-forms.txt','utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#')) SURFACE_SN.add(t.split(/\s+/)[0].toUpperCase());
  }
console.log(`surface-form opt-ins: ${[...SURFACE_SN].join(', ') || '(none)'}`);

// The definite article as a Paleo proclitic. Stripped from an opted-in surface form
// because the English already prints "the": "the Hagawayam" would read "the the
// nations". The ROOT is never touched — this only removes a prefix the translation
// renders separately as its own English word.
const ART = '\u{10904}';
try {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database('./corpus.db', { readonly: true });
  // DOMINANCE, not "ever tagged". A single stray nmpr tag on an ordinary noun used to
  // make EVERY occurrence of that word a name: 'iyr (city) rendered as the bare capital
  // "Iyar" instead of "iyar (city)". Count each Strong's tags and treat it as a name only
  // when nmpr/adjv is what it actually IS most of the time.
  const posCounts = new Map();                       // sn -> {nmpr, adjv, total}
  for (const r of db.prepare(
      "SELECT strongs, pos, COUNT(*) n FROM tokens_bhs WHERE strongs<>'' AND pos<>'punct' GROUP BY strongs, pos").all()) {
    const sn = 'H' + String(r.strongs).replace(/^H+/,'');
    const e = posCounts.get(sn) || { nmpr: 0, adjv: 0, total: 0 };
    if (r.pos === 'nmpr') e.nmpr += r.n;
    if (r.pos === 'adjv') e.adjv += r.n;
    e.total += r.n;
    posCounts.set(sn, e);
  }
  for (const [sn, e] of posCounts) {
    if (!e.total) continue;
    if (e.nmpr / e.total > 0.5)      NMPR.add(sn);   // predominantly a person/place
    else if (e.adjv / e.total > 0.5) ADJV.add(sn);   // predominantly an adjective/gentilic
  }
  db.close();
  console.log(`names (nmpr): ${NMPR.size.toLocaleString()}   peoples (adjv/gentilic): ${ADJV.size.toLocaleString()}`);

  // SURFACE FORMS. strongs-roots.json is the LEMMA — so goy (H1471) and goyim are
  // both "gaway". tokens_bhs has the word as it is actually written in each verse.
  // Key it by (book:chapter:verse, Strong's) and prefer it over the lemma, so
  // "nations" renders gawayam because that IS the Hebrew standing there. Read, not
  // constructed: no plural endings are invented anywhere in this file.
  const db2 = new Database('./corpus.db', { readonly: true });
  for (const t of db2.prepare(`SELECT book_id, chapter, verse, strongs, word_raw, token_ordinal
        FROM tokens_bhs WHERE strongs <> '' AND pos <> 'punct' AND verse > 0
        ORDER BY book_id, chapter, verse, token_ordinal`).all()) {
    const sn = 'H' + String(t.strongs).replace(/^H+/,'');
    const k = `${t.book_id}:${t.chapter}:${t.verse}|${sn}`;
    if (!SURFACE.has(k)) SURFACE.set(k, t.word_raw);      // first occurrence in the verse
    // Which Strong's OSHB actually tags in this verse. This file renders English
    // from the WEB's OWN Strong's tagging (web-strongs.jsonl); the READER renders
    // Hebrew from OSHB (tokens_bhs). Two independent taggings of one verse — and
    // where they disagree, the English word and the Hebrew block disagree on
    // screen, which is exactly "the English does not match my transliterations".
    // Record OSHB's set per verse so the disagreement can be COUNTED rather than
    // discovered by reading.
    const vk = `${t.book_id}:${t.chapter}:${t.verse}`;
    (OSHB_VERSE_SN.get(vk) || OSHB_VERSE_SN.set(vk, new Set()).get(vk)).add(sn);
  }
  db2.close();
  console.log(`surface forms from tokens_bhs: ${SURFACE.size.toLocaleString()}`);
} catch (e) { console.log('(corpus.db unavailable — lemma forms only) ' + e.message); }
const NAMEY = new Set([...NMPR, ...ADJV]);

// WHICH NAMES ARE PEOPLES?
// A curated list, peoples.txt — NOT derived from the corpus tags. The tags are
// unreliable for this: OSHB marks Kenite (H7017), Rephaim (H7497) and Israel
// (H3478) as nmpr, exactly like a personal name, while Kenizzite and Hittite are
// adjv. So half of any nation list came out bare. The peoples in scripture are a
// finite, known set, so they are written down where you can read and edit them.
//
//   in peoples.txt  ->  Amaray (Amorite),  Yasharaal (Israel)
//   any other name  ->  Abaram,  Mashah,  Dawad
//
// Singular is enough; plural forms are generated here.
if (!existsSync('./peoples.txt')) die('peoples.txt not found — it decides which names carry an English gloss');
const PEOPLE_WORDS = new Set();
for (const line of readFileSync('./peoples.txt','utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  PEOPLE_WORDS.add(t);
  PEOPLE_WORDS.add(t + 's');                       // Amorite -> Amorites
  if (/e$/.test(t)) PEOPLE_WORDS.add(t.slice(0,-1) + 'es');
  if (/man$/.test(t)) PEOPLE_WORDS.add(t.slice(0,-3) + 'men');
}
console.log(`peoples (glossed with their English name): ${PEOPLE_WORDS.size.toLocaleString()} forms`);

// DIVINE TITLES — rendered as your transliteration, BARE, no English gloss.
// They are not nmpr in OSHB (elohim H430 is a common noun, subs), and "god" occurs
// lowercase, so both of my name tests rejected them and they stayed English. They
// are neither a name-by-tag nor a term-with-a-gloss; they are their own class.
// The Strong's still comes from the text, so God renders Alahayam / Alahay / Aal
// according to the Hebrew word actually standing there.
const DIVINE = new Set(), DIVINE_SN = new Map();
if (existsSync('./divine-titles.txt'))
  for (const line of readFileSync('./divine-titles.txt','utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [w, ...sns] = t.split(/\s+/);
    DIVINE.add(w.toLowerCase());
    if (sns.length) DIVINE_SN.set(w.toLowerCase(), sns);   // allowed; first is fallback
  }
console.log(`divine titles (transliterated bare): ${DIVINE.size}`);

// Multi-word divine titles: "Most High" -> Ilayawan. Applied to the whole phrase
// BEFORE word-level substitution, so "Most" and "High" stay ordinary English on
// their own. Recorded in the map as phrases so the NT gets them too.
const DIVINE_PHRASES = [];
if (existsSync('./divine-phrases.txt'))
  for (const line of readFileSync('./divine-phrases.txt','utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=>')) continue;
    const [eng, tr] = t.split('=>').map(x => x.trim());
    if (eng && tr) DIVINE_PHRASES.push({ eng, tr, re: new RegExp('\\b' + eng.replace(/\s+/g,'\\s+') + '\\b', 'g') });
  }
console.log(`divine phrases: ${DIVINE_PHRASES.length}`);
const phraseMap = {};

// GLOSS OVERRIDES — the transliteration always comes from the Hebrew; this only
// changes the English in the parentheses. WEB prints "word" for BOTH dabar (H1697)
// and imrah (H565), so the reader got "dabar (word)" and "amarah (word)" with no way
// to tell them apart. Overriding H565 to "sayings" removes the collision.
const GLOSS_OVERRIDE = new Map();

// ── CURATED GLOSSES: lexicon.json / homographs.json ─────────────────────────────────
// These are the same curated files the Parallel viewer glosses from, so the flat English
// baseline and the word-block viewer finally agree: "dabar (word / matter)" in both, not
// "dabar (words)" here and "word / matter" there.
//
// The lookup MIRRORS server.js parseHebrewData (L2224-2233) so there is exactly one
// gloss policy in the app, not two:
//   homographs[root_<pos>]  →  lexicon[surface] → lexicon[surfacePlene]
//                           →  lexicon[root]    → lexicon[rootPlene]
// Matres lectionis (doubled yod/waw in plene spelling) are collapsed as a second pass so a
// curated key in either spelling matches either surface; exact forms are always tried first.
//
// Order of the whole chain at the emit site:
//   gloss-overrides.txt  →  homographs/lexicon (curated)  →  first KJV sense  →  the
//   English word in this verse (the old behaviour, still the last resort).
// --gloss-source=word restores the previous behaviour (verse's English word wins).
const GLOSS_SOURCE = argv('--gloss-source', 'lexicon');   // 'lexicon' | 'word'
const LEXICON = (() => {
  for (const p of ['./lexicon/lexicon.json', './lexicon.json']) {
    if (!existsSync(p)) continue;
    try { const j = JSON.parse(readFileSync(p, 'utf8')); console.log(`curated lexicon: ${p} (${Object.keys(j).length} entries)`); return j; }
    catch (e) { console.log(`! ${p} unreadable: ${e.message}`); }
  }
  console.log('! no lexicon/lexicon.json — glosses fall back to the KJV sense / the verse word');
  return {};
})();
const HOMOGRAPHS = (() => {
  for (const p of ['./lexicon/homographs.json', './homographs.json']) {
    if (!existsSync(p)) continue;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { /* ignore */ }
  }
  return {};
})();
// hebrew-extra-lexicon.json is curated too (it shipped blank; every populated
// entry was typed by hand), so it belongs in the same chain as lexicon.json.
const HEB_EXTRA = (() => {
  for (const p of ['./lexicon/hebrew-extra-lexicon.json', './hebrew-extra-lexicon.json']) {
    if (!existsSync(p)) continue;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { /* ignore */ }
  }
  return {};
})();

// ── ONE CURATED LOOKUP FOR THE WHOLE APP ────────────────────────────────────
// This chain used to be written out here, in build-surface-index.js and in
// server.js parseHebrewData, and the three copies had drifted (only the bake
// read hebrew-extra-lexicon; only the bake fell through to kjv_def). It now
// lives in gloss-resolver.cjs and all three import it.
// NOTE: this file's KJV/verse-word RANKING is deliberately its own — that is a
// policy about English prose, not about what a Paleo root means. Only the
// curated lookup is shared. `uncurated` is left off here on purpose: KJV_SENSE
// is ranked below the original verse word further down, which the resolver
// knows nothing about.
const { createGlossResolver, collapseMatres } = createRequire(import.meta.url)('./gloss-resolver.cjs');
const _resolveCurated = createGlossResolver({
  homographs: HOMOGRAPHS, lexicon: LEXICON, hebExtra: HEB_EXTRA, allowUncurated: false,
});
/** Curated gloss for a paleo root. '' when uncurated — unchanged contract. */
function curatedGloss(rootPaleo, sn) {
  if (!rootPaleo) return '';
  const snNorm = sn ? 'H' + String(sn).replace(/^H+/, '') : '';
  return _resolveCurated({
    sn: snNorm,
    snKeys: snNorm ? [`${rootPaleo}_${snNorm}`, `${collapseMatres(rootPaleo)}_${snNorm}`] : [],
    roots: [rootPaleo],
  }).text;
}
/** Tidy a curated gloss for inline use: strip bracket notes, collapse whitespace. */
const tidyGloss = g => String(g || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
if (existsSync('./gloss-overrides.txt'))
  for (const line of readFileSync('./gloss-overrides.txt','utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(H\d+)\s+(.+)$/);
    if (m) GLOSS_OVERRIDE.set(m[1], m[2].trim());
  }
console.log(`gloss overrides: ${GLOSS_OVERRIDE.size}`);

let names = 0, peoples = 0, terms = 0, noRoot = 0, untouched = 0, ambiguous = 0, surfaceUsed = 0;
let oshbBlockedCount = 0;   // WEB's headword had no OSHB-tagged Strong's anywhere in the verse — left English rather than invent a word
let curatedHits = 0;   // terms glossed from the curated lexicon/homographs rather than the verse word

// WORD MAP — a by-product, not a second pipeline.
// The NT is Greek (G-numbers) and the non-canonical books have no Strong's at all, so
// this Strong's-driven pass cannot reach them, and they still read "God", "Adam",
// "Eve". The fix is NOT to hand-maintain a second map — that is exactly how Aharan
// and Aharawan ended up coexisting. Instead we record every English->transliteration
// decision made HERE, from the Hebrew, and apply the same table to the untagged
// sources. One source of truth; the spellings cannot drift.
const wordMap = new Map();      // english word -> Map(translit -> count)
const noteWord = (eng, tr, kind) => {
  // Capitalized proper nouns only. A lowercase 'name' is almost always a
  // sentence-position artifact, not a real name.
  if (!/^[A-Z]/.test(eng)) return;
  const k = eng.toLowerCase();
  if (!wordMap.has(k)) wordMap.set(k, { kind, forms: new Map() });
  wordMap.get(k).forms.set(tr, (wordMap.get(k).forms.get(tr) || 0) + 1);
};

// TERM map — the SAFE way to carry terms to the NT.
// A term is your English word ("repent") tied to its Hebrew root. The Greek NT quotes
// the OT throughout, and these concepts do not change across testaments, so the same
// English term should render the same Hebrew. The DANGER is segment co-occurrence
// (which gave saying->dabar), so we do NOT learn from co-occurrence here: we record a
// term ONLY when it is genuinely on your list AND the head word we transliterated in
// this segment IS that term word. One term -> its translit, tallied across the OT;
// kept later only if it resolved to a single form.
const termMap = new Map();      // english TERM word -> Map(translit -> count)
const noteTerm = (eng, tr) => {
  const k = eng.toLowerCase();
  if (!TERMS.has(normT(k))) return;                 // must be a word YOU listed
  if (!termMap.has(k)) termMap.set(k, new Map());
  termMap.get(k).set(tr, (termMap.get(k).get(tr) || 0) + 1);
};
const missingRoot = new Map();
const unglossedWords = new Map();   // english word -> times it stayed English (no head word)
const out = [];

// QUOTE BACKFILL (added 2026-08-22, see CLAUDE.md "H802..." era entry for the
// investigation this came out of). web-strongs.jsonl is scraped from an
// interlinear page, not the clean WEB text — a plain-English speech-verb like
// "saying," or "said," regularly reaches this file with NO opening quote mark
// even though the reported speech that follows it is a direct quotation
// (confirmed: 178 of 1,674 said/saying/answered/... constructs across the OT,
// e.g. Numbers 36:6 "saying, Let them be married..." Judges 2:3 "...I also
// said, I will not drive them out... snare to you.\"" — that one already HAD
// its closing quote, just not the matching open). Evidence-gated, same as
// every other rule in this file: only fires when the very next non-space
// character is a capital letter with NO quote mark already there (so this
// never double-inserts, and never touches the common indirect-speech case —
// "he said, however, that..." — which continues in lowercase).
const SPEECH_VERBS_RE = /\b(said|saying|answered|answering|cried out|cried|spoke|speaking|commanded|swore|sware|declared|asked|asking|prayed|replied),(\s+)(?!["'‘’“”])([A-Z])/g;

for (const r of rows) {
  let changed = false;
  const pieces = [];
  for (const seg of r.segments) {
    if (!seg.sn) { pieces.push(seg.text); continue; }
    const paleo = ROOTS[seg.sn];
    const words = seg.text.split(/(\s+)/);

    // Which word in this segment does the Strong's actually name?
    // Prefer the candidate the lexicon glosses for THIS Strong's. Fall back to the
    // first candidate only when the lexicon has nothing to say.
    const g = GLOSS.get(seg.sn);
    const cands = [];
    for (let i = 0; i < words.length; i++) {
      const tok = words[i];
      if (!/[A-Za-z]/.test(tok)) continue;
      const bare = tok.replace(/^[^A-Za-z]+/,'').replace(/[^A-Za-z]+$/,'');
      if (!bare || bare.length < 2) continue;
      if (NEVER_HEAD.has(bare.toLowerCase())) continue;
      // Auxiliary/light verb: only a candidate if THIS Strong's actually glosses it.
      // "did" in "you didn't build" (H1129 banah) is filtered; "do" in "do them"
      // (H6213 asah, kjv_def lists "do") survives and renders ishah (do).
      if (SOFT_HEAD.has(bare.toLowerCase()) && !(g && g.has(normT(bare)))) continue;
      const isDivine = DIVINE.has(bare.toLowerCase());
      // A NAME is decided by the Strong's tag, not by English casing. If the segment's
      // Strong's is tagged nmpr/adjv in the corpus (NAMEY) and has a root, it is a name
      // and renders from that root. No capitalization or everLower heuristic -- those
      // guessed at what the tag already states, and the guess dropped real names like
      // Judah (H3063, nmpr, valid root) that also appear lowercase somewhere.
      // Your sacred-terms list is authoritative: if this Strong's is a term Strong's
      // (TERM_SN) or the word is a pinned term, it renders as a TERM even when the
      // same Strong's also carries an nmpr tag (dabar 'word' vs Dabar as a name).
      const isTermStrongs = TERM_SN.has(seg.sn) || TERM_PIN.get(normT(bare)) === seg.sn;
      // adjv is OSHB's ADJECTIVE tag. It covers gentilics ("the Hittite") but ALSO plain
      // adjectives — qanna' (jealous), male' (full) — which were rendering as bare capitals
      // ("Qanaa Al", "Malaa of all good things") and so never got a gloss. An adjv Strong's
      // is a name ONLY when the word is a people in peoples.txt; otherwise it's a term.
      const isNameTag = NMPR.has(seg.sn) || (ADJV.has(seg.sn) && PEOPLE_WORDS.has(bare));
      const isName = isDivine || (isNameTag && !!ROOTS[seg.sn] && !isTermStrongs);
      const glossed = g ? g.has(normT(bare)) : false;
      // A term is any word THIS Strong's glosses, when the Strong's is one your list
      // selected. So "afraid" renders yaraa (H3372) even though your list says "fear".
      const pin = TERM_PIN.get(normT(bare));
      // GLOSS EVERYTHING THE STRONG'S GLOSSES. Previously a word had to be on the curated
      // sacred-terms list (or its Strong's had to be), so "increase", "mightily", "milk",
      // "honey", "vineyards", "kindled" … stayed plain English even though the segment
      // carried a Strong's. Now any word this Strong's own kjv_def glosses is a term — the
      // tag decides, not a hand-written list. NEVER_HEAD still keeps filler words out, and
      // sacred-terms.txt still WINS the head-word slot in the ranking below.
      const isTerm = !isDivine && (
        pin ? seg.sn === pin                          // pinned: only its own Strong's
            : (glossed || TERMS.has(normT(bare))));
      if (!isName && !isTerm) continue;
      cands.push({ i, tok, bare, isDivine, isName, isTerm, glossed, pinned: !!pin && seg.sn === pin });
    }
    // Ranking, most specific first:
    //   divine title            -> always
    //   a NAME the Strong's glosses      (Amaray (Amorite), not a lowercase term)
    //   a word on YOUR term list that the Strong's glosses   ("man", not "young")
    //   any word the Strong's glosses
    //   the only candidate there is
    let pick = cands.find(c => c.isDivine)
            || cands.find(c => c.isName && c.glossed)
            || cands.find(c => c.isName)
            || cands.find(c => c.pinned)                  // a pinned term owns its Strong's
            || cands.find(c => c.glossed && TERMS.has(normT(c.bare)))
            || cands.find(c => c.glossed)
            || (cands.length === 1 ? cands[0] : null);
    // One candidate and no gloss match is still unambiguous — there is nothing else
    // in the segment it could be (Moses, and "young man"). Several candidates with no
    // gloss match IS ambiguous, and we leave it in English rather than guess.
    if (!pick && cands.length > 1) ambiguous++;
    // A divine title must never be attached to a Strong's that is not its own:
    // "to speak with Yahweh" sat in a segment tagged H8085 (heard) and rendered
    // "Shamai". If the segment's Strong's does not gloss the divine word, keep the
    // word but use its OWN Strong's from divine-titles.txt.
    // A divine title may ONLY use a Strong's from its own allowed list. Otherwise
    // "Lord" borrows H3068 -- whose lexicon gloss literally reads "Jehovah, the Lord"
    // -- and Psalm 110:1 comes out "Yahawah says to my Yahawah" instead of Adanay.
    let useSn = seg.sn;
    if (pick && pick.isDivine) {
      const allowed = DIVINE_SN.get(pick.bare.toLowerCase());
      if (allowed && allowed.length) useSn = allowed.includes(seg.sn) ? seg.sn : allowed[0];
    }
    // OSHB RECONCILIATION + GATE. seg.sn is WEB's OWN alignment tag, not the verse's
    // real Masoretic tagging — the two regularly disagree (7,663 rendered words
    // measured clashing with OSHB in one run). tokens_bhs is the ground truth the
    // Hebrew column actually renders from, so:
    //   1. If OSHB tags this verse with a DIFFERENT Strong's whose own kjv_def
    //      covers this exact word, use THAT one. Isaiah 29:4: WEB tags "speak"
    //      H6032 (anah "answer"); OSHB's real token there is H1696 (dabar "speak")
    //      — H1696's kjv_def covers "speak", so it wins.
    //   2. If no such candidate exists — the word WEB chose to gloss (e.g.
    //      "brought") is not one OSHB tags anywhere in this verse under ANY
    //      Strong's a reasonable substitute check finds — do not invent a
    //      transliteration at all. A Hebrew-looking word that is not actually
    //      standing anywhere in this verse's real Hebrew (WEB's own segment
    //      landed on the wrong headword, e.g. "brought" -> sabab, a word not
    //      present in the verse) is worse than showing no gloss.
    // Gated to non-divine picks: divine titles already resolve through their own
    // curated DIVINE_SN allow-list, which is trustworthy independent of OSHB.
    let oshbBlocked = false;
    if (pick && !pick.isDivine) {
      const _vk0 = `${CODE2ID[r.code]}:${r.chapter}:${r.verse}`;
      const _oshb0 = OSHB_VERSE_SN.get(_vk0);
      if (_oshb0 && _oshb0.size && !_oshb0.has(useSn)) {
        const better = [..._oshb0].find(sn => { const gg = GLOSS.get(sn); return gg && gg.has(normT(pick.bare)); });
        if (better) useSn = better;
        else oshbBlocked = true;
      }
    }
    // fieldy 2026-07-27: "make my parallel/novel english show strictly my
    // transliteration of the strongs characters of the word... ensure the
    // base root word is consistent. I expect Ashar (not asharay), ach (not
    // achayam)." The surface-form opt-in below used to substitute the verse's
    // own written (inflected) form for certain Strong's numbers, which is
    // exactly the kind of per-verse variation that made the same word render
    // differently in different places. rootPaleo is now ALWAYS the bare
    // strongs-roots.json lemma for this Strong's, full stop, so the same SN
    // transliterates identically everywhere -- suffixes are handled manually
    // (term-forms.txt pins) where you want them, not reconstructed here.
    let rootPaleo = (pick && !oshbBlocked) ? ROOTS[useSn] : null;

    let hit = false;
    const rebuilt = words.map((tok, i) => {
      if (!pick || i !== pick.i) return tok;
      const { bare, isDivine, isName } = pick;
      if (oshbBlocked) { oshbBlockedCount++; hit = true; return tok; }
      if (!rootPaleo) { missingRoot.set(useSn, (missingRoot.get(useSn)||0)+1); noRoot++; hit = true; return tok; }
      const tr = translit(rootPaleo);
      // CROSS-CHECK against OSHB. If the Strong's this render is using is not one
      // OSHB tags anywhere in this verse, the transliteration printed in the
      // English cannot match the Hebrew block the reader draws from tokens_bhs.
      const _vk = `${CODE2ID[r.code]}:${r.chapter}:${r.verse}`;
      const _oshb = OSHB_VERSE_SN.get(_vk);
      if (_oshb && _oshb.size && !_oshb.has(useSn)) {
        SN_CLASH.push({ ref: _vk, word: bare, web_sn: useSn, web_translit: tr,
                        oshb_sns: [..._oshb].join(' ') });
      }
      hit = true; changed = true;
      if (isName || isDivine) {
        names++;
        // Only PROPER NOUNS enter the word map. A name IS the Hebrew word, 1:1, so it
        // carries safely to the untagged NT. Terms do NOT: "saying" is not dabar, it
        // merely shared a segment with the H1697 head word, and mapping it would turn
        // every "saying"/"thought"/"came" in the NT into Hebrew. Names only.
        noteWord(bare, tr, isDivine ? 'divine' : (PEOPLE_WORDS.has(bare) ? 'people' : 'name'));
        if (!isDivine && PEOPLE_WORDS.has(bare)) { peoples++; return tok.replace(bare, `${tr} (${bare})`); }
        // Every OTHER name now carries its English name as a gloss too — Paraih (Pharaoh),
        // Masah (Massah), Abaram (Abraham) — so the reader always sees who or where it is.
        // DIVINE names stay BARE: no "(LORD)" or "(God)" is ever printed. Pass --bare-names
        // to restore the old behaviour (names with no gloss at all).
        if (!isDivine && !BARE_NAMES) return tok.replace(bare, `${tr} (${bare})`);
        return tok.replace(bare, tr);
      }
      terms++;
      // ORDER (fieldy): my lexicon  ->  the ORIGINAL WORD in this verse  ->  KJV last.
      // The KJV sense is a poor gloss for display: openscriptures kjv_def is an
      // alphabetical dump of every rendering the translators ever used, so its FIRST entry
      // is often an idiom marker or an alphabetical accident — H5674 abar starts
      // "idiom alienate", H8085 shama "idiom attentively", H4941 mishpat "phrase adversary".
      // The word the translator actually chose in THIS verse ("go", "hear", "ordinances")
      // is nearly always better, so KJV now only fires when there is no word at all.
      const curated = GLOSS_SOURCE === 'lexicon' ? tidyGloss(curatedGloss(rootPaleo, useSn)) : '';
      const gl = GLOSS_OVERRIDE.get(useSn)
              || curated
              || bare.toLowerCase()
              || (GLOSS_SOURCE === 'lexicon' ? KJV_SENSE.get(useSn) : '')
              || '';
      if (curated) curatedHits++;
      // fieldy: "No need to worry about term-forms for anything that has backed
      // a hebrew source." This verse IS backed by real Hebrew (useSn came from
      // this token's own OSHB reconciliation above) — always show the plain
      // transliterated root, never a term-forms.txt pin. Pins (TERM_FORM) still
      // matter for the UNTAGGED corpus (NT/apocrypha, no per-verse Hebrew to
      // derive a root from — see map.terms below), just not here.
      const shown = tr.toLowerCase();
      noteTerm(bare, shown);
      return tok.replace(bare, `${shown} (${gl})`);
    }).join('');
    if (!hit) {
      untouched++;
      // Record WHY a word stayed English. A segment with no head word means this Strong's
      // glossed none of its words — so the word is missing from the lexicon/sacred-terms,
      // or the dictionary uses a different vocabulary for it (WEB "symbols" vs kjv
      // "frontlets"). Reported at the end so the corpus tells you what to curate next,
      // instead of you finding them one at a time while reading.
      for (const tok of words) {
        const b = tok.replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z]+$/, '').toLowerCase();
        if (b.length < 3 || NEVER_HEAD.has(b) || SOFT_HEAD.has(b)) continue;
        unglossedWords.set(b, (unglossedWords.get(b) || 0) + 1);
      }
    }
    pieces.push(rebuilt);
  }
  let vtext = pieces.join(' ');
  for (const ph of DIVINE_PHRASES) {
    if (ph.re.test(vtext)) { vtext = vtext.replace(ph.re, ph.tr); phraseMap[ph.eng] = ph.tr; }
    ph.re.lastIndex = 0;
  }
  // SENTENCE CASE. Terms emit lowercase (tr.toLowerCase()), which is right mid-sentence but
  // wrong at the head of one: "Praise Yah! Praise him…" came out "halal (praise) Yah! halal
  // (praise) him…". Recapitalize the first letter of the verse and of every sentence after
  // terminal punctuation. Only a letter immediately following .!? (or the verse start) is
  // touched, so a gloss in parentheses — "(praise)" — is never affected.
  vtext = vtext
    .replace(/^(\s*["'\u201c\u2018(\[]?\s*)([a-z])/, (_m, lead, c) => lead + c.toUpperCase())
    .replace(/([.!?][)\]"'\u201d\u2019]*\s+["'\u201c\u2018(\[]?\s*)([a-z])/g, (_m, lead, c) => lead + c.toUpperCase())
    // Backfill a missing opening quote before direct speech \u2014 see SPEECH_VERBS_RE above.
    .replace(SPEECH_VERBS_RE, (_m, verb, ws, cap) => `${verb},${ws}"${cap}`);
  out.push({ code: r.code, chapter: r.chapter, verse: r.verse,
             text: vtext.replace(/__PIECES__/,'')  // no-op placeholder
                     .split('\u0000').join('')
                     .replace(/[\r\n]+/g,' ')          // segments can carry a line break
                     .replace(/\s+/g,' ')
                     .replace(/\s+([,.;:!?\u2019\u201D])/g,'$1')
                     // NOTE: this used to also .replace(/\s*"\s*$/,'') here ("stray
                     // trailing quote from the page"). Removed 2026-08-22 — it was
                     // deleting the LEGITIMATE closing quote off every verse whose
                     // direct speech ends exactly at the verse boundary, which in
                     // Biblical dialogue is extremely common: measured at 2,465
                     // verses across 38 of the 39 OT books (nearly the whole OT)
                     // silently losing their closing quotation mark this way. See
                     // CLAUDE.md for the investigation (Genesis 2:16-18 was the
                     // verse that surfaced it). If a genuine scraping artifact is
                     // ever found again, fix it at the source (web-strongs.jsonl /
                     // fetch-web-strongs.mjs) or gate the strip on real evidence —
                     // never blanket-strip every verse-final quote mark again.
                     .trim() });
}

// ── WHERE THE ENGLISH AND THE READER DISAGREE ───────────────────────────────
// Every row here is a word whose English transliteration CANNOT match the Hebrew
// block beside it, because the two pipelines are using different Strong's for the
// same verse. Reported, not guessed at.
if (SN_CLASH.length) {
  const byWord = new Map();
  for (const c of SN_CLASH) {
    const k = `${c.word}\u0000${c.web_sn}`;
    byWord.set(k, (byWord.get(k) || 0) + 1);
  }
  console.log(`\nSTRONG'S CLASH with OSHB: ${SN_CLASH.length.toLocaleString()} rendered words use a ` +
              `Strong's tokens_bhs does not tag in that verse`);
  console.log(`  (${byWord.size.toLocaleString()} distinct english+SN pairs — these are the words whose ` +
              `English transliteration cannot match the reader)`);
  for (const [k, n] of [...byWord].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    const [wd, sn] = k.split('\u0000');
    console.log(`     ${String(n).padStart(6)}  "${wd}" rendered from ${sn}`);
  }
  const _snOut = (() => { const i = process.argv.indexOf('--sn-out'); return i >= 0 ? process.argv[i + 1] : null; })();
  if (_snOut) {
    const rows = ['ref\tenglish_word\tweb_strongs\tweb_translit\toshb_strongs_in_that_verse'];
    for (const c of SN_CLASH) rows.push([c.ref, c.word, c.web_sn, c.web_translit, c.oshb_sns].join('\t'));
    writeFileSync(_snOut, rows.join('\n') + '\n', 'utf8');
    console.log(`     full list -> ${_snOut} (${SN_CLASH.length} rows, UTF-8 TSV)`);
  } else {
    console.log('     re-run with --sn-out snclash.txt for the full list');
  }
}

console.log(`\nnames transliterated : ${names.toLocaleString()}  (of which peoples, glossed: ${peoples.toLocaleString()})`);
console.log(`terms transliterated : ${terms.toLocaleString()}  (glossed)`);
console.log(`  glossed from the curated lexicon/homographs: ${curatedHits.toLocaleString()}` +
            (terms ? ` (${Math.round(curatedHits / terms * 100)}%)` : '') +
            (GLOSS_SOURCE === 'lexicon' ? '' : '   [--gloss-source=word: curated lookup DISABLED]'));
console.log(`Strong's with NO Paleo root (left English, reported): ${noRoot.toLocaleString()}`);
console.log(`blocked by OSHB gate (WEB's headword matched no Strong's OSHB tags in the verse, left English): ${oshbBlockedCount.toLocaleString()}`);
console.log(`segments with 2+ candidates and no gloss match (left English): ${ambiguous.toLocaleString()}`);
console.log(`rendered from the verse's SURFACE form rather than the lemma: ${surfaceUsed.toLocaleString()}`);
if (unglossedWords.size) {
  console.log('\nTOP WORDS STILL LEFT IN ENGLISH (no Strong\'s in their segment glosses them).');
  console.log('Add the ones you want rendered to sacred-terms.txt, or give the root a gloss in');
  console.log('lexicon.json / gloss-overrides.txt — then re-run. This is the list to work from:');
  const top = [...unglossedWords].sort((a,b)=>b[1]-a[1]).slice(0,40);
  console.log('  ' + top.map(([w,n]) => `${w}\u00d7${n}`).join('  '));
}
if (missingRoot.size) {
  console.log('  top missing roots:');
  for (const [sn,n] of [...missingRoot].sort((a,b)=>b[1]-a[1]).slice(0,10))
    console.log(`     ${sn}  x${n}`);
}

console.log('\nsamples:');
for (const [c,ch,v] of [['GEN',15,16],['PSA',119,9],['PSA',119,11],['GEN',15,19],['GEN',15,20],['GEN',15,21],['EXOD',3,15]]) {
  const r = out.find(x => x.code===c && x.chapter===ch && x.verse===v);
  if (r) console.log(`  ${c} ${ch}:${v}  ${r.text.slice(0,120)}`);
}

// ── GUARD: this file rewrites ONLY the books web-strongs.jsonl covers. ─────────
// web-strongs.jsonl fetched without --all is Genesis..Malachi. Loading that with
// `load-english-baseline.js --reset-baseline` DELETED the entire New Testament and
// every non-canonical book (Jasher, Jubilees, 1/2 Adam and Eve) along with the
// transliteration they already carried. A tool that rewrites one range of books must
// never be able to destroy the ones it does not touch.
const codes = new Set(out.map(r => r.code));
const NT = ['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH',
            '2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];
const haveNT = NT.some(c => codes.has(c));
if (!haveNT) {
  console.log('\n\u26a0  THIS BASELINE IS OT-ONLY (' + codes.size + ' books, no New Testament).');
  console.log('   Do NOT run `load-english-baseline.js --reset-baseline` with it — a reset');
  console.log('   deletes every book this file does not contain: the whole NT, Jasher,');
  console.log('   Jubilees, 1/2 Adam and Eve. Load it WITHOUT --reset-baseline so it');
  console.log('   updates the OT in place and leaves everything else alone.');
  console.log('   (To cover the NT too: node fetch-web-strongs.mjs --all)');
}

if (DRY) { console.log('\n[dry-run] nothing written.'); process.exit(0); }
// Keep only unambiguous entries: a word that got ONE spelling across the whole OT.
// A word rendered several ways (because its Hebrew differs verse to verse) cannot be
// mapped by spelling alone, so it is left out rather than forced.
const map = { names: {}, peoples: {}, divine: {}, terms: {}, ambiguous: {} };
for (const [eng, e] of wordMap) {
  const forms = [...e.forms].sort((a, b) => b[1] - a[1]);
  if (forms.length > 1) { map.ambiguous[eng] = forms.map(([f, n]) => `${f}×${n}`); continue; }
  const bucket = e.kind === 'name' ? map.names : e.kind === 'people' ? map.peoples
               : e.kind === 'divine' ? map.divine : map.terms;
  bucket[eng] = forms[0][0];
}
// DIVINE carries to untagged books with FIXED primary forms. In the OT, God varies
// (Alahayam/Aal/Alawah) by the Hebrew actually present, which is correct there. But
// the NT/apocrypha have no Hebrew to vary on, so they need one standard spelling each.
// Taken straight from the roots: no invented letters.
const DIVINE_PRIMARY = { god: 'H430', gods: 'H430', lord: 'H136', god_almighty: 'H7706' };
map.divine = map.divine || {};
for (const [word, sn] of Object.entries(DIVINE_PRIMARY)) {
  const paleo = ROOTS[sn];
  if (paleo) map.divine[word] = translit(paleo);
}
map.phrases = phraseMap;
// term-forms.txt pins an English term to an EXACT transliteration, for words whose
// OT Hebrew inflects too much to derive one form (father -> ab, fathers -> abawath).
// This is the deliberate-choice equivalent of the goy/goyim surface split.
map.terms = {}; map.termsAmbiguous = {}; map.termsAlternates = {}; map.termsDominant = {};
for (const [eng, forms] of termMap) {
  if (TERM_FORM.has(eng)) { map.terms[eng] = TERM_FORM.get(eng); continue; }   // deliberate pin
  const sorted = [...forms].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, n]) => s + n, 0);
  const [topForm, topN] = sorted[0];
  // CARRY EVERY TERM, using its most common OT form.
  //
  // The old rule (>=90% dominance and >=10 occurrences) left 228 ordinary words out of the
  // untagged books entirely — city, rest, beginning, saying, time, ground, heart, judge,
  // good, woman, sheep — so Jasher and the NT read as plain English while the OT rendered
  // them. fieldy: "even if a word has several Hebrew words that mean it, choosing any one
  // generally works and I can always spotcheck and fix." A word being spelled two ways in
  // the OT is not a reason to show it in NEITHER, so plurality wins.
  //
  // Nothing is lost: every alternative is recorded in termsAlternates, and the confidence
  // is recorded in termsDominant, so a wrong pick is visible and fixable in term-forms.txt.
  // --term-dominance=N (0..1) restores a threshold; the default 0 carries everything.
  if (sorted.length === 1) map.terms[eng] = topForm;
  else if (topN / total >= TERM_DOMINANCE) {
    map.terms[eng] = topForm;
    map.termsDominant[eng] = `${topForm} (${Math.round(topN / total * 100)}% of ${total})`;
    if (sorted.length > 1) map.termsAlternates[eng] = sorted.slice(1).map(([f, n]) => `${f}\u00d7${n}`);
  }
  else map.termsAmbiguous[eng] = sorted.map(([f, n]) => `${f}\u00d7${n}`);
}
writeFileSync('word-map.json', JSON.stringify(map, null, 1));
console.log(`  terms carried to NT: ${Object.keys(map.terms).length} \u00b7 left out: ${Object.keys(map.termsAmbiguous).length}` + (TERM_DOMINANCE ? ` (--term-dominance=${TERM_DOMINANCE})` : ' (carrying every term by most-common form)'));
if (map.termsDominant) console.log(`  of those, ${Object.keys(map.termsDominant).length} kept by dominant-form rule (e.g. father, son, mother)`);
console.log(`\nword-map.json  names ${Object.keys(map.names).length} · peoples ${Object.keys(map.peoples).length}` +
            ` · divine ${Object.keys(map.divine).length} · terms ${Object.keys(map.terms).length}` +
            ` · ambiguous (left out) ${Object.keys(map.ambiguous).length}`);
console.log('  -> node apply-word-map.mjs   to normalise the NT and the non-canonical books');

writeFileSync(OUT, out.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`\n\u2713 ${OUT} — ${out.length.toLocaleString()} verses`);
console.log(haveNT
  ? 'Next:  node load-english-baseline.js --reset-baseline   then restart the server.'
  : 'Next:  node load-english-baseline.js            (NO --reset-baseline: it would delete the NT)');
