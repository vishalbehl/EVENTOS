import { app, BrowserWindow, ipcMain, shell, Menu, dialog, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import fs from "node:fs";

const DEFAULT_DESKTOP_URL = "http://127.0.0.1:3007";
const DEFAULT_VENUE_API_URL = "http://127.0.0.1:8001";
const desktopUrl = process.env.SRR_DESKTOP_URL || DEFAULT_DESKTOP_URL;
const venueApiUrl = process.env.NEXT_PUBLIC_VENUE_SERVER_URL || process.env.VENUE_SERVER_URL || DEFAULT_VENUE_API_URL;
const isProduction = process.env.NODE_ENV === "production";

if (!isProduction) {
  app.setPath("userData", path.join(app.getPath("appData"), "Eventos SRR Preview Dev"));
  app.commandLine.appendSwitch("disk-cache-dir", path.join(os.tmpdir(), "eventos-srr-preview-electron-cache"));
}

let mainWindow: BrowserWindow | null = null;
let activeFileWatcher: fs.FSWatcher | null = null;

function localDatabaseDir(): string {
  const dir = path.join(app.getPath("userData"), "srr-local");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function localDatabasePath(): string {
  return path.join(localDatabaseDir(), "srr-local.db");
}

function validateSqliteFile(dbPath: string): { valid: boolean; message: string } {
  if (!fs.existsSync(dbPath)) {
    return { valid: false, message: "Replica file does not exist." };
  }
  const fd = fs.openSync(dbPath, "r");
  try {
    const header = Buffer.alloc(16);
    const read = fs.readSync(fd, header, 0, header.length, 0);
    if (read < 16) {
      return { valid: false, message: "Replica file is too small to be a SQLite database." };
    }
    const signature = header.toString("ascii");
    if (signature !== "SQLite format 3\u0000") {
      return { valid: false, message: "Replica file does not contain a valid SQLite header." };
    }
    return { valid: true, message: "SQLite header verified." };
  } finally {
    fs.closeSync(fd);
  }
}

function localPresentationsCacheDir(): string {
  const dir = path.join(app.getPath("userData"), "cached_presentations");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(value);
  return match ? decodeURIComponent(match[1].replace(/"/g, "")) : null;
}

async function downloadPresentationToCache(fileUrl: string): Promise<string> {
  const resolvedUrl = fileUrl.startsWith("http://") || fileUrl.startsWith("https://")
    ? fileUrl
    : new URL(fileUrl, venueApiUrl).toString();
  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Venue Server download failed (${response.status})`);
  }
  const nameFromHeader = filenameFromDisposition(response.headers.get("content-disposition"));
  const fallbackName = path.basename(new URL(resolvedUrl).pathname) || `presentation-${Date.now()}.bin`;
  const target = path.join(localPresentationsCacheDir(), nameFromHeader || fallbackName);
  const tempTarget = `${target}.${Date.now()}.tmp`;
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempTarget, buffer);
  fs.renameSync(tempTarget, target);
  return target;
}

async function uploadModifiedPresentation(input: {
  filePath: string;
  speakerId: string;
  sessionSpeakerId: string;
  deviceKey?: string;
}): Promise<any> {
  if (!fs.existsSync(input.filePath)) {
    throw new Error("Modified presentation file is not available on this workstation.");
  }
  const stat = fs.statSync(input.filePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error("Modified presentation file is empty or invalid.");
  }

  const form = new FormData();
  const filename = path.basename(input.filePath);
  const buffer = fs.readFileSync(input.filePath);
  form.append("speaker_id", input.speakerId);
  form.append("session_speaker_id", input.sessionSpeakerId);
  form.append("filename", filename);
  form.append("file_size_bytes", String(stat.size));
  form.append("file", new Blob([buffer]), filename);

  const headers: Record<string, string> = {};
  if (input.deviceKey) headers["X-Device-Key"] = input.deviceKey;

  const response = await fetch(new URL("/api/v1/srr/files/upload", venueApiUrl), {
    method: "POST",
    headers,
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Venue Server upload failed (${response.status}): ${detail || response.statusText}`);
  }
  return response.json();
}

async function downloadReplicaFromServer(): Promise<ReturnType<typeof getLocalDbStatus> & { syncedFrom?: string; error?: string }> {
  const sourceUrl = new URL("/api/v1/srr/replica.sqlite", venueApiUrl).toString();
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Venue Server replica download failed (${response.status})`);
  }
  const targetPath = localDatabasePath();
  const tempTarget = `${targetPath}.${Date.now()}.tmp`;
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempTarget, buffer);
  const validation = validateSqliteFile(tempTarget);
  if (!validation.valid) {
    fs.rmSync(tempTarget, { force: true });
    throw new Error(validation.message);
  }
  fs.renameSync(tempTarget, targetPath);
  return { ...getLocalDbStatus(), syncedFrom: sourceUrl };
}

function getLocalDbStatus() {
  const dbPath = localDatabasePath();
  if (!fs.existsSync(dbPath)) {
    return {
      exists: false,
      path: dbPath,
      sizeBytes: 0,
      tablesCount: 0,
      version: undefined,
    };
  }
  const stat = fs.statSync(dbPath);
  const validation = validateSqliteFile(dbPath);
  return {
    exists: validation.valid,
    path: dbPath,
    sizeBytes: stat.size,
    updatedAt: stat.mtimeMs,
    tablesCount: undefined,
    version: undefined,
    isValidSqlite: validation.valid,
    validationMessage: validation.message,
  };
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  let ipv4 = "127.0.0.1";
  let mac = "00:00:00:00:00:00";
  let interfaceName = "loopback";

  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const iface of list) {
      if (!iface.internal && iface.family === "IPv4") {
        ipv4 = iface.address;
        mac = iface.mac;
        interfaceName = name;
        break;
      }
    }
    if (ipv4 !== "127.0.0.1") break;
  }

  return {
    ipv4,
    mac: mac.toUpperCase(),
    interfaceName,
    hostname: os.hostname(),
    platform: os.platform(),
    osRelease: os.release(),
    arch: os.arch(),
    totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
  };
}

async function handleImportDatabase() {
  const openOptions: OpenDialogOptions = {
    title: "Import Eventos SRR Local Database",
    properties: ["openFile"],
    filters: [
      { name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
      { name: "All Files", extensions: ["*"] },
    ],
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, openOptions) : await dialog.showOpenDialog(openOptions);
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true, ...getLocalDbStatus() };
  }

  const selectedPath = result.filePaths[0];
  const targetPath = localDatabasePath();
  try {
    const validation = validateSqliteFile(selectedPath);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    const tempTarget = `${targetPath}.${Date.now()}.tmp`;
    fs.copyFileSync(selectedPath, tempTarget);
    fs.renameSync(tempTarget, targetPath);
    mainWindow?.webContents.send("srr-desktop:db-imported", { source: selectedPath });
    return { canceled: false, importedFrom: selectedPath, ...getLocalDbStatus() };
  } catch (err: any) {
    return { canceled: true, error: err.message, ...getLocalDbStatus() };
  }
}

async function handleExportDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const saveOptions: SaveDialogOptions = {
    title: "Download Eventos SRR Database Snapshot",
    defaultPath: `eventos-srr-db-${timestamp}.sqlite`,
    filters: [
      { name: "SQLite Database", extensions: ["sqlite", "db"] },
      { name: "All Files", extensions: ["*"] },
    ],
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, saveOptions) : await dialog.showSaveDialog(saveOptions);
  if (result.canceled || !result.filePath) {
    return { canceled: true, ...getLocalDbStatus() };
  }

  const sourcePath = localDatabasePath();
  try {
    if (!fs.existsSync(sourcePath)) {
      throw new Error("No local SQLite replica exists to export.");
    }
    const validation = validateSqliteFile(sourcePath);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    fs.copyFileSync(sourcePath, result.filePath);
    return { canceled: false, exportedTo: result.filePath, ...getLocalDbStatus() };
  } catch (err: any) {
    return { canceled: true, error: err.message, ...getLocalDbStatus() };
  }
}

function buildApplicationMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "&File",
      submenu: [
        {
          label: "Import Local Database (.sqlite)...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            await handleImportDatabase();
          },
        },
        {
          label: "Download Database Snapshot...",
          accelerator: "CmdOrCtrl+S",
          click: async () => {
            await handleExportDatabase();
          },
        },
        { type: "separator" },
        {
          label: "Open Database Folder",
          click: () => {
            shell.openPath(localDatabaseDir());
          },
        },
        {
          label: "Open Presentations Cache Folder",
          click: () => {
            shell.openPath(localPresentationsCacheDir());
          },
        },
        { type: "separator" },
        {
          label: "Exit Application",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "&Database",
      submenu: [
        {
          label: "Database Health & Status",
          click: () => {
            const status = getLocalDbStatus();
            dialog.showMessageBox(mainWindow!, {
              type: "info",
              title: "Local Database Status",
              message: "EVENTOS SRR Database Status",
              detail: `Path: ${status.path}\nSize: ${(status.sizeBytes / 1024).toFixed(1)} KB\nTables: ${status.tablesCount}\nOffline Replication: ACTIVE`,
            });
          },
        },
        {
          label: "Force Re-sync to Venue Server",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => {
            mainWindow?.webContents.send("srr-desktop:force-sync");
          },
        },
        { type: "separator" },
        {
          label: "Clear Local Presentation Cache",
          click: async () => {
            const res = await dialog.showMessageBox(mainWindow!, {
              type: "warning",
              buttons: ["Cancel", "Clear Cache"],
              defaultId: 0,
              title: "Clear Presentations Cache",
              message: "Are you sure you want to clear temporary presentation files?",
            });
            if (res.response === 1) {
              const cacheDir = localPresentationsCacheDir();
              try {
                fs.rmSync(cacheDir, { recursive: true, force: true });
                fs.mkdirSync(cacheDir, { recursive: true });
                mainWindow?.webContents.send("srr-desktop:cache-cleared");
              } catch {}
            }
          },
        },
      ],
    },
    {
      label: "&Workstations",
      submenu: [
        {
          label: "Workstation Mode (/workstation)",
          accelerator: "CmdOrCtrl+1",
          click: () => {
            mainWindow?.loadURL(`${desktopUrl}/workstation`);
          },
        },
        {
          label: "Scanning Mode (/scanning)",
          accelerator: "CmdOrCtrl+2",
          click: () => {
            mainWindow?.loadURL(`${desktopUrl}/scanning`);
          },
        },
        {
          label: "Admin Fleet Console (/admin)",
          accelerator: "CmdOrCtrl+3",
          click: () => {
            mainWindow?.loadURL(`${desktopUrl}/admin`);
          },
        },
        {
          label: "Device Management (/admin/devices)",
          accelerator: "CmdOrCtrl+4",
          click: () => {
            mainWindow?.loadURL(`${desktopUrl}/admin/devices`);
          },
        },
        { type: "separator" },
        {
          label: "Toggle Kiosk / Fullscreen Mode",
          accelerator: "F11",
          click: () => {
            if (mainWindow) {
              const isFull = mainWindow.isFullScreen();
              mainWindow.setFullScreen(!isFull);
            }
          },
        },
      ],
    },
    {
      label: "&View",
      submenu: [
        { role: "reload", accelerator: "CmdOrCtrl+R" },
        { role: "forceReload", accelerator: "CmdOrCtrl+Shift+R" },
        { role: "toggleDevTools", accelerator: "F12" },
        { type: "separator" },
        { role: "resetZoom", accelerator: "CmdOrCtrl+0" },
        { role: "zoomIn", accelerator: "CmdOrCtrl+=" },
        { role: "zoomOut", accelerator: "CmdOrCtrl+-" },
      ],
    },
    {
      label: "&Help",
      submenu: [
        {
          label: "Hardware & Network Telemetry",
          click: () => {
            const net = getNetworkInfo();
            dialog.showMessageBox(mainWindow!, {
              type: "info",
              title: "System Telemetry",
              message: `Station Host: ${net.hostname}`,
              detail: `IP Address: ${net.ipv4}\nMAC Address: ${net.mac}\nInterface: ${net.interfaceName}\nPlatform: ${net.platform} (${net.arch})\nMemory: ${net.freeMemoryMB} MB / ${net.totalMemoryMB} MB`,
            });
          },
        },
        {
          label: "Venue Server Connection (:8001)",
          click: () => {
            shell.openExternal("http://127.0.0.1:8001/docs");
          },
        },
        { type: "separator" },
        {
          label: "About EVENTOS SRR",
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: "info",
              title: "About EVENTOS",
              message: "EVENTOS Speaker Ready Room (SRR) Preview System",
              detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChromium: ${process.versions.chrome}`,
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    fullscreen: false,
    autoHideMenuBar: false, // Visible in normal windowed mode
    title: "EVENTOS | Speaker Ready Room (SRR)",
    backgroundColor: "#070809",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(buildApplicationMenu());
  win.setMenuBarVisibility(true);

  // Automatically hide the native menu bar in fullscreen mode and restore it when exiting
  win.on("enter-full-screen", () => {
    win.setMenuBarVisibility(false);
  });

  win.on("leave-full-screen", () => {
    win.setMenuBarVisibility(true);
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.loadURL(desktopUrl);

  win.on("closed", () => {
    mainWindow = null;
    if (activeFileWatcher) {
      activeFileWatcher.close();
      activeFileWatcher = null;
    }
  });

  return win;
}

app.whenReady().then(() => {
  mainWindow = createWindow();

  // Desktop App Metadata & Telemetry
  ipcMain.handle("srr-desktop:get-app-info", () => {
    return {
      appVersion: app.getVersion(),
      desktopUrl,
      isDesktop: true,
      isPackaged: app.isPackaged,
      platform: process.platform,
      system: getNetworkInfo(),
      localDatabase: getLocalDbStatus(),
    };
  });

  // Real Hardware Network Interfaces
  ipcMain.handle("srr-desktop:get-system-info", () => {
    return getNetworkInfo();
  });

  // Local Database Operations
  ipcMain.handle("srr-desktop:get-local-database-status", () => {
    return getLocalDbStatus();
  });

  ipcMain.handle("srr-desktop:initialize-local-database", () => {
    const dbPath = localDatabasePath();
    if (!fs.existsSync(dbPath)) {
      throw new Error("Local SQLite replica is not available. Import or sync a real replica first.");
    }
    const validation = validateSqliteFile(dbPath);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
    return getLocalDbStatus();
  });

  ipcMain.handle("srr-desktop:sync-local-database", async () => {
    try {
      return await downloadReplicaFromServer();
    } catch (err: any) {
      return { ...getLocalDbStatus(), error: err.message };
    }
  });

  ipcMain.handle("srr-desktop:import-local-database", async () => {
    return await handleImportDatabase();
  });

  ipcMain.handle("srr-desktop:export-local-database", async () => {
    return await handleExportDatabase();
  });

  ipcMain.handle("srr-desktop:open-database-folder", () => {
    const dir = localDatabaseDir();
    shell.openPath(dir);
    return { opened: true, path: dir };
  });

  ipcMain.handle("srr-desktop:reset-database", async () => {
    try {
      const dbPath = localDatabasePath();
      if (fs.existsSync(dbPath)) {
        fs.rmSync(dbPath, { force: true });
      }
      const cacheDir = localPresentationsCacheDir();
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
      return { success: true, ...getLocalDbStatus() };
    } catch (err: any) {
      return { success: false, error: err.message, ...getLocalDbStatus() };
    }
  });

  // Window Actions
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.handle("window:maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle("window:close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("window:toggle-fullscreen", () => {
    if (mainWindow) {
      const isFull = mainWindow.isFullScreen();
      mainWindow.setFullScreen(!isFull);
      return !isFull;
    }
    return false;
  });

  // Native PowerPoint / Presentation File Launcher
  ipcMain.handle("srr-desktop:open-native-file", async (_event, filePath: string) => {
    try {
      if (!filePath) {
        return { opened: false, error: "No file path provided" };
      }
      
      const localTarget = filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.startsWith("/api/")
        ? await downloadPresentationToCache(filePath)
        : path.isAbsolute(filePath) ? filePath : path.join(localPresentationsCacheDir(), path.basename(filePath));
      if (!fs.existsSync(localTarget)) {
        return { opened: false, error: "Presentation file is not cached on this workstation." };
      }
      const openError = await shell.openPath(localTarget);
      if (openError) return { opened: false, error: openError };
      startWatchingFile(localTarget);
      return { opened: true, localPath: localTarget };
    } catch (err: any) {
      return { opened: false, error: err.message };
    }
  });

  ipcMain.handle("srr-desktop:upload-modified-presentation", async (_event, payload: {
    filePath: string;
    speakerId: string;
    sessionSpeakerId: string;
    deviceKey?: string;
  }) => {
    try {
      if (!payload?.filePath || !payload.speakerId || !payload.sessionSpeakerId) {
        return { error: "Missing presentation upload context." };
      }
      return await uploadModifiedPresentation(payload);
    } catch (err: any) {
      return { error: err.message };
    }
  });

  function startWatchingFile(watchPath: string) {
    if (activeFileWatcher) {
      activeFileWatcher.close();
    }
    try {
      activeFileWatcher = fs.watch(watchPath, (eventType) => {
        if (eventType === "change") {
          mainWindow?.webContents.send("srr-desktop:file-modified", {
            filePath: watchPath,
            modifiedAt: new Date().toISOString(),
          });
        }
      });
    } catch {}
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
