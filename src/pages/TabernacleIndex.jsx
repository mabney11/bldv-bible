/**
 * TabernacleIndex.jsx — /models/tabernacle: the chooser for the tabernacle and
 * its camp (Raise, guided or on foot). The generic ModelIndex on lib/models/tabernacle.js.
 */
import ModelIndex from './ModelIndex.jsx';
import MODEL from '../lib/models/tabernacle.js';

export default function TabernacleIndex() { return <ModelIndex model={MODEL} />; }
