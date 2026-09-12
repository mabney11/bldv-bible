import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle.js';
import './Landing.css';

/**
 * Landing — entry page. The hierarchy:
 *
 *   1. Hero: logo + title
 *   2. The two ways in — the Novel English Bible, and the Hebrew itself
 *   3. The two big features — Maps & Models, and the Lexicon
 *   4. The tools (Parallel, Translation Studio, Passages, Works Library, Guide)
 *
 * The Greek, Latin and Ge'ez sources are reached from inside the reader
 * (the source switcher), not from here — the front door is the Hebrew.
 */
export default function Landing() {
  // Own convention, not the generic pageTitle() "<Page> | BLD Bible" suffix —
  // matches server/prerender.js's /landing snapshot exactly (see LANDING_TITLE
  // there) so there's no title flash on hydration.
  usePageTitle('BLD Bible: Online Bible Study Tool');
  return (
    <div className="landing">
      <div className="landing-logo-area">
        <div className="landing-logo-mark">
          <div className="landing-logo-glyph">𐤀𐤁</div>
        </div>
        <h1 className="landing-title">
          BLD Bible<br /><span>Online Bible Study Tool</span>
        </h1>
        <div className="landing-subtitle">
          The scriptures in their own names — Hebrew first, English beside it, the land drawn from the text
        </div>
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

      <nav className="landing-features" aria-label="Explore">
        <Link to="/models" className="landing-feature landing-feature-maps">
          <span className="landing-feature-ico" aria-hidden="true">🗺</span>
          <span className="landing-feature-body">
            <span className="landing-feature-name">Maps &amp; Models</span>
            <span className="landing-feature-sub">The Holy Land in 3D — Joshua's allotments, Ezekiel's millennial kingdom, the cities, the rivers and seas, every border traced to its verse</span>
            <span className="landing-feature-go">Open the maps →</span>
          </span>
        </Link>
        <Link to="/lexicon-page" className="landing-feature landing-feature-lex">
          <span className="landing-feature-ico" aria-hidden="true">🔎</span>
          <span className="landing-feature-body">
            <span className="landing-feature-name">Lexicon</span>
            <span className="landing-feature-sub">Every word, root and name — its paleo letters, its parts, its Strong's number and every verse it stands in</span>
            <span className="landing-feature-go">Open the lexicon →</span>
          </span>
        </Link>
      </nav>

      <nav className="landing-sec-links" aria-label="Tools">
        <Link to="/parallel/1/1" className="landing-sec-link">
          <span aria-hidden="true">📖</span> English–Hebrew Parallel
        </Link>
        <Link to="/translate?book=1&chapter=1&verse=1" className="landing-sec-link">
          <span aria-hidden="true">✏️</span> Translation Studio
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
