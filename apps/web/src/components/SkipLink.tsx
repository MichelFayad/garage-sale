// Skip-to-content link (WCAG 2.4.1). Visually hidden until focused, it lets
// keyboard users jump past the nav to <main id="main-content">. Styled via the
// .skip-link class in globals.css.
export function SkipLink() {
  return (
    <a href="#main-content" className="skip-link">
      Skip to content
    </a>
  );
}
