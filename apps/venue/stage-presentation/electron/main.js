const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const venueUrl = (process.env.VITE_VENUE_SERVER_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
const allowedExtensions = new Set([".ppt", ".pptx", ".pdf", ".mp4", ".webm", ".png", ".jpg", ".jpeg", ".gif", ".txt", ".doc", ".docx", ".xls", ".xlsx", ".odp"]);
let deviceAccessToken = null;

async function ensureDeviceAccessToken() {
  if (deviceAccessToken) return deviceAccessToken;
  const deviceId = process.env.VITE_DEVICE_ID || "";
  const enrollmentToken = process.env.VITE_DEVICE_TOKEN || "";
  if (!deviceId || !enrollmentToken) {
    throw new Error("Stage device enrollment is not configured.");
  }
  const response = await fetch(new URL("/api/v1/auth/device/token", venueUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, enrollment_token: enrollmentToken }),
  });
  if (!response.ok) throw new Error(`Stage device authentication failed (${response.status}).`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Stage device authentication returned no access token.");
  deviceAccessToken = payload.access_token;
  return deviceAccessToken;
}

function headers() {
  return {
    ...(process.env.VITE_VENUE_KEY ? { "X-Venue-Key": process.env.VITE_VENUE_KEY } : {}),
    ...(process.env.VITE_DEVICE_ID && deviceAccessToken ? { "X-Venue-Device-Id": process.env.VITE_DEVICE_ID, "X-Device-Token": deviceAccessToken } : {}),
  };
}

async function fetchWithDeviceAuth(url) {
  await ensureDeviceAccessToken();
  let response = await fetch(url, { headers: headers() });
  if (response.status === 401) {
    deviceAccessToken = null;
    await ensureDeviceAccessToken();
    response = await fetch(url, { headers: headers() });
  }
  return response;
}

function cacheDir() {
  const dir = path.join(app.getPath("userData"), "stage-presentations");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findPowerPoint() {
  const candidates = [
    process.env.STAGE_POWERPOINT_PATH,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Microsoft Office", "root", "Office16", "POWERPNT.EXE"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Microsoft Office", "root", "Office16", "POWERPNT.EXE"),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function prepareAndOpen(input) {
  if (!input || typeof input !== "object") throw new Error("Stage App received an invalid presentation request.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(input.fileId || ""))) {
    throw new Error("Stage App received an invalid presentation file ID.");
  }
  const version = Number(input.version);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Stage App received an invalid presentation version.");
  const filename = String(input.filename || "");
  if (!filename || path.basename(filename) !== filename || filename.includes("\0")) {
    throw new Error("Stage App received an invalid presentation filename.");
  }
  const parsed = new URL(input.url, venueUrl);
  if (parsed.origin !== new URL(venueUrl).origin || !parsed.pathname.startsWith("/api/v1/venue/rooms/")) {
    throw new Error("Stage App may only open files served by the configured Venue Server room endpoint.");
  }
  const extension = path.extname(filename || parsed.pathname).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error(`Format ${extension || "unknown"} is not supported by the Stage App.`);
  const response = await fetchWithDeviceAuth(parsed);
  if (!response.ok) throw new Error(`Venue Server file download failed (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const expected = response.headers.get("x-file-sha256") || input.checksum || "";
  if (!expected || checksum.toLowerCase() !== expected.toLowerCase()) throw new Error("Presentation checksum verification failed.");
  const target = path.join(cacheDir(), `${input.fileId}.v${version}${extension}`);
  const temp = `${target}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, buffer);
  fs.renameSync(temp, target);
  let error = "";
  if (extension === ".ppt" || extension === ".pptx") {
    const powerPoint = findPowerPoint();
    if (input.mode === "slideshow") {
      if (!powerPoint) throw new Error("PowerPoint is not installed or is not available to the Stage App; slideshow mode cannot be started.");
      spawn(powerPoint, ["/S", target], { detached: true, stdio: "ignore" }).unref();
    } else error = await shell.openPath(target);
  } else error = await shell.openPath(target);
  if (error) throw new Error(error);
  return { opened: true, localPath: target, checksum, mode: input.mode || "normal" };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#020617",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  if (process.env.STAGE_DESKTOP_URL || process.env.NODE_ENV === "development") win.loadURL(process.env.STAGE_DESKTOP_URL || "http://localhost:5173");
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("stage:prepare-and-open", async (_event, input) => {
    try { return await prepareAndOpen(input); }
    catch (error) { return { opened: false, error: error instanceof Error ? error.message : "Presentation launch failed." }; }
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
