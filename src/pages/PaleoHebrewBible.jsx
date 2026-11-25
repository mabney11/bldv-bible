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
        <div className="phb-sample-paleo" lang="hbo" dir="rtl">{PAGE.sample.paleo}</div>
        <figcaption>
          <span className="phb-sample-ref">{PAGE.sample.ref}</span>
          <Link to={PAGE.sample.to} className="phb-link">{PAGE.sample.label}</Link>
        </figcaption>
      </figure>

      <div className="phb-cta">
        <Link to="/parallel/genesis/1" className="phb-cta-main">Read Paleo Hebrew and English side by side</Link>
        <Link to="/?book=1&chapter=1" className="phb-cta-alt">Paleo Hebrew reader</Link>
      </div>

      {PAGE.sections.map((s) => <Section key={s.id} s={s} />)}

      <section id="waw" className="phb-section">
        <h2>{w.h2}</h2>
        <p>{w.p}</p>
        <div className="phb-waw">
          {w.words.map((word) => (
            <div key={word.paleo} className="phb-waw-word">
              <div className="phb-pieces" dir="rtl">
                {word.pieces.map(([l, s], i) => (
                  <span key={i} className={`phb-piece${l === WAW ? ' is-waw' : ''}`}>
                    <span className="phb-piece-l" lang="hbo">{l}</span>
                    <span className="phb-piece-s">{s}</span>
                  </span>
                ))}
              </div>
              <div className="phb-waw-tr">{word.translit} <span>({word.en})</span></div>
              <div className="phb-waw-role">{word.role}</div>
            </div>
          ))}
        </div>
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
                  <td className="phb-ex-paleo" lang="hbo">{c.paleo}</td>
                  <td className="phb-td-num">{c.letters}</td>
                  <td className="phb-td-common">{c.common}</td>
                  <td className="phb-td-bld">{c.bld}</td>
                  <td className="phb-td-note">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
