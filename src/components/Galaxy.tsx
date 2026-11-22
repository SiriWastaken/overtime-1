"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GalaxyData } from "@/lib/galaxy";
import { motionOk, peek } from "@/lib/fx";
import { Avatar } from "./bits";
import { EdgeGauge, hot } from "./edge";

const K_MIN = 1;
const K_MAX = 40;
const DETAIL = [1.6, 2.6]; // zoom range where the density view hands over to individual dots

interface Cam {
  x: number;
  y: number;
  k: number;
}

/**
 * Spread the cloud: asinh around the median, scaled by the interquartile range, then mapped to 0–100 with the
 * median at 50. The dense middle opens up, the long tails (the best teams) stay visible, and no quadrant is empty.
 */
function spread(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  const q = (p: number) =>
    s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  const med = q(0.5);
  const iqr = q(0.75) - q(0.25) || 1;
  const t = v.map((x) => Math.asinh((x - med) / (iqr / 2)));
  const span = Math.max(...t.map(Math.abs)) || 1;
  return t.map((x) => 50 + (x / span) * 45);
}
const smooth = (a: number, b: number, x: number) =>
  Math.min(1, Math.max(0, (x - a) / (b - a)));

/**
 * Home: a search-first column (headline, search, Top 10) beside the map of every team.
 * Map: offense up, defense across (median at the centre lines). Zoomed out it shows density and the top 10; zoomed in
 * every team is a dot (brighter = more EDGE) with non-overlapping labels. Hover for a tooltip, click for the card.
 */
export function Galaxy({
  data,
  mine,
  title,
  bare = false,
}: {
  data: GalaxyData;
  mine: number | null;
  title: string;
  bare?: boolean;
}) {
  const N = data.n.length;
  const cvs = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Cam>({ x: 50, y: 50, k: 1 });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const hover = useRef(-1);
  const picked = useRef(-1);
  const raf = useRef(0);
  const flight = useRef(0);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(
    null,
  );
  const [full, setFull] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const zoomedRef = useRef(false);

  const px = useMemo(() => spread(data.x), [data]);
  const py = useMemo(() => spread(data.y), [data]);
  const order = useMemo(
    () =>
      [...Array(N).keys()]
        .filter((i) => data.e[i] !== null)
        .sort((a, b) => data.e[b]! - data.e[a]!),
    [data, N],
  );
  const rankOf = useMemo(
    () => new Map(order.map((i, r) => [i, r + 1])),
    [order],
  );
  const byNum = useMemo(() => new Map(data.n.map((n, i) => [n, i])), [data]);
  const mineIdx = mine !== null ? (byNum.get(mine) ?? -1) : -1;
  const eMax = Math.max(0.01, data.e[order[0]] ?? 0.01);

  const frame = useCallback(() => {
    const { w, h } = size.current;
    const m = w < 500 ? 20 : 44;
    return {
      sx: Math.max(w - 2 * m, 40) / 100,
      sy: Math.max(h - 2 * m, 40) / 100,
      ox: w / 2,
      oy: h / 2,
    };
  }, []);
  const worldToScreen = useCallback(
    (x: number, y: number) => {
      const { sx, sy, ox, oy } = frame();
      const c = cam.current;
      return [ox + (x - c.x) * sx * c.k, oy - (y - c.y) * sy * c.k] as const;
    },
    [frame],
  );
  const toScreen = useCallback(
    (i: number) => worldToScreen(px[i], py[i]),
    [worldToScreen, px, py],
  );

  // ---------------------------------------------------------------- drawing (on demand only)
  const draw = useCallback(() => {
    raf.current = 0;
    const c = cvs.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const { w, h, dpr } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const k = cam.current.k;
    const css = getComputedStyle(document.documentElement);
    const font = css.getPropertyValue("--font-display") || "sans-serif";
    const sans = css.getPropertyValue("--font-sans") || "sans-serif";
    // a small field (one event) is always dots: density hexes only help with thousands of teams
    const detail = N < 200 ? 1 : smooth(DETAIL[0], DETAIL[1], k);
    const TEXT = css.getPropertyValue("--text") || "#eceef1";
    const ACCENT = css.getPropertyValue("--accent") || "#3fe6ff";
    const zoomedIn = detail >= 0.5;
    if (zoomedIn !== zoomedRef.current) {
      zoomedRef.current = zoomedIn;
      setZoomed(zoomedIn);
    }

    // the medians: the only chart furniture
    const [mx, my] = worldToScreen(50, 50);
    ctx.strokeStyle = TEXT;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(mx) + 0.5, 0);
    ctx.lineTo(Math.round(mx) + 0.5, h);
    ctx.moveTo(0, Math.round(my) + 0.5);
    ctx.lineTo(w, Math.round(my) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";

    // zoomed out: density hexes, binned in screen space
    if (detail < 1) {
      const R = 9;
      const hw = Math.sqrt(3) * R;
      const bins = new Map<string, number>();
      let top = 1;
      for (let i = 0; i < N; i++) {
        const [X, Y] = toScreen(i);
        if (X < -R || X > w + R || Y < -R || Y > h + R) continue;
        const row = Math.round(Y / (1.5 * R));
        const col = Math.round((X - (row & 1 ? hw / 2 : 0)) / hw);
        const key = `${col},${row}`;
        const n = (bins.get(key) ?? 0) + 1;
        bins.set(key, n);
        if (n > top) top = n;
      }
      ctx.globalAlpha = 1 - detail;
      for (const [key, n] of bins) {
        const [col, row] = key.split(",").map(Number);
        const cx = col * hw + (row & 1 ? hw / 2 : 0);
        const cy = row * 1.5 * R;
        ctx.fillStyle = TEXT;
        ctx.globalAlpha = (1 - detail) * (0.06 + 0.5 * (n / top) ** 0.7);
        ctx.beginPath();
        for (let s = 0; s < 6; s++) {
          const a = (Math.PI / 3) * s + Math.PI / 6;
          ctx.lineTo(cx + (R - 1) * Math.cos(a), cy + (R - 1) * Math.sin(a));
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // zoomed in: every team, brighter and larger with EDGE
    if (detail > 0) {
      ctx.globalAlpha = detail;
      const zr = Math.min(2, Math.sqrt(k / 2));
      for (let j = order.length - 1; j >= 0; j--) {
        const i = order[j];
        const [X, Y] = toScreen(i);
        if (X < -10 || X > w + 10 || Y < -10 || Y > h + 10) continue;
        const g = Math.max(0, Math.min(1, data.e[i]! / eMax));
        ctx.fillStyle = TEXT;
        ctx.globalAlpha = detail * (0.25 + 0.75 * g);
        ctx.beginPath();
        ctx.arc(X, Y, (1.2 + g * 2.8) * zr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // standouts: the top 10 always (the only glow); more labels as you zoom in, never overlapping
    const taken: [number, number, number][] = [];
    const fits = (x: number, y: number, tw: number) =>
      !taken.some(
        ([tx, ty, ww]) =>
          x < tx + ww + 6 && tx < x + tw + 6 && Math.abs(ty - y) < 16,
      );
    const budget = 10 + Math.round(detail * k * 8);
    let shown = 0;
    for (const i of order) {
      if (shown >= budget) break;
      const top10 = (rankOf.get(i) ?? 99) <= 10;
      if (!top10 && detail === 0) break;
      const [X, Y] = toScreen(i);
      if (X < 0 || X > w || Y < 0 || Y > h) continue;
      if (top10) {
        ctx.fillStyle = ACCENT;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(X, Y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = TEXT;
        ctx.beginPath();
        ctx.arc(X, Y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (i === picked.current || i === mineIdx) continue;
      ctx.font = `600 ${top10 ? 16 : 14}px ${font}`;
      const label = String(data.n[i]);
      const tw = ctx.measureText(label).width;
      // right, left, above, below: the first spot that is free (standouts in a cluster still get a label)
      const spot = [
        [X + 8, Y],
        [X - 8 - tw, Y],
        [X - tw / 2, Y - 16],
        [X - tw / 2, Y + 16],
      ].find(([x, y]) => fits(x, y, tw));
      if (!spot) continue;
      taken.push([spot[0], spot[1], tw]);
      ctx.fillStyle = TEXT;
      ctx.globalAlpha = top10 ? 1 : 0.75;
      ctx.fillText(label, spot[0], spot[1] + 5);
      ctx.globalAlpha = 1;
      shown++;
    }

    // my team, hover, selection
    const mark = (
      i: number,
      color: string,
      label: string | null,
      dashed = false,
    ) => {
      if (i < 0) return;
      const [X, Y] = toScreen(i);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [3, 3] : []);
      ctx.beginPath();
      ctx.arc(X, Y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (label) {
        ctx.font = `700 16px ${font}`;
        ctx.fillStyle = color;
        ctx.fillText(label, X + 14, Y - 8);
      }
    };
    mark(
      mineIdx,
      TEXT,
      mineIdx >= 0 ? `${data.n[mineIdx]} (yours)` : null,
      true,
    );
    mark(hover.current, TEXT, null);
    mark(
      picked.current,
      ACCENT,
      picked.current >= 0 ? String(data.n[picked.current]) : null,
    );
  }, [N, data, order, rankOf, eMax, toScreen, worldToScreen, mineIdx]);

  const redraw = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  }, [draw]);
  // canvas colours come from the theme tokens: repaint when the theme flips
  useEffect(() => {
    window.addEventListener("ot:theme", redraw);
    return () => window.removeEventListener("ot:theme", redraw);
  }, [redraw]);

  const zoomAt = useCallback(
    (sxp: number, syp: number, f: number) => {
      const { sx, sy, ox, oy } = frame();
      const c = cam.current;
      const k = Math.min(K_MAX, Math.max(K_MIN, c.k * f));
      const wx = c.x + (sxp - ox) / (sx * c.k);
      const wy = c.y - (syp - oy) / (sy * c.k);
      cam.current = {
        k,
        x: wx - (sxp - ox) / (sx * k),
        y: wy + (syp - oy) / (sy * k),
      };
      redraw();
    },
    [frame, redraw],
  );
  const reset = () => {
    cancelAnimationFrame(flight.current);
    cam.current = { x: 50, y: 50, k: 1 };
    picked.current = -1;
    redraw();
  };

  // ---------------------------------------------------------------- camera flights (a jump in calm / reduced motion)
  const flyTo = useCallback(
    (i: number, open = true) => {
      const { w } = size.current;
      const { sx } = frame();
      const k1 = Math.max(cam.current.k, 5);
      // On wide screens the card covers the right of the map: park the dot left of centre.
      const dx = open && w > 700 ? (w * 0.18) / (sx * k1) : 0;
      const to = { x: px[i] + dx, y: py[i], k: k1 };
      picked.current = i;
      cancelAnimationFrame(flight.current);
      const done = () => open && peek(`frc${data.n[i]}`, data.year, true);
      if (!motionOk() || !w) {
        cam.current = to;
        redraw();
        return done();
      }
      const from = { ...cam.current };
      const t0 = performance.now();
      const step = (t: number) => {
        const u = Math.min((t - t0) / 600, 1);
        const e = 1 - (1 - u) ** 3;
        cam.current = {
          x: from.x + (to.x - from.x) * e,
          y: from.y + (to.y - from.y) * e,
          k: Math.exp(
            Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e,
          ),
        };
        draw();
        if (u < 1) flight.current = requestAnimationFrame(step);
        else done();
      };
      flight.current = requestAnimationFrame(step);
    },
    [data, draw, redraw, frame, px, py],
  );

  useEffect(() => {
    const c = cvs.current!;
    const ro = new ResizeObserver(([e]) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width: w, height: h } = e.contentRect;
      size.current = { w, h, dpr };
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      redraw();
    });
    ro.observe(c);
    const onFly = (e: Event) => {
      const i = byNum.get(Number((e as CustomEvent).detail));
      if (i !== undefined) flyTo(i);
    };
    window.addEventListener("ot:fly", onFly);
    return () => {
      ro.disconnect();
      window.removeEventListener("ot:fly", onFly);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      cancelAnimationFrame(flight.current);
    };
  }, [byNum, flyTo, redraw]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // ---------------------------------------------------------------- pointer: pan, pinch, wheel, hover, tap
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = cvs.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const hit = (x: number, y: number, slop: number) => {
    let best = -1;
    let bd = slop * slop;
    // zoomed out only the labelled top 10 are targets; zoomed in, any dot
    const pool = N >= 200 && cam.current.k < DETAIL[0] ? order.slice(0, 10) : order;
    for (const i of pool) {
      const [X, Y] = toScreen(i);
      const d = (X - x) ** 2 + (Y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };
  useEffect(() => {
    const c = cvs.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(flight.current);
      const r = c.getBoundingClientRect();
      zoomAt(
        e.clientX - r.left,
        e.clientY - r.top,
        Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)),
      );
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(flight.current);
    cvs.current!.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current;
    const prev = p.get(e.pointerId);
    if (!prev) {
      if (e.pointerType !== "mouse") return;
      const [x, y] = local(e);
      const i = hit(x, y, 14);
      if (i !== hover.current) {
        hover.current = i;
        cvs.current!.style.cursor = i >= 0 ? "pointer" : "grab";
        redraw();
      }
      setTip(i >= 0 ? { i, x, y } : null);
      return;
    }
    const { sx, sy } = frame();
    if (p.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      cam.current.x -= dx / (sx * cam.current.k);
      cam.current.y += dy / (sy * cam.current.k);
      setTip(null);
      redraw();
    } else if (p.size === 2) {
      const [a, b] = [...p.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a2, b2] = [...p.values()];
      moved.current += 10;
      const [mx, my] = local({
        clientX: (a2.x + b2.x) / 2,
        clientY: (a2.y + b2.y) / 2,
      });
      if (d0 > 0) zoomAt(mx, my, Math.hypot(a2.x - b2.x, a2.y - b2.y) / d0);
      return;
    }
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: React.PointerEvent) => {
    const was = ptrs.current.size;
    ptrs.current.delete(e.pointerId);
    if (was !== 1 || moved.current >= 6) return;
    const [x, y] = local(e);
    const i = hit(x, y, e.pointerType === "mouse" ? 14 : 24);
    if (i >= 0) {
      picked.current = i;
      setTip(null);
      redraw();
      peek(`frc${data.n[i]}`, data.year, true);
    }
  };

  // ---------------------------------------------------------------- search (local, instant)
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const num = /^\d+$/.test(t);
    const out: number[] = [];
    const exact = num ? byNum.get(Number(t)) : undefined;
    if (exact !== undefined) out.push(exact);
    for (const i of order) {
      if (out.length >= 6) break;
      if (
        i !== exact &&
        (num
          ? String(data.n[i]).startsWith(t)
          : data.name[i].toLowerCase().includes(t))
      )
        out.push(i);
    }
    return out;
  }, [q, byNum, order, data]);
  // An exact team number flies there as you type.
  useEffect(() => {
    const t = q.trim();
    if (/^\d{1,5}$/.test(t) && byNum.has(Number(t)))
      flyTo(byNum.get(Number(t))!, false);
  }, [q, byNum, flyTo]);

  const row = (i: number, k: number, listbox: boolean) => {
    const rank = rankOf.get(i);
    const body = (
      <>
        <span className="rk">{rank ?? "—"}</span>
        <Avatar team={data.n[i]} year={data.year} />
        <span className={`team-num${hot(rank)}`}>{data.n[i]}</span>
        <span className="nm">{data.name[i]}</span>
        <EdgeGauge edge={data.e[i]} />
      </>
    );
    return listbox ? (
      <li
        key={i}
        id={`gr-${k}`}
        role="option"
        aria-selected={k === active}
        onMouseMove={() => setActive(k)}
        onClick={() => flyTo(i)}
      >
        {body}
      </li>
    ) : (
      <li key={i}>
        <button type="button" onClick={() => flyTo(i)}>
          {body}
        </button>
      </li>
    );
  };

  return (
    <section
      className={`home${full ? " full" : ""}${bare ? " bare" : ""}`}
      aria-label={bare ? "Map of the field" : "Find a team"}
    >
      {bare ? null : (
        <div className="home-side">
          <h1>Find a team.</h1>
          <p className="home-sub">
            {title} · {N.toLocaleString()} teams
          </p>
          <div className="find">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="10.5" cy="10.5" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <input
              type="search"
              role="combobox"
              aria-label="Team number or name"
              aria-expanded={results.length > 0}
              aria-controls="home-results"
              aria-activedescendant={
                results[active] !== undefined ? `gr-${active}` : undefined
              }
              placeholder="Team number or name"
              value={q}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown")
                  (e.preventDefault(),
                    setActive((a) => Math.min(a + 1, results.length - 1)));
                else if (e.key === "ArrowUp")
                  (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
                else if (e.key === "Enter" && results[active] !== undefined)
                  (e.preventDefault(), flyTo(results[active]));
                else if (e.key === "Escape") setQ("");
              }}
            />
            <kbd aria-hidden>/</kbd>
          </div>

          {q.trim() ? (
            <ul
              className="rows"
              id="home-results"
              role="listbox"
              aria-label="Matching teams"
            >
              {results.length ? (
                results.map((i, k) => row(i, k, true))
              ) : (
                <li className="status-line">Nobody matches that.</li>
              )}
            </ul>
          ) : (
            <>
              {mineIdx >= 0 ? (
                <div className="home-block">
                  <h2>Your team</h2>
                  <ul className="rows">{row(mineIdx, 0, false)}</ul>
                </div>
              ) : null}
              <details className="home-block" open>
                <summary>
                  <h2>Top 10 by EDGE</h2>
                </summary>
                <ol className="rows">
                  {order.slice(0, 10).map((i, k) => row(i, k, false))}
                </ol>
                <Link className="more-link" href={`/teams?year=${data.year}&view=list`}>
                  All {N.toLocaleString()} teams →
                </Link>
              </details>
            </>
          )}
        </div>
      )}

      <div className="home-map">
        <canvas
          ref={cvs}
          role="img"
          aria-label={`Map of ${N.toLocaleString()} teams by offense (up) and defense (across). Use the search or the Top 10 list to reach a team.`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={(e) => ptrs.current.delete(e.pointerId)}
          onPointerLeave={() => {
            if (hover.current >= 0) {
              hover.current = -1;
              setTip(null);
              redraw();
            }
          }}
          onDoubleClick={(e) => {
            const [x, y] = local(e);
            zoomAt(x, y, 2);
          }}
        />
        <span className="axis-y" aria-hidden>
          Offense →
        </span>
        <span className="axis-x" aria-hidden>
          Defense →
        </span>
        {tip ? (
          <div
            className="map-tip"
            style={{ left: tip.x, top: tip.y }}
            aria-hidden
          >
            <b>{data.n[tip.i]}</b>
            <span>{data.name[tip.i]}</span>
            <EdgeGauge edge={data.e[tip.i]} size="xs" />
          </div>
        ) : null}
        <p className="map-key">
          {zoomed
            ? "Each dot is a team. Brighter: more EDGE."
            : "Shade: how many teams. Labelled: the top 10 by EDGE. Zoom in for every team."}
        </p>
        <div className="map-ctl">
          <button
            type="button"
            className="ghost expand"
            aria-pressed={full}
            onClick={() => setFull((f) => !f)}
          >
            {full ? "Close map" : "Expand map"}
          </button>
          <div className="zoom">
            <button
              type="button"
              className="ghost"
              aria-label="Zoom in"
              onClick={() =>
                zoomAt(size.current.w / 2, size.current.h / 2, 1.8)
              }
            >
              +
            </button>
            <button
              type="button"
              className="ghost"
              aria-label="Zoom out"
              onClick={() =>
                zoomAt(size.current.w / 2, size.current.h / 2, 1 / 1.8)
              }
            >
              −
            </button>
            <button type="button" className="ghost" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
