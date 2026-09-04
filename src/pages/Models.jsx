/**
 * Models.jsx — "Renderings & Models": the index of interactive 3D / visual
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
    paleo: '𐤉𐤁𐤍𐤀𐤋',
    tags: ['Joshua 13–19', 'Ezekiel 47–48', '3D terrain', 'Cities'],
    to: '/models/holy-land',
    quick: [
      { label: 'Joshua allotments', to: '/models/holy-land?overlay=joshua' },
      { label: 'Millennial kingdom', to: '/models/holy-land?overlay=ezekiel' },
      { label: 'Jabneel — Joshua 15:11', to: '/models/holy-land?city=jabneel-judah' },
    ],
  },
];

export default function Models() {
  usePageTitle(pageTitle('Renderings & Models'), 'Interactive 3D maps and models for scripture study — the Holy Land in relief with the allotments of Joshua and Ezekiel.');
  return (
    <div className="models-page">
      <header className="models-top">
        <Link to="/landing" className="models-back" title="Home">←</Link>
        <h1 className="models-h1">Renderings &amp; Models</h1>
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
          <p className="models-card-blurb">Future renderings — the tabernacle, the temple of Ezekiel 40–43, the city and its gates — will appear here as they're built.</p>
        </div>
      </div>
    </div>
  );
}
