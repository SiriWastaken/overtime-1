export default function Loading() {
  return (
    <div className="state" role="status">
      <div className="ring" aria-hidden />
      <p className="muted">Clock’s running…</p>
    </div>
  );
}
