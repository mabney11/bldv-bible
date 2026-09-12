/**
 * TempleIndex.jsx — /models/temple: the house of Yahawah's three stories as
 * branches to choose from (Build, Dedicate, Walk), each opening the model at
 * /models/temple/<story>. Old links (?mode=…, ?piece=…) are sent on to the
 * right story with their query kept.
 */
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { Glossed } from '../components/PassageRefs.jsx';
import { STORIES } from '../components/TempleStories.jsx';
import { MODES } from '../lib/models/temple.js';
import './Models.css';
import './Temple.css';

export default function TempleIndex() {
  usePageTitle(pageTitle('The Bayath (House) of Yahawah — Maps & Models'), 'The bayath (house) Shalamah (Solomon) banah (built) for Yahawah as an interactive 3D model, measured in amah (cubits) from the text — watch it rise (1 Kings 6–7), see it dedicated (1 Kings 8), or walk in from the gate to the arawan (ark).');
  const [params] = useSearchParams();
  const mode = params.get('mode');
  if (MODES[mode] || params.get('piece') || params.get('view')) {
    const q = new URLSearchParams(params); q.delete('mode');
    const qs = q.toString();
    return <Navigate to={`/models/temple/${MODES[mode] ? mode : 'walk'}${qs ? `?${qs}` : ''}`} replace />;
  }
  return (
    <div className="models-page tp-index">
      <header className="models-top">
        <Link to="/models" className="models-back" title="Maps & Models">←</Link>
        <h1 className="models-h1">The Bayath (House) of Yahawah <span className="tp-index-paleo" dir="rtl" aria-hidden="true">𐤁𐤉𐤕 𐤉𐤄𐤅𐤄</span></h1>
        <span className="models-count">{STORIES.length} stories</span>
      </header>
      <p className="models-intro">
        <Glossed text="One model, measured in amah (cubits) from the text, and three ways through it. Each is its own story: choose one, and the model opens there — every part on it can be tapped for its measures and verses in any of them." />
      </p>
      <div className="tp-index-grid">
        {STORIES.map(({ key, label, Icon, kicker, blurb, modes }) => (
          <article key={key} className="tp-index-card">
            <Link to={`/models/temple/${key}`} className="tp-index-hero">
              <span className="tp-index-icon"><Icon /></span>
              <span className="tp-index-kicker">{kicker}</span>
              <span className="tp-index-title">{label}</span>
            </Link>
            <p className="tp-index-blurb"><Glossed text={blurb} /></p>
            <div className="tp-index-go">
              <Link to={`/models/temple/${key}`} className="models-card-open">{label === 'Walk' ? 'Walk in →' : label === 'Build' ? 'Watch it rise →' : 'See the dedication →'}</Link>
              {modes.includes('roam') && <Link to="/models/temple/roam" className="models-card-q">Roam it on your own feet</Link>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
