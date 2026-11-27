/**
 * Names.jsx — /names: the core names of scripture, each with the verse it comes from.
 *
 * fieldy (2026-11-25): "the common name large and at the top -- 'Jesus' then a line separator underneath
 * then the actual hebrew letters and the verse that shows where their name came from ... that verse should
 * be present in the card with highlights" / "i dont want to have to manually select the names" / "smart
 * ordering ... based on name impact and meaning, also ... alphabetical order" / "switch between card view
 * and list view". The list is baked (server/build-names.mjs -> names-index.json); the verse is the reader's
 * live text. Sort and view are kept in the address (?sort=az&view=list) and remembered.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiNames } from '../lib/api.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import { NameLetters, MarkedVerse } from './NamePage.jsx';
import '../components/NovelText.css';
import './Passages.css';
import './Names.css';

const SORTS = [
  { id: 'impact', label: 'By impact' },
  { id: 'az', label: 'A–Z' },
  { id: 'heb', label: 'A–Z (Hebrew)' },
];
const VIEWS = [{ id: 'cards', label: 'Cards', ico: '▦' }, { id: 'list', label: 'List', ico: '☰' }];
const PREFS = 'names-prefs';
function readPrefs() { try { return JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { return {}; } }

export default function Names() {
  usePageTitle(pageTitle('Names'), 'The names of scripture and what they mean — Jesus (Yashawai, he will save), Israel, Jacob, David, Solomon, the kings — each in its own Hebrew letters beside the verse it comes from.');
  const [sp, setSp] = useSearchParams();
  const prefs = useMemo(readPrefs, []);
  const sort = SORTS.some(s => s.id === sp.get('sort')) ? sp.get('sort') : (prefs.sort || 'impact');
  const view = VIEWS.some(v => v.id === sp.get('view')) ? sp.get('view') : (prefs.view || 'cards');
  const set = (k, v) => {
    const next = new URLSearchParams(sp); next.set(k, v); setSp(next, { replace: true });
    try { localStorage.setItem(PREFS, JSON.stringify({ ...readPrefs(), [k]: v })); } catch { /* storage off */ }
  };
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [explainedOnly, setExplainedOnly] = useState(false);
  useEffect(() => {
    let live = true;
    apiNames().then(d => { if (live) setData(d); }).catch(() => { if (live) setData({ intro: '', names: [] }); });
    return () => { live = false; };
  }, []);

  const list = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const hit = (n) => !needle || [n.english, n.name, n.meaning, n.sn, ...(n.common || []), n.origin?.label].join(' ').toLowerCase().includes(needle);
    const out = data.names.filter(n => hit(n) && (!explainedOnly || n.explained));
    if (sort === 'az') out.sort((a, b) => a.english.localeCompare(b.english));
    else if (sort === 'heb') out.sort((a, b) => a.name.localeCompare(b.name));
    else {
      const rk = (n) => (Number.isFinite(n.rank) ? n.rank : Infinity); // names.json `rank` pins a name first
      out.sort((a, b) => (rk(a) - rk(b)) || b.score - a.score || a.english.localeCompare(b.english));
    }
    return out;
  }, [data, q, sort, explainedOnly]);

  const total = data?.names?.length || 0;
  return (
    <div className="pgs-page nm-index">
      <header className="pgs-top">
        <Link to="/landing" className="pgs-back" title="Home">←</Link>
        <h1 className="pgs-h1">Names</h1>
        <span className="pgs-count">{data ? `${list.length === total ? total : `${list.length} of ${total}`} names` : ''}</span>
      </header>
      {data?.intro && <p className="pgs-intro">{data.intro}</p>}
      <div className="pgs-tools nm-tools">
        <input className="pgs-search" type="search" placeholder="Find a name — Jesus, Yaiqab, David, save, king…" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a name" />
        <div className="nm-seg" role="group" aria-label="Order">
          {SORTS.map(s => <button key={s.id} type="button" className={sort === s.id ? 'on' : ''} onClick={() => set('sort', s.id)}>{s.label}</button>)}
        </div>
        <div className="nm-seg" role="group" aria-label="View">
          {VIEWS.map(v => <button key={v.id} type="button" className={view === v.id ? 'on' : ''} onClick={() => set('view', v.id)} title={v.label}><span aria-hidden="true">{v.ico}</span> {v.label}</button>)}
        </div>
        <label className="nm-only"><input type="checkbox" checked={explainedOnly} onChange={e => setExplainedOnly(e.target.checked)} /> Only names scripture explains</label>
      </div>

      {!data && <div className="pgs-wait">Loading…</div>}
      {data && list.length === 0 && <div className="pgs-wait">{total ? <>Nothing matches “{q}”.</> : 'No names yet.'}</div>}

      {view === 'cards' ? (
        <section className="pgs-group">
          <div className="nm-grid">
            {list.map(n => (
              <Link key={n.slug} to={`/name/${n.slug}`} className="nm-card2">
                <span className="nm-card-en">{n.english}</span>
                <span className="nm-card-rule" />
                <NameLetters letters={n.letters} size="md" />
                <span className="nm-card-en nm-card-tr">{n.name}</span>
                {n.meaning && <span className="nm-card-sub">{n.meaning}</span>}
                {n.origin && (
                  <span className="nm-card-verse">
                    <span className="nm-card-ref">{n.origin.label}{n.origin.first ? <span className="nm-card-first">first named</span> : null}</span>
                    {n.origin.text ? <span className="nm-card-text"><MarkedVerse text={n.origin.text} marks={n.origin.marks} /></span> : <span className="nm-card-text nm-empty">No English text yet.</span>}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="pgs-group">
          <div className="nm-list" role="table">
            <div className="nm-row nm-row-h" role="row">
              <span role="columnheader">Name</span><span role="columnheader">Hebrew</span><span role="columnheader" className="nm-col-mean">Taken from</span><span role="columnheader">Named in</span>
            </div>
            {list.map(n => (
              <Link key={n.slug} to={`/name/${n.slug}`} className="nm-row" role="row">
                <span className="nm-row-en">{n.english}</span>
                <span className="nm-row-heb"><span className="nm-row-tr">{n.name}</span> <NameLetters letters={n.letters} size="xs" /></span>
                <span className="nm-col-mean">{n.meaning || '—'}</span>
                <span className="nm-row-ref">{n.origin?.label || ''}{n.origin?.first ? '' : n.origin ? ' ✦' : ''}</span>
              </Link>
            ))}
            {list.length > 0 && <div className="nm-list-key">✦ scripture says why the name was given there; otherwise the verse it is first named in.</div>}
          </div>
        </section>
      )}
    </div>
  );
}
