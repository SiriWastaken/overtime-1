import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['node:sqlite'],
  // Retired screens. Query strings (year, event) carry over.
  async redirects() {
    return [
      { source: '/lab', has: [{ type: 'query', key: 'tab', value: 'alliance' }], destination: '/pick', permanent: true }, // Pick is its own tab again
      { source: '/predict', destination: '/compare', permanent: true },
      { source: '/scout', destination: '/teams', permanent: true },
      { source: '/directory', destination: '/teams', permanent: true },
    ];
  },
};

export default config;
