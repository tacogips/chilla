import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

function resolveChromiumExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }

  try {
    const value = execSync("which chromium", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}

const chromiumExecutablePath = resolveChromiumExecutablePath();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:1420",
    headless: true,
    launchOptions: chromiumExecutablePath
      ? { executablePath: chromiumExecutablePath }
      : undefined,
  },
  webServer: {
    command: "bun run dev -- --host localhost",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
