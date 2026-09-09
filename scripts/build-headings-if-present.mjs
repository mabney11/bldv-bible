// Runs server/build-headings.mjs when it exists — plain Node, so `npm run build`
// behaves the same in PowerShell/cmd as in bash (the old `[ -f … ] || true` was bash-only).
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const f = 'server/build-headings.mjs';
if (existsSync(f)) execFileSync(process.execPath, [f], { stdio: 'inherit' });
