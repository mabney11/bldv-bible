/**
 * Temple.jsx — "The Bayath (House) of Yahawah": the bayath (house) Shalamah (Solomon)
 * built (1 Kings 6–7; 2 Chronicles 3–4), its courts and the king's houses, as an
 * interactive model. Route: /models/temple/:story (build|dedicate|walk|roam).
 * The page is the generic ModelPage on the temple's MODEL (lib/models/temple.js).
 */
import ModelPage from './ModelPage.jsx';
import MODEL from '../lib/models/temple.js';

export default function Temple() { return <ModelPage model={MODEL} />; }
