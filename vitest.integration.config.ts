import { defineConfig } from "vitest/config";

// API tests against a deployed stage: npx sst shell --stage <stage> -- npm run test:integration
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
