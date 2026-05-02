import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: [
    "<rootDir>/test/prisma-schema",
    "<rootDir>/test/unit",
    "<rootDir>/test/integration",
    "<rootDir>/test/e2e",
    "<rootDir>/test/game",
  ],
  testMatch: ["**/*.spec.ts"],
  globalSetup: "<rootDir>/test/prisma-schema/helpers/global-setup.ts",
  testTimeout: 30000,
  // All test suites share the ge_test Postgres database. Running in parallel
  // causes truncateAll() in one worker to wipe data written by another.
  // Sequential execution is the simplest correct isolation strategy.
  maxWorkers: 1,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
};

export default config;
