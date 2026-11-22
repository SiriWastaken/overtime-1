import { Mascot } from '@/components/Mascot';

export default function Loading() {
  return (
    <div className="state" role="status">
      <Mascot mood="think" size={72} />
      <p className="muted">Crunching the numbers…</p>
    </div>
  );
}
