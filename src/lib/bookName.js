/**
 * The book's name as it reads in front of a chapter or verse. fieldy, 2026-11-04:
 * "lets clean up the Proverb(s) / Psalm(s) sitewide" — the book is "Psalms", but a
 * reference to one of them is "Psalm 23" / "Psalm 23:1" (ordinary English usage;
 * Proverbs keeps its plural: "Proverbs 28:9", his choice). Every place that
 * writes "<book> <chapter>" goes through this. A copy lives in server/prerender.js
 * and server/server.js (chapterName) — keep them the same.
 */
export const chapterName = (name) => (name === 'Psalms' ? 'Psalm' : name);
