'use client';

import { useEffect, useRef } from 'react';

// Three star layers drawn once to canvases, then moved only with compositor transforms (pointer + scroll
// parallax), so an idle page does no per-frame work. A rare shooting star is the only ambient animation; it is
// skipped when the tab is hidden, in calm mode or with reduced motion.

const LAYERS = [
  { count: 200, size: [0.4, 0.8], alpha: [0.12, 0.35], depth: 6, scroll: 0.02 },
  { count: 70, size: [0.6, 1.1], alpha: [0.25, 0.55], depth: 14, scroll: 0.05 },
  { count: 18, size: [1, 1.6], alpha: [0.45, 0.8], depth: 26, scroll: 0.09 },
];

// Deterministic PRNG so the sky doesn't reshuffle on every resize.
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(canvas: HTMLCanvasElement, layer: (typeof LAYERS)[number], seed: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const rand = mulberry(seed);
  const density = (w * h) / (1440 * 900);
  const n = Math.round(layer.count * Math.max(density, 0.35));
  for (let i = 0; i < n; i++) {
    const r = layer.size[0] + rand() * (layer.size[1] - layer.size[0]);
    const a = layer.alpha[0] + rand() * (layer.alpha[1] - layer.alpha[0]);
    const hue = rand();
    ctx.fillStyle = hue < 0.3 ? `rgba(255,242,224,${a})` : `rgba(255,255,255,${a})`; // white and warm white only
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function SpaceBackground() {
  const root = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    const html = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const still = () => html.hasAttribute('data-calm') || reduce.matches;

    const redraw = () => canvases.current.forEach((c, i) => c && draw(c, LAYERS[i], 17 + i * 101));
    redraw();
    let resizeT = 0;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = window.setTimeout(redraw, 150);
    };

    // Parallax: event-driven, one rAF per change, eased toward the target.
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    const apply = () => {
      raf = 0;
      px += (tx - px) * 0.12;
      py += (ty - py) * 0.12;
      const sy = window.scrollY;
      canvases.current.forEach((c, i) => {
        if (!c) return;
        const L = LAYERS[i];
        c.style.transform = still() ? '' : `translate3d(${(-px * L.depth).toFixed(2)}px, ${(-py * L.depth - sy * L.scroll).toFixed(2)}px, 0)`;
      });
      if (Math.abs(tx - px) > 0.002 || Math.abs(ty - py) > 0.002) raf = requestAnimationFrame(apply);
    };
    const kick = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
      kick();
    };

    // Occasional shooting star.
    let shootT = 0;
    const shoot = () => {
      shootT = window.setTimeout(shoot, 25000 + Math.random() * 35000);
      if (still() || document.hidden || !root.current) return;
      const s = document.createElement('span');
      s.className = 'shooting';
      s.style.left = `${30 + Math.random() * 65}%`;
      s.style.top = `${Math.random() * 40}%`;
      const ang = 195 + Math.random() * 25;
      const dist = 260 + Math.random() * 200;
      s.style.setProperty('--angle', `${ang}deg`);
      s.style.setProperty('--dx', `${Math.cos((ang * Math.PI) / 180) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin((ang * Math.PI) / 180) * dist}px`);
      root.current.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    };
    shootT = window.setTimeout(shoot, 12000);

    const onVis = () => (document.hidden ? html.setAttribute('data-hidden', '') : html.removeAttribute('data-hidden'));
    const onCalm = () => kick();

    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('ot:calm', onCalm);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(shootT);
      clearTimeout(resizeT);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', kick);
      window.removeEventListener('ot:calm', onCalm);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div className="space" ref={root} aria-hidden>
      <div className="nebula" />
      {LAYERS.map((_, i) => (
        <canvas
          key={i}
          className={`l${i + 1}`}
          ref={(el) => {
            canvases.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
