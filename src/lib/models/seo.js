/**
 * seo.js — the client side of server/seo/models-seo.json (ONE copy, shared with
 * server/prerender.js): the search-facing title and description of every Story
 * Model / Map page, and which models a verse belongs to (the "See it in 3D"
 * links on the Detailed Verse page).
 *
 * useModelSeo() sets document.title/description to exactly what the prerendered
 * snapshot served, so the hydrated page and the crawler's copy agree.
 */
import { useLocation } from 'react-router-dom';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import SEO from '../../../server/seo/models-seo.json';

export const MODEL_SEO = SEO;

export function seoFor(path) {
  return SEO.pages[path] || null;
}

/** title + description for the page at the current path; falls back to the page's own strings */
export function useModelSeo(fallbackTitle, fallbackDescription) {
  const { pathname } = useLocation();
  const pg = seoFor(pathname.replace(/\/+$/, '') || '/');
  usePageTitle(pg ? pg.title : fallbackTitle, pg ? pg.description : fallbackDescription);
}

export const refLabel = (r) => `${r.book} ${r.from[0]}:${r.from[1]}${r.to[0] === r.from[0] ? `–${r.to[1]}` : `–${r.to[0]}:${r.to[1]}`}`;

/** the story models / maps whose scripture covers this verse (book by slug) */
export function modelsForVerse(slug, chapter, verse) {
  if (!slug || !chapter || verse == null) return [];
  const key = chapter * 1000 + verse;
  return Object.values(SEO.models).filter((m) => m.refs.some((r) => r.slug === slug
    && key >= r.from[0] * 1000 + r.from[1] && key <= r.to[0] * 1000 + r.to[1]))
    .map((m) => ({ ...m, title: (SEO.pages[m.base]?.title || m.name).replace(/ \| BLD Bible$/, '') }));
}
