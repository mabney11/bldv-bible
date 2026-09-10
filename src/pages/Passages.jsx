/**
 * Passages.jsx — the collection of named passages: /passages
 *
 * Every card opens one bookmarkable page of just that passage's verses
 * (/passage/:slug — see Passage.jsx). The collection itself lives in
 * server/lexicon/passages.json; adding a passage is one entry there.
 * Any reference can also be opened ad hoc from the box at the top
 * (/passage?ref=…).
 */
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiPassages } from '../lib/api.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './Passages.css';

export default function Passages() {
  usePageTitle(pageTitle('Passages'), 'Named passages of scripture, each on its own page — the Prayer of Azariah, the Proclamation of Mordecai, Yaiqab’s blessings, the songs, the prayers, the decrees.');
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [ref, setRef] = useState('');
  useEffect(() => {
    let live = true;
    apiPassages().then(d => { if (live) setData(d); }).catch(() => { if (live) setData({ groups: [], passages: [] }); });
    return () => { live = false; };
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const hit = (p) => !needle || [p.title, p.subtitle, p.blurb, p.refs, ...(p.labels || []), ...(p.tags || [])].join(' ').toLowerCase().includes(needle);
    const order = [...(data.groups || [])];
    for (const p of data.passages) if (p.group && !order.includes(p.group)) order.push(p.group);
    return order
      .map(g => ({ name: g, items: data.passages.filter(p => (p.group || 'Passages') === g && hit(p)) }))
      .filter(g => g.items.length);
  }, [data, q]);

  const openRef = (e) => {
    e.preventDefault();
    const r = ref.trim();
    if (r) navigate(`/passage?ref=${encodeURIComponent(r)}`);
  };

  const total = data?.passages?.length || 0;
  return (
    <div className="pgs-page">
      <header className="pgs-top">
        <Link to="/landing" className="pgs-back" title="Home">←</Link>
        <h1 className="pgs-h1">Passages</h1>
        <span className="pgs-count">{data ? `${total} passage${total === 1 ? '' : 's'}` : ''}</span>
      </header>
      <p className="pgs-intro">
        The named passages of scripture, each on its own page — just its verses, in the Novel English Bible’s own words, with a link you can keep. A prayer, a song, a blessing, a decree: open it whole instead of hunting for it in a chapter.
      </p>

      <div className="pgs-tools">
        <input className="pgs-search" type="search" placeholder="Find a passage — Azariah, blessing, Esther…" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a passage" />
        <form className="pgs-ref" onSubmit={openRef}>
          <input type="text" placeholder="Any reference — Genesis 49:8–12; Isaiah 53" value={ref} onChange={e => setRef(e.target.value)} aria-label="Open any reference as a passage" />
          <button type="submit" disabled={!ref.trim()}>Open</button>
        </form>
      </div>

      {!data && <div className="pgs-wait">Loading…</div>}
      {data && groups.length === 0 && <div className="pgs-wait">Nothing matches “{q}”.</div>}
      {groups.map(g => (
        <section key={g.name} className="pgs-group">
          <h2 className="pgs-group-h">{g.name}</h2>
          <div className="pgs-grid">
            {g.items.map(p => (
              <Link key={p.slug} to={`/passage/${p.slug}`} className="pgs-card">
                <span className="pgs-card-title">{p.title}</span>
                {p.subtitle && <span className="pgs-card-sub">{p.subtitle}</span>}
                <span className="pgs-card-refs">{(p.labels && p.labels.length ? p.labels : [p.refs]).join(' · ')}</span>
                {p.blurb && <span className="pgs-card-blurb">{p.blurb}</span>}
                <span className="pgs-card-go">Open the passage →</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
