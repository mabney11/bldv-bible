/**
 * TempleStories.jsx — the three ways into the house of Yahawah, each its own
 * page: BUILD (/models/temple/build), DEDICATE (/models/temple/dedicate) and
 * WALK (/models/temple/walk; on your own feet at /models/temple/roam). The
 * catalogue (/models/temple) shows them as branches; the model's header shows
 * which one is open. The icons are drawn here in the app's gold, in the plain
 * line of the paleo letters: courses of stone rising, the inan (cloud) over
 * the ash (fire) on the altar, the gate with the way in.
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

/** The branches, in the order the text tells them. `modes` are the model's modes each branch opens. */
export const STORIES = [
  { key: 'build', label: 'Build', modes: ['build'], Icon: BuildIcon,
    kicker: '1 Kings 6–7 · 2 Chronicles 3–4',
    blurb: 'Watch the bayath (house) rise in the order the text gives it: the yasad (foundation), the qayarawath (walls) and their chambers, the roof, the araz (cedar) within and the zahab (gold) over it, the karawab (cherubim), the doors, the courts, the nachashath (brass), the vessels — and last the arawan (ark) brought in.' },
  { key: 'dedicate', label: 'Dedicate', modes: ['dedicate'], Icon: DedicateIcon,
    kicker: '1 Kings 8 · 2 Chronicles 5–7',
    blurb: 'The qahal (assembly) gathers, the kahanayam (priests) carry the arawan (ark) in under the wings, the inan (cloud) fills the house, Shalamah (Solomon) prays on the kayawar (scaffold), ash (fire) comes down on the mazabach (altar), the kabawad (glory) is seen, the zabach (sacrifices) and the chag (feast), and the people are sent home.' },
  { key: 'walk', label: 'Walk', modes: ['walk', 'roam'], Icon: WalkIcon,
    kicker: 'From the gate to the arawan (ark)',
    blurb: 'In through the gate of the great court, past the mazabach (altar) and the yam (sea), between Yakayan (Jachin) and Baiz (Boaz), through the awalam (porch) and the doors, down the hayakal between the lampstands, through the parakath (veil) to the arawan (ark) beneath the wings — guided, or on your own feet.' },
];
export const storyFor = (mode) => STORIES.find((s) => s.modes.includes(mode)) || STORIES[2];
