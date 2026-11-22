import Link from 'next/link';
import { Mascot } from '@/components/Mascot';

export default function NotFound() {
  return (
    <div className="state">
      <Mascot mood="oops" size={96} />
      <h1>Nothing here.</h1>
      <p>
        Try another team, or <Link href="/">head home</Link>. <kbd>⌘K</kbd> finds anything.
      </p>
    </div>
  );
}
