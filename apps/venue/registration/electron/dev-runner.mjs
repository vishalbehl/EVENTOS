import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(electronDir, "..");
const desktopUrl = process.env.VENUE_DESKTOP_URL || "http://127.0.0.1:3005";
const nextPort = new URL(desktopUrl).port || "3005";
const waitTarget = `tcp:127.0.0.1:${nextPort}`;
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

spawnNode("next", nextBin, ["dev", "--port", nextPort]);

try {
  await runNode("wait-on", waitOnBin, [waitTarget]);
  await runNode("electron-tsc", tscBin, ["-p", "electron/tsconfig.json"]);
  const electron = spawnNode("electron", electronBin, ["electron-dist/main.js"]);
  electron.once("exit", (code) => stopAll(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stopAll(1);
}
