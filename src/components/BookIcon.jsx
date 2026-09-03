// Small inline "open book" icon — deliberately plain line-art (no emoji,
// no color of its own) so it sits next to text-glyph buttons like the
// settings wheel (⚙) without looking out of place. Renders at 1em so it
// scales with whatever button/text size it's dropped into and inherits
// currentColor like the app's other inline SVGs.
export default function BookIcon({ className, style, title }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d="M12 6.7c-1.7-1.4-3.8-2.1-6.3-2.1-.9 0-1.6.08-2.3.24v12.9c.7-.16 1.4-.24 2.3-.24 2.5 0 4.6.7 6.3 2.1 1.7-1.4 3.8-2.1 6.3-2.1.9 0 1.6.08 2.3.24V4.83c-.7-.16-1.4-.24-2.3-.24-2.5 0-4.6.7-6.3 2.1z" />
      <path d="M12 6.7v12.9" />
    </svg>
  );
}
