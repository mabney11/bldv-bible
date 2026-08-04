// books.js — shared text-data tables used by every page.

export const BOOK_NAMES = {
   1:'Genesis',         2:'Exodus',       3:'Leviticus',    4:'Numbers',     5:'Deuteronomy',
   6:'Joshua',          7:'Judges',       8:'Ruth',         9:'1 Samuel',   10:'2 Samuel',
  11:'1 Kings',        12:'2 Kings',     13:'1 Chronicles',14:'2 Chronicles',
  15:'Ezra',           16:'Nehemiah',    17:'Esther',      18:'Job',       19:'Psalms',
  20:'Proverbs',       21:'Ecclesiastes',22:'Song of Songs',23:'Isaiah',
  24:'Jeremiah',       25:'Lamentations',26:'Ezekiel',     27:'Daniel',
  28:'Hosea',          29:'Joel',        30:'Amos',        31:'Obadiah',   32:'Jonah',
  33:'Micah',          34:'Nahum',       35:'Habakkuk',    36:'Zephaniah', 37:'Haggai',
  38:'Zechariah',      39:'Malachi',
  // New Testament (LXX won't have these; GNT and Ge'ez do)
  40:'Matthew',        41:'Mark',        42:'Luke',        43:'John',      44:'Acts',
  45:'Romans',         46:'1 Corinthians',47:'2 Corinthians',48:'Galatians',49:'Ephesians',
  50:'Philippians',    51:'Colossians',  52:'1 Thessalonians',53:'2 Thessalonians',
  54:'1 Timothy',      55:'2 Timothy',   56:'Titus',       57:'Philemon',  58:'Hebrews',
  59:'James',          60:'1 Peter',     61:'2 Peter',     62:'1 John',    63:'2 John',
  64:'3 John',         65:'Jude',        66:'Revelation',
  // Ethiopic-canon additional books (BETMAS_GEZ_ETH)
  67:'1 Enoch',        68:'Jubilees',    69:'1 Maccabees',  70:'Sirach',    71:'Wisdom',
  // Deuterocanon / pseudepigrapha (served comprehensively from corpus.db)
  72:'Tobit',            73:'Judith',          74:'Baruch',
  75:'Letter of Jeremiah',76:'2 Maccabees',    77:'3 Maccabees',
  78:'4 Maccabees',      79:'Susanna',         80:'Bel and the Dragon',
  81:'1 Esdras',         82:'Odes',            83:'Psalms of Solomon',
  84:'Prayer of Manasseh',85:'Psalm 151',      86:'Psalm 154',
  87:'2 Meqabyan',       88:'3 Meqabyan',      89:'4 Baruch',
  90:'Apocalypse of Ezra',
  // Promoted pseudepigrapha (run assign-canon-ids.py) — cross-language books
  100:'Jasher',101:'1 Adam and Eve',102:'2 Adam and Eve',
  103:'Testament of Reuben',104:'Testament of Simeon',105:'Testament of Levi',106:'Testament of Judah',
  107:'Testament of Issachar',108:'Testament of Zebulun',109:'Testament of Dan',110:'Testament of Naphtali',
  111:'Testament of Gad',112:'Testament of Asher',113:'Testament of Joseph',114:'Testament of Benjamin',
  115:'Joseph and Asenath',116:'Testament of Abraham',117:'Testament of Isaac',118:'Testament of Jacob',
  119:'Testament of Job',120:'Testament of Solomon',121:'Apocalypse of Abraham',122:'Ascension of Isaiah',
  123:'Apocalypse of Elijah',124:'Apocalypse of Sedrach',125:'Apocalypse of Peter',126:'Assumption of Moses',
  127:'Ladder of Jacob',128:'Lives of the Prophets',129:'Jannes and Jambres',130:'History of the Rechabites',
  131:'Book of Giants',132:'Genesis Apocryphon',133:'Wisdom of Ahikar',134:'Words of Gad the Seer',
  135:'Odes of Solomon',136:'2 Enoch',137:'3 Baruch',138:'2 Baruch',139:'4 Ezra',
  140:'Songs of the Sabbath Sacrifice',141:'Five Psalms of David',142:'Visions of Amram',143:'1 Meqabyan',
  144:'Testament of Kohath',145:'Book of Nathan the Prophet',146:'Apocryphon of Joshua',
  147:'Balaam Inscription',148:'Words of Azariah',149:'Gospel of Nicodemus',150:'Epistle of Barnabas',
  151:'Shepherd of Hermas I',152:'Shepherd of Hermas II',153:'Shepherd of Hermas III',154:'Greek Esther',
};

export const PALEO_LETTERS = [
  '𐤀','𐤁','𐤂','𐤃','𐤄','𐤅','𐤆','𐤇','𐤈','𐤉','𐤊',
  '𐤋','𐤌','𐤍','𐤎','𐤏','𐤐','𐤑','𐤒','𐤓','𐤔','𐤕'
];

// Each letter has a "med" sound (when it appears mid-word) and a "fin" sound
// (when it appears as the final character). We pick which to use per position
// when transliterating a paleo string.
export const CHAR_MAP = {
  '𐤀':{med:'a',  fin:'a' }, '𐤁':{med:'ba', fin:'b' }, '𐤂':{med:'ga', fin:'g' },
  '𐤃':{med:'da', fin:'d' }, '𐤄':{med:'ha', fin:'h' }, '𐤅':{med:'wa', fin:'w' },
  '𐤆':{med:'za', fin:'z' }, '𐤇':{med:'cha',fin:'ch'}, '𐤈':{med:'ta', fin:'t' },
  '𐤉':{med:'ya', fin:'y' }, '𐤊':{med:'ka', fin:'k' }, '𐤋':{med:'la', fin:'l' },
  '𐤌':{med:'ma', fin:'m' }, '𐤍':{med:'na', fin:'n' }, '𐤎':{med:'sa', fin:'s' },
  '𐤏':{med:'i',  fin:'i' }, '𐤐':{med:'pa', fin:'p' }, '𐤑':{med:'tza',fin:'tz'},
  '𐤒':{med:'qa', fin:'q' }, '𐤓':{med:'ra', fin:'r' }, '𐤔':{med:'sha',fin:'sh'},
  '𐤕':{med:'tha',fin:'th'},
};

export const LETTER_NAMES = {
  '𐤀':'Alap',  '𐤁':'Bayath','𐤂':'Gamal', '𐤃':'Dalath','𐤄':'Hay',   '𐤅':'Waw',
  '𐤆':'Zayan', '𐤇':'Chayath','𐤈':'Tayath','𐤉':'Yad',   '𐤊':'Kap',   '𐤋':'Lamad',
  '𐤌':'Mayam', '𐤍':'Nawan', '𐤎':'Samak', '𐤏':'Iyan',  '𐤐':'Pah',   '𐤑':'Tzaday',
  '𐤒':'Qap',   '𐤓':'Rash',  '𐤔':'Shayan','𐤕':'Thaw',
};

/** Transliterate a paleo string to its English pronunciation. First letter
 *  capitalised, last char uses its "fin" form. */
export function translit(w) {
  if (!w) return '';
  const chars = [...w];
  let t = '';
  for (let i = 0; i < chars.length; i++) {
    const c = CHAR_MAP[chars[i]];
    t += c ? (i === chars.length - 1 ? c.fin : c.med) : chars[i];
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Sort key for paleo strings — index into PALEO_LETTERS, padded into ascii. */
export function paleoSortKey(w) {
  return [...(w || '')].map(c => {
    const i = PALEO_LETTERS.indexOf(c);
    return i < 0 ? '\x7f' : String.fromCharCode(i + 32);
  }).join('');
}
