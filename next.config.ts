import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['node:sqlite'],
  // Retired screens. Query strings (year, event) carry over.
  async redirects() {
    return [
      { source: '/pick', destination: '/lab?tab=alliance', permanent: true }, // Alliance selection is now in Lab
      { source: '/predict', destination: '/compare', permanent: true },
      { source: '/scout', destination: '/teams', permanent: true },
      { source: '/directory', destination: '/teams', permanent: true },
    ];
  },
};

export default config;
