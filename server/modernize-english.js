'use strict';
/*
 * modernize-english.js — de-archaic Elizabethan / KJV-era English in a verse.
 *
 * Morphology-aware and CONSERVATIVE:
 *   • closed-class function words (thou/thee/thy/ye/hast/hath/unto/…) are mapped
 *   • archaic verb inflections (-eth/-est) are generated from a curated verb list,
 *     so only real verbs are touched — teeth, death, beneath, Nazareth, forest,
 *     honest, breath, wreath are never altered.
 * Idempotent: modern text has no archaic markers, so re-running changes nothing.
 */

// ── curated base verbs common to scripture (base/infinitive spelling) ─────────
const VERBS = [
  'come','go','do','make','give','take','see','hear','say','know','love','walk','dwell',
  'live','sit','stand','call','send','bring','keep','work','rule','reign','judge','seek',
  'find','ask','answer','believe','follow','serve','fear','hate','bless','curse','pray',
  'praise','worship','cry','weep','laugh','rejoice','mourn','turn','return','depart','enter',
  'remain','abide','continue','cease','begin','pass','lead','feed','heal','save','destroy',
  'build','plant','sow','reap','gather','scatter','open','shut','cover','fill','pour','wash',
  'anoint','offer','burn','eat','drink','sleep','wake','rise','fall','flee','pursue','smite',
  'deliver','redeem','forgive','remember','forget','understand','perceive','regard','behold',
  'consider','look','watch','wait','hope','trust','obey','choose','refuse','desire','delight',
  'command','teach','learn','write','read','count','number','weigh','measure','divide','join',
  'bind','loose','carry','lift','throw','cast','hold','touch','move','shake','tremble','rest',
  'labor','grow','increase','multiply','prosper','wither','speak','tell','show','lie','draw',
  'grant','hasten','entreat','beseech','declare','establish','magnify','exalt','humble','fear',
  // — folded in from the de-archaic residue report —
  'reveal','endure','shed','approach','become','please','think','bestow','despise','require',
  'avoid','support','fly','stumble','arise','fight','raise','appear','shade','recompense',
  'proceed','exist','stare','ascend','will','slander','receive','shine','incite','meet','mean',
  'resist','restore','flow','dissolve','wish','plead','wear','swear','honour','hinder','accept',
  'rear','requite','deceive','sing','hearken','help','visit','lay','cleanse','restrain','repent',
  'escape','quicken','share','trouble','reckon','endeavour','glorify','suit','shear','prophesy',
  'dispute','contend','deny','need','observe','inquire','grieve','mention','advance','abstain',
  'persist','belong','doubt','undertake','deserve','place','revere','converse','suffer','suggest',
  'envy','flourish','fade','sympathise','cause','gnaw','disturb','finish','renew','heat','preserve',
  'attack','steal','resent','covet','overreach','behave','disobey','encompass','blind','darken',
  'justify','persuade','overcome','aid','strengthen','abominate','dispraise','welcome','languish',
  'kindle','drive','force','conceal','tend','plunder','defraud','pity','provoke','refresh','defile',
  'kill','befall','sell','laud','betray','gaze','err','enforce','excel','leave','cleave','compass',
  'fetch','conquer','hide','crown','appertain','happen','forsake','summon','arrange','explore',
  // — found 2026-07-30, Pistis Sophia (G.R.S. Mead) —
  'surround','instruct','expand','discourse',
  // — found 2026-07-30, de-archaic-corpus.js --dry-run residue report, round 1 —
  'interpret','slink','wreathe','satisfy','promise','address','knock','beseem','pierce',
  'question','bide','change','prove','seal','inherit','reach','purify','comprehend',
  'transgress','renounce','possess','soar','penetrate','commend','explain','complain',
  'seethe','heed',
  // — round 2 —
  'hand','resemble','mix','fashion','remove','undo','dispatch','torment','encourage',
  'breathe','well','chastize','constrain','sense','contrive','goad','utter','release',
  'discharge','surrender','accomplish','envelop','shoot','tower','constitute','buy',
  'amass','urge','sprout','busy','search',
  // — round 3 —
  'consume','separate','invest','try','spend','encircle','deposit','perform','fulfill',
  'repay','bow','apply','awake','bend','deck',
  // — round 5 —
  'protest','await','succeed',
  'scrutinise','care','prepare','defend','beat','withdraw','seem','rain','root','attend','concern',
  'plow','contain','punish','profess','pronounce','part','tarry','prevent','fail','hurt','stay',
  'inhabit','issue','protect','devour','add','sate','round',
  'bear','long','break','mate','exact','order','shed','excel',
  // — round 6, found 2026-08-01, Acts of Barnabas (ingest-nt-apocrypha-2.py) —
  'proclaim',
  // — round 7, found 2026-08-02, de-archaic-corpus.js --dry-run residue report
  // after adding besought/whence/held-his-peace (Pistis Sophia II) —
  'pardon',
];

// standard modern 3rd-person singular
function thirdS(v) {
  if (/(s|x|z|ch|sh)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  if (/o$/.test(v)) return v + 'es';                       // go→goes, do→does
  return v + 's';
}
// archaic 3rd person (-eth) and 2nd person (-est) spellings
function eth(v) { return /e$/.test(v) ? v + 'th' : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'ieth' : v + 'eth'; }
function est(v) { return /e$/.test(v) ? v + 'st' : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'iest' : v + 'est'; }

// build archaic→modern verb table from the curated list
const VERBMAP = {};
for (const v of VERBS) { VERBMAP[eth(v)] = thirdS(v); VERBMAP[est(v)] = v; }

// irregulars + common consonant-doubled forms the rules above don't generate
Object.assign(VERBMAP, {
  hath: 'has', hast: 'have', doth: 'does', dost: 'do', doeth: 'does', doest: 'do',
  saith: 'says', saidst: 'said', hadst: 'had', didst: 'did', wast: 'were', wert: 'were',
  shalt: 'shall', wilt: 'will', canst: 'can', couldst: 'could', wouldst: 'would',
  shouldst: 'should', mayest: 'may', mayst: 'may', mightest: 'might', mightst: 'might',
  spake: 'spoke', sware: 'swore', brake: 'broke', bare: 'bore', gavest: 'gave',
  camest: 'came', sawest: 'saw', knewest: 'knew', tookest: 'took', wentest: 'went',
  wouldest: 'would', shouldest: 'should', couldest: 'could',
  sitteth: 'sits', sittest: 'sit', runneth: 'runs', runnest: 'run', putteth: 'puts',
  setteth: 'sets', getteth: 'gets', beginneth: 'begins', forgetteth: 'forgets',
  // doubled-consonant present forms
  committeth: 'commits', committest: 'commit', begetteth: 'begets', begettest: 'beget',
  sinneth: 'sins', sinnest: 'sin', winneth: 'wins', winnest: 'win',
  stirreth: 'stirs', stirrest: 'stir', letteth: 'lets', lettest: 'let',
  shutteth: 'shuts', shuttest: 'shut', fitteth: 'fits', plotteth: 'plots', plottest: 'plot',
  worshippeth: 'worships', worshippest: 'worship',
  // irregular 2nd-person past
  spakest: 'spoke', leddest: 'led', broughtest: 'brought', sentest: 'sent',
  leftest: 'left', madest: 'made', satest: 'sat', badest: 'bade', chosest: 'chose',
  smotest: 'smote', breakest: 'break', bordereth: 'borders', demandest: 'demand',
  oughtest: 'ought', dureth: 'lasts',
  // — found 2026-08-02, Gospel of Peter (Ante-Nicene Fathers, Walker 1886) — an
  // 1880s literary-register translation carries archaisms beyond thou/thee/-eth,
  // this one's an irregular past tense the regular VERBS-list rules can't derive
  // ("beseech"→"besought", not "beseeched"):
  besought: 'begged',
  sheddeth: 'sheds', sheddest: 'shed', excelleth: 'excels', excellest: 'excel',
  forgettest: 'forget',
  // — found 2026-07-30 —
  hasteth: 'hastens', hastest: 'hasten',        // "hastes" is itself archaic-flavored; "hastens" reads modern
  compelleth: 'compels', compellest: 'compel',  // doubled consonant, regular rule would give "compeleth"
  // — round 2: doubled-consonant / suppletive forms the regular rule can't derive —
  travelleth: 'travels', travellest: 'travel',  // British doubled-l spelling
  marvelleth: 'marvels', marvellest: 'marvel',  // same
  saidest: 'said',                              // 2nd-person past of "say" (irregular, not "sayedst")
  settest: 'set',                               // doubled t, like the existing "sitteth/sittest" pattern
  // — round 3 —
  transferreth: 'transfers', transferrest: 'transfer',  // doubled r
  cutteth: 'cuts', cuttest: 'cut',                       // doubled t
  // — round 4 —
  rotteth: 'rots', rottest: 'rot',                       // doubled t
});

// closed-class function words (pronouns / adverbs)
const WORDS = {
  thou: 'you', thee: 'you', thy: 'your', thine: 'your', ye: 'you', thyself: 'yourself',
  unto: 'to', whither: 'where', thither: 'there', hither: 'here', verily: 'truly',
  wherefore: 'therefore', hitherto: 'until now',
  // — found 2026-08-02, Gospel of Peter — same "whither/thither/hither" family,
  // this one was simply missing:
  whence: 'from where',
  shew: 'show', shewed: 'showed', shewn: 'shown', sheweth: 'shows', shewest: 'show',
};

const ALL = { ...VERBMAP, ...WORDS };
const matchCase = (out, src) => src[0] === src[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;

function modernize(text) {
  if (!text) return text;
  let s = text;
  // phrase-level so a bare noun "art" is never touched
  s = s.replace(/\bthou art\b/gi, m => matchCase('you are', m));
  s = s.replace(/\bart thou\b/gi, m => matchCase('are you', m));
  s = s.replace(/\b(hast|hadst|dost|wast|wert|shalt|wilt|canst) thou\b/gi,
    (m, v) => matchCase(({ hast: 'have', hadst: 'had', dost: 'do', wast: 'were', wert: 'were', shalt: 'shall', wilt: 'will', canst: 'can' })[v.toLowerCase()] + ' you', m));
  // — found 2026-08-02, Gospel of Peter — KJV-register idiom, not a single archaic
  // word (each word in it is individually modern: "held", "his", "peace"), so the
  // whole-word table below can't catch it. Tense-aware: held/holds/hold + peace.
  s = s.replace(/\bheld (?:his|her|their|my|your) peace\b/gi, m => matchCase('kept silent', m));
  s = s.replace(/\bholds (?:his|her|their|my|your) peace\b/gi, m => matchCase('keeps silent', m));
  s = s.replace(/\bhold (?:his|her|their|my|your) peace\b/gi, m => matchCase('keep silent', m));
  // whole-word archaic → modern (verbs + function words)
  s = s.replace(/\b[A-Za-z]+\b/g, w => {
    const r = ALL[w.toLowerCase()];
    return r ? matchCase(r, w) : w;
  });
  return s.replace(/ {2,}/g, ' ');
}

// residue report: archaic markers we did NOT resolve (excludes safe look-alikes)
const SAFE = /\b(honest|modest|forest|harvest|earnest|west|best|rest|guest|priest|beast|feast|least|east|most|must|first|thirst|breast|chest|quest|request|protest|contest|arrest|invest|digest|suggest|manifest|conquest|interest|tempest|behest|bequest|midwest|northwest|southwest|teeth|death|breath|beneath|wreath|sheath|Elizabeth|Nazareth|Gath|Goliath|Japheth|Ashtoreth|beget|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth|hundredth|thousandth|smallest|largest|greatest|finest|eldest|youngest|oldest|highest|lowest|dearest|nearest|earliest|latest|mightiest|strongest|wisest|richest|poorest|deepest|widest|fairest)\b/i;
const MARK = /\b(\w{3,}eth|\w{3,}est|thou|thee|thy|thine|ye|hast|hath|dost|doth|didst|shalt|wilt|unto|saith|spake)\b/gi;
function listResidual(text) {
  const t = modernize(text);
  return [...new Set((t.match(MARK) || []).filter(w => !SAFE.test(w)))];
}

module.exports = { modernize, listResidual };
