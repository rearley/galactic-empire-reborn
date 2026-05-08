import type { Config } from 'jest';

/** Opt-in manual smoke test suite. Run with: npm run test:manual */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/manual'],
  testMatch: ['**/*.manual.spec.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

export default config;
