import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: [
    "<rootDir>/test/prisma-schema",
    "<rootDir>/test/auth",
    "<rootDir>/test/unit",
    "<rootDir>/test/integration",
    "<rootDir>/test/e2e",
    "<rootDir>/test/game",
    "<rootDir>/test/gateway",
    "<rootDir>/test/balance",
    "<rootDir>/test/mail",
    "<rootDir>/test/team",
    "<rootDir>/test/invariants",
  ],
  testMatch: ["**/*.spec.ts"],
  globalSetup: "<rootDir>/test/prisma-schema/helpers/global-setup.ts",
  // Galaxy generation is O((2*UNIVMAX+1)^2) and several suites regenerate the
  // whole world per run. At the deployed UNIVMAX=100 that is 40_401 sectors
  // each time, which took the suite from ~4 to ~10 minutes. Tests exercise
  // generation LOGIC, not world size, so they run a small galaxy.
  //
  // The one property that genuinely depends on the deployed size -- that the
  // galaxy is large enough that no ship's weapon reach dominates it -- is
  // asserted against backend/config/game.config.json directly, so shrinking
  // the galaxy here cannot mask a bad deployed value.
  // @see test/integration/range-and-ai.spec.ts
  setupFiles: ["<rootDir>/test/helpers/test-galaxy-size.ts"],
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
