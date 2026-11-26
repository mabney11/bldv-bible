import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle.js';
import PAGE from '../../server/seo/paleo-hebrew-bible.json';
import './PaleoHebrewBible.css';

/**
 * /paleo-hebrew-bible — the page that answers a search for "paleo hebrew bible"
 * (fieldy, 2026-11-25). Every word on it comes from server/seo/paleo-hebrew-bible.json,
 * the same copy server/prerender.js serves to crawlers, so the snapshot and the
 * hydrated page never disagree. Paleo letters only (RULE ZERO).
 */
const WAW = '𐤅';

/** Consecutive letters of one part -> one span with the reader's morpheme class. */
function groups(pieces) {
  const out = [];
  for (const [l, s, css, label, written] of pieces) {
    const added = written === false;           // a root letter the scribe left out, added back
    const last = out[out.length - 1];
    if (last && last.css === (css || '') && last.added === added) { last.paleo += l; last.tr += s; }
    else out.push({ css: css || '', label: label || '', paleo: l, tr: s, added });
  }
  return out;
}
const partClass = (g) => `phb-m ${g.css === 'root' ? 'phb-root' : g.css}`;

function Morph({ pieces, field }) {
  return groups(pieces).map((g, i) => (
    <span key={i} className={partClass(g)} title={g.label}>{g[field]}</span>
  ));
}

/** "Reads right to left" with an arrow pointing the way the words go. */
function ReadsRtl() {
  return (
    <div className="phb-rtl" aria-label="Hebrew reads from right to left">
      <span className="phb-rtl-arrow" aria-hidden="true">←</span>
      <span>Hebrew reads right to left: start at the right</span>
      <span className="phb-rtl-start" aria-hidden="true">1</span>
    </div>
  );
}

/** A common spelling with its e/E letters marked. */
function MarkE({ text }) {
  return [...text].map((ch, i) => (/e/i.test(ch) ? <mark key={i} className="phb-e">{ch}</mark> : ch));
}

function Legend({ items }) {
  return (
    <div className="phb-legend">
      {items.map((it) => (
        <span key={it.css} className={`phb-legend-item ${it.css === 'root' ? 'phb-root' : it.css} phb-m`}>
          <span className="phb-legend-dot" />{it.label}
        </span>
      ))}
    </div>
  );
}

function Section({ s }) {
  return (
    <section id={s.id} className="phb-section">
      <h2>{s.h2}</h2>
      {s.p.map((t, i) => <p key={i}>{t}</p>)}
      {s.links && (
        <div className="phb-links">
          {s.links.map((l) => <Link key={l.to} to={l.to} className="phb-link">{l.label}</Link>)}
        </div>
      )}
    </section>
  );
}

export default function PaleoHebrewBible() {
  usePageTitle(PAGE.title, PAGE.description);
  const w = PAGE.waw;
  return (
    <div className="phb">
      <header className="phb-top">
        <Link to="/landing" className="phb-back" title="Home">←</Link>
        <div>
          <h1 className="phb-h1">{PAGE.h1}</h1>
          <p className="phb-kicker">{PAGE.kicker}</p>
        </div>
      </header>

      <p className="phb-intro">{PAGE.intro}</p>

      <figure className="phb-sample">
        <ReadsRtl />
        <div className="phb-sample-words" dir="rtl">
          {PAGE.sample.words.map((word, i) => (
            <div key={i} className="phb-sample-word">
              <span className="phb-sample-paleo" lang="hbo"><Morph pieces={word.pieces} field="paleo" /></span>
              <span className="phb-sample-tr"><Morph pieces={word.pieces} field="tr" /></span>
              {word.gloss != null && <span className="phb-sample-gloss">({word.gloss})</span>}
            </div>
          ))}
        </div>
        <Legend items={PAGE.sample.legend} />
        <p className="phb-sample-note">{PAGE.sample.note}</p>
        <p className="phb-sample-note">{PAGE.colorsNote}</p>
        <figcaption>
          <span className="phb-sample-ref">{PAGE.sample.ref}</span>
          <Link to={PAGE.sample.to} className="phb-link">{PAGE.sample.label}</Link>
        </figcaption>
      </figure>

      <div className="phb-cta">
        {PAGE.readButtons.map((b) => (
          <Link key={b.to} to={b.to} className="phb-cta-btn">
            <span className="phb-cta-label">{b.label}</span>
            <span className="phb-cta-sub">{b.sub}</span>
          </Link>
        ))}
      </div>

      {PAGE.sections.map((s) => <Section key={s.id} s={s} />)}

      <section id="waw" className="phb-section">
        <h2>{w.h2}</h2>
        <p>{w.p}</p>
        <ReadsRtl />
        <div className="phb-waw">
          {w.words.map((word) => (
            <div key={word.paleo} className="phb-waw-word">
              <div className="phb-pieces" dir="rtl">
                {word.pieces.map(([l, s, css, label], i) => (
                  <span key={i} className={`phb-piece phb-m ${css === 'root' ? 'phb-root' : css || ''}${l === WAW ? ' is-waw' : ''}`} title={label}>
                    <span className="phb-piece-l" lang="hbo">{l}</span>
                    <span className="phb-piece-s">{s}</span>
                  </span>
                ))}
              </div>
              <div className="phb-waw-tr"><Morph pieces={word.pieces} field="tr" /> <span>({word.en})</span></div>
              <div className="phb-waw-role">{word.role}</div>
            </div>
          ))}
        </div>
        <Legend items={w.legend} />
        <p className="phb-after">{w.after} <Link to={w.to} className="phb-inline">{w.ref}</Link></p>
      </section>

      <section id="guide" className="phb-section">
        <h2>{PAGE.guideH2}</h2>
        <p>{PAGE.guideP}</p>
        <div className="phb-table-wrap">
          <table className="phb-table">
            <thead><tr><th>Letter</th><th>Name</th><th>Medial</th><th>Final</th><th>Example</th></tr></thead>
            <tbody>
              {PAGE.guide.map((g) => (
                <tr key={g.letter}>
                  <td className="phb-td-letter" lang="hbo">{g.letter}</td>
                  <td>{g.name}</td>
                  <td className="phb-td-sound">{g.medial}</td>
                  <td className="phb-td-sound">{g.final}</td>
                  <td><span className="phb-ex-paleo" lang="hbo">{g.example.paleo}</span> {g.example.translit} <span className="phb-ex-en">({g.example.en})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="compare" className="phb-section">
        <h2>{PAGE.compareH2}</h2>
        <p>{PAGE.compareP}</p>
        <div className="phb-table-wrap">
          <table className="phb-table">
            <thead><tr><th>Hebrew</th><th>Letters</th><th>Common</th><th>BLD Bible</th><th>What the common spelling does</th></tr></thead>
            <tbody>
              {PAGE.compare.map((c) => (
                <tr key={c.paleo}>
                  <td className="phb-ex-paleo" lang="hbo"><Morph pieces={c.pieces} field="paleo" /></td>
                  <td className="phb-td-num">{c.letters}</td>
                  <td className="phb-td-common"><MarkE text={c.common} /></td>
                  <td className="phb-td-bld"><Morph pieces={c.pieces} field="tr" /></td>
                  <td className="phb-td-note">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="origins" className="phb-section">
        <h2>{PAGE.origins.h2}</h2>
        <div className="phb-origins">
          {PAGE.origins.pairs.map((o) => (
            <div key={o.latin} className="phb-origin">
              <span className="phb-origin-paleo" lang="hbo">{o.paleo}</span>
              <span className="phb-origin-arrow" aria-hidden="true">→</span>
              <span className={`phb-origin-paleo phb-turn-${o.turn}`} lang="hbo" aria-hidden="true">{o.paleo}</span>
              <span className="phb-origin-arrow" aria-hidden="true">→</span>
              <span className="phb-origin-latin">{o.latin}</span>
              <span className="phb-origin-cap">{o.name}, {o.turn === 'rotate' ? 'turned on its side' : 'turned to face the other way'}, through the {o.via}. BLD Bible: <b>{o.bld}</b></span>
            </div>
          ))}
        </div>
        {PAGE.origins.p.map((t, i) => <p key={i}>{t}</p>)}
        <h3 className="phb-h3">{PAGE.origins.allH3}</h3>
        <div className="phb-lineage">
          {PAGE.origins.all.map((o) => (
            <div key={o.letter} className={`phb-lin${o.latin === '—' ? ' is-none' : ''}`}>
              <span className="phb-lin-paleo" lang="hbo">{o.letter}</span>
              <span className="phb-lin-name">{o.name}</span>
              <span className="phb-lin-greek">{o.greek}</span>
              <span className="phb-lin-latin">{o.latin === '—' ? 'no Latin letter' : o.latin}</span>
              {o.looks && <span className="phb-lin-looks">looks like {o.looks}</span>}
              <span className="phb-lin-bld">BLD Bible: {o.bld}</span>
            </div>
          ))}
        </div>
        <p className="phb-after">{PAGE.origins.allP}</p>
        <h3 className="phb-h3">{PAGE.origins.looksH3}</h3>
        <p>{PAGE.origins.looksP}</p>
        <div className="phb-looks">
          {PAGE.origins.looks.map((o) => (
            <div key={o.letter} className="phb-look">
              <div className="phb-look-pair">
                <span className="phb-origin-paleo" lang="hbo">{o.letter}</span>
                <span className="phb-origin-arrow" aria-hidden="true">≈</span>
                <span className="phb-origin-latin">{o.latin}</span>
              </div>
              <div className="phb-look-name">{o.name}</div>
              <p>{o.note}</p>
            </div>
          ))}
        </div>
      </section>

      {PAGE.more.map((s) => <Section key={s.id} s={s} />)}

      <section id="questions" className="phb-section">
        <h2>{PAGE.faqH2}</h2>
        <dl className="phb-faq">
          {PAGE.faq.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
