import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') ?? 'Overtime 1';
  const desc = searchParams.get('desc') ?? 'Fast, beautiful FRC stats, Bayesian modeling, and verified backtests.';
  const badge = searchParams.get('badge') ?? 'FRC Analytics & Verified Models';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#06080b',
          color: '#eceef1',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '2px solid #3fe6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3fe6ff',
              fontWeight: 'bold',
              fontSize: '20px',
            }}
          >
            1
          </div>
          <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#eceef1', letterSpacing: '0.05em' }}>
            OVERTIME 1
          </span>
          <span
            style={{
              marginLeft: 'auto',
              backgroundColor: 'rgba(63, 230, 255, 0.12)',
              color: '#3fe6ff',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '15px',
              fontWeight: '600',
            }}
          >
            {badge}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '900px' }}>
          <h1
            style={{
              fontSize: title.length > 35 ? '48px' : '60px',
              fontWeight: 'bold',
              lineHeight: 1.15,
              color: '#ffffff',
              margin: 0,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              fontSize: '22px',
              lineHeight: 1.4,
              color: '#a9b0ba',
              margin: 0,
            }}
          >
            {desc}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: '20px',
            fontSize: '16px',
            color: '#7f8792',
          }}
        >
          <span>The Blue Alliance API v3 · Ridge Regression · Bayesian Shrinkage · Monte Carlo</span>
          <span style={{ color: '#3fe6ff' }}>overtime1.com</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
