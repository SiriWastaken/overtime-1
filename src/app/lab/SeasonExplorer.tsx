'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/bits';
import { Why } from '@/components/ui';

interface ExplorerTeam {
  number: number;
  nickname: string;
  auto: number;
  teleop: number;
  endgame: number;
  net: number;
  defense: number;
}

export function SeasonExplorer({
  year,
  teams,
}: {
  year: number;
  teams: ExplorerTeam[];
}) {
  const [xAxis, setXAxis] = useState<'auto' | 'defense'>('auto');
  const [hovered, setHovered] = useState<ExplorerTeam | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Season records
  const topAuto = [...teams].sort((a, b) => b.auto - a.auto)[0];
  const topTeleop = [...teams].sort((a, b) => b.teleop - a.teleop)[0];
  const topNet = [...teams].sort((a, b) => b.net - a.net)[0];
  const topDef = [...teams].sort((a, b) => b.defense - a.defense)[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Ranges
    const xVals = teams.map((t) => (xAxis === 'auto' ? t.auto : t.defense));
    const yVals = teams.map((t) => t.teleop);
    const minX = 0;
    const maxX = Math.max(10, Math.ceil(Math.max(...xVals, 10) / 5) * 5);
    const minY = 0;
    const maxY = Math.max(20, Math.ceil(Math.max(...yVals, 20) / 10) * 10);

    const pad = 40;
    const pw = w - pad * 2;
    const ph = h - pad * 2;

    // Background & Grid
    ctx.fillStyle = '#06080b';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    // Grid lines
    for (let x = minX; x <= maxX; x += maxX > 30 ? 10 : 5) {
      const cx = pad + ((x - minX) / (maxX - minX)) * pw;
      ctx.beginPath();
      ctx.moveTo(cx, pad);
      ctx.lineTo(cx, h - pad);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(x), cx - 6, h - pad + 14);
    }

    for (let y = minY; y <= maxY; y += maxY > 60 ? 20 : 10) {
      const cy = h - pad - ((y - minY) / (maxY - minY)) * ph;
      ctx.beginPath();
      ctx.moveTo(pad, cy);
      ctx.lineTo(w - pad, cy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(y), 12, cy + 4);
    }

    // Axis labels
    ctx.fillStyle = 'var(--text-2)';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${xAxis === 'auto' ? 'Autonomous' : 'Defense Suppression'} (xPts)`, w / 2 - 40, h - 10);
    ctx.save();
    ctx.translate(14, h / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Teleop Points (xPts)', 0, 0);
    ctx.restore();

    // Draw dots
    for (const t of teams) {
      const vx = xAxis === 'auto' ? t.auto : t.defense;
      const vy = t.teleop;
      const cx = pad + ((vx - minX) / (maxX - minX)) * pw;
      const cy = h - pad - ((vy - minY) / (maxY - minY)) * ph;

      const isHover = hovered?.number === t.number;
      ctx.fillStyle = isHover ? '#3fe6ff' : t.net > 35 ? '#4ade80' : 'rgba(63, 230, 255, 0.45)';
      ctx.beginPath();
      ctx.arc(cx, cy, isHover ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      if (isHover) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, [teams, xAxis, hovered]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const my = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const pad = 40;
    const pw = canvas.width - pad * 2;
    const ph = canvas.height - pad * 2;

    const xVals = teams.map((t) => (xAxis === 'auto' ? t.auto : t.defense));
    const yVals = teams.map((t) => t.teleop);
    const minX = 0;
    const maxX = Math.max(10, Math.ceil(Math.max(...xVals, 10) / 5) * 5);
    const minY = 0;
    const maxY = Math.max(20, Math.ceil(Math.max(...yVals, 20) / 10) * 10);

    let nearest: ExplorerTeam | null = null;
    let minDist = 16;

    for (const t of teams) {
      const vx = xAxis === 'auto' ? t.auto : t.defense;
      const vy = t.teleop;
      const cx = pad + ((vx - minX) / (maxX - minX)) * pw;
      const cy = canvas.height - pad - ((vy - minY) / (maxY - minY)) * ph;
      const d = Math.hypot(cx - mx, cy - my);
      if (d < minDist) {
        minDist = d;
        nearest = t;
      }
    }

    setHovered(nearest);
  };

  return (
    <div className="season-explorer-panel">
      <div className="section-head">
        <div>
          <h3>Season Multi-Metric Explorer</h3>
          <p className="sub">
            2D component scatter plot across {teams.length.toLocaleString()} rated teams. Hover over any point to inspect individual robot contributions.
          </p>
        </div>
        <div className="axis-toggle">
          <span className="muted">X-Axis:</span>
          <button
            type="button"
            className={xAxis === 'auto' ? 'button small active' : 'button ghost small'}
            onClick={() => setXAxis('auto')}
          >
            Autonomous
          </button>
          <button
            type="button"
            className={xAxis === 'defense' ? 'button small active' : 'button ghost small'}
            onClick={() => setXAxis('defense')}
          >
            Defense Suppression
          </button>
        </div>
      </div>

      <div className="explorer-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={800}
          height={380}
          className="explorer-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
        />
        {hovered ? (
          <div className="point-tooltip">
            <span className="strong">#{hovered.number} {hovered.nickname}</span>
            <span>Net xPts: <strong>+{hovered.net.toFixed(1)}</strong></span>
            <span>Auto: +{hovered.auto.toFixed(1)} · Teleop: +{hovered.teleop.toFixed(1)}</span>
            <Link href={`/teams/${hovered.number}?year=${year}`} className="link">
              View team profile →
            </Link>
          </div>
        ) : null}
      </div>

      {/* Season Records */}
      <div className="season-records-grid">
        {topNet ? (
          <div className="record-card">
            <span className="record-label">HIGHEST NET XPTS</span>
            <span className="record-val">+{topNet.net.toFixed(1)} pts</span>
            <Link href={`/teams/${topNet.number}?year=${year}`} className="record-team">
              #{topNet.number} {topNet.nickname}
            </Link>
          </div>
        ) : null}
        {topAuto ? (
          <div className="record-card">
            <span className="record-label">TOP AUTONOMOUS CONTRIBUTOR</span>
            <span className="record-val">+{topAuto.auto.toFixed(1)} pts</span>
            <Link href={`/teams/${topAuto.number}?year=${year}`} className="record-team">
              #{topAuto.number} {topAuto.nickname}
            </Link>
          </div>
        ) : null}
        {topTeleop ? (
          <div className="record-card">
            <span className="record-label">TOP TELEOP CONTRIBUTOR</span>
            <span className="record-val">+{topTeleop.teleop.toFixed(1)} pts</span>
            <Link href={`/teams/${topTeleop.number}?year=${year}`} className="record-team">
              #{topTeleop.number} {topTeleop.nickname}
            </Link>
          </div>
        ) : null}
        {topDef ? (
          <div className="record-card">
            <span className="record-label">TOP DEFENSIVE SUPPRESSION</span>
            <span className="record-val">+{topDef.defense.toFixed(1)} pts</span>
            <Link href={`/teams/${topDef.number}?year=${year}`} className="record-team">
              #{topDef.number} {topDef.nickname}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
