import { Link } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './Guide.css';

/**
 * Guide — what the app does and where to find it. Replaces the Token
 * Cheatsheet as the page the landing points at: the cheatsheet is the
 * grammar of the raw BHS tokens (still at /cheatsheet for the curious);
 * this is the tour of the features a reader actually uses.
 *
 * Route: /guide
 */
const SECTIONS = [
  {
    id: 'read',
    ico: '📜',
    title: 'Read the scriptures in their own names',
    body: 'The Novel English Bible reads as clean English, but every person and place keeps its Hebrew name — Yahawadah, not Judah; Yarawashalam, not Jerusalem. The name is followed by its meaning in parentheses the first time it matters, so "Bayath-Lacham (house of bread)" tells you what the writer heard. The empty gold marker after the Name — Yahawah () — is deliberate: the Name is never glossed.',
    links: [
      { to: '/bible?book=1&chapter=1', label: 'Novel English Bible — BaRaashayath 1' },
      { to: '/bible?book=6&chapter=15&verse=11', label: 'Yahawashawai (Joshua) 15:11 — Jabneel' },
    ],
  },
  {
    id: 'hebrew',
    ico: '𐤀',
    title: 'The Hebrew itself, in paleo letters',
    body: 'The Hebrew reader shows the text in the paleo-Hebrew script the prophets wrote in — the same 22 letters, never the later square script. Tap any word for its parts: the root, the prefixes and suffixes, person, gender and number, and the Strong’s number that links it to every other place it occurs. The Greek, Latin and Ge’ez sources are one switch away inside the same reader.',
    links: [
      { to: '/?book=1&chapter=1', label: 'Hebrew reader — BaRaashayath 1:1' },
      { to: '/?source=LXX&book=1&chapter=1&verse=1', label: 'Greek (Septuagint + NT)' },
    ],
  },
  {
    id: 'parallel',
    ico: '📖',
    title: 'English and Hebrew side by side',
    body: 'The Parallel view sets the English against the Hebrew verse by verse, word-linked: hover or tap an English word and its Hebrew lights up, and the other way round. It is the fastest way to check what a translation did with a word.',
    links: [{ to: '/parallel/1/1', label: 'Parallel — BaRaashayath 1' }],
  },
  {
    id: 'maps',
    ico: '🗺',
    title: 'Maps & Models',
    body: 'The Holy Land in 3D is drawn from the text, not traced from an atlas: the tribal allotments of Yahawashawai (Joshua) 13–19, the millennial bands of Yachazaqaal (Ezekiel) 47–48 with the Holy Portion measured in cubits, the cities with their verses, and the rivers and seas under the names the Bible gives them. Tap any portion, city or water for its verses; every border and measurement says which verse it comes from. The Statue of the Dream is Daniel 2 in 3D: tap the dahab (gold), kasap (silver), nachash (brass), parazal (iron) and chasap (clay) for their verses, then play the aban (stone) gazar (cut) out laa (NOT) yadayan (hands) striking the tzalam (likeness) to pieces.',
    links: [
      { to: '/models/holy-land', label: 'The Holy Land in 3D' },
      { to: '/models/holy-land?overlay=joshua', label: 'Joshua’s allotments' },
      { to: '/models/statue', label: 'The Statue of the Dream (Daniel 2)' },
      { to: '/models/prints', label: 'Printable map sheets (PNG · SVG · PDF)' },
      { to: '/models', label: 'All models' },
    ],
  },
  {
    id: 'passages',
    ico: '📜',
    title: 'Passages',
    body: 'The named passages — the Prayer of Azarias, the Proclamation of Mardocheus, Yaiqab’s blessing on his sons, the Song of the Sea, the Ten Commandments — each on its own page with just its verses, in the same words and names as the Novel English Bible, at an address you can keep. Any reference can be opened the same way: /passage?ref=Isaiah 53.',
    links: [
      { to: '/passages', label: 'All passages' },
      { to: '/passage/jacobs-blessings', label: 'Yaiqab’s blessing on his twelve sons' },
      { to: '/passage/proclamation-of-mordecai', label: 'The Proclamation of Mardocheus' },
    ],
  },
  {
    id: 'lexicon',
    ico: '🔎',
    title: 'Lexicon, roots and concordance',
    body: 'Every word in the text is in the Lexicon: its paleo letters, transliteration, meaning, and the parts a name is built from. The Root Explorer walks a root through all its surface forms, and the Concordance lists every verse a word stands in. Search reaches across all of it — Hebrew, English, the names and the works.',
    links: [
      { to: '/lexicon-page', label: 'Lexicon' },
      { to: '/roots', label: 'Root Explorer' },
      { to: '/concordance', label: 'Concordance' },
      { to: '/search', label: 'Search' },
    ],
  },
  {
    id: 'translate',
    ico: '✏️',
    title: 'Translation Studio',
    body: 'Where the English is made. Each verse sits over its Hebrew tokens with their glosses; a rendering is edited word by word and kept with its history, so the English can always be traced back to the Hebrew that produced it.',
    links: [{ to: '/translate?book=1&chapter=1&verse=1', label: 'Translation Studio — BaRaashayath 1:1' }],
  },
  {
    id: 'works',
    ico: '📚',
    title: 'Works Library',
    body: 'Books beyond the canon and studies built on it, read in the same reader with the same names.',
    links: [{ to: '/works', label: 'Works Library' }],
  },
];

export default function Guide() {
  usePageTitle(pageTitle('Guide'), 'What BLD Bible does and where to find it — the Novel English Bible, the paleo-Hebrew reader, the Parallel view, Maps & Models, Passages, the Lexicon and the Translation Studio.');
  return (
    <div className="guide">
      <header className="guide-top">
        <Link to="/landing" className="guide-back" title="Home">←</Link>
        <h1 className="guide-h1">Guide</h1>
        <span className="guide-kicker">What the app does, and where</span>
      </header>
      <nav className="guide-toc" aria-label="Sections">
        {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`}><span aria-hidden="true">{s.ico}</span> {s.title}</a>)}
      </nav>
      <div className="guide-sections">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="guide-section">
            <div className="guide-ico" aria-hidden="true">{s.ico}</div>
            <div className="guide-body">
              <h2>{s.title}</h2>
              <p>{s.body}</p>
              <div className="guide-links">
                {s.links.map((l) => <Link key={l.to} to={l.to} className="guide-link">{l.label} →</Link>)}
              </div>
            </div>
          </section>
        ))}
      </div>
      <footer className="guide-foot">
        Under the hood: the Hebrew text is tagged word by word (BHS), and the reader shows those tags when you open a word.
        The grammar of every tag is in the <Link to="/cheatsheet">Token Cheatsheet</Link>.
      </footer>
    </div>
  );
}
