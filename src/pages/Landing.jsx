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

/** The Lexicon's icon — a smartphone (fieldy, 2026-09-29: "make it look more
 *  like a smartphone, i like the alap but lets also have an ox head image and
 *  scribble text denoting more details about a word can be found here"): the
 *  ox head the letter was drawn from, beside 𐤀, over lines of scribbled notes. */
export function LexiconDeviceIcon({ size = 44 }) {
  return (
    <svg className="landing-lexdex" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="10" y="1.5" width="28" height="45" rx="6" fill="#c8322f" />
      <rect x="11.6" y="3.1" width="24.8" height="41.8" rx="4.6" fill="#111214" />
      <rect x="13.2" y="6.4" width="21.6" height="35.4" rx="2.4" fill="#f4ecd8" />
      <rect x="20.5" y="4.1" width="7" height="1.4" rx=".7" fill="#2a2b2f" />
      <rect x="20" y="42.6" width="8" height="1" rx=".5" fill="#55565c" />
      {/* the ox head — horns, ears, face, eyes, nostrils */}
      <g transform="translate(14.6 9) scale(.95)" fill="none" stroke="#6b3f18" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.2 3.4 Q1 3 .4 .4 M8.8 3.4 Q11 3 11.6 .4" />
        <path d="M3 3.4 Q6 2.4 9 3.4 L8.4 9 Q6 11.6 3.6 9 Z" fill="#c98a4b" />
        <path d="M3 4.4 L.9 5.6 L3.2 6 M9 4.4 L11.1 5.6 L8.8 6" fill="#c98a4b" />
        <circle cx="4.9" cy="5.6" r=".45" fill="#2a1a0c" stroke="none" />
        <circle cx="7.1" cy="5.6" r=".45" fill="#2a1a0c" stroke="none" />
        <circle cx="5.3" cy="8.9" r=".35" fill="#2a1a0c" stroke="none" />
        <circle cx="6.7" cy="8.9" r=".35" fill="#2a1a0c" stroke="none" />
      </g>
      <text x="30" y="19.5" textAnchor="middle" fontSize="11" fill="#b8801f" style={{ fontFamily: 'var(--paleo-font)' }}>𐤀</text>
      {/* scribbled notes — more about the word */}
      <g fill="none" strokeLinecap="round" strokeWidth=".95">
        <path d="M15.4 25 q1 -1.2 2 0 t2 0 t2 0 t2 0 t2 0 t2 0 t2 0" stroke="#b8801f" />
        <path d="M15.4 29 q1 -1.1 2 0 t2 0 t2 0 t2 0 t2 0 t2 0" stroke="#7a6a4e" />
        <path d="M15.4 33 q1 -1.1 2 0 t2 0 t2 0 t2 0 t2 0 t2 0 t2 0" stroke="#7a6a4e" />
        <path d="M15.4 37 q1 -1.1 2 0 t2 0 t2 0 t2 0" stroke="#7a6a4e" />
      </g>
    </svg>
  );
}

/** Maps' icon — the real map, not a drawing (fieldy, 2026-09-29: "keep my map
 *  realistic … all 12 tribes should fit in the frame"): a render of
 *  /models/holy-land's own Ezekiel 47–48 allotment, Dan to Gad, north up, saved
 *  as public/model-thumbs/holy-land-icon.jpg (256 px; the /maps poster
 *  holy-land.jpg is the same render at 800 × 500, with the tribes' names). */
export function TribesChartIcon({ size = 44 }) {
  return <img className="landing-tribes" src="/model-thumbs/holy-land-icon.jpg" width={size} height={size} alt="" loading="lazy" />;
}

/** The Parallel Bible's icon — English beside paleo, in four quadrants:
 *  A 𐤀 over b 𐤁 (fieldy, 2026-09-29). */
export function ParallelQuadIcon({ size = 44 }) {
  return (
    <svg className="landing-quad" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="3" y="3" width="42" height="42" rx="7" fill="#f4ecd8" />
      <path d="M24 7 V41 M7 24 H41" stroke="#b79a62" strokeWidth="1.2" />
      <text x="13.5" y="19.5" textAnchor="middle" fontSize="15" fill="#2a2320" style={{ fontFamily: 'Georgia, serif', fontWeight: 700 }}>A</text>
      <text x="34.5" y="19.5" textAnchor="middle" fontSize="15" fill="#b8801f" style={{ fontFamily: 'var(--paleo-font)' }}>𐤀</text>
      <text x="13.5" y="38.5" textAnchor="middle" fontSize="15" fill="#2a2320" style={{ fontFamily: 'Georgia, serif', fontWeight: 700 }}>b</text>
      <text x="34.5" y="38.5" textAnchor="middle" fontSize="15" fill="#b8801f" style={{ fontFamily: 'var(--paleo-font)' }}>𐤁</text>
    </svg>
  );
}

/** Interactive Story Models' icon — "something that implies 'interactive games'
 *  are here" (fieldy, 2026-09-29): a pixel-art temple and its mountain rising out
 *  of an open book (the story coming off the page), pixel stars, and a game
 *  controller badge. Drawn here, no image file; lifts and twinkles on hover. */
export function StoryGameIcon({ size = 44 }) {
  const px = (x, y, w, h, f) => <rect x={x} y={y} width={w} height={h} fill={f} shapeRendering="crispEdges" />;
  return (
    <svg className="landing-storygame" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {/* stars */}
      <g className="lsg-stars" fill="#f5d27a">
        {px(5, 6, 2, 2)}{px(40, 4, 2, 2)}{px(33, 11, 1.5, 1.5)}{px(10, 15, 1.5, 1.5)}
      </g>
      {/* the story rising off the page */}
      <g className="lsg-rise">
        {/* mountain, stepped like pixel art */}
        {px(12, 26, 24, 4, '#3f7f6e')}{px(15, 22, 18, 4, '#4a9480')}{px(18, 18, 12, 4, '#56a88f')}
        {/* the house on the mountain top */}
        {px(19, 12, 10, 6, '#e8aa55')}{px(18, 10, 12, 2, '#f5c070')}{px(21, 8, 6, 2, '#f5c070')}
        {px(23, 14, 2, 4, '#5a3a14')}{px(20, 13, 1.5, 3, '#fff3d6')}{px(26.5, 13, 1.5, 3, '#fff3d6')}
      </g>
      {/* open book */}
      <path d="M4 31 Q14 27 24 31 Q34 27 44 31 L44 39 Q34 35 24 39 Q14 35 4 39 Z" fill="#f4ecd8" />
      <path d="M24 31 L24 39" stroke="#b79a62" strokeWidth="1" />
      <path d="M4 39 Q14 35 24 39 Q34 35 44 39 L44 41 Q34 37 24 41 Q14 37 4 41 Z" fill="#8a5a2b" />
      <path d="M8 32.5 Q14 30.5 20 32.5 M8 35 Q14 33 20 35 M28 32.5 Q34 30.5 40 32.5 M28 35 Q34 33 40 35" stroke="#c9b58a" strokeWidth=".8" fill="none" />
      {/* controller badge */}
      <g className="lsg-pad" transform="translate(30 38)">
        <rect x="0" y="0" width="16" height="9" rx="4.5" fill="#2b6fd6" stroke="#0e0e0f" strokeWidth="1" />
        {px(3, 3.5, 5, 2, '#fff')}{px(4.5, 2, 2, 5, '#fff')}
        <circle cx="11" cy="3.3" r="1.1" fill="#f5c542" /><circle cx="12.8" cy="5.6" r="1.1" fill="#f06a5e" />
      </g>
    </svg>
  );
}

const FEATURES = [
  {
    to: '/models', cls: 'landing-feature-models', ico: <StoryGameIcon />, name: 'Interactive Story Models',
    sub: 'The epics of the Bible in 3D, built from the text — watch Shalamah (Solomon)\'s bayath (house) rise, walk the house and the city Yachazaqaal (Ezekiel) saw, raise the mashakan (tabernacle) with the twelve tribes camped about it, and stand in the gate of the city coming down out of shamayam (heaven)',
    go: 'Play the stories →',
  },
  {
    to: '/maps', cls: 'landing-feature-maps', ico: <TribesChartIcon />, name: 'Maps',
    sub: 'The prophetic Holy Land in 3D — the twelve tribes\' allotments of Joshua and of Ezekiel\'s kingdom to come, the Holy Portion, the cities, the rivers and seas, every border traced to its verse; printable sheets too',
    go: 'Open the maps →',
  },
  {
    to: '/parallel/genesis/1', cls: 'landing-feature-parallel', ico: <ParallelQuadIcon />, name: 'English–Paleo Hebrew Parallel Bible',
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
