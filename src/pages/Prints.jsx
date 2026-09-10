/**
 * Prints.jsx — "Printable Maps": the Holy Land as official-looking map sheets, drawn from
 * the same data as the interactive model and saved as a high-quality PNG, an SVG, or
 * printed to PDF from the browser. Nothing is fetched from outside the app.
 *
 * Route: /models/prints  (?map=ezekiel|joshua|holy)
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import HolyLandPoster, { PRINTS, posterSvgText, posterToPng, saveBlob } from '../components/HolyLandPoster.jsx';
import './Prints.css';

const FILE = { ezekiel: 'holy-land-ezekiel-47-48', joshua: 'holy-land-joshua-13-19', holy: 'holy-portion-ezekiel-48' };
const MAP_LINK = { ezekiel: '/models/holy-land?overlay=ezekiel', joshua: '/models/holy-land?overlay=joshua', holy: '/models/holy-land?overlay=ezekiel&view=holy' };

export default function Prints() {
  usePageTitle(pageTitle('Printable Maps — Maps & Models'), 'The Holy Land as printable map sheets: the allotments of Joshua and of Ezekiel, and the Holy Portion — save as PNG, SVG or PDF.');
  const [params, setParams] = useSearchParams();
  const id = PRINTS.some((p) => p.id === params.get('map')) ? params.get('map') : 'ezekiel';
  const spec = PRINTS.find((p) => p.id === id);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const wrap = useRef(null);
  const pick = (next) => { const q = new URLSearchParams(params); q.set('map', next); setParams(q, { replace: true }); };

  useEffect(() => { document.body.classList.add('prints-body'); return () => document.body.classList.remove('prints-body'); }, []);

  const svg = () => wrap.current?.querySelector('svg');
  const savePng = async (scale) => {
    const el = svg(); if (!el) return;
    setBusy(`Drawing the sheet at ${scale}×…`); setErr('');
    try { saveBlob(await posterToPng(el, scale), `${FILE[id]}@${scale}x.png`); }
    catch (e) { setErr(`Could not draw the PNG: ${e.message || e}. Save the SVG instead — it prints at any size.`); }
    finally { setBusy(''); }
  };
  const saveSvg = async () => {
    const el = svg(); if (!el) return;
    setBusy('Packing the SVG…'); setErr('');
    try { saveBlob(new Blob([await posterSvgText(el)], { type: 'image/svg+xml;charset=utf-8' }), `${FILE[id]}.svg`); }
    catch (e) { setErr(`Could not save the SVG: ${e.message || e}`); }
    finally { setBusy(''); }
  };

  return (
    <div className="prints-page">
      <header className="prints-top">
        <Link to="/models" className="prints-back" title="Maps & Models">←</Link>
        <h1 className="prints-h1">Printable Maps</h1>
        <Link to={MAP_LINK[id]} className="prints-open">Interactive map ↗</Link>
      </header>
      <p className="prints-intro">
        Map sheets drawn from the same text-derived data as the interactive model — every border, plot and name is the model's own — laid out like an official map: title, tribes' legend, compass and scale. Save one as a print-quality PNG, as an SVG (sharp at any size), or print it to PDF.
      </p>
      <nav className="prints-tabs" aria-label="Sheets">
        {PRINTS.map((p) => <button key={p.id} type="button" className={`prints-tab${p.id === id ? ' on' : ''}`} onClick={() => pick(p.id)}>{p.title}</button>)}
      </nav>
      <div className="prints-actions">
        <button type="button" className="prints-btn prints-btn-main" disabled={!!busy} onClick={() => savePng(3)}>Save PNG · print quality</button>
        <button type="button" className="prints-btn" disabled={!!busy} onClick={() => savePng(1.5)}>PNG · screen</button>
        <button type="button" className="prints-btn" disabled={!!busy} onClick={saveSvg}>Save SVG</button>
        <button type="button" className="prints-btn" disabled={!!busy} onClick={() => window.print()}>Print / PDF</button>
        {busy && <span className="prints-busy">{busy}</span>}
      </div>
      {err && <p className="prints-err">{err}</p>}
      <div className="prints-sheet" ref={wrap}>
        <HolyLandPoster print={spec} />
      </div>
      <p className="prints-note">
        The print-quality PNG is 4,200 px wide — about 14 in / 36 cm at 300 dpi. On a phone, a saved image lands in your downloads or photos; "Print / PDF" uses the browser's own print sheet (choose "Save as PDF"). The map is idealized from the landmark lists of the text, not surveyed; see the note on the sheet.
      </p>
    </div>
  );
}
