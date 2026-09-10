import type { Config } from 'jest';

/**
 * Minimal Jest config for `packages/wire`, matching the backend's setup
 * (ts-jest, node environment) with nothing this package doesn't need — no
 * Prisma bootstrap, no global setup, no DB.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
};

export default config;
