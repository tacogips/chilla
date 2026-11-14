import { spawn, type ChildProcess } from "node:child_process";
import { chmod, copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  Builder,
  By,
  Capabilities,
  type WebDriver,
  type WebElement,
} from "selenium-webdriver";

const DRIVER_HOST = "127.0.0.1";
const DRIVER_PORT = 4480;
const NATIVE_DRIVER_PORT = 4481;
const STARTUP_TIMEOUT_MS = 60_000;

const repoRoot = requireEnv("CHILLA_TAURI_E2E_REPO_ROOT");
const appBinaryPath = requireEnv("CHILLA_TAURI_E2E_APP");
const webkitDriverPath = requireEnv("CHILLA_TAURI_E2E_WEBKIT_DRIVER");
const startupPath = requireEnv("CHILLA_TAURI_E2E_STARTUP_PATH");

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
    fixtureRoot = await mkdtemp(join(tmpdir(), "chilla-epub-toc-location-"));
    const copiedStartupPath = await copyStartupFixture(fixtureRoot);
    const launcherPath = await createAppLauncher(
      fixtureRoot,
      copiedStartupPath,
    );

    tauriDriver = spawnTauriDriver();
    await waitForPort(DRIVER_HOST, DRIVER_PORT, STARTUP_TIMEOUT_MS);

    driver = await createWebDriver(launcherPath);
    await waitForReaderReady();

    const initialPageLabel = await readPageLabel();
    await ensureTocOpen();
    const tocTarget = await findTocNavigationTarget();
    const tocTargetLabel = await tocTarget.getText();
    await tocTarget.click();

    await driver.wait(async () => {
      return (await readPageLabel()) !== initialPageLabel;
    }, STARTUP_TIMEOUT_MS);
    const relocatedPageLabel = await readPageLabel();

    await driver.wait(async () => {
      return (await readActiveTocLabel()) === tocTargetLabel;
    }, STARTUP_TIMEOUT_MS);

    await driver
      .findElement(By.css('button[aria-label="Reload current file"]'))
      .click();
    await waitForReaderReady();
    await ensureTocOpen();

    await driver.wait(async () => {
      return (await readPageLabel()) === relocatedPageLabel;
    }, STARTUP_TIMEOUT_MS);
    await driver.wait(async () => {
      return (await readActiveTocLabel()) === tocTargetLabel;
    }, STARTUP_TIMEOUT_MS);

    await driver.quit();
    driver = undefined;

    driver = await createWebDriver(launcherPath);
    await waitForReaderReady();
    await ensureTocOpen();

    await driver.wait(async () => {
      return (await readPageLabel()) === relocatedPageLabel;
    }, STARTUP_TIMEOUT_MS);
    await driver.wait(async () => {
      return (await readActiveTocLabel()) === tocTargetLabel;
    }, STARTUP_TIMEOUT_MS);

    console.log(`Initial page label: ${initialPageLabel}`);
    console.log(`Relocated page label: ${relocatedPageLabel}`);
    console.log(`Active TOC label: ${tocTargetLabel}`);
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

async function copyStartupFixture(root: string): Promise<string> {
  const copiedPath = join(root, basename(startupPath));
  await copyFile(startupPath, copiedPath);
  return copiedPath;
}

async function waitForReaderReady(): Promise<void> {
  await driver!.wait(async () => {
    const errorBanners = await driver!.findElements(By.css(".banner--error"));
    if (errorBanners.length > 0) {
      const errorText = await errorBanners[0]!.getText();
      throw new Error(`Desktop app showed an error banner: ${errorText}`);
    }

    const pageLabels = await driver!.findElements(
      By.css(".epub-reader__page-label"),
    );
    if (pageLabels.length === 0) {
      return false;
    }

    const pageLabel = await pageLabels[0]!.getText();
    if (!pageLabel.startsWith("Page ")) {
      return false;
    }

    const bodyHtml = await driver!.executeScript<string>(
      "return document.body ? document.body.innerHTML : '';",
    );
    return bodyHtml.includes("file-preview--epub");
  }, STARTUP_TIMEOUT_MS);
}

async function ensureTocOpen(): Promise<void> {
  const buttons = await driver!.findElements(By.css(".toc__button"));
  if (buttons.length > 0) {
    return;
  }

  await driver!
    .findElement(By.css('button[aria-label="Toggle table of contents"]'))
    .click();

  await driver!.wait(async () => {
    const tocButtons = await driver!.findElements(By.css(".toc__button"));
    return tocButtons.length > 0;
  }, STARTUP_TIMEOUT_MS);
}

async function findTocNavigationTarget(): Promise<WebElement> {
  const buttons = await driver!.findElements(
    By.css(".toc__button:not([disabled])"),
  );
  if (buttons.length < 2) {
    throw new Error("Expected at least two enabled EPUB TOC buttons");
  }

  for (let index = buttons.length - 1; index >= 0; index -= 1) {
    const button = buttons[index];
    if (button === undefined) {
      continue;
    }

    const className = await button.getAttribute("class");
    if (!className.includes("toc__button--active")) {
      return button;
    }
  }

  throw new Error(
    "Expected an EPUB TOC target distinct from the active location",
  );
}

async function readPageLabel(): Promise<string> {
  return await driver!
    .findElement(By.css(".epub-reader__page-label"))
    .getText();
}

async function readActiveTocLabel(): Promise<string> {
  return await driver!.findElement(By.css(".toc__button--active")).getText();
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

async function createAppLauncher(
  root: string,
  pathToOpen: string,
): Promise<string> {
  const launcherPath = join(root, "launch-chilla.sh");

  await writeFile(
    launcherPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `exec ${JSON.stringify(appBinaryPath)} ${JSON.stringify(pathToOpen)}`,
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
