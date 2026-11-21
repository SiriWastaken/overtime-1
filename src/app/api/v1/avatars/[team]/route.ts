// Team avatar (FIRST's 40×40 PNG, served by TBA's team media endpoint). Responses go through the shared TbaClient,
// so each team/season is fetched once and then revalidated with its ETag. Missing avatars, a missing API key or a
// TBA outage all return a transparent 1×1 PNG, so <img> tags never show a broken image.

import { TbaClient } from '@/lib/tba';

interface Media {
  type: string;
  details?: { base64Image?: unknown };
}
const isMedia = (x: unknown): x is Media[] => Array.isArray(x) && x.every((m) => typeof m === 'object' && m !== null && typeof (m as Media).type === 'string');

const client = new TbaClient(undefined, 4, 1);
const BLANK = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const png = (body: Buffer, maxAge: number) =>
  new Response(new Uint8Array(body), { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${maxAge}` } });

export async function GET(req: Request, ctx: { params: Promise<{ team: string }> }) {
  const { team } = await ctx.params;
  const year = Number(new URL(req.url).searchParams.get('year'));
  if (!/^\d{1,5}$/.test(team) || !(year >= 2018 && year <= 2100)) return png(BLANK, 86400); // FIRST avatars start in 2018
  try {
    const r = await client.get(`/team/frc${team}/media/${year}`, isMedia);
    const b64 = r.data?.find((m) => m.type === 'avatar')?.details?.base64Image;
    if (typeof b64 === 'string' && b64.length < 200_000) return png(Buffer.from(b64, 'base64'), 7 * 86400);
    return png(BLANK, 86400);
  } catch {
    return png(BLANK, 600); // TBA unreachable or no key: try again later
  }
}
