import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme.js';
import { TOKEN_FIELD_LABELS, TOKEN_VALUE_LABELS } from '../lib/tokenLabels.js';
import { apiRebuildIndexes } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { CHEATSHEET_LONG_HTML } from './CheatsheetLong.js';
import { usePageTitle, pageTitle } from '../hooks/usePageTitle.js';
import './Cheatsheet.css';
import './CheatsheetLong.css';

// Field index — the canonical key/meaning/scope/values table from the BHS docs.
const FIELD_INDEX = [
  { key: 'sp',  name: 'Surface part of speech', who: 'All', values: 'verb, subs, adjv, prep, conj, art, prps, prde, prin, inrg, nega, nmpr, advb, intj' },
  { key: 'pdp', name: 'Pragmatic deep POS', who: 'All', values: 'Same set as sp. Can differ — a verb used as a noun has sp=verb, pdp=subs. pdp drives the translation slot.' },
  { key: 'vs',  name: 'Verbal stem', who: 'Verbs', values: 'qal, nif, piel, pual, hif, hof, hit, hsht, htpo, poel, polel…' },
  { key: 'vt',  name: 'Verbal tense/aspect', who: 'Verbs', values: 'perf, impf, wayq, impv, infc, infa, ptca, ptcp' },
  { key: 'ps',  name: 'Person', who: 'Verbs', values: 'p1, p2, p3, unknown' },
  { key: 'gn',  name: 'Gender', who: 'Verbs, nouns, adjectives', values: 'm, f, unknown' },
  { key: 'nu',  name: 'Number', who: 'Verbs, nouns, adjectives', values: 'sg, pl, du, unknown' },
  { key: 'st',  name: 'State', who: 'Nouns, adjectives', values: 'a (absolute), c (construct)' },
  { key: 'pfm', name: 'Prefix marker (person prefix)', who: 'Verbs', values: 'J (he/it 𐤉), T / T= (she/you 𐤕), > / < (I 𐤀), N (we 𐤍), M (ptcp mem 𐤌), absent' },
  { key: 'vbs', name: 'Verbal stem marker', who: 'Verbs', values: 'H (hifil 𐤄), N (nifal 𐤍), HCT / HT (hitpael 𐤕), absent' },
  { key: 'vbe', name: 'Verbal ending', who: 'Verbs (perf/impf/impv)', values: 'TJ (I 𐤕𐤉), T (you/she 𐤕), TM (you pl 𐤕𐤌), TN (you fpl 𐤕𐤍), W (they/waw 𐤅), WN (they-f 𐤅𐤍), H / H= (she 3fs), NW (we 𐤍𐤅), NH (they-f 𐤍𐤄), absent' },
  { key: 'nme', name: 'Nominal/verbal ending', who: 'Nouns, verbs', values: 'H (fem/toward 𐤄), T (fem ending 𐤕), J / J= (construct/my 𐤉), JM / JM= (plural masc 𐤉𐤌), WT (plural fem 𐤅𐤕), WTJ (plural construct 𐤅𐤕𐤉), NH (they f.pl 𐤍𐤄), absent' },
  { key: 'prs', name: 'Pronominal suffix', who: 'Nouns, verbs, prepositions', values: 'J (me/my 𐤉), K (your 𐤊), KM (your-pl 𐤊𐤌), KN (your-fpl 𐤊𐤍), W / HW (his), H (her 𐤄), NW (our 𐤍𐤅), NJ (me 𐤍𐤉), M / HM (them), N / HN (them-f), absent' },
  { key: 'uvf', name: 'Unclassified final', who: 'Nouns, prepositions', values: 'H (directional 𐤄), J (connecting Yad 𐤉), N (nun paragogic 𐤍), absent' },
];

const ANATOMY = [
  ['f-verse', 'verse'], ['f-ord', 'ord'], ['f-raw', '𐤉𐤀𐤌𐤓'], ['f-pos', 'verb'],
  ['f-attr', 'sp=verb'], ['f-attr', 'pdp=verb'], ['f-attr', 'vs=qal'], ['f-attr', 'vt=wayq'],
  ['f-attr', 'ps=p3'], ['f-attr', 'gn=m'], ['f-attr', 'nu=sg'], ['f-attr', 'pfm=J'],
  ['f-attr', 'vbs=absent'], ['f-attr', 'uvf=absent'], ['f-attr', 'nme=absent'],
];

const NAV = [
  { id: 'anatomy',             label: 'Token anatomy',        section: 'Structure' },
  { id: 'fields',              label: 'Field index',          section: 'Structure' },
  { id: 'pos',                 label: 'POS values',           section: 'Fields' },
  { id: 'verb-fields',         label: 'Verbal fields',        section: 'Fields' },
  { id: 'noun-fields',         label: 'Noun fields',          section: 'Fields' },
  { id: 'person-fields',       label: 'Person/gender/num',    section: 'Fields' },
  { id: 'affixes',             label: 'Affix layers',         section: 'Mechanics' },
  { id: 'grouping',            label: 'Word grouping',        section: 'Mechanics' },
  { id: 'strip-order',         label: 'Strip order',          section: 'Mechanics' },
  { id: 'examples',            label: 'Examples',             section: 'Worked' },
  { id: 'practical-examples',  label: 'Practical',            section: 'Worked' },
  { id: 'inspection-workflow', label: 'Inspection workflow',  section: 'Workflow' },
  { id: 'homograph-selection', label: 'Homograph selection',  section: 'Workflow' },
  { id: 'mutations',           label: 'Root mutations',       section: 'Edge' },
  { id: 'edge-cases',          label: 'Edge cases',           section: 'Edge' },
  { id: 'values',              label: 'Value dictionaries',   section: 'Reference' },
  { id: 'admin',               label: 'Rebuild indexes',      section: 'Admin' },
];

export default function Cheatsheet() {
  usePageTitle(pageTitle('Token Cheatsheet'));
  const { theme, toggle: toggleTheme } = useTheme();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rebuilding, setRebuilding] = useState(false);

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const query = q.trim().toLowerCase();
  const fieldRows = useMemo(() => {
    if (!query) return FIELD_INDEX;
    return FIELD_INDEX.filter(f =>
      f.key.toLowerCase().includes(query) ||
      f.name.toLowerCase().includes(query) ||
      f.values.toLowerCase().includes(query)
    );
  }, [query]);

  const valueTables = useMemo(() => {
    return Object.entries(TOKEN_VALUE_LABELS).map(([key, table]) => ({
      key,
      label: TOKEN_FIELD_LABELS[key] || key,
      entries: Object.entries(table).filter(([code, desc]) => {
        if (!query) return true;
        return code.toLowerCase().includes(query) ||
               desc.toLowerCase().includes(query) ||
               key.toLowerCase().includes(query);
      }),
    })).filter(t => t.entries.length);
  }, [query]);

  // ── Search highlighter for the static long-form HTML ─────────────────────
  // The React-controlled sections (fields/values) filter their rows directly.
  // The long-form sections are baked HTML, so we walk their text nodes on every
  // query change and wrap matches in <mark class="cs-hl"> spans. Removing old
  // marks first keeps the DOM clean across queries.
  const longRef = useRef(null);
  useEffect(() => {
    const container = longRef.current;
    if (!container) return;
    // Strip any prior highlights by replacing them with their text content
    container.querySelectorAll('mark.cs-hl').forEach(el => {
      const parent = el.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      parent.normalize();
    });
    if (!query || query.length < 2) return;
    // Walk all text nodes, find case-insensitive substring matches, wrap them
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent || !node.textContent.toLowerCase().includes(query)) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip text inside <style>/<script> just in case
        const tag = node.parentElement?.tagName?.toLowerCase();
        if (tag === 'style' || tag === 'script') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const toProcess = [];
    let n;
    while ((n = walker.nextNode())) toProcess.push(n);
    for (const node of toProcess) {
      const text = node.textContent;
      const lower = text.toLowerCase();
      const parts = [];
      let i = 0;
      while (i < text.length) {
        const idx = lower.indexOf(query, i);
        if (idx < 0) { parts.push({ text: text.slice(i), mark: false }); break; }
        if (idx > i) parts.push({ text: text.slice(i, idx), mark: false });
        parts.push({ text: text.slice(idx, idx + query.length), mark: true });
        i = idx + query.length;
      }
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        if (p.mark) {
          const m = document.createElement('mark');
          m.className = 'cs-hl';
          m.textContent = p.text;
          frag.appendChild(m);
        } else {
          frag.appendChild(document.createTextNode(p.text));
        }
      }
      node.parentNode?.replaceChild(frag, node);
    }
  }, [query]);

  const doRebuild = async () => {
    if (!confirm('Rebuild server-side indexes? This may take a while.')) return;
    setRebuilding(true);
    try {
      const r = await apiRebuildIndexes();
      toast(r.ok ? 'Rebuild started' : 'Rebuild request sent', r.ok ? 'ok' : 'err');
    } catch (e) {
      toast('Rebuild failed: ' + e.message, 'err');
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="cs-shell">
      <aside className="cs-sidebar">
        <div className="cs-logo">
          <Link to="/landing" style={{ color: 'var(--gold)' }}>𐤀𐤁 BHS Cheatsheet</Link>
          <p>Token format reference</p>
        </div>
        {[...new Set(NAV.map(n => n.section))].map(section => (
          <div key={section}>
            <div className="cs-nav-section">{section}</div>
            {NAV.filter(n => n.section === section).map(n => (
              <a key={n.id} className="cs-nav-item" onClick={() => scrollTo(n.id)}>{n.label}</a>
            ))}
          </div>
        ))}
        <div className="cs-nav-section">Theme</div>
        <a className="cs-nav-item" onClick={toggleTheme}>{theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}</a>
      </aside>

      <main className="cs-main">
        <div className="cs-search-wrap">
          <span style={{ color: 'var(--text3)' }}>⌕</span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search any field, value, or concept…"
            aria-label="Search cheatsheet"
          />
        </div>

        <section className="cs-section" id="anatomy">
          <h2>Token anatomy</h2>
          <p className="cs-sub">Every row in the raw token viewer follows this exact pipe-delimited format</p>
          <div className="cs-token-line">
            {ANATOMY.map(([cls, txt], i) => (
              <span key={i}>
                <span className={`cs-tok-field cs-${cls}`}>{txt}</span>
                {i < ANATOMY.length - 1 && <span className="cs-sep">|</span>}
              </span>
            ))}
          </div>
          <div className="cs-field-grid">
            <Card color="#5b9cf6" title="Field 1 — verse number" desc="Which verse within the chapter this token belongs to. Tokens with the same verse number form one verse." />
            <Card color="#3ecfb0" title="Field 2 — token ordinal" desc="Sequential position of this token within the verse. Token 1 is the rightmost word in RTL display." />
            <Card color="#f0b84a" title="Field 3 — word_raw (Paleo script)" desc="The actual Paleo-Hebrew characters as they appear in the BHS text. May be empty for some tokens." />
            <Card color="#a78bfa" title="Field 4 — pos (part of speech)" desc="The grammatical category. conj/prep/art get their own word blocks; verb/subs/adjv trigger affix stripping." />
            <Card wide title="Fields 5+ — pipe-delimited key=value attributes" desc="Morphological attributes. Order varies by part of speech. Absent fields use the literal string 'absent'." />
          </div>
        </section>

        <section className="cs-section" id="fields">
          <h2>Field index</h2>
          <p className="cs-sub">Every key that can appear in the attribute string, what it means, and valid values</p>
          <table className="cs-table">
            <thead><tr><th>Key</th><th>Full name</th><th>Who has it</th><th>Values</th></tr></thead>
            <tbody>
              {fieldRows.map(f => (
                <tr key={f.key}>
                  <td className="cs-mono">{f.key}</td>
                  <td>{f.name}</td>
                  <td>{f.who}</td>
                  <td>{f.values}</td>
                </tr>
              ))}
              {fieldRows.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--text3)' }}>No fields match "{q}"</td></tr>}
            </tbody>
          </table>
        </section>

        {/* ── LONG-FORM REFERENCE SECTIONS ──────────────────────────────────
            These are the deep field explanations, worked examples, mutation
            patterns, and edge-case notes from the original cheatsheet. The
            HTML and CSS are extracted verbatim from bhs-token-cheatsheet.html
            and namespaced under .cs-long so they don't fight the React shell. */}
        <div ref={longRef} className="cs-long" dangerouslySetInnerHTML={{ __html: CHEATSHEET_LONG_HTML }} />

        <section className="cs-section" id="values">
          <h2>Value dictionaries</h2>
          <p className="cs-sub">Decoded meanings for each coded value — these are the same tables the viewer uses to render descriptive tokens</p>
          <div className="cs-val-grid">
            {valueTables.map(t => (
              <div key={t.key} className="cs-val-card">
                <div className="cs-val-card-title"><span className="cs-mono">{t.key}</span> · {t.label}</div>
                <div className="cs-val-list">
                  {t.entries.map(([code, desc]) => (
                    <div key={code} className="cs-val-row">
                      <span className="cs-val-code">{code}</span>
                      <span className="cs-val-desc">{desc.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cs-section" id="admin">
          <h2>Rebuild indexes</h2>
          <p className="cs-sub">Trigger a server-side rebuild of the root/surface navigation indexes (admin only)</p>
          <button className="cs-rebuild-btn" onClick={doRebuild} disabled={rebuilding}>
            {rebuilding ? 'Rebuilding…' : '↻ Rebuild server indexes'}
          </button>
        </section>
      </main>
    </div>
  );
}

function Card({ color, title, desc, wide }) {
  return (
    <div className="cs-field-card" style={wide ? { gridColumn: '1 / -1' } : null}>
      <div className="cs-field-name" style={{ color: color || 'var(--text2)' }}>{title}</div>
      <div className="cs-field-desc">{desc}</div>
    </div>
  );
}
