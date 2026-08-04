import './SideNav.css';

/** SideNav — two arrow buttons (prev/next) that float against the viewport edges.
 *  Hidden on touch viewports (where swipe handles it). */
export default function SideNav({ onPrev, onNext, hiddenPrev, hiddenNext }) {
  return (
    <>
      <button
        className="side-nav-btn side-nav-prev"
        onClick={onPrev}
        title="Previous"
        aria-label="Previous"
        disabled={!!hiddenPrev}
        style={hiddenPrev ? { opacity: 0.25 } : null}
      >&#9664;</button>
      <button
        className="side-nav-btn side-nav-next"
        onClick={onNext}
        title="Next"
        aria-label="Next"
        disabled={!!hiddenNext}
        style={hiddenNext ? { opacity: 0.25 } : null}
      >&#9654;</button>
    </>
  );
}
