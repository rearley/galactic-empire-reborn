import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Single build-time accent color (FR-001) — green chosen for v1
        accent: '#4ade80', // = Tailwind green-400
      },
    },
  },
  plugins: [],
};

export default config;
