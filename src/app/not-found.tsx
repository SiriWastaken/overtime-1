import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="state">
      <h1>Sudden death.</h1>
      <p className="muted">That page didn’t make it out of overtime.</p>
      <p>
        <kbd>⌘K</kbd> to find a team, or <Link href="/">back to Explore</Link>.
      </p>
    </div>
  );
}
