/**
 * Ezekiel.jsx — "The Bayath (House) Yachazaqaal (Ezekiel) Saw": the house of
 * Ezekiel 40–43 as an interactive model. Route: /models/ezekiel/:story (walk|roam).
 * The generic ModelPage on the model's MODEL (lib/models/ezekiel.js).
 */
import ModelPage from './ModelPage.jsx';
import MODEL from '../lib/models/ezekiel.js';

export default function Ezekiel() { return <ModelPage model={MODEL} />; }
