// keyboards.js — on-screen keyboard layouts for scripts users can't easily
// type on a normal keyboard. Shared between the Hebrew Viewer's inline
// search composer and the global /search page so both stay in sync.
//
// Each entry: { id, label, dir: 'rtl'|'ltr', rows: [[chars...], ...] }
// `dir` drives the input's `direction` CSS so users type the way the script
// actually reads — Hebrew/Paleo/Syriac right-to-left, everything else
// left-to-right. Adding a new script tab (Ge'ez, Syriac, Greek, ...) means
// adding one entry here; the composer/search-page UI is generic over this
// list.

export const PALEO_KBD_ROWS = [
  ['𐤀', '𐤁', '𐤂', '𐤃', '𐤄', '𐤅'],
  ['𐤆', '𐤇', '𐤈'],
  ['𐤉', '𐤊', '𐤋', '𐤌', '𐤍'],
  ['𐤎', '𐤏', '𐤐', '𐤑', '𐤒'],
  ['𐤓', '𐤔', '𐤕'],
];

// Phase 1 ships Paleo only (matches the existing Hebrew search). Ge'ez,
// Syriac, and the rest get added here in a later phase — the shape is
// already generic so that's additive, not a rewrite.
export const KEYBOARDS = [
  { id: 'paleo', label: 'Paleo', dir: 'rtl', rows: PALEO_KBD_ROWS },
];

export const getKeyboard = id => KEYBOARDS.find(k => k.id === id) || KEYBOARDS[0];
