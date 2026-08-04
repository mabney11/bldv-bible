/**
 * Scans.jsx — read original-language page scans visually, in-app.
 *
 * For texts whose originals aren't digitized as machine-readable text (the Greek
 * pseudepigrapha, the classical-Armenian Zohrab Bible, etc.), this embeds the
 * Internet Archive BookReader so they can be read page-by-page now and OCR'd into
 * text later. The manifest lives in src/scans.json — add an entry (just an
 * archive.org id) and it shows up here; no rebuild of anything else required.
 *
 * Route: add to App.jsx →  <Route path="/scans" element={<Scans />} />
 * Deep-link a specific scan with /scans?id=<slug>.
 */
import { useState, useMemo } from "react";
import manifest from "../scans.json";

export default function Scans() {
  const scans = (manifest.scans || []).filter(s => s.archive_id);
  const params = new URLSearchParams(window.location.search);
  const initial = params.get("id");
  const [sel, setSel] = useState(
    scans.find(s => s.slug === initial) || scans[0] || null
  );
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const f = scans.filter(s =>
      !q || `${s.title} ${s.language} ${s.edition}`.toLowerCase().includes(q.toLowerCase())
    );
    const by = {};
    for (const s of f) (by[s.language] = by[s.language] || []).push(s);
    return by;
  }, [q, scans]);

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg, #0d0f12)", color: "var(--fg, #e8e8e8)" }}>
      <aside style={{ width: 320, borderRight: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <button onClick={() => window.history.back()} style={btn}>←</button>
            <strong style={{ fontSize: 15 }}>Scan Library</strong>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search editions…"
            style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)", color: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ overflowY: "auto", padding: "6px 0" }}>
          {Object.entries(groups).map(([lang, items]) => (
            <div key={lang}>
              <div style={{ padding: "8px 16px 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.5 }}>{lang}</div>
              {items.map(s => (
                <button key={s.slug} onClick={() => setSel(s)} title={s.edition}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 16px", border: "none", cursor: "pointer",
                    background: sel && sel.slug === s.slug ? "rgba(74,158,255,0.15)" : "transparent",
                    color: "inherit", borderLeft: sel && sel.slug === s.slug ? "2px solid var(--blue,#4a9eff)" : "2px solid transparent" }}>
                  <div style={{ fontSize: 13.5 }}>{s.title}</div>
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{s.edition}</div>
                </button>
              ))}
            </div>
          ))}
          {!Object.keys(groups).length && <div style={{ padding: 16, opacity: 0.5, fontSize: 13 }}>No matches.</div>}
        </div>
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {sel ? (
          <>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{sel.title} <span style={{ opacity: 0.5, fontWeight: 400 }}>· {sel.language}</span></div>
                <div style={{ fontSize: 12, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel.edition}</div>
              </div>
              <a href={`https://archive.org/details/${sel.archive_id}`} target="_blank" rel="noreferrer"
                 style={{ ...btn, textDecoration: "none", whiteSpace: "nowrap" }}>open at archive.org ↗</a>
            </div>
            <iframe key={sel.slug} title={sel.title}
              src={`https://archive.org/embed/${sel.archive_id}`}
              style={{ flex: 1, width: "100%", border: "none" }} allowFullScreen />
          </>
        ) : (
          <div style={{ margin: "auto", opacity: 0.5 }}>No scans in the manifest yet.</div>
        )}
      </main>
    </div>
  );
}

const btn = { fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.05)", color: "inherit", cursor: "pointer" };
