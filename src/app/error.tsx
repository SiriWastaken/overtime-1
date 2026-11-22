'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="state" role="alert">
      <h1>That didn’t load.</h1>
      <p className="muted">Something broke on our side. Your picks are saved on this device.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
