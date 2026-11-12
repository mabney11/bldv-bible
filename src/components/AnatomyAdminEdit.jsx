import { useEffect, useState } from 'react';
import { getAdminStatus } from '../lib/localOverlay.js';
import { apiAdminGetLexiconFile, apiAdminSaveLexiconFile } from '../lib/api.js';
import './RootAdminEdit.css';

// Admin-only: edit what a Strong's number is "Built from" — its parts (Strong's
// number + gloss + optional spelling), the meaning sentence and the definition
// line. Writes server/lexicon/strongs-anatomy.json (the curated anatomy that
// wins over the dictionary's derivation) through the backed-up admin file API.
// "Use the dictionary" removes the curated entry. fieldy, 2026-11-12.
const FILE = 'strongs-anatomy.json';
const blankPart = () => ({ sn: '', gloss: '', translit: '' });
const normSn = s => { const m = /^\s*h?0*(\d+[a-z]?)\s*$/i.exec(s || ''); return m ? 'H' + m[1].toLowerCase() : null; };

export default function AnatomyAdminEdit({ sn, anatomy, onSaved }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState([]);
  const [meaning, setMeaning] = useState('');
  const [def, setDef] = useState('');
  const [curated, setCurated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)).catch(() => {}); }, []);
  useEffect(() => { setOpen(false); setMsg(null); }, [sn]);

  // Opening: start from the curated entry if there is one, else from what the page shows now.
  useEffect(() => {
    if (!open) return;
    let live = true;
    apiAdminGetLexiconFile(FILE).catch(() => null).then(f => {
      if (!live) return;
      let entry = null;
      try { entry = f ? JSON.parse(f.content)[sn] : null; } catch { /* ignore */ }
      setCurated(!!entry);
      if (entry) {
        setParts((entry.parts || []).map(p => typeof p === 'string' ? { ...blankPart(), sn: p } : { sn: p.sn || '', gloss: p.gloss || '', translit: p.translit || '' }));
        setMeaning(entry.meaning || ''); setDef(entry.def || '');
      } else {
        setParts((anatomy?.parts || []).map(p => ({ sn: p.sn, gloss: p.gloss || p.kjv || '', translit: '' })));
        setMeaning(anatomy?.meaning || ''); setDef(anatomy?.strongs_def || '');
      }
      if (!(entry?.parts?.length || anatomy?.parts?.length)) setParts([blankPart()]);
    });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sn]);

  if (!isAdmin || !sn) return null;

  const setPart = (i, k, v) => setParts(ps => ps.map((p, j) => j === i ? { ...p, [k]: v } : p));
  const move = (i, d) => setParts(ps => { const a = ps.slice(); const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  const write = async (mutate, okText) => {
    setBusy(true); setMsg(null);
    try {
      const f = await apiAdminGetLexiconFile(FILE).catch(() => ({ content: '{}' }));
      let obj; try { obj = JSON.parse(f.content || '{}'); } catch { throw new Error(`${FILE} isn't valid JSON — fix it in /admin/lexicon first`); }
      mutate(obj);
      await apiAdminSaveLexiconFile(FILE, JSON.stringify(obj, null, 2) + '\n');
      setMsg({ ok: okText });
      onSaved && onSaved();
    } catch (e) { setMsg({ err: e.message || 'Save failed' }); }
    finally { setBusy(false); }
  };

  const save = () => {
    const out = [];
    for (const p of parts) {
      if (!p.sn.trim() && !p.gloss.trim()) continue;
      const n = normSn(p.sn);
      if (!n) { setMsg({ err: `"${p.sn}" isn't a Strong's number (H1, H3045 …)` }); return; }
      const o = { sn: n };
      if (p.gloss.trim()) o.gloss = p.gloss.trim();
      if (p.translit.trim()) o.translit = p.translit.trim();
      out.push(o);
    }
    const entry = { parts: out };
    if (meaning.trim()) entry.meaning = meaning.trim();
    if (def.trim()) entry.def = def.trim();
    write(obj => { obj[sn] = entry; }, `Saved ${sn} to ${FILE}`).then(() => setCurated(true));
  };
  const revert = () => write(obj => { delete obj[sn]; }, `Removed ${sn} — the dictionary's reading shows again`).then(() => setCurated(false));

  return (
    <span className="rae aae">
      <button type="button" className="rae-toggle" onClick={() => setOpen(o => !o)} title="Edit what this number is built from (admin)">
        {open ? '✕' : '✎ edit built from'}
      </button>
      {open && (
        <div className="rae-panel aae-panel">
          {parts.map((p, i) => (
            <div key={i} className="aae-part">
              <input className="rae-input aae-sn" value={p.sn} placeholder="H1" onChange={e => setPart(i, 'sn', e.target.value)} />
              <input className="rae-input aae-tr" value={p.translit} placeholder="spelling (opt.)" title="How this part is written here, e.g. Abay — empty = the number's own transliteration" onChange={e => setPart(i, 'translit', e.target.value)} />
              <input className="rae-input aae-gl" value={p.gloss} placeholder="gloss, e.g. My Father" onChange={e => setPart(i, 'gloss', e.target.value)} />
              <button type="button" className="aae-mini" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
              <button type="button" className="aae-mini" onClick={() => move(i, 1)} disabled={i === parts.length - 1} title="Move down">↓</button>
              <button type="button" className="aae-mini" onClick={() => setParts(ps => ps.filter((_, j) => j !== i))} title="Remove part">✕</button>
            </div>
          ))}
          <button type="button" className="aae-mini aae-add" onClick={() => setParts(ps => [...ps, blankPart()])}>+ part</button>
          <label className="aae-lbl">Meaning (the parts read as a sentence)
            <input className="rae-input" value={meaning} placeholder="My Father Knows" onChange={e => setMeaning(e.target.value)} />
          </label>
          <label className="aae-lbl">Definition line (empty = the dictionary's)
            <input className="rae-input" value={def} placeholder="Ab-Yadai, a son of Abaraham by Qatawarah" onChange={e => setDef(e.target.value)} />
          </label>
          <div className="rae-btns">
            <button type="button" className="rae-btn" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}<small>{FILE} · {sn} · {curated ? 'curated' : 'dictionary now'}</small>
            </button>
            {curated && (
              <button type="button" className="rae-btn" disabled={busy} onClick={revert}>
                Use the dictionary<small>removes {sn} from {FILE}</small>
              </button>
            )}
          </div>
          {msg && <div className={msg.err ? 'rae-err' : 'rae-ok'}>{msg.err || msg.ok}</div>}
        </div>
      )}
    </span>
  );
}
