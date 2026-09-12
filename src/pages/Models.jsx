/**
 * Models.jsx — "Maps & Models": the index of interactive 3D / visual
 * models in the app. Linked from the landing page. Each model is its own
 * lazy route (see App.jsx); this page is just the catalogue, so adding a
 * model is one entry in MODELS below plus its route.
 *
 * Route: /models
 */
import { Link } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './Models.css';

export const MODELS = [
  {
    slug: 'holy-land',
    title: 'The Holy Land in 3D',
    kicker: 'Interactive terrain map',
    blurb: 'Fly over the Levant in 3D relief. Switch between the tribal allotments of Joshua 13–19 and the millennial allotments of Ezekiel 47–48, see the biblical cities of Joshua with their paleo-Hebrew names, and find out which portion today\'s cities and peoples fall in.',
    paleo: '𐤉𐤁𐤍-𐤀𐤋',
    tags: ['Joshua 13–19', 'Ezekiel 47–48', '3D terrain', 'Cities'],
    to: '/models/holy-land',
    quick: [
      { label: 'Joshua allotments', to: '/models/holy-land?overlay=joshua' },
      { label: 'Millennial kingdom', to: '/models/holy-land?overlay=ezekiel' },
      { label: 'Jabneel — Joshua 15:11', to: '/models/holy-land?city=jabneel-judah' },
    ],
  },
  {
    slug: 'statue',
    title: 'The Tzalam (Likeness) of the Dream',
    kicker: 'Interactive 3D model · Daniel 2',
    blurb: 'Nabawakadanaatzar (Nebuchadnezzar)\'s tzalam (likeness) — the raash (head) of dahab (gold), the chaday (breast) and darai (arms) of kasap (silver), the maih (belly) and yarakaa (thighs) of nachash (brass), the shaq (legs) of parazal (iron), the ragal (feet) of parazal (iron) and chasap (clay) — and the aban (stone) gazar (cut) out laa (without) yadayan (hands). Tap any piece for the text\'s own words and verses; play the aban (stone) striking it to pieces, scrub through the fall, and see that only the aban (stone) remains.',
    paleo: '𐤑𐤋𐤌 𐤀𐤁𐤍',
    tags: ['Daniel 2:31–45', 'Daniel 7–8', '3D · 2D sheet', 'Animation'],
    to: '/models/statue',
    quick: [
      { label: 'The aban (stone) — Daniel 2:34', to: '/models/statue?piece=stone' },
      { label: 'The ragal (feet) of parazal (iron) and chasap (clay)', to: '/models/statue?piece=feet' },
      { label: 'Flat 2D sheet', to: '/models/statue?view=2d' },
    ],
  },
  {
    slug: 'temple',
    title: 'The Bayath (House) of Yahawah',
    kicker: 'Interactive 3D model · 1 Kings 6–7',
    blurb: 'The bayath (house) Shalamah (Solomon) banah (built) for Yahawah, measured in amah (cubits) from the text: the hayakal (temple) and the dabayar (oracle) with its karawab (cherubim), the awalam (porch), Yakayan (Jachin) and Baiz (Boaz), the yam (sea) on twelve oxen, the ten makanawath (bases), the mazabach (altar), the chatzarawath (courts) and the malak (king)\'s houses. Watch it rise in the order 1 Kings 6–7 gives it, or walk in from the gate to the arawan (ark); tap any part for its measures, verse by verse.',
    paleo: '𐤁𐤉𐤕 𐤉𐤄𐤅𐤄',
    tags: ['1 Kings 6–8', '2 Chronicles 3–7', '3D · plan & section', 'Build · Dedicate · Walk · Roam'],
    to: '/models/temple',
    quick: [
      { label: 'Walk in, gate to ark', to: '/models/temple?mode=walk' },
      { label: 'Watch it rise (1 Kings 6–7 in order)', to: '/models/temple?mode=build' },
      { label: 'The dedication: the ark, the inan (cloud), the ash (fire) — 1 Kings 8', to: '/models/temple?mode=dedicate' },
      { label: 'Roam it on your own feet', to: '/models/temple?mode=roam' },
      { label: 'The karawab (cherubim) of the dabayar (oracle)', to: '/models/temple?piece=karawab' },
      { label: 'Yakayan (Jachin) and Baiz (Boaz)', to: '/models/temple?piece=pillars' },
    ],
  },
  {
    slug: 'prints',
    title: 'Printable Maps',
    kicker: 'Downloadable map sheets',
    blurb: 'The Holy Land as official-looking map sheets, drawn from the same data as the 3D model: the allotment of Ezekiel 47–48 with the Holy Portion and the prince\'s land, the allotment of Joshua 13–19, and the Holy Portion close up. Save as a print-quality PNG, an SVG, or a PDF.',
    paleo: '𐤀𐤓𐤑 𐤒𐤃𐤔',
    tags: ['Ezekiel 47–48', 'Joshua 13–19', 'PNG · SVG · PDF'],
    to: '/models/prints',
    quick: [
      { label: 'Ezekiel\'s allotment', to: '/models/prints?map=ezekiel' },
      { label: 'Joshua\'s allotment', to: '/models/prints?map=joshua' },
      { label: 'The Holy Portion', to: '/models/prints?map=holy' },
    ],
  },
];

export default function Models() {
  usePageTitle(pageTitle('Maps & Models'), 'Interactive 3D maps and models for scripture study — the Holy Land in relief with the allotments of Joshua and Ezekiel, and the tzalam (likeness) of Daniel 2 with the aban (stone) gazar (cut) out laa (without) yadayan (hands), and the bayath (house) Shalamah (Solomon) built for Yahawah, measured from 1 Kings 6–7.');
  return (
    <div className="models-page">
      <header className="models-top">
        <Link to="/landing" className="models-back" title="Home">←</Link>
        <h1 className="models-h1">Maps &amp; Models</h1>
        <span className="models-count">{MODELS.length} model{MODELS.length === 1 ? '' : 's'}</span>
      </header>
      <p className="models-intro">
        Visual and three-dimensional renderings built from the text — maps, layouts and structures described in scripture, drawn to scale where the text gives measurements and idealized where it gives landmarks. More will be added here over time.
      </p>
      <div className="models-grid">
        {MODELS.map((m) => (
          <article key={m.slug} className="models-card">
            <Link to={m.to} className="models-card-hero">
              <span className="models-card-paleo" aria-hidden="true">{m.paleo}</span>
              <span className="models-card-kicker">{m.kicker}</span>
              <span className="models-card-title">{m.title}</span>
            </Link>
            <p className="models-card-blurb">{m.blurb}</p>
            <div className="models-card-tags">{m.tags.map((t) => <span key={t}>{t}</span>)}</div>
            <div className="models-card-quick">
              <Link to={m.to} className="models-card-open">Open model →</Link>
              {m.quick.map((qk) => <Link key={qk.to} to={qk.to} className="models-card-q">{qk.label}</Link>)}
            </div>
          </article>
        ))}
        <div className="models-card models-card-soon">
          <span className="models-card-kicker">Coming</span>
          <span className="models-card-title">More models</span>
          <p className="models-card-blurb">Future renderings — the temple of Ezekiel 40–43, the tabernacle, the city and its gates — will appear here as they're built.</p>
        </div>
      </div>
    </div>
  );
}
