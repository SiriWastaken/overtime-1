'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="state" role="alert">
      <h1>Timeout.</h1>
      <p className="muted">Something broke on our side.</p>
      <button type="button" onClick={reset}>
        Restart the clock
      </button>
    </div>
  );
}
