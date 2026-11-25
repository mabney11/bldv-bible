/**
 * Names.jsx — /names: names -> meaning, from scripture.
 *
 * fieldy (2026-11-24): "names and their scriptures that imply where the name came
 * from -- the very first one being Yashai and Yashawai -- show the common name that
 * translators chose and point out differences". The collection lives in
 * server/lexicon/names.json (one entry per name); each card opens /name/:slug.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiNames } from '../lib/api.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { NameLetters } from './NamePage.jsx';
import './Passages.css';
import './Names.css';

export default function Names() {
  usePageTitle(pageTitle('Names'), 'What the names of scripture mean, shown in their own letters beside the verse that explains them — and what changes when translators replace them. Yashawai (he will save), Yahawashawai and more.');
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let live = true;
    apiNames().then(d => { if (live) setData(d); }).catch(() => { if (live) setData({ intro: '', names: [] }); });
    return () => { live = false; };
  }, []);
  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.names.filter(n => !needle || [n.name, n.meaning, n.sn, n.root?.name, n.root?.gloss, ...(n.common || []), ...(n.origin || [])].join(' ').toLowerCase().includes(needle));
  }, [data, q]);
  const total = data?.names?.length || 0;
  return (
    <div className="pgs-page nm-index">
      <header className="pgs-top">
        <Link to="/landing" className="pgs-back" title="Home">←</Link>
        <h1 className="pgs-h1">Names</h1>
        <span className="pgs-count">{data ? `${total} name${total === 1 ? '' : 's'}` : ''}</span>
      </header>
      {data?.intro && <p className="pgs-intro">{data.intro}</p>}
      <div className="pgs-tools">
        <input className="pgs-search" type="search" placeholder="Find a name — Yashawai, Jesus, Joshua, save…" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a name" />
      </div>
      {!data && <div className="pgs-wait">Loading…</div>}
      {data && list.length === 0 && <div className="pgs-wait">{total ? <>Nothing matches “{q}”.</> : 'No names yet.'}</div>}
      <section className="pgs-group">
        <div className="pgs-grid">
          {list.map(n => (
            <Link key={n.slug} to={`/name/${n.slug}`} className="pgs-card nm-card">
              <NameLetters letters={n.letters} size="sm" />
              <span className="pgs-card-title nm-card-name">{n.name}</span>
              <span className="nm-card-meaning">{n.meaning}</span>
              {n.common?.length > 0 && <span className="nm-card-common">Translators wrote: {n.common.join(' · ')}</span>}
              {n.origin?.length > 0 && <span className="pgs-card-refs">Named in {n.origin.join(' · ')}</span>}
              <span className="pgs-card-go">Open the name →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
