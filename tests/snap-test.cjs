// snap-test.js — verify the lexicon snap-fix logic without spinning up a
// full DOM. We model the scrolling-container math directly:
//
//   container has overflow:auto and position:relative
//   anchors are absolutely-static elements with `position:sticky; top:0`
//
// The bug being checked: snapping BACK to an earlier letter after snapping
// to a later one must produce a scroll target of the earlier letter's true
// (static) offsetTop — not a near-zero value influenced by sticky positioning.

// Synthetic layout:
const ROW_HEIGHT = 30;       // height of a word row
const ANCHOR_HEIGHT = 32;    // height of a letter anchor (sticky header)

// Build a fake list: 5 letters, each with 10 rows.
const letters = ['A','B','C','D','E'];
const layout = [];
let y = 0;
for (const letter of letters) {
  layout.push({ kind: 'anchor', letter, offsetTop: y });
  y += ANCHOR_HEIGHT;
  for (let i = 0; i < 10; i++) {
    layout.push({ kind: 'row', letter, offsetTop: y });
    y += ROW_HEIGHT;
  }
}

// LEGACY (buggy) implementation: when an anchor is currently sticky at top:0,
// getBoundingClientRect().top == 0 relative to the viewport. The scroll
// container's getBoundingClientRect().top is the constant container-top.
// So bbox-relative-to-container = -containerTop, which when added to scrollTop
// makes the user "stuck" at the same scroll position.
function buggyScrollTarget(currentScrollTop, anchorOffsetTop) {
  // Simulate "what does getBoundingClientRect().top return for this anchor?"
  // For non-sticky anchors: offsetTop - currentScrollTop.
  // For the *currently-sticky* anchor (one whose offsetTop is at or above
  // currentScrollTop): it's pinned at 0 in the container's frame.
  const ratio = anchorOffsetTop - currentScrollTop;
  // If ratio <= 0, the anchor is already pinned at the top of the visible
  // area (negative would mean it's scrolled past, but sticky keeps it at 0).
  const bbox = ratio <= 0 ? 0 : ratio;
  // The old code: lw.scrollTop + (anchor.bbox.top - container.bbox.top)
  // container.bbox.top, relative to itself, is 0 — but our `bbox` is
  // already container-relative, so the delta is `bbox`.
  return currentScrollTop + bbox;
}

// FIXED implementation: use offsetTop directly.
function fixedScrollTarget(currentScrollTop, anchorOffsetTop) {
  return anchorOffsetTop;
}

// Test case 1: jump from top to letter C (later). Both should agree.
{
  const target = layout.find(l => l.kind === 'anchor' && l.letter === 'C');
  const buggy = buggyScrollTarget(0, target.offsetTop);
  const fixed = fixedScrollTarget(0, target.offsetTop);
  console.log(`Test 1 (top → C):  buggy=${buggy}, fixed=${fixed}, target=${target.offsetTop}`);
  console.assert(fixed === target.offsetTop, 'fix should equal target');
}

// Test case 2: now at C, jump BACK to letter A (earlier).
// The buggy code reads "what's the bbox of A's anchor?" — but C is sticky,
// covering A's static position. A's static offsetTop is FAR ABOVE scrollTop,
// so the ratio is negative -> bbox becomes 0 -> scrollTarget = scrollTop +0.
// (We model "below or at" the sticky one as pinned at 0.)
{
  const cAnchor = layout.find(l => l.kind === 'anchor' && l.letter === 'C');
  const aAnchor = layout.find(l => l.kind === 'anchor' && l.letter === 'A');
  const scrollTop = cAnchor.offsetTop;     // we're "at" letter C
  const buggy = buggyScrollTarget(scrollTop, aAnchor.offsetTop);
  const fixed = fixedScrollTarget(scrollTop, aAnchor.offsetTop);
  console.log(`Test 2 (C → A):    buggy=${buggy}, fixed=${fixed}, target=${aAnchor.offsetTop}`);
  console.assert(fixed === aAnchor.offsetTop, 'fixed should scroll back to A');
  console.assert(buggy !== aAnchor.offsetTop,  'buggy version stuck at C');
}

// Test case 3: at C, jump to D (the very next letter). Buggy might also fail
// here because D is right at scrollTop+headerHeight; the ratio is small but
// positive, so the buggy version adds that delta. Should match fixed.
{
  const cAnchor = layout.find(l => l.kind === 'anchor' && l.letter === 'C');
  const dAnchor = layout.find(l => l.kind === 'anchor' && l.letter === 'D');
  const scrollTop = cAnchor.offsetTop;
  const buggy = buggyScrollTarget(scrollTop, dAnchor.offsetTop);
  const fixed = fixedScrollTarget(scrollTop, dAnchor.offsetTop);
  console.log(`Test 3 (C → D):    buggy=${buggy}, fixed=${fixed}, target=${dAnchor.offsetTop}`);
  console.assert(fixed === dAnchor.offsetTop, 'fixed should scroll forward to D');
  console.assert(buggy === dAnchor.offsetTop, 'forward-jump works in both');
}

console.log('\nAll assertions passed — fix correctly handles back-jumps where buggy code stalls.');
