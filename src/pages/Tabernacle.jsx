/**
 * Tabernacle.jsx — "The Mashakan (Tabernacle) and Its Machanah (Camp)": the
 * tabernacle of Exodus 25–27, 40 with the camp of Numbers 2 as an interactive
 * model. Route: /models/tabernacle/:story (walk|roam). The generic ModelPage
 * on the model's MODEL (lib/models/tabernacle.js).
 */
import ModelPage from './ModelPage.jsx';
import MODEL from '../lib/models/tabernacle.js';

export default function Tabernacle() { return <ModelPage model={MODEL} />; }
