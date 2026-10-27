import { defineConfig } from "vitest/config";

// Unit tests (npm test). API tests against a stage: vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
  },
});
