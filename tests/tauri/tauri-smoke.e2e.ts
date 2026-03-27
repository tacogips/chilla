import { spawn, type ChildProcess } from "node:child_process";
import {
  access,
  chmod,
  constants as fsConstants,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  Builder,
  By,
  Capabilities,
  Key,
  until,
  type WebDriver,
  type WebElement,
} from "selenium-webdriver";

const DRIVER_PORT = 4444;
const NATIVE_DRIVER_PORT = 4445;
const DRIVER_HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 30_000;
const FIXTURE_NOTE_COUNT = 220;
const FIXTURE_README_TEXT =
  "This document comes from the real Tauri E2E fixture workspace.";
const FIXTURE_MP3_NAME = "file_example_MP3_1MG.mp3";
const FIXTURE_MP4_NAME = "file_example_MP4_480_1_5MG.mp4";

const repoRoot = requireEnv("CHILLA_TAURI_E2E_REPO_ROOT");
const appBinaryPath = requireEnv("CHILLA_TAURI_E2E_APP");
const webkitDriverPath = requireEnv("CHILLA_TAURI_E2E_WEBKIT_DRIVER");

let fixtureRoot: string | undefined;
let fixtureWorkspaceRoot: string | undefined;
let tauriDriver: ChildProcess | undefined;
let driver: WebDriver | undefined;
let tauriDriverLogs = "";
let tauriDriverFailure: Error | undefined;
let isShuttingDown = false;

void main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  try {
    await access(appBinaryPath, fsConstants.X_OK);
    fixtureRoot = await mkdtemp(join(tmpdir(), "chilla-tauri-e2e-"));
    fixtureWorkspaceRoot = await createWorkspaceFixture(fixtureRoot);
    const launcherPath = await createAppLauncher(fixtureRoot);
    await access(launcherPath, fsConstants.X_OK);

    tauriDriver = startTauriDriver();
    await waitForPort(DRIVER_HOST, DRIVER_PORT, STARTUP_TIMEOUT_MS);
    ensureTauriDriverHealthy();

    driver = await createWebDriver(launcherPath);
    ensureTauriDriverHealthy();

    await runStep("verify workspace startup", async () => {
      await verifyWorkspaceLoads(driver!, fixtureWorkspaceRoot!);
    });
    ensureTauriDriverHealthy();

    await runStep("verify file tree render", async () => {
      await verifyFileTreeRenders(driver!);
    });
    ensureTauriDriverHealthy();

    await runStep("verify filter focus retention", async () => {
      await verifyFilterFocus(driver!);
    });
    ensureTauriDriverHealthy();

    await runStep("verify lazy loading", async () => {
      await verifyLazyLoading(driver!);
    });
    ensureTauriDriverHealthy();

    ({ driver, tauriDriver } = await restartDesktopSession(launcherPath));
    ensureTauriDriverHealthy();

    await runStep("verify workspace restart", async () => {
      await verifyWorkspaceLoads(driver!, fixtureWorkspaceRoot!);
    });
    ensureTauriDriverHealthy();

    await runStep("verify server-side filtering", async () => {
      await verifyServerSideFiltering(driver!);
    });
    ensureTauriDriverHealthy();

    await runStep("verify README preview styling", async () => {
      await verifyReadmePreview(driver!);
    });
    ensureTauriDriverHealthy();

    await runStep("verify MP4 inline playback preview", async () => {
      await verifyVideoPreview(driver!);
    });
    ensureTauriDriverHealthy();

    await runStep("verify MP3 inline playback preview", async () => {
      await verifyAudioPreview(driver!);
    });
    ensureTauriDriverHealthy();

    console.log("Linux Tauri E2E coverage passed.");
  } finally {
    await shutdown(driver, tauriDriver);
    await cleanupFixture(fixtureRoot);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function startTauriDriver(): ChildProcess {
  if (fixtureWorkspaceRoot === undefined) {
    throw new Error("Fixture workspace path is not initialized.");
  }

  const child = spawn(
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
      env: {
        ...process.env,
        CHILLA_TAURI_E2E_REAL_APP: appBinaryPath,
        CHILLA_TAURI_E2E_STARTUP_PATH: fixtureWorkspaceRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", (chunk: Buffer | string) => {
    tauriDriverLogs += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    tauriDriverLogs += chunk.toString();
  });

  child.once("error", (error: Error) => {
    tauriDriverFailure = new Error(
      `Failed to start tauri-driver.${tauriDriverDetail()}\n\n${formatError(error)}`,
    );
  });
  child.once("exit", (code, signal) => {
    if (isShuttingDown || code === 0 || signal === "SIGTERM") {
      return;
    }

    tauriDriverFailure = new Error(
      `tauri-driver exited before the test completed (code=${code}, signal=${signal}).${tauriDriverDetail()}`,
    );
  });

  return child;
}

async function createWebDriver(applicationPath: string): Promise<WebDriver> {
  const capabilities = new Capabilities();
  capabilities.setBrowserName("wry");
  capabilities.set("tauri:options", {
    application: applicationPath,
  });

  return await new Builder()
    .usingServer(`http://${DRIVER_HOST}:${DRIVER_PORT}/`)
    .withCapabilities(capabilities)
    .build();
}

async function verifyWorkspaceLoads(
  currentDriver: WebDriver,
  expectedWorkspaceRoot: string,
): Promise<void> {
  await currentDriver.wait(
    until.elementLocated(By.css(".file-browser__filter")),
    STARTUP_TIMEOUT_MS,
  );

  const pathElement = await currentDriver.wait(
    until.elementLocated(By.css(".file-browser__path")),
    STARTUP_TIMEOUT_MS,
  );
  const pathText = await pathElement.getText();

  if (!pathText.includes(expectedWorkspaceRoot)) {
    throw new Error(
      `Expected workspace path to include ${expectedWorkspaceRoot}, got ${JSON.stringify(pathText)}`,
    );
  }
}

async function verifyFileTreeRenders(currentDriver: WebDriver): Promise<void> {
  await waitForButton(currentDriver, "docs");
  await waitForButton(currentDriver, "notes-001.md");
}

async function verifyFilterFocus(currentDriver: WebDriver): Promise<void> {
  const filterInput = await waitForFilterInput(currentDriver);
  await resetFilter(currentDriver, filterInput);
  await filterInput.click();

  await filterInput.sendKeys("n");
  await expectFilterState(currentDriver, filterInput, "n");

  await filterInput.sendKeys("o");
  await expectFilterState(currentDriver, filterInput, "no");

  await resetFilter(currentDriver, filterInput);
}

async function verifyServerSideFiltering(
  currentDriver: WebDriver,
): Promise<void> {
  const filterInput = await waitForFilterInput(currentDriver);
  await resetFilter(currentDriver, filterInput);

  if (await buttonExists(currentDriver, "notes-220.md")) {
    throw new Error("notes-220.md should not be visible before filtering.");
  }

  await replaceInputValue(currentDriver, filterInput, "notes-220");
  await waitForButton(currentDriver, "notes-220.md");
  await resetFilter(currentDriver, filterInput);
}

async function verifyLazyLoading(currentDriver: WebDriver): Promise<void> {
  const filterInput = await waitForFilterInput(currentDriver);
  await resetFilter(currentDriver, filterInput);
  await currentDriver.wait(
    async () => !(await buttonExists(currentDriver, "notes-220.md")),
    STARTUP_TIMEOUT_MS,
  );

  const browserPane = await currentDriver.findElement(
    By.css(".pane__body.file-browser"),
  );

  await currentDriver.executeScript(
    `
      const pane = arguments[0];
      pane.scrollTop = pane.scrollHeight;
      pane.dispatchEvent(new Event("scroll"));
    `,
    browserPane,
  );

  await waitForButton(currentDriver, "notes-220.md");
}

async function verifyReadmePreview(currentDriver: WebDriver): Promise<void> {
  await ensureDarkTheme(currentDriver);

  const filterInput = await waitForFilterInput(currentDriver);
  await replaceInputValue(currentDriver, filterInput, "README");

  await clickButtonByAriaLabel(currentDriver, "README.md");

  await currentDriver.wait(async () => {
    const preview = await currentDriver.findElement(
      By.css(".preview__content.markdown-body"),
    );
    const text = await preview.getText();
    return text.includes(FIXTURE_README_TEXT);
  }, STARTUP_TIMEOUT_MS);

  const styles = (await currentDriver.executeScript(
    `
      const preview = document.querySelector(".preview__content.markdown-body");
      if (preview === null) {
        throw new Error("missing preview element");
      }
      const styles = getComputedStyle(preview);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        colorScheme: styles.colorScheme,
      };
    `,
  )) as {
    readonly backgroundColor: string;
    readonly color: string;
    readonly colorScheme: string;
  };

  if (styles.backgroundColor !== "rgb(13, 17, 23)") {
    throw new Error(
      `Expected dark preview background, got ${JSON.stringify(styles.backgroundColor)}`,
    );
  }

  if (styles.color !== "rgb(201, 209, 217)") {
    throw new Error(
      `Expected dark preview foreground, got ${JSON.stringify(styles.color)}`,
    );
  }

  if (styles.colorScheme !== "dark") {
    throw new Error(
      `Expected dark color-scheme, got ${JSON.stringify(styles.colorScheme)}`,
    );
  }
}

async function verifyVideoPreview(currentDriver: WebDriver): Promise<void> {
  const filterInput = await waitForFilterInput(currentDriver);
  await replaceInputValue(currentDriver, filterInput, "MP4_480");

  await clickButtonByAriaLabel(currentDriver, FIXTURE_MP4_NAME);

  const video = await currentDriver.wait(
    until.elementLocated(By.css("video")),
    STARTUP_TIMEOUT_MS,
  );

  const videoReady = await currentDriver.wait(async () => {
    const state = (await readMediaState(
      currentDriver,
      "video",
    )) as MediaElementState;
    return (
      (state.attributeSrc.startsWith("http://127.0.0.1:") ||
        state.attributeSrc.startsWith("blob:tauri://localhost/")) &&
      state.errorCode === null
    );
  }, STARTUP_TIMEOUT_MS).catch(() => false);

  const state = await readMediaState(currentDriver, "video");

  if (!videoReady) {
    const bodyText = await currentDriver.findElement(By.css("body")).getText();
    throw new Error(
      `Timed out waiting for inline MP4 preview state: ${JSON.stringify(state)}\n\nBody text:\n${bodyText}`,
    );
  }

  if (
    !state.attributeSrc.startsWith("http://127.0.0.1:") &&
    !state.attributeSrc.startsWith("blob:tauri://localhost/")
  ) {
    throw new Error(
      `Expected inline video src attribute to use the localhost stream URL or a Linux blob fallback URL, got ${JSON.stringify(state.attributeSrc)}`,
    );
  }

  if (state.errorCode !== null) {
    throw new Error(
      `Expected inline MP4 preview without media error, got code ${state.errorCode}`,
    );
  }

  await resetFilter(currentDriver, filterInput);
  void video;
}

async function verifyAudioPreview(currentDriver: WebDriver): Promise<void> {
  const filterInput = await waitForFilterInput(currentDriver);
  await replaceInputValue(currentDriver, filterInput, "MP3_1MG");

  await clickButtonByAriaLabel(currentDriver, FIXTURE_MP3_NAME);

  await currentDriver.wait(
    until.elementLocated(By.css("audio")),
    STARTUP_TIMEOUT_MS,
  );

  const audioReady = await currentDriver.wait(async () => {
    const state = (await readMediaState(
      currentDriver,
      "audio",
    )) as MediaElementState;
    return (
      (state.attributeSrc.startsWith("http://127.0.0.1:") ||
        state.attributeSrc.startsWith("blob:tauri://localhost/")) &&
      state.errorCode === null
    );
  }, STARTUP_TIMEOUT_MS).catch(() => false);

  const state = await readMediaState(currentDriver, "audio");

  if (!audioReady) {
    const bodyText = await currentDriver.findElement(By.css("body")).getText();
    throw new Error(
      `Timed out waiting for inline MP3 preview state: ${JSON.stringify(state)}\n\nBody text:\n${bodyText}`,
    );
  }

  if (
    !state.attributeSrc.startsWith("http://127.0.0.1:") &&
    !state.attributeSrc.startsWith("blob:tauri://localhost/")
  ) {
    throw new Error(
      `Expected inline MP3 preview to use the localhost stream URL or a blob fallback URL, got ${JSON.stringify(state.attributeSrc)}`,
    );
  }

  if (state.errorCode !== null) {
    throw new Error(
      `Expected inline MP3 preview without media error, got code ${state.errorCode}`,
    );
  }

  const bodyText = await currentDriver.findElement(By.css("body")).getText();
  if (bodyText.includes("Inline playback failed")) {
    throw new Error(
      `Expected MP3 preview to avoid inline playback failure UI, got body text ${JSON.stringify(bodyText)}`,
    );
  }

  await resetFilter(currentDriver, filterInput);
}

async function shutdown(
  currentDriver: WebDriver | undefined,
  currentTauriDriver: ChildProcess | undefined,
): Promise<void> {
  isShuttingDown = true;

  if (currentDriver !== undefined) {
    try {
      await currentDriver.quit();
    } catch (error) {
      console.error("Failed to stop WebDriver session:", error);
    }
  }

  if (
    currentTauriDriver !== undefined &&
    currentTauriDriver.exitCode === null
  ) {
    currentTauriDriver.kill("SIGTERM");
    await delay(500);

    if (currentTauriDriver.exitCode === null) {
      currentTauriDriver.kill("SIGKILL");
    }
  }
}

async function restartDesktopSession(launcherPath: string): Promise<{
  readonly driver: WebDriver;
  readonly tauriDriver: ChildProcess;
}> {
  await shutdown(driver, tauriDriver);
  driver = undefined;
  tauriDriver = undefined;
  tauriDriverLogs = "";
  tauriDriverFailure = undefined;
  isShuttingDown = false;

  const nextTauriDriver = startTauriDriver();
  await waitForPort(DRIVER_HOST, DRIVER_PORT, STARTUP_TIMEOUT_MS);
  ensureTauriDriverHealthy();

  const nextDriver = await createWebDriver(launcherPath);
  ensureTauriDriverHealthy();

  return {
    driver: nextDriver,
    tauriDriver: nextTauriDriver,
  };
}

async function cleanupFixture(root: string | undefined): Promise<void> {
  if (root === undefined) {
    return;
  }

  await rm(root, { force: true, recursive: true });
}

async function waitForPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    ensureTauriDriverHealthy();

    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });

      socket.setTimeout(1_000);
      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (connected) {
      return;
    }

    await delay(200);
  }

  ensureTauriDriverHealthy();

  throw new Error(
    `Timed out waiting for tauri-driver on ${host}:${port}.${tauriDriverDetail()}`,
  );
}

function ensureTauriDriverHealthy(): void {
  if (tauriDriverFailure !== undefined) {
    throw tauriDriverFailure;
  }
}

function tauriDriverDetail(): string {
  return tauriDriverLogs.length > 0
    ? `\n\nCaptured tauri-driver output:\n${tauriDriverLogs}`
    : "";
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

async function runStep(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    console.log(`[tauri-e2e] ${name}`);
    await fn();
  } catch (error) {
    throw new Error(`${name} failed\n\n${formatError(error)}`);
  }
}

async function createWorkspaceFixture(root: string): Promise<string> {
  const workspaceRoot = join(root, "workspace");
  const docsRoot = join(workspaceRoot, "docs");
  await mkdir(docsRoot, { recursive: true });
  await copyFixtureMediaFile(FIXTURE_MP3_NAME, join(workspaceRoot, FIXTURE_MP3_NAME));
  await copyFixtureMediaFile(FIXTURE_MP4_NAME, join(workspaceRoot, FIXTURE_MP4_NAME));

  await writeFile(
    join(workspaceRoot, "README.md"),
    [
      "# Tauri Fixture README",
      "",
      FIXTURE_README_TEXT,
      "",
      "- Desktop runtime verification",
      "- Real directory paging and filtering",
    ].join("\n"),
  );
  await writeFile(
    join(docsRoot, "intro.md"),
    "# Intro\n\nThis folder confirms the real file tree is rendered.\n",
  );

  for (let index = 1; index <= FIXTURE_NOTE_COUNT; index += 1) {
    await writeFile(
      join(workspaceRoot, `notes-${String(index).padStart(3, "0")}.md`),
      `# Note ${index}\n\nFixture note ${index}.\n`,
    );
  }

  return workspaceRoot;
}

async function copyFixtureMediaFile(
  fixtureFileName: string,
  destinationPath: string,
): Promise<void> {
  await copyFile(
    join(repoRoot, "src-tauri", "tests", "fixtures", fixtureFileName),
    destinationPath,
  );
}

async function createAppLauncher(root: string): Promise<string> {
  const launcherPath = join(root, "launch-chilla.sh");

  await writeFile(
    launcherPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'exec "${CHILLA_TAURI_E2E_REAL_APP:?}" "${CHILLA_TAURI_E2E_STARTUP_PATH:?}"',
      "",
    ].join("\n"),
  );
  await chmod(launcherPath, 0o755);

  return launcherPath;
}

async function waitForFilterInput(
  currentDriver: WebDriver,
): Promise<WebElement> {
  return await currentDriver.wait(
    until.elementLocated(By.css(".file-browser__filter")),
    STARTUP_TIMEOUT_MS,
  );
}

async function waitForButton(
  currentDriver: WebDriver,
  ariaLabel: string,
): Promise<WebElement> {
  return await currentDriver.wait(
    until.elementLocated(By.css(`button[aria-label="${ariaLabel}"]`)),
    STARTUP_TIMEOUT_MS,
  );
}

async function clickButtonByAriaLabel(
  currentDriver: WebDriver,
  ariaLabel: string,
): Promise<void> {
  await currentDriver.wait(async () => {
    try {
      const button = await waitForButton(currentDriver, ariaLabel);
      await button.click();
      return true;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.name !== "StaleElementReferenceError"
      ) {
        throw error;
      }

      return false;
    }
  }, STARTUP_TIMEOUT_MS);
}

async function buttonExists(
  currentDriver: WebDriver,
  ariaLabel: string,
): Promise<boolean> {
  const matches = await currentDriver.findElements(
    By.css(`button[aria-label="${ariaLabel}"]`),
  );

  return matches.length > 0;
}

async function ensureDarkTheme(currentDriver: WebDriver): Promise<void> {
  const toggle = await currentDriver.wait(
    until.elementLocated(By.css(".workspace__theme-toggle")),
    STARTUP_TIMEOUT_MS,
  );
  const ariaLabel = await toggle.getAttribute("aria-label");

  if (ariaLabel === "Switch to dark theme") {
    await toggle.click();
  }

  await currentDriver.wait(async () => {
    return (
      (await toggle.getAttribute("aria-label")) === "Switch to light theme"
    );
  }, STARTUP_TIMEOUT_MS);
}

async function replaceInputValue(
  currentDriver: WebDriver,
  input: WebElement,
  value: string,
): Promise<void> {
  await currentDriver.executeScript(
    `
      const element = arguments[0];
      const nextValue = arguments[1];
      element.focus();
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    `,
    input,
    value,
  );
}

async function resetFilter(
  currentDriver: WebDriver,
  input: WebElement,
): Promise<void> {
  await input.click();
  await input.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
  await currentDriver.wait(async () => {
    return (await input.getAttribute("value")) === "";
  }, STARTUP_TIMEOUT_MS);
}

async function expectFilterState(
  currentDriver: WebDriver,
  input: WebElement,
  value: string,
): Promise<void> {
  await currentDriver.wait(async () => {
    const currentValue = await input.getAttribute("value");
    const isFocused = (await currentDriver.executeScript(
      "return document.activeElement === arguments[0];",
      input,
    )) as boolean;

    return currentValue === value && isFocused;
  }, STARTUP_TIMEOUT_MS);
}

interface MediaElementState {
  readonly attributeSrc: string;
  readonly currentSrc: string;
  readonly readyState: number;
  readonly networkState: number;
  readonly errorCode: number | null;
}

async function readMediaState(
  currentDriver: WebDriver,
  selector: "audio" | "video",
): Promise<MediaElementState> {
  return (await currentDriver.executeScript(
    `
      const media = document.querySelector(arguments[0]);
      if (!(media instanceof HTMLMediaElement)) {
        throw new Error(\`missing media element for selector \${arguments[0]}\`);
      }

      return {
        attributeSrc: media.getAttribute("src") ?? "",
        currentSrc: media.currentSrc,
        readyState: media.readyState,
        networkState: media.networkState,
        errorCode: media.error ? media.error.code : null,
      };
    `,
    selector,
  )) as MediaElementState;
}
