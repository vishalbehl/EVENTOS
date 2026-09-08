import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(electronDir, "..");
const repoRoot = path.resolve(appDir, "..", "..", "..");
const desktopUrl = process.env.VENUE_DESKTOP_URL || "http://127.0.0.1:3006";
const nextPort = new URL(desktopUrl).port || "3006";
const waitTargetNext = `tcp:127.0.0.1:${nextPort}`;
const waitTargetBackend = "tcp:127.0.0.1:8001";
const children = new Set();

let shuttingDown = false;

function resolveFromApp(id) {
  return require.resolve(id, { paths: [appDir] });
}

function spawnNode(label, script, args = [], options = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "development",
      VENUE_DESKTOP_URL: desktopUrl,
      ELECTRON_START_URL: desktopUrl,
      ...options.env,
    },
    stdio: options.stdio || "inherit",
  });

  children.add(child);
  child.once("exit", () => children.delete(child));
  child.once("error", (error) => {
    console.error(`[${label}] ${error.message}`);
    stopAll(1);
  });
  return child;
}

async function backendAlreadyRunning() {
  try {
    const response = await fetch("http://127.0.0.1:8001/health", { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

function spawnBackend() {
  const venueServerDir = path.join(repoRoot, "services", "venue", "venue-server");
  const isWin = process.platform === "win32";
  const configuredPython = process.env.VENUE_SERVER_PYTHON;
  const candidates = [
    configuredPython,
    path.join(venueServerDir, ".venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python"),
    path.join(repoRoot, "services", "backend", ".venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python"),
    path.join(repoRoot, ".venv", isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python"),
  ].filter(Boolean);

  const pythonExe = candidates.find((candidate) => fs.existsSync(candidate)) || (isWin ? "python.exe" : "python3");
  const runnerScript = path.join(venueServerDir, "dev_runner.py");

  console.log(`[Venue Desktop] Supervised Venue Server backend starting via ${pythonExe}...`);
  const child = spawn(pythonExe, [runnerScript, "--port", "8001"], {
    cwd: venueServerDir,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
    stdio: "inherit",
  });

  children.add(child);
  child.once("exit", () => children.delete(child));
  child.once("error", (error) => {
    console.error(`[Venue Server Backend] ${error.message}`);
  });
  return child;
}

function clearNextDevelopmentCache() {
  const devCache = path.join(appDir, ".next", "dev");
  try {
    fs.rmSync(devCache, { recursive: true, force: true });
    console.log("[Venue Desktop] Cleared generated Next.js development cache.");
  } catch (error) {
    throw new Error(`Unable to clear Next.js development cache: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runNode(label, script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawnNode(label, script, args);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} exited with ${signal || code}`));
    });
  });
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 800).unref();
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
process.on("exit", () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
});

const nextBin = resolveFromApp("next/dist/bin/next");
const waitOnBin = resolveFromApp("wait-on/bin/wait-on");
const tscBin = resolveFromApp("typescript/bin/tsc");
const electronBin = resolveFromApp("electron/cli.js");

// 1. Reuse an already-running Docker/host Venue API. Starting a second
// supervisor would reclaim its port and make the desktop window unstable.
if (await backendAlreadyRunning()) {
  console.log("[Venue Desktop] Reusing Venue Server backend already running on port 8001.");
} else {
  spawnBackend();
}

// 2. Start Next.js Frontend on port 3006
clearNextDevelopmentCache();
console.log(`[Venue Desktop] Starting Next.js development server on port ${nextPort}...`);
spawnNode("next", nextBin, ["dev", "--webpack", "--port", nextPort]);

try {
  console.log(`[Venue Desktop] Waiting for Backend at ${waitTargetBackend} and Next.js at ${waitTargetNext}...`);
  await runNode("wait-on-backend", waitOnBin, ["-t", "15000", waitTargetBackend]);
  await runNode("wait-on-next", waitOnBin, ["-t", "15000", waitTargetNext]);
  console.log("[Venue Desktop] Compiling Electron TypeScript...");
  await runNode("electron-tsc", tscBin, ["-p", "electron/tsconfig.json"]);
  console.log("[Venue Desktop] Launching Electron window...");
  const electron = spawnNode("electron", electronBin, ["electron-dist/main.js"]);
  electron.once("exit", (code) => stopAll(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stopAll(1);
}
