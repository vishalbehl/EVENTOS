import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

let mainWindow: BrowserWindow | null = null;

function appRoot(): string {
  return path.resolve(__dirname, "..");
}

function repoRoot(): string {
  return path.resolve(appRoot(), "..", "..", "..");
}

function serviceRuntime(): { serviceRoot: string; pythonExe: string; runtimeAvailable: boolean } {
  const serviceRoot = path.join(repoRoot(), "services", "venue", "venue-server");
  const configuredPython = process.env.VENUE_SERVER_PYTHON;
  const candidates = [
    configuredPython,
    path.join(serviceRoot, ".venv", "Scripts", "python.exe"),
    path.join(serviceRoot, ".venv", "bin", "python"),
    path.join(repoRoot(), "services", "backend", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot(), "services", "backend", ".venv", "bin", "python"),
    path.join(repoRoot(), ".venv", "Scripts", "python.exe"),
    path.join(repoRoot(), ".venv", "bin", "python"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const pythonExe = candidates.find((candidate) => fs.existsSync(candidate));
  return {
    serviceRoot,
    pythonExe: pythonExe || (process.platform === "win32" ? "python.exe" : "python3"),
    runtimeAvailable: Boolean(pythonExe),
  };
}

function runPythonScript(scriptPath: string, args: string[]): Promise<any> {
  const runtime = serviceRuntime();
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Script not found: ${scriptPath}`));
    }
    const child = spawn(runtime.pythonExe, [scriptPath, ...args], {
      cwd: runtime.serviceRoot,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) {
            return reject(new Error(parsed.error));
          }
        } catch {
          // fall through
        }
        return reject(new Error(stderr.trim() || stdout.trim() || `Process exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        resolve({ success: true, raw: stdout.trim() });
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "EVENTOS | Venue Server Operations Console",
    backgroundColor: "#050505",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const url = process.env.ELECTRON_START_URL || (app.isPackaged ? "https://venue.local" : "http://127.0.0.1:3006");
  mainWindow.loadURL(url);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC Window Controls
ipcMain.on("window:minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window:maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on("window:close", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle("app:info", () => {
  return {
    version: app.getVersion(),
    name: "EventOS Venue Server Operations",
    platform: process.platform,
    isPackaged: app.isPackaged,
  };
});

ipcMain.handle("venue:get-setup-status", async () => {
  const envDir = path.join(repoRoot(), "services", "venue", "venue-server");
  const envPath = path.join(envDir, ".env");
  let dbUrl = "";
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) {
      dbUrl = match[1].trim();
    }
  }

  let dbName = "eventos_venue_server";
  let host = "127.0.0.1";
  let port = 5432;
  let user = "postgres";

  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl.replace(/^postgresql\+asyncpg:\/\//, "http://"));
      dbName = parsed.pathname.replace(/^\//, "") || dbName;
      host = parsed.hostname || host;
      port = parsed.port ? parseInt(parsed.port, 10) : port;
      user = parsed.username || user;
    } catch {
      // ignore
    }
  }

  return {
    configured: Boolean(dbUrl && !dbUrl.endsWith("/")),
    database: dbName,
    host,
    port,
    user,
    databaseUrl: dbUrl,
  };
});

ipcMain.handle("venue:setup-databases", async (_event, setup) => {
  const setupPayloadPath = path.join(app.getPath("userData"), `venue-setup-${Date.now()}.json`);
  fs.writeFileSync(setupPayloadPath, JSON.stringify(setup), "utf-8");

  try {
    const scriptPath = path.join(repoRoot(), "services", "venue", "venue-server", "scripts", "node", "setup_venue_databases.py");
    if (fs.existsSync(scriptPath)) {
      await runPythonScript(scriptPath, [setupPayloadPath]);
    } else {
      console.warn("setup_venue_databases.py not found at: " + scriptPath);
    }

    // Save DB credentials directly to the venue server env
    const envDir = path.join(repoRoot(), "services", "venue", "venue-server");
    fs.mkdirSync(envDir, { recursive: true });
    const envPath = path.join(envDir, ".env");
    const dbName = String(setup.database || "eventos_venue_server").trim();
    const dbUrl = `postgresql+asyncpg://${setup.user || "postgres"}:${setup.password || ""}@${setup.host || "127.0.0.1"}:${setup.port || 5432}/${dbName}`;
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

    if (envContent.includes("DATABASE_URL=")) {
      envContent = envContent.replace(/DATABASE_URL=.*/, `DATABASE_URL=${dbUrl}`);
    } else {
      envContent += `\nDATABASE_URL=${dbUrl}`;
    }
    fs.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");

    try {
      const mainPy = path.join(envDir, "app", "main.py");
      if (fs.existsSync(mainPy)) {
        const now = new Date();
        fs.utimesSync(mainPy, now, now);
      }
      await fetch("http://127.0.0.1:8001/api/v1/venue/admin/reload-database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_url: dbUrl }),
      });
    } catch {
      // ignore
    }

    return { success: true };
  } catch (error: any) {
    throw new Error(`Database setup failed: ${error.message}`);
  } finally {
    if (fs.existsSync(setupPayloadPath)) {
      fs.rmSync(setupPayloadPath, { force: true });
    }
  }
});

ipcMain.handle("venue:import-local-database", async () => {
  const openOptions: OpenDialogOptions = {
    title: "Import Eventos local database",
    properties: ["openFile"],
    filters: [
      { name: "SQLite database", extensions: ["db", "sqlite", "sqlite3"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, openOptions) : await dialog.showOpenDialog(openOptions);
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const destDir = path.join(repoRoot(), "services", "venue", "venue-server", "data");
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, "venue_imported.sqlite");
  fs.copyFileSync(result.filePaths[0], destPath);

  return { canceled: false, importedFrom: result.filePaths[0], path: destPath };
});

ipcMain.handle("venue:reset-venue-database", async () => {
  const envDir = path.join(repoRoot(), "services", "venue", "venue-server");
  const envPath = path.join(envDir, ".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf-8");
    envContent = envContent.replace(/^DATABASE_URL=.*$/m, "DATABASE_URL=");
    fs.writeFileSync(envPath, envContent, "utf-8");
  }

  const importedDb = path.join(repoRoot(), "services", "venue", "venue-server", "data", "venue_imported.sqlite");
  if (fs.existsSync(importedDb)) {
    fs.rmSync(importedDb, { force: true });
  }

  return { success: true };
});

