/**
 * nameForms.js — the app's spelling of a Strong's number's NAME, everywhere a paleo root
 * is shown with a transliteration: allowlisted compounds are hyphenated (Yashar-Al,
 * Bayath-Lacham, Har-Al) exactly as server/lexicon/compound-hyphenation.json says, so the
 * Roots explorer, the map and the rendered English all spell one name one way (fieldy:
 * "the goal is app consistency"). Anything not on the allowlist is the plain root.
 */
import HYPHEN from '../../server/lexicon/compound-hyphenation.json' with { type: 'json' };
import { translit } from './books.js';

const norm = (sn) => 'H' + String(sn || '').replace(/^H+/i, '');
export function hyphenEntry(sn) {
  const e = sn ? HYPHEN[norm(sn)] : null;
  return e && !e.skip ? e : null;
}
/** Transliteration of a root, hyphenated when its number is on the allowlist. */
export function nameTranslit(sn, paleo) {
  const e = hyphenEntry(sn);
  return e?.to || translit(paleo);
}
/** The paleo, hyphenated the same way (𐤄𐤓-𐤀𐤋) — or the root as given. */
export function namePaleo(sn, paleo) {
  const e = hyphenEntry(sn);
  return e?.paleo || paleo;
}
