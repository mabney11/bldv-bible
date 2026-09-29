import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle.js';
import './Landing.css';

/**
 * Landing — entry page. The hierarchy (fieldy, 2026-09-29):
 *
 *   1. Hero: logo + title + the pitch ("Read the Bible in English with the
 *      original Hebrew … the Temple that Solomon built, and so much more ⌄⌄⌄")
 *   2. The two ways in — the Novel English Bible, and the Hebrew itself
 *   3. The four big features, in this order:
 *        Interactive Story Models (/models) — split from the maps because it
 *          is expected to grow the most
 *        Maps (/maps)
 *        English–Paleo Hebrew Parallel Bible (promoted from the tools row)
 *        Lexicon (a field-guide device icon instead of the magnifying glass)
 *   4. The tools (Translation Studio + its public progress, Passages, …)
 *
 * The Greek, Latin and Ge'ez sources are reached from inside the reader
 * (the source switcher), not from here — the front door is the Hebrew.
 * Keep the pitch word for word with server/prerender.js's LANDING_PITCH.
 */

/** A handheld field-guide device — the Lexicon's icon ("a pokedex like image
 *  instead of the magnifying glass"): a red case, a lens, three lights, and a
 *  screen showing 𐤀. Drawn here, no image file. */
export function LexiconDeviceIcon({ size = 40 }) {
  return (
    <svg className="landing-lexdex" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="3" width="36" height="42" rx="6" fill="#c8322f" />
      <rect x="6" y="3" width="36" height="42" rx="6" fill="none" stroke="#7a1715" strokeWidth="1.5" />
      <path d="M6 17 H42" stroke="#7a1715" strokeWidth="1.5" />
      <circle cx="15" cy="10.5" r="5.2" fill="#f4f1e8" />
      <circle cx="15" cy="10.5" r="3.9" fill="#3aa0e8" />
      <circle cx="13.6" cy="9.1" r="1.3" fill="#e6f5ff" />
      <circle cx="25" cy="8" r="1.6" fill="#f06a5e" />
      <circle cx="30" cy="8" r="1.6" fill="#f5c542" />
      <circle cx="35" cy="8" r="1.6" fill="#58c26b" />
      <rect x="11" y="21" width="26" height="16" rx="2.5" fill="#1d2320" stroke="#f4f1e8" strokeWidth="1.6" />
      <text x="24" y="33.6" textAnchor="middle" fontSize="12" fill="#e6b84a" style={{ fontFamily: 'var(--paleo-font)' }}>𐤀</text>
      <circle cx="13" cy="41" r="1.4" fill="#7a1715" />
      <rect x="27" y="40" width="10" height="2" rx="1" fill="#7a1715" />
    </svg>
  );
}

const FEATURES = [
  {
    to: '/models', cls: 'landing-feature-models', ico: '🏛', name: 'Interactive Story Models',
    sub: 'The epics of the Bible in 3D, built from the text — watch Shalamah (Solomon)\'s bayath (house) rise, walk the house and the city Yachazaqaal (Ezekiel) saw, raise the mashakan (tabernacle) with the twelve tribes camped about it, and stand in the gate of the city coming down out of shamayam (heaven)',
    go: 'Enter the stories →',
  },
  {
    to: '/maps', cls: 'landing-feature-maps', ico: '🗺', name: 'Maps',
    sub: 'The prophetic Holy Land in 3D — the twelve tribes\' allotments of Joshua and of Ezekiel\'s kingdom to come, the Holy Portion, the cities, the rivers and seas, every border traced to its verse; printable sheets too',
    go: 'Open the maps →',
  },
  {
    to: '/parallel/genesis/1', cls: 'landing-feature-parallel', ico: '📖', name: 'English–Paleo Hebrew Parallel Bible',
    sub: 'Every verse in English beside its paleo Hebrew, word for word — hover a word and its Hebrew lights up; the Hebrew every translation should come packaged with',
    go: 'Open the parallel Bible →',
  },
  {
    to: '/lexicon-page', cls: 'landing-feature-lex', ico: <LexiconDeviceIcon />, name: 'Lexicon',
    sub: 'Every word, root and name — its paleo letters, its parts, its Strong\'s number and every verse it stands in',
    go: 'Open the lexicon →',
  },
];

export default function Landing() {
  // Own convention, not the generic pageTitle() "<Page> | BLD Bible" suffix —
  // matches server/prerender.js's /landing snapshot exactly (see LANDING_TITLE
  // there) so there's no title flash on hydration.
  usePageTitle('BLD Bible: Hebrew–English Bible & Interactive 3D Bible Stories');
  const toFeatures = (e) => {
    e.preventDefault();
    document.getElementById('landing-explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="landing">
      <div className="landing-logo-area">
        <div className="landing-logo-mark">
          <div className="landing-logo-glyph">𐤀𐤁</div>
        </div>
        <h1 className="landing-title">
          BLD Bible<br /><span>Online Bible Study Tool</span>
        </h1>
        <p className="landing-subtitle">
          Read the Bible in English with the original Hebrew text that any translator should package with their translation.
          Immerse yourself in the 3D storytelling epics of the Bible. See the prophetic Holy Land which is sure to come,
          the Temple that Solomon built, and so much more
        </p>
        <a href="#landing-explore" className="landing-more" onClick={toFeatures} aria-label="See it all below">
          <span aria-hidden="true">⌄</span><span aria-hidden="true">⌄</span><span aria-hidden="true">⌄</span>
        </a>
      </div>

      <div className="landing-enter">
        <Link to="/bible?book=1&chapter=1" className="landing-read-cta">
          <span className="landing-read-cta-label">Novel English Bible</span>
          <span className="landing-read-cta-sub">Clean English translation with Hebrew-backed names &amp; places</span>
        </Link>

        <Link to="/?book=1&chapter=1" className="landing-cta">
          Enter Hebrew — BaRaashayath (Genesis) 1:1
        </Link>
      </div>

      <nav className="landing-features" id="landing-explore" aria-label="Explore">
        {FEATURES.map((f) => (
          <Link key={f.to} to={f.to} className={`landing-feature ${f.cls}`}>
            <span className="landing-feature-ico" aria-hidden="true">{f.ico}</span>
            <span className="landing-feature-body">
              <span className="landing-feature-name">{f.name}</span>
              <span className="landing-feature-sub">{f.sub}</span>
              <span className="landing-feature-go">{f.go}</span>
            </span>
          </Link>
        ))}
      </nav>

      <nav className="landing-sec-links" aria-label="Tools">
        <Link to="/translate?book=1&chapter=1&verse=1" className="landing-sec-link">
          <span aria-hidden="true">✏️</span> Translation Studio
        </Link>
        <Link to="/progress" className="landing-sec-link">
          <span aria-hidden="true" className="landing-mem">𐤌</span> Translation Progress
        </Link>
        <Link to="/passages" className="landing-sec-link">
          <span aria-hidden="true">📜</span> Passages
        </Link>
        <Link to="/precepts" className="landing-sec-link">
          <span aria-hidden="true">⁂</span> Precepts
        </Link>
        <Link to="/works" className="landing-sec-link">
          <span aria-hidden="true">📚</span> Works Library
        </Link>
        <Link to="/guide" className="landing-sec-link">
          <span aria-hidden="true">🧭</span> Guide
        </Link>
      </nav>

      <div className="landing-sub">
        Beginning with <strong>BaRaashayath</strong> (Genesis) · Book 1 · Chapter 1 · Verse 1
      </div>

      <Link to="/admin-login" className="landing-lex-link" style={{ opacity: 0.4, fontSize: 12, marginTop: 8 }}>
        Admin
      </Link>
    </div>
  );
}
