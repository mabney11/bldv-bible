/**
 * EzekielCity.jsx — "The Iyar (City) Yachazaqaal (Ezekiel) Saw and the Holy Portion": the city of Ezekiel 48 and the
 * holy portion of Ezekiel 45 and 48 as an interactive model, with the house model standing in its midst.
 * Route: /models/ezekiel-city/:story (portion|city|roam). The generic ModelPage on lib/models/ezekiel-city.js.
 */
import ModelPage from './ModelPage.jsx';
import MODEL from '../lib/models/ezekiel-city.js';

export default function EzekielCity() { return <ModelPage model={MODEL} />; }
