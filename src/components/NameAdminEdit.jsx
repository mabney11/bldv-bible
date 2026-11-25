/**
 * NameAdminEdit.jsx — owner only: edit what /names writes about one name (server/lexicon/names.json, keyed by
 * Strong's number): the English name, the verse it comes from and the words to light up in it, and the sound
 * links (echoes). The meaning and the words it is built from are edited with AnatomyAdminEdit (strongs-
 * anatomy.json) right beside it. Saves through the backed-up admin lexicon-file route; the server hot-reloads.
 * fieldy, 2026-11-25: "i need the ability to edit each of these".
 */
import { useEffect, useState } from 'react';
import { getAdminStatus } from '../lib/localOverlay.js';
import { apiAdminGetLexiconFile, apiAdminSaveLexiconFile } from '../lib/api.js';
import './RootAdminEdit.css';

const FILE = 'names.json';
const blankEcho = () => ({ from: { name: '', paleo: '', gloss: '', sn: '' }, to: { name: '', paleo: '', gloss: '', sn: '' }, note: '' });
const marksToText = (ms = []) => ms.filter(m => m.word).map(m => (m.part && m.part !== m.word ? `${m.word} | ${m.part}` : m.word)).join('\n');
const textToMarks = (t) => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [w, p] = l.split('|').map(x => x.trim()); return { word: w, part: p || w }; });

export default function NameAdminEdit({ sn, current, onSaved }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [english, setEnglish] = useState('');
  const [ref, setRef] = useState('');
  const [marks, setMarks] = useState('');
  const [echoes, setEchoes] = useState([]);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { getAdminStatus().then(s => setIsAdmin(!!s.isAdmin)).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    apiAdminGetLexiconFile(FILE).catch(() => null).then(f => {
      if (!live) return;
      let entry = null;
      try { entry = f ? (JSON.parse(f.content).names || []).find(n => n.sn === sn) : null; } catch { /* ignore */ }
      setHas(!!entry);
      setEnglish(entry?.english || current?.english || '');
      const o = entry?.origin?.[0];
      setRef(o?.ref || '');
      setMarks(marksToText(o?.marks));
      setEchoes((entry?.echoes || []).map(e => ({ ...blankEcho(), ...e, from: { ...blankEcho().from, ...e.from }, to: { ...blankEcho().to, ...e.to } })));
    });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sn]);
  if (!isAdmin || !sn) return null;

  const write = async (mutate, ok) => {
    setBusy(true); setMsg(null);
    try {
      const f = await apiAdminGetLexiconFile(FILE);
      const obj = JSON.parse(f.content || '{}');
      obj.names = obj.names || [];
      mutate(obj);
      await apiAdminSaveLexiconFile(FILE, JSON.stringify(obj, null, 2) + '\n');
      setMsg({ ok }); onSaved && onSaved();
    } catch (e) { setMsg({ err: e.message || 'Save failed' }); }
    finally { setBusy(false); }
  };
  const save = () => write(obj => {
    let e = obj.names.find(n => n.sn === sn);
    if (!e) { e = { sn }; obj.names.push(e); }
    if (english.trim()) e.english = english.trim(); else delete e.english;
    if (ref.trim()) {
      const prev = (e.origin || [])[0] || {};
      e.origin = [{ ...prev, ref: ref.trim(), marks: textToMarks(marks) }, ...(e.origin || []).slice(1)];
    } else delete e.origin;
    const ech = echoes.filter(x => x.from.paleo.trim() && x.to.paleo.trim()).map(x => ({
      from: Object.fromEntries(Object.entries(x.from).filter(([, v]) => String(v).trim())),
      to: Object.fromEntries(Object.entries(x.to).filter(([, v]) => String(v).trim())),
      ...(x.note.trim() ? { note: x.note.trim() } : {}),
    }));
    if (ech.length) e.echoes = ech; else delete e.echoes;
  }, `Saved ${sn} to ${FILE}`).then(() => setHas(true));
  const remove = () => write(obj => { obj.names = obj.names.filter(n => n.sn !== sn); }, `Removed ${sn} — it shows the verse it is first named in`).then(() => setHas(false));
  const setEcho = (i, side, k, v) => setEchoes(es => es.map((e, j) => j !== i ? e : (side ? { ...e, [side]: { ...e[side], [k]: v } } : { ...e, [k]: v })));

  return (
    <span className="rae aae nae">
      <button type="button" className="rae-toggle" onClick={() => setOpen(o => !o)} title="Edit this name (admin)">{open ? '✕' : '✎ edit name'}</button>
      {open && (
        <div className="rae-panel aae-panel">
          <label className="aae-lbl">Name translators wrote (shown large)
            <input className="rae-input" value={english} placeholder="Israel" onChange={e => setEnglish(e.target.value)} />
          </label>
          <label className="aae-lbl">Verse it comes from (empty = the verse it is first named in)
            <input className="rae-input" value={ref} placeholder="Genesis 32:28" onChange={e => setRef(e.target.value)} />
          </label>
          <label className="aae-lbl">Words to light up — one per line, “word | part” to light only part (the name itself is always lit)
            <textarea className="rae-input" rows={4} value={marks} placeholder={'Yashar-Al\nKay-Sharahayath | Sharahayath'} onChange={e => setMarks(e.target.value)} />
          </label>
          <div className="aae-lbl">Sounds like (drawn letter under letter)</div>
          {echoes.map((x, i) => (
            <div key={i} className="nae-echo">
              {['from', 'to'].map(side => (
                <div key={side} className="aae-part">
                  <input className="rae-input aae-tr" value={x[side].name} placeholder={side === 'from' ? 'Sharay' : 'Zarai'} onChange={e => setEcho(i, side, 'name', e.target.value)} />
                  <input className="rae-input aae-tr" value={x[side].paleo} placeholder="letters 𐤔𐤓𐤉" onChange={e => setEcho(i, side, 'paleo', e.target.value)} />
                  <input className="rae-input aae-gl" value={x[side].gloss} placeholder="gloss" onChange={e => setEcho(i, side, 'gloss', e.target.value)} />
                  <input className="rae-input aae-sn" value={x[side].sn} placeholder="H…" onChange={e => setEcho(i, side, 'sn', e.target.value)} />
                </div>
              ))}
              <input className="rae-input" value={x.note} placeholder="note (optional)" onChange={e => setEcho(i, null, 'note', e.target.value)} />
              <button type="button" className="aae-mini" onClick={() => setEchoes(es => es.filter((_, j) => j !== i))}>✕ remove</button>
            </div>
          ))}
          <button type="button" className="aae-mini aae-add" onClick={() => setEchoes(es => [...es, blankEcho()])}>+ sound link</button>
          <div className="rae-btns">
            <button type="button" className="rae-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}<small>{FILE} · {sn}</small></button>
            {has && <button type="button" className="rae-btn" disabled={busy} onClick={remove}>Remove what is written<small>back to the first-named verse</small></button>}
          </div>
          {msg && <div className={msg.err ? 'rae-err' : 'rae-ok'}>{msg.err || msg.ok}</div>}
        </div>
      )}
    </span>
  );
}
