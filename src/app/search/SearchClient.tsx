'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/bits';

interface SearchClientProps {
  year: number;
  teams: [number, string, string, number][]; // [num, nickname, city, rank]
  events: [string, string, string, string][]; // [key, name, city, status]
}

export function SearchClient({ year, teams, events }: SearchClientProps) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      return {
        teams: teams.slice(0, 16),
        events: events.slice(0, 8),
      };
    }

    const isNum = /^\d+$/.test(query);

    const mTeams = teams.filter(([num, nick, city]) => {
      if (isNum && String(num).startsWith(query)) return true;
      return (
        String(num).includes(query) ||
        nick.toLowerCase().includes(query) ||
        city.toLowerCase().includes(query)
      );
    });

    const mEvents = events.filter(([key, name, city]) => {
      return (
        key.toLowerCase().includes(query) ||
        name.toLowerCase().includes(query) ||
        city.toLowerCase().includes(query)
      );
    });

    return {
      teams: mTeams.slice(0, 30),
      events: mEvents.slice(0, 20),
    };
  }, [q, teams, events]);

  return (
    <div className="search-page-workspace">
      <div className="search-input-container">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Instant search by team number, nickname, city, or event code..."
          className="search-large-input"
        />
        {q ? (
          <button type="button" className="clear-btn" onClick={() => setQ('')} aria-label="Clear search">
            ✕
          </button>
        ) : null}
      </div>

      <div className="search-results-grid">
        {/* Teams Column */}
        <div className="results-column">
          <div className="results-head">
            <h3>Teams</h3>
            <span className="muted">{filtered.teams.length} found</span>
          </div>

          <div className="search-items-list">
            {filtered.teams.map(([num, nick, city, rank]) => (
              <Link key={num} href={`/teams/${num}?year=${year}`} className="search-item-card">
                <Avatar team={num} year={year} size={28} />
                <div className="search-item-details">
                  <div className="search-item-title">
                    <span className="search-num">#{num}</span>
                    <span className="search-nick">{nick}</span>
                  </div>
                  <span className="search-sub muted">{city || 'FRC Team'}</span>
                </div>
                <span className="search-rank">#{rank}</span>
              </Link>
            ))}
            {filtered.teams.length === 0 ? (
              <div className="empty-panel small">
                <span className="muted">No teams match “{q}”.</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Events Column */}
        <div className="results-column">
          <div className="results-head">
            <h3>Events</h3>
            <span className="muted">{filtered.events.length} found</span>
          </div>

          <div className="search-items-list">
            {filtered.events.map(([key, name, city, st]) => (
              <Link key={key} href={`/events/${key}?year=${year}`} className="search-item-card">
                <div className="search-item-details">
                  <div className="search-item-title">
                    <span className="search-event-name">{name}</span>
                  </div>
                  <span className="search-sub muted">{city} · {key}</span>
                </div>
                <span className={`status-pill ${st}`}>{st}</span>
              </Link>
            ))}
            {filtered.events.length === 0 ? (
              <div className="empty-panel small">
                <span className="muted">No events match “{q}”.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
