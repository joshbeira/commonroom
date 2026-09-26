import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1040 },
      },
    },
  ],
  webServer: {
    command:
      process.platform === "win32"
        ? "..\\.venv\\Scripts\\python.exe ..\\scripts\\e2e_server.py"
        : "python ../scripts/e2e_server.py",
    url: "http://127.0.0.1:8001/healthz",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
