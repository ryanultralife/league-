import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        field: '#0b3d1e',
        chalk: '#f7f7f2',
        diamond: '#c98a2b',
        broadcast: '#0a0e1a',
        accent: '#ffd23f',
      },
      fontFamily: {
        score: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        broadcast: '0 4px 24px rgba(0,0,0,0.55)',
      },
    },
  },
  plugins: [],
};

export default config;
