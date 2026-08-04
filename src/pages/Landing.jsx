import { Link } from 'react-router-dom';
import './Landing.css';

/**
 * Landing — entry page. The hierarchy:
 *
 *   1. Hero: logo + title
 *   2. Primary CTA — Hebrew Genesis 1:1 (the original)
 *   3. SOURCE SWITCHER — direct entry into LXX / GNT / Ge'ez at their
 *      conventional opening verses. This is what users need to see right
 *      away if they want to start in a non-Hebrew source.
 *   4. Secondary tools (Parallel, Translation Studio, Share, Lexicon,
 *      Cheatsheet) — for power users.
 *   5. Per-language lexicon row — every source has its own surface lexicon.
 */
export default function Landing() {
  return (
    <div className="landing">
      <div className="landing-logo-area">
        <div className="landing-logo-mark">
          <div className="landing-logo-glyph">𐤀𐤁</div>
        </div>
        <h1 className="landing-title">
          Paleo-Hebrew <span>Translation Studio</span>
        </h1>
        <div className="landing-subtitle">
          Hebrew · Greek · Latin · Ge&#39;ez — scriptures, plus a library of works
        </div>
      </div>

      <Link to="/bible?book=1&chapter=1" className="landing-read-cta">
        <span className="landing-read-cta-label">Novel English Bible</span>
        <span className="landing-read-cta-sub">Clean English translation with Hebrew-backed names &amp; places</span>
      </Link>

      <Link to="/?book=1&chapter=1" className="landing-cta">
        Enter Hebrew — BaRaashayath (Genesis) 1:1
      </Link>

      <nav className="landing-sources" aria-label="Open another source">
        <div className="landing-sources-label">Other sources</div>
        <div className="landing-sources-row">
          <Link to="/?source=LXX&book=1&chapter=1&verse=1" className="landing-source-card">
            <span className="landing-source-tag">GREEK</span>
            <span className="landing-source-name">Greek Scriptures</span>
            <span className="landing-source-sub">Septuagint + NT · Gen → Rev →</span>
          </Link>
          <Link to="/?source=GEZ&book=1&chapter=1&verse=1" className="landing-source-card">
            <span className="landing-source-tag">GEZ</span>
            <span className="landing-source-name">Ge&#39;ez Bible</span>
            <span className="landing-source-sub">Ethiopic · Gen 1:1 →</span>
          </Link>
          <Link to="/?source=LAT&book=1&chapter=1&verse=1" className="landing-source-card">
            <span className="landing-source-tag">LAT</span>
            <span className="landing-source-name">Latin Vulgate</span>
            <span className="landing-source-sub">Latin · Gen 1:1 →</span>
          </Link>
        </div>
      </nav>

      <nav className="landing-sec-links" aria-label="Tools">
        <Link to="/parallel?book=1&chapter=1" className="landing-sec-link">
          <span aria-hidden="true">📖</span> English–Hebrew Parallel
        </Link>
        <Link to="/translate?book=1&chapter=1&verse=1" className="landing-sec-link">
          <span aria-hidden="true">✏️</span> Translation Studio
        </Link>
        <Link to="/share" className="landing-sec-link">
          <span aria-hidden="true">🖼</span> Share &amp; Export
        </Link>
        <Link to="/works" className="landing-sec-link">
          <span aria-hidden="true">📚</span> Works Library
        </Link>
        <Link to="/lexicon-page" className="landing-sec-link">
          <span aria-hidden="true">🔎</span> Lexicon
        </Link>
        <Link to="/cheatsheet" className="landing-sec-link">
          <span aria-hidden="true">📋</span> Token Cheatsheet
        </Link>
      </nav>

      {/* Per-language lexicons — same URL with a lang param */}
      <nav className="landing-lex-row" aria-label="Per-language lexicons">
        <span className="landing-lex-label">Open lexicon as:</span>
        <Link to="/lexicon-page?lang=hebrew" className="landing-lex-link">Hebrew</Link>
        <span className="landing-lex-dot">·</span>
        <Link to="/lexicon-page?lang=greek" className="landing-lex-link">Greek</Link>
        <span className="landing-lex-dot">·</span>
        <Link to="/lexicon-page?lang=geez" className="landing-lex-link">Ge&#39;ez</Link>
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
