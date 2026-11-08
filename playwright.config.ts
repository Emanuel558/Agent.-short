import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
const mockGemini = pathToFileURL(
  fileURLToPath(new URL("./tests/helpers/gemini-fetch.mjs", import.meta.url)),
).href;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          },
        }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AI_PROVIDER: "demo",
      // Override any real credentials inherited from a developer's Codespace.
      GEMINI_API_KEY: "autotube-e2e-gemini-key",
      GEMINI_MODEL: "gemini-2.5-flash",
      NODE_OPTIONS: `--import=${mockGemini}`,
      // Keep this loopback test server independent of the developer's deployment.
      APP_ORIGIN: "",
      CODESPACE_NAME: "",
      DATABASE_PATH: `./data/e2e-${process.pid}.sqlite`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
