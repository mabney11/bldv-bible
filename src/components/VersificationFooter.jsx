import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './VersificationFooter.css';

// Where the Hebrew numbering differs from the modern (English) numbers the site uses, one line per point where a
// Hebrew run starts: "Hebrew chapter 5 starts at English 4:21 ✓". The ✓ / ✗ is checked by the server
// (/api/versification-points) — the run's Hebrew verse count must fill the English verses up to the next run.
// fieldy 2026-11-26. Renders nothing for a chapter numbered the same in both (almost all of them).
const cache = new Map();

export default function VersificationFooter({ book, chapter, className = '' }) {
  const key = `${book}:${chapter}`;
  const [points, setPoints] = useState(() => cache.get(key) || []);
  useEffect(() => {
    if (!book || !chapter) { setPoints([]); return; }
    if (cache.has(key)) { setPoints(cache.get(key)); return; }
    let live = true;
    fetch(`/api/versification-points?book=${book}&chapter=${chapter}`)
      .then(r => (r.ok ? r.json() : []))
      .then(p => { const list = Array.isArray(p) ? p : []; cache.set(key, list); if (live) setPoints(list); })
      .catch(() => { if (live) setPoints([]); });
    return () => { live = false; };
  }, [book, chapter, key]);
  if (!points.length) return null;
  return (
    <aside className={`vf-foot ${className}`} aria-label="Hebrew verse numbering">
      <div className="vf-title">Hebrew numbering</div>
      <ul>
        {points.map((p, i) => (
          <li key={i} className={`vf-${p.kind}`}>
            <span className="vf-text">{p.text}</span>
            {p.kind === 'added'
              ? <span className="vf-note">added</span>
              : <span className={p.oneToOne ? 'vf-ok' : 'vf-bad'} title={p.oneToOne ? 'checked: every word is there' : 'does not line up'}>{p.oneToOne ? '✓' : '✗'}</span>}
            <span className="vf-detail">
              {p.detail}
              {p.link && <> {' '}<Link className="vf-link" to={`/parallel?book=${p.link.book}&chapter=${p.link.chapter}&verse=${p.link.verse}`}>Compare {p.link.label} →</Link></>}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
