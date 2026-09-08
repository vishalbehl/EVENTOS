"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let mainWindow = null;
function appRoot() {
    return path_1.default.resolve(__dirname, "..");
}
function repoRoot() {
    return path_1.default.resolve(appRoot(), "..", "..", "..");
}
function serviceRuntime() {
    const serviceRoot = path_1.default.join(repoRoot(), "services", "venue", "venue-server");
    const configuredPython = process.env.VENUE_SERVER_PYTHON;
    const candidates = [
        configuredPython,
        path_1.default.join(serviceRoot, ".venv", "Scripts", "python.exe"),
        path_1.default.join(serviceRoot, ".venv", "bin", "python"),
        path_1.default.join(repoRoot(), "services", "backend", ".venv", "Scripts", "python.exe"),
        path_1.default.join(repoRoot(), "services", "backend", ".venv", "bin", "python"),
        path_1.default.join(repoRoot(), ".venv", "Scripts", "python.exe"),
        path_1.default.join(repoRoot(), ".venv", "bin", "python"),
    ].filter((candidate) => Boolean(candidate));
    const pythonExe = candidates.find((candidate) => fs_1.default.existsSync(candidate));
    return {
        serviceRoot,
        pythonExe: pythonExe || (process.platform === "win32" ? "python.exe" : "python3"),
        runtimeAvailable: Boolean(pythonExe),
    };
}
function runPythonScript(scriptPath, args) {
    const runtime = serviceRuntime();
    return new Promise((resolve, reject) => {
        if (!fs_1.default.existsSync(scriptPath)) {
            return reject(new Error(`Script not found: ${scriptPath}`));
        }
        const child = (0, child_process_1.spawn)(runtime.pythonExe, [scriptPath, ...args], {
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
                }
                catch {
                    // fall through
                }
                return reject(new Error(stderr.trim() || stdout.trim() || `Process exited with code ${code}`));
            }
            try {
                const parsed = JSON.parse(stdout.trim());
                resolve(parsed);
            }
            catch {
                resolve({ success: true, raw: stdout.trim() });
            }
        });
        child.on("error", (err) => {
            reject(err);
        });
    });
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1100,
        minHeight: 700,
        title: "EVENTOS | Venue Server Operations Console",
        backgroundColor: "#050505",
        webPreferences: {
            preload: path_1.default.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });
    const url = process.env.ELECTRON_START_URL || (electron_1.app.isPackaged ? "https://venue.local" : "http://127.0.0.1:3006");
    mainWindow.loadURL(url);
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
// IPC Window Controls
electron_1.ipcMain.on("window:minimize", () => {
    if (mainWindow)
        mainWindow.minimize();
});
electron_1.ipcMain.on("window:maximize", () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        }
        else {
            mainWindow.maximize();
        }
    }
});
electron_1.ipcMain.on("window:close", () => {
    if (mainWindow)
        mainWindow.close();
});
electron_1.ipcMain.handle("app:info", () => {
    return {
        version: electron_1.app.getVersion(),
        name: "EventOS Venue Server Operations",
        platform: process.platform,
        isPackaged: electron_1.app.isPackaged,
    };
});
electron_1.ipcMain.handle("venue:get-setup-status", async () => {
    const envDir = path_1.default.join(repoRoot(), "services", "venue", "venue-server");
    const envPath = path_1.default.join(envDir, ".env");
    let dbUrl = "";
    if (fs_1.default.existsSync(envPath)) {
        const envContent = fs_1.default.readFileSync(envPath, "utf-8");
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
        }
        catch {
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
electron_1.ipcMain.handle("venue:setup-databases", async (_event, setup) => {
    // Electron runs on Windows, outside the Compose network. Translate the
    // Docker-only service hostname to the published host port before invoking
    // the provisioning script.
    const requestedHost = String(setup?.host || "127.0.0.1").trim();
    const requestedPort = Number(setup?.port || 5433);
    const normalizedSetup = {
        ...setup,
        host: requestedHost === "venue-db" ? "127.0.0.1" : requestedHost,
        port: requestedHost === "venue-db" && requestedPort === 5432 ? 5433 : requestedPort,
    };
    const setupPayloadPath = path_1.default.join(electron_1.app.getPath("userData"), `venue-setup-${Date.now()}.json`);
    fs_1.default.writeFileSync(setupPayloadPath, JSON.stringify(normalizedSetup), "utf-8");
    try {
        const scriptPath = path_1.default.join(repoRoot(), "services", "venue", "venue-server", "scripts", "node", "setup_venue_databases.py");
        if (fs_1.default.existsSync(scriptPath)) {
            await runPythonScript(scriptPath, [setupPayloadPath]);
        }
        else {
            console.warn("setup_venue_databases.py not found at: " + scriptPath);
        }
        // Save DB credentials directly to the venue server env
        const envDir = path_1.default.join(repoRoot(), "services", "venue", "venue-server");
        fs_1.default.mkdirSync(envDir, { recursive: true });
        const envPath = path_1.default.join(envDir, ".env");
        const dbName = String(normalizedSetup.database || "venue_db").trim();
        const dbUrl = `postgresql+asyncpg://${normalizedSetup.user || "postgres"}:${normalizedSetup.password || ""}@${normalizedSetup.host || "127.0.0.1"}:${normalizedSetup.port || 5433}/${dbName}`;
        let envContent = fs_1.default.existsSync(envPath) ? fs_1.default.readFileSync(envPath, "utf-8") : "";
        if (envContent.includes("DATABASE_URL=")) {
            envContent = envContent.replace(/DATABASE_URL=.*/, `DATABASE_URL=${dbUrl}`);
        }
        else {
            envContent += `\nDATABASE_URL=${dbUrl}`;
        }
        fs_1.default.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");
        try {
            const reloadHeaders = { "Content-Type": "application/json", "X-Venue-Bootstrap": "local-desktop" };
            const reloadUrls = [
                // Host-run development backend.
                { url: "http://127.0.0.1:8001/api/v1/venue/admin/reload-database", database_url: dbUrl },
                // Docker backend: venue-db is resolvable only inside the Compose network.
                { url: "http://127.0.0.1:8001/api/v1/venue/admin/reload-database", database_url: `postgresql+asyncpg://${normalizedSetup.user || "postgres"}:${normalizedSetup.password || "venue_password"}@venue-db:5432/${dbName}` },
            ];
            let lastError = "unknown reload error";
            let reloaded = false;
            for (const candidate of reloadUrls) {
                try {
                    const response = await fetch(candidate.url, {
                        method: "POST",
                        headers: reloadHeaders,
                        body: JSON.stringify({ database_url: candidate.database_url }),
                    });
                    if (response.ok) {
                        reloaded = true;
                        break;
                    }
                    lastError = await response.text();
                }
                catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                }
            }
            if (!reloaded)
                throw new Error(lastError);
        }
        catch (error) {
            throw new Error(`Venue Server database reload failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return { success: true };
    }
    catch (error) {
        throw new Error(`Database setup failed: ${error.message}`);
    }
    finally {
        if (fs_1.default.existsSync(setupPayloadPath)) {
            fs_1.default.rmSync(setupPayloadPath, { force: true });
        }
    }
});
electron_1.ipcMain.handle("venue:import-local-database", async () => {
    const openOptions = {
        title: "Import Eventos local database",
        properties: ["openFile"],
        filters: [
            { name: "SQLite database", extensions: ["db", "sqlite", "sqlite3"] },
            { name: "All files", extensions: ["*"] },
        ],
    };
    const result = mainWindow ? await electron_1.dialog.showOpenDialog(mainWindow, openOptions) : await electron_1.dialog.showOpenDialog(openOptions);
    if (result.canceled || !result.filePaths[0]) {
        return { canceled: true };
    }
    const destDir = path_1.default.join(repoRoot(), "services", "venue", "venue-server", "data");
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const destPath = path_1.default.join(destDir, "venue_imported.sqlite");
    fs_1.default.copyFileSync(result.filePaths[0], destPath);
    return { canceled: false, importedFrom: result.filePaths[0], path: destPath };
});
electron_1.ipcMain.handle("venue:reset-venue-database", async () => {
    const envDir = path_1.default.join(repoRoot(), "services", "venue", "venue-server");
    const envPath = path_1.default.join(envDir, ".env");
    if (fs_1.default.existsSync(envPath)) {
        let envContent = fs_1.default.readFileSync(envPath, "utf-8");
        envContent = envContent.replace(/^DATABASE_URL=.*$/m, "DATABASE_URL=");
        fs_1.default.writeFileSync(envPath, envContent, "utf-8");
    }
    const importedDb = path_1.default.join(repoRoot(), "services", "venue", "venue-server", "data", "venue_imported.sqlite");
    if (fs_1.default.existsSync(importedDb)) {
        fs_1.default.rmSync(importedDb, { force: true });
    }
    return { success: true };
});
