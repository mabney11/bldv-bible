// progress.mjs — ETA timers for long-running scripts (fieldy: "for my long running
// tasks give me ETA timers no matter how long"). The implementation is progress.cjs so
// the CommonJS scripts (build-surface-index.js, heb-align.js) share it; this is the ESM face.
//
//   import { progress, fmtDur } from './progress.mjs';
//   const p = progress('rendering verses', rows.length);   // prints every ~5 s
//   for (const r of rows) { …; p.tick(); }
//   p.done();                                               // "✓ rendering verses — 53,081 in 4m 12s"
//
// The line carries: done/total, %, rate, elapsed, and the ETA from the running rate.
// Steps that are ONE call (a big UPDATE, a table load) can't report inside themselves —
// render-all.mjs wraps every step with a ticker instead (see there).
import cjs from './progress.cjs';
export const { progress, fmtDur } = cjs;
