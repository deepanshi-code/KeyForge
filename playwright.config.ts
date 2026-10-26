import { defineConfig, devices } from "@playwright/test";

/** True on GitHub Actions. (Read via globalThis so the app's tsconfig needn't include Node types.) */
const CI = Boolean((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI);

/** Browser tests run against the production build, exactly as deployed. */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: CI ? 1 : 0,
  reporter: CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4174/",
    serviceWorkers: "block", // keep every test on fresh files
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx vite preview --port 4174 --strictPort",
    url: "http://localhost:4174/",
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
