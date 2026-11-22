// A small canvas burst for real milestones only (an event win). Under 1 s, no dependency, removed when done.
// Loaded on demand (dynamic import), never runs in Calm mode or with reduced motion (the caller checks).

const COLORS = ['--sun', '--d-blue', '--d-pink', '--d-mint', '--d-coral'];

export function burst(from: HTMLElement) {
  const css = getComputedStyle(document.documentElement);
  const colors = COLORS.map((c) => css.getPropertyValue(c).trim());
  const ink = css.getPropertyValue('--ink').trim();
  const r = from.getBoundingClientRect();
  const cvs = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cvs.className = 'confetti';
  cvs.width = innerWidth * dpr;
  cvs.height = innerHeight * dpr;
  document.body.appendChild(cvs);
  const ctx = cvs.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const bits = Array.from({ length: 70 }, (_, i) => ({
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    vx: (Math.random() - 0.5) * 9,
    vy: -4 - Math.random() * 7,
    s: 5 + Math.random() * 5,
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.4,
    c: colors[i % colors.length],
  }));
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = (t - t0) / 900;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (k >= 1) return cvs.remove();
    ctx.globalAlpha = 1 - k * k;
    for (const b of bits) {
      b.vy += 0.35;
      b.x += b.vx;
      b.y += b.vy;
      b.a += b.va;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.fillStyle = b.c;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      ctx.fillRect(-b.s / 2, -b.s / 3, b.s, (b.s * 2) / 3);
      ctx.strokeRect(-b.s / 2, -b.s / 3, b.s, (b.s * 2) / 3);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
