// progress.mjs — ETA timers for long-running scripts (fieldy: "for my long running
// tasks give me ETA timers no matter how long").
//
//   import { progress, fmtDur } from './progress.mjs';
//   const p = progress('rendering verses', rows.length);   // prints every ~5 s
//   for (const r of rows) { …; p.tick(); }
//   p.done();                                               // "✓ rendering verses — 53,081 in 4m 12s"
//
// The line carries: done/total, %, rate, elapsed, and the ETA from the running rate.
// Steps that are ONE call (a big UPDATE, a table load) can't report inside themselves —
// render-all.mjs wraps every step with a ticker instead (see there).
export const fmtDur = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
};
export function progress(label, total, { every = 5000, stream = process.stderr } = {}) {
  const t0 = Date.now();
  let n = 0, last = t0, finished = false;
  const line = () => {
    const el = Date.now() - t0, rate = n / Math.max(el, 1) * 1000;
    const left = total && rate > 0 ? (total - n) / rate * 1000 : null;
    const pct = total ? ` ${(n / total * 100).toFixed(0)}%` : '';
    return `    ⏱ ${label}: ${n.toLocaleString()}${total ? ` / ${total.toLocaleString()}` : ''}${pct} · ${rate.toFixed(0)}/s · ${fmtDur(el)} elapsed${left !== null ? ` · ~${fmtDur(left)} left` : ''}`;
  };
  return {
    tick(k = 1) { n += k; const now = Date.now(); if (now - last >= every) { last = now; stream.write(line() + '\n'); } },
    set(v) { n = v; this.tick(0); },
    done(msg) { if (finished) return; finished = true; stream.write(`    ✓ ${msg || label} — ${n.toLocaleString()} in ${fmtDur(Date.now() - t0)}\n`); },
  };
}
