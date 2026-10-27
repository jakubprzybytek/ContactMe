import { defineConfig, devices } from "@playwright/test";
import { testStage } from "./tests/stage";

// E2E tests against a deployed stage: npx sst shell --stage <stage> -- npm run test:e2e
const { siteUrl } = testStage();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: siteUrl, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
