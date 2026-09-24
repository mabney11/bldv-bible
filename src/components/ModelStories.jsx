/**
 * ModelStories.jsx — the icons of the stories a model's chooser offers, drawn
 * in the app's gold, in the plain line of the paleo letters: courses of stone
 * rising (Build), the inan (cloud) over the ash (fire) on the altar (Dedicate),
 * the gate with the way in (Walk), the man with the qanah (reed) (Measure), the
 * tent under the cloud (Raise). A model's STORIES name their icon by key
 * (STORY_ICONS); the chooser (pages/ModelIndex.jsx) and the model page's header
 * draw it.
 */
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

/** Courses of hewn stone rising, the top one still going up; a plumb line beside. */
export function BuildIcon(props) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...props}>
      <g {...stroke}>
        <path d="M6 40h36" />
        <path d="M8 40V31h13v9M21 40V31h13v9M34 40V31h8" />
        <path d="M8 31V22h7v9M15 31V22h13v9M28 31V22h12v9" />
        <path d="M14 22v-9h11v9M25 22v-9h11v9" />
        <path d="M18 13V6h9v7" strokeDasharray="2.5 2.2" />
        <path d="M42 8v20" /><path d="M39.5 28.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0" />
      </g>
    </svg>
  );
}
/** The inan (cloud) settling on the house, the ash (fire) come down on the altar before it. */
export function DedicateIcon(props) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...props}>
      <g {...stroke}>
        <path d="M11 20.5a5.5 5.5 0 0 1 5-7.5a7 7 0 0 1 13-2.5a5.5 5.5 0 0 1 8 5a5 5 0 0 1 1.5 9.5H13a5 5 0 0 1-2-4.5z" />
        <path d="M14 25v5M20 25v6M26 25v5M32 25v6M38 25v5" strokeDasharray="1.5 2.4" />
        <path d="M17 41h14" /><path d="M19 41v-5h10v5" />
        <path d="M24 36c-3-2.5-3.5-5.5-1.5-8c0.5 2 1.5 2.5 2 3c0-2.5 1-4 3-5.5c-0.5 3 3 4 1.5 7.5c-0.8 1.8-2.2 3-5 3z" />
      </g>
    </svg>
  );
}
/** The gate of the court — two pillars, a lintel — and the way in, foot by foot. */
export function WalkIcon(props) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...props}>
      <g {...stroke}>
        <path d="M8 14h32M11 14v14M37 14v14M9 11h6M33 11h6" />
        <path d="M11 14v-3M37 14v-3" />
        <path d="M6 41c6-6 9-8 18-13M42 41c-6-6-9-8-18-13" />
        <path d="M21.5 33a1.6 2.4 -15 1 0 3.2 0a1.6 2.4 -15 1 0-3.2 0M23.5 39a1.6 2.4 15 1 0 3.2 0a1.6 2.4 15 1 0-3.2 0" />
        <path d="M20 28.5a1.6 2.4 -15 1 0 3.2 0a1.6 2.4 -15 1 0-3.2 0" />
      </g>
    </svg>
  );
}

/** The man with the measuring qanah (reed) at a gate's threshold (Ezekiel 40:3–5). */
export function MeasureIcon(props) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...props}>
      <g {...stroke}>
        <path d="M6 41h36" />
        <path d="M10 41V17h8v24M30 41V17h8v24M8 17h32" />
        <path d="M13 12l5-5h12l5 5" />
        <path d="M24 41V22" strokeDasharray="2 2.2" />
        <path d="M20 26h8M20 30h8M20 34h8" />
        <path d="M40 8v26M38 12h4M38 18h4M38 24h4M38 30h4" />
      </g>
    </svg>
  );
}
/** The tent of the mashakan under the inan (cloud), its court about it (Exodus 40:17–38). */
export function RaiseIcon(props) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...props}>
      <g {...stroke}>
        <path d="M12 14.5a4.5 4.5 0 0 1 4-6a6 6 0 0 1 11-2a4.5 4.5 0 0 1 7 4a4 4 0 0 1 1 8H14a4 4 0 0 1-2-4z" />
        <path d="M6 41h36" />
        <path d="M14 41V27h20v14" /><path d="M12 27l12-6l12 6" />
        <path d="M22 41v-7h4v7" />
        <path d="M6 41v-8M42 41v-8M6 33h36" strokeDasharray="2 2.2" />
      </g>
    </svg>
  );
}
/** The city square with its twelve gates, three a side (Ezekiel 48:30–35; Revelation 21:12–13). */
export function CityIcon(props) {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...props}>
      <g {...stroke}>
        <path d="M8 8h32v32H8z" />
        <path d="M14 8v-2M24 8v-2M34 8v-2M14 40v2M24 40v2M34 40v2M8 14h-2M8 24h-2M8 34h-2M40 14h2M40 24h2M40 34h2" />
        <path d="M12.5 8h3M22.5 8h3M32.5 8h3M12.5 40h3M22.5 40h3M32.5 40h3M8 12.5v3M8 22.5v3M8 32.5v3M40 12.5v3M40 22.5v3M40 32.5v3" strokeWidth="3" />
        <path d="M18 18h12v12H18z" strokeDasharray="2 2" />
      </g>
    </svg>
  );
}

export const STORY_ICONS = { build: BuildIcon, dedicate: DedicateIcon, walk: WalkIcon, measure: MeasureIcon, raise: RaiseIcon, city: CityIcon };
