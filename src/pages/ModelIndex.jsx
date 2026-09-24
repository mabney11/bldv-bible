/**
 * ModelIndex.jsx — a model's chooser (<base>): its stories as branches, each
 * opening the model at <base>/<story>. Old links (?mode=…, ?piece=…) are sent
 * on to the right story with their query kept. pages/TempleIndex.jsx is one
 * line on this.
 */
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { Glossed } from '../components/PassageRefs.jsx';
import { STORY_ICONS } from '../components/ModelStories.jsx';
import './Models.css';
import './Temple.css';

export default function ModelIndex({ model }) {
  const { MODES, base, stories } = model;
  usePageTitle(pageTitle(`${model.title} — Maps & Models`), model.indexDescription || model.description);
  const [params] = useSearchParams();
  const mode = params.get('mode');
  if (MODES[mode] || params.get('piece') || params.get('view')) {
    const q = new URLSearchParams(params); q.delete('mode');
    const qs = q.toString();
    let last = null; try { last = sessionStorage.getItem(`${model.id}-story`); } catch { /* fine */ }   // a ?piece link lands in the story last open (on foot stays on foot), else the default
    return <Navigate to={`${base}/${MODES[mode] ? mode : MODES[last] ? last : model.defaultStory}${qs ? `?${qs}` : ''}`} replace />;
  }
  return (
    <div className="models-page tp-index">
      <header className="models-top">
        <Link to="/models" className="models-back" title="Maps & Models">←</Link>
        <h1 className="models-h1">{model.title} <span className="tp-index-paleo" dir="rtl" aria-hidden="true">{model.paleo}</span></h1>
        <span className="models-count">{stories.length} {stories.length === 1 ? 'story' : 'stories'}</span>
      </header>
      <p className="models-intro">
        <Glossed text={model.indexIntro} />
      </p>
      <div className="tp-index-grid">
        {stories.map(({ key, label, icon, kicker, blurb, modes, go, roamLabel }) => {
          const Icon = STORY_ICONS[icon] || STORY_ICONS.walk;
          const roam = modes.find((m) => MODES[m]?.free);
          return (
            <article key={key} className="tp-index-card">
              <Link to={`${base}/${key}`} className="tp-index-hero">
                <span className="tp-index-icon"><Icon /></span>
                <span className="tp-index-kicker">{kicker}</span>
                <span className="tp-index-title">{label}</span>
              </Link>
              <p className="tp-index-blurb"><Glossed text={blurb} /></p>
              <div className="tp-index-go">
                <Link to={`${base}/${key}`} className="models-card-open">{go || `${label} →`}</Link>
                {roam && <Link to={`${base}/${roam}`} className="models-card-q">{roamLabel || 'Roam it on your own feet'}</Link>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
