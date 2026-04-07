import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Builder, By, Capabilities, type WebDriver } from "selenium-webdriver";

const DRIVER_HOST = "127.0.0.1";
const DRIVER_PORT = 4480;
const NATIVE_DRIVER_PORT = 4481;
const STARTUP_TIMEOUT_MS = 60_000;

const repoRoot = requireEnv("CHILLA_TAURI_E2E_REPO_ROOT");
const appBinaryPath = requireEnv("CHILLA_TAURI_E2E_APP");
const webkitDriverPath = requireEnv("CHILLA_TAURI_E2E_WEBKIT_DRIVER");
const startupPath = requireEnv("CHILLA_TAURI_E2E_STARTUP_PATH");
const expectedText = requireEnv("CHILLA_TAURI_E2E_EXPECT_TEXT");

let fixtureRoot: string | undefined;
let tauriDriver: ChildProcess | undefined;
let driver: WebDriver | undefined;

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});

async function main(): Promise<void> {
  try {
    fixtureRoot = await mkdtemp(join(tmpdir(), "chilla-epub-preview-"));
    const launcherPath = await createAppLauncher(fixtureRoot);

    tauriDriver = spawnTauriDriver();
    await waitForPort(DRIVER_HOST, DRIVER_PORT, STARTUP_TIMEOUT_MS);
    driver = await createWebDriver(launcherPath);

    try {
      await driver.wait(async () => {
        const errorBanners = await driver!.findElements(
          By.css(".banner--error"),
        );
        if (errorBanners.length > 0) {
          const errorText = await errorBanners[0]!.getText();
          throw new Error(`Desktop app showed an error banner: ${errorText}`);
        }

        const bodyText = await driver!.executeScript<string>(
          "return document.body ? document.body.innerText : '';",
        );
        return bodyText.includes(expectedText);
      }, STARTUP_TIMEOUT_MS);
    } catch (error: unknown) {
      const bodyText = await driver.executeScript<string>(
        "return document.body ? document.body.innerText : '';",
      );
      const bodyHtml = await driver.executeScript<string>(
        "return document.body ? document.body.innerHTML : '';",
      );
      console.error(`Timeout body excerpt:\n${bodyText.slice(0, 1200)}`);
      console.error(
        `DOM contains EPUB wrapper: ${bodyHtml.includes("file-preview--epub")}`,
      );
      throw error;
    }

    const bodyText = await driver.executeScript<string>(
      "return document.body ? document.body.innerText : '';",
    );
    const bodyHtml = await driver.executeScript<string>(
      "return document.body ? document.body.innerHTML : '';",
    );

    console.log(`Verified preview text: ${expectedText}`);
    console.log(
      `EPUB HTML present: ${bodyHtml.includes("file-preview--epub")}`,
    );
    console.log(bodyText.slice(0, 400));
  } finally {
    if (driver !== undefined) {
      await driver.quit().catch(() => {});
    }
    if (tauriDriver !== undefined) {
      tauriDriver.kill("SIGTERM");
    }
    if (fixtureRoot !== undefined) {
      await rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function waitForPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const attempt = () => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

async function createAppLauncher(root: string): Promise<string> {
  const launcherPath = join(root, "launch-chilla.sh");

  await writeFile(
    launcherPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `exec ${JSON.stringify(appBinaryPath)} ${JSON.stringify(startupPath)}`,
      "",
    ].join("\n"),
  );
  await chmod(launcherPath, 0o755);

  return launcherPath;
}

function spawnTauriDriver(): ChildProcess {
  return spawn(
    "tauri-driver",
    [
      "--native-driver",
      webkitDriverPath,
      "--native-host",
      DRIVER_HOST,
      "--native-port",
      String(NATIVE_DRIVER_PORT),
      "--port",
      String(DRIVER_PORT),
    ],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function createWebDriver(launcherPath: string): Promise<WebDriver> {
  const capabilities = new Capabilities();
  capabilities.setBrowserName("wry");
  capabilities.set("tauri:options", {
    application: launcherPath,
  });

  return await new Builder()
    .usingServer(`http://${DRIVER_HOST}:${DRIVER_PORT}/`)
    .withCapabilities(capabilities)
    .build();
}
