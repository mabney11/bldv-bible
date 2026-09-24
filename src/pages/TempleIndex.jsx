/**
 * TempleIndex.jsx — /models/temple: the house of Yahawah's three stories as
 * branches to choose from (Build, Dedicate, Walk). The generic ModelIndex on the
 * temple's MODEL (lib/models/temple.js).
 */
import ModelIndex from './ModelIndex.jsx';
import MODEL from '../lib/models/temple.js';

export default function TempleIndex() { return <ModelIndex model={MODEL} />; }
