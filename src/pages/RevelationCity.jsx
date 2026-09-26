/**
 * RevelationCity.jsx — "The Shairay (City) Coming Down Out of Shamayam (Heaven)": the holy city of Revelation 21–22 as an
 * interactive model at the text's own scale. Route: /models/revelation-city/:story (descend|roam). The generic ModelPage
 * on lib/models/revelation-city.js.
 */
import ModelPage from './ModelPage.jsx';
import MODEL from '../lib/models/revelation-city.js';

export default function RevelationCity() { return <ModelPage model={MODEL} />; }
