/**
 * VerseSwitch — the verse-level pages, each one a tap from the others (fieldy,
 * 2026-09-29: "lets give every verse level page back and forth access with each
 * other"): Detailed Verse (/genesis/1/1), Hebrew Viewer (/?book=&chapter=&verse=),
 * Parallel (/parallel/genesis/1-1) and the Translation Studio. The page you are
 * on shows as the current (non-link) pill. "Detailed Verse" is the official name
 * of the /<book>/<chapter>/<verse> page wherever another page refers to it.
 */
import { Link } from 'react-router-dom';
import './VerseSwitch.css';

export const detailedVerseHref = (slug, chapter, verse) => `/${slug}/${chapter}/${verse}`;

export default function VerseSwitch({ current, slug, chapter, verse, hebrewHref, hebrewLabel = 'Hebrew Viewer', className = '' }) {
  if (!slug || !chapter || verse == null) return null;
  const q = `book=${encodeURIComponent(slug)}&chapter=${chapter}&verse=${verse}`;
  const items = [
    { key: 'detail', label: 'Detailed Verse', to: detailedVerseHref(slug, chapter, verse), title: 'The verse on its own page — word by word, roots, Strong\'s' },
    { key: 'hebrew', label: hebrewLabel, to: hebrewHref || `/?${q}`, title: 'The verse in the Hebrew Viewer' },
    { key: 'parallel', label: 'Parallel', to: `/parallel/${slug}/${chapter}-${verse}`, title: 'English beside the paleo Hebrew' },
    { key: 'studio', label: 'Studio', to: `/translate?${q}`, title: 'The verse in the Translation Studio' },
  ];
  return (
    <nav className={`vswitch ${className}`} aria-label="This verse in">
      {items.map((it) => (it.key === current
        ? <span key={it.key} className="vswitch-item on" aria-current="page">{it.label}</span>
        : <Link key={it.key} to={it.to} className="vswitch-item" title={it.title}>{it.label}</Link>))}
    </nav>
  );
}
