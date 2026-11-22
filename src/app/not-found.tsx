import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="state">
      <h1>No page here.</h1>
      <p>
        <kbd>⌘K</kbd> to find a team, or <Link href="/">back to alliance selection</Link>.
      </p>
    </div>
  );
}
