// ESM face of lex-owner-lib.cjs (the one copy of the rule) — see that file.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const L = require('./lex-owner-lib.cjs');
export const { loadOwnerEvidence, shared, glossWords } = L;
