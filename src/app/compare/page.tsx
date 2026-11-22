import { defaultYear, resolveYear, teamRating, teamHistory, teamMeta, teamRatings } from '@/lib/queries';
import { CompareView } from './CompareView';

export const metadata = {
  title: 'Compare Teams · Overtime 1',
  description: 'Side-by-side comparison of 2-4 FRC teams across xPts ratings, scoring components, uncertainty bounds, and simulated head-to-head odds.',
};

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const year = resolveYear(sp.year) ?? defaultYear() ?? 2026;
  const teamsParam = sp.teams ?? '';

  const parsedNumbers = teamsParam
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 4);

  // If no teams specified, default to top 2 contenders
  const finalNumbers = parsedNumbers.length > 0 ? parsedNumbers : [1690, 254];

  const loadedTeams = finalNumbers.flatMap((num) => {
    const key = `frc${num}`;
    const r = teamRating(year, key);
    const meta = teamMeta(key);
    if (!r) return [];
    const hist = teamHistory(year, key);
    return [
      {
        key,
        number: num,
        nickname: meta?.nickname ?? null,
        city: meta?.city ?? null,
        state_prov: meta?.state_prov ?? null,
        country: meta?.country ?? null,
        rank: r.rank,
        net: r.rating.net,
        sd: r.rating.total.sd,
        matches: r.rating.matches,
        components: {
          auto: r.rating.components.auto ?? { mean: 0, sd: 0 },
          teleop: r.rating.components.teleop ?? { mean: 0, sd: 0 },
          endgame: r.rating.components.endgame ?? { mean: 0, sd: 0 },
          defense: r.rating.defense ?? null,
          fouls: r.rating.fouls ?? { mean: 0, sd: 0 },
        },
        history: hist.map((h) => ({ t: h.t, mean: h.mean })),
      },
    ];
  });

  const { rows: allRows } = teamRatings(year, { limit: 100 });
  const allTeamNumbers = allRows.map((r) => ({ number: r.number, nickname: r.nickname ?? '' }));

  return (
    <div className="page-container">
      <div className="page-head">
        <div>
          <h1>
            Compare Teams <em>{year}</em>
          </h1>
          <p className="sub">
            Side-by-side analysis of 2–4 teams across ratings, scoring components, trends, and head-to-head matchup odds.
          </p>
        </div>
      </div>

      <CompareView year={year} initialTeams={loadedTeams} allTeamNumbers={allTeamNumbers} />
    </div>
  );
}
