"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const node_os_1 = __importDefault(require("node:os"));
const node_fs_1 = __importDefault(require("node:fs"));
const DEFAULT_DESKTOP_URL = "http://127.0.0.1:3007";
const DEFAULT_VENUE_API_URL = "http://127.0.0.1:8001";
const desktopUrl = node_process_1.default.env.SRR_DESKTOP_URL || DEFAULT_DESKTOP_URL;
const venueApiUrl = node_process_1.default.env.NEXT_PUBLIC_VENUE_SERVER_URL || node_process_1.default.env.VENUE_SERVER_URL || DEFAULT_VENUE_API_URL;
const isProduction = node_process_1.default.env.NODE_ENV === "production";
if (!isProduction) {
    electron_1.app.setPath("userData", node_path_1.default.join(electron_1.app.getPath("appData"), "Eventos SRR Preview Dev"));
    electron_1.app.commandLine.appendSwitch("disk-cache-dir", node_path_1.default.join(node_os_1.default.tmpdir(), "eventos-srr-preview-electron-cache"));
}
let mainWindow = null;
let activeFileWatcher = null;
function localDatabaseDir() {
    const dir = node_path_1.default.join(electron_1.app.getPath("userData"), "srr-local");
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function localDatabasePath() {
    return node_path_1.default.join(localDatabaseDir(), "srr-local.db");
}
function validateSqliteFile(dbPath) {
    if (!node_fs_1.default.existsSync(dbPath)) {
        return { valid: false, message: "Replica file does not exist." };
    }
    const fd = node_fs_1.default.openSync(dbPath, "r");
    try {
        const header = Buffer.alloc(16);
        const read = node_fs_1.default.readSync(fd, header, 0, header.length, 0);
        if (read < 16) {
            return { valid: false, message: "Replica file is too small to be a SQLite database." };
        }
        const signature = header.toString("ascii");
        if (signature !== "SQLite format 3\u0000") {
            return { valid: false, message: "Replica file does not contain a valid SQLite header." };
        }
        return { valid: true, message: "SQLite header verified." };
    }
    finally {
        node_fs_1.default.closeSync(fd);
    }
}
function localPresentationsCacheDir() {
    const dir = node_path_1.default.join(electron_1.app.getPath("userData"), "cached_presentations");
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function filenameFromDisposition(value) {
    if (!value)
        return null;
    const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(value);
    return match ? decodeURIComponent(match[1].replace(/"/g, "")) : null;
}
async function downloadPresentationToCache(fileUrl) {
    const resolvedUrl = fileUrl.startsWith("http://") || fileUrl.startsWith("https://")
        ? fileUrl
        : new URL(fileUrl, venueApiUrl).toString();
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
        throw new Error(`Venue Server download failed (${response.status})`);
    }
    const nameFromHeader = filenameFromDisposition(response.headers.get("content-disposition"));
    const fallbackName = node_path_1.default.basename(new URL(resolvedUrl).pathname) || `presentation-${Date.now()}.bin`;
    const target = node_path_1.default.join(localPresentationsCacheDir(), nameFromHeader || fallbackName);
    const tempTarget = `${target}.${Date.now()}.tmp`;
    const buffer = Buffer.from(await response.arrayBuffer());
    node_fs_1.default.writeFileSync(tempTarget, buffer);
    node_fs_1.default.renameSync(tempTarget, target);
    return target;
}
async function uploadModifiedPresentation(input) {
    if (!node_fs_1.default.existsSync(input.filePath)) {
        throw new Error("Modified presentation file is not available on this workstation.");
    }
    const stat = node_fs_1.default.statSync(input.filePath);
    if (!stat.isFile() || stat.size <= 0) {
        throw new Error("Modified presentation file is empty or invalid.");
    }
    const form = new FormData();
    const filename = node_path_1.default.basename(input.filePath);
    const buffer = node_fs_1.default.readFileSync(input.filePath);
    form.append("speaker_id", input.speakerId);
    form.append("session_speaker_id", input.sessionSpeakerId);
    form.append("filename", filename);
    form.append("file_size_bytes", String(stat.size));
    form.append("file", new Blob([buffer]), filename);
    const headers = {};
    if (input.deviceKey)
        headers["X-Device-Key"] = input.deviceKey;
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
async function downloadReplicaFromServer() {
    const sourceUrl = new URL("/api/v1/srr/replica.sqlite", venueApiUrl).toString();
    const response = await fetch(sourceUrl);
    if (!response.ok) {
        throw new Error(`Venue Server replica download failed (${response.status})`);
    }
    const targetPath = localDatabasePath();
    const tempTarget = `${targetPath}.${Date.now()}.tmp`;
    const buffer = Buffer.from(await response.arrayBuffer());
    node_fs_1.default.writeFileSync(tempTarget, buffer);
    const validation = validateSqliteFile(tempTarget);
    if (!validation.valid) {
        node_fs_1.default.rmSync(tempTarget, { force: true });
        throw new Error(validation.message);
    }
    node_fs_1.default.renameSync(tempTarget, targetPath);
    return { ...getLocalDbStatus(), syncedFrom: sourceUrl };
}
function getLocalDbStatus() {
    const dbPath = localDatabasePath();
    if (!node_fs_1.default.existsSync(dbPath)) {
        return {
            exists: false,
            path: dbPath,
            sizeBytes: 0,
            tablesCount: 0,
            version: undefined,
        };
    }
    const stat = node_fs_1.default.statSync(dbPath);
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
    const interfaces = node_os_1.default.networkInterfaces();
    let ipv4 = "127.0.0.1";
    let mac = "00:00:00:00:00:00";
    let interfaceName = "loopback";
    for (const name of Object.keys(interfaces)) {
        const list = interfaces[name];
        if (!list)
            continue;
        for (const iface of list) {
            if (!iface.internal && iface.family === "IPv4") {
                ipv4 = iface.address;
                mac = iface.mac;
                interfaceName = name;
                break;
            }
        }
        if (ipv4 !== "127.0.0.1")
            break;
    }
    return {
        ipv4,
        mac: mac.toUpperCase(),
        interfaceName,
        hostname: node_os_1.default.hostname(),
        platform: node_os_1.default.platform(),
        osRelease: node_os_1.default.release(),
        arch: node_os_1.default.arch(),
        totalMemoryMB: Math.round(node_os_1.default.totalmem() / (1024 * 1024)),
        freeMemoryMB: Math.round(node_os_1.default.freemem() / (1024 * 1024)),
    };
}
async function handleImportDatabase() {
    const openOptions = {
        title: "Import Eventos SRR Local Database",
        properties: ["openFile"],
        filters: [
            { name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
            { name: "All Files", extensions: ["*"] },
        ],
    };
    const result = mainWindow ? await electron_1.dialog.showOpenDialog(mainWindow, openOptions) : await electron_1.dialog.showOpenDialog(openOptions);
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
        node_fs_1.default.copyFileSync(selectedPath, tempTarget);
        node_fs_1.default.renameSync(tempTarget, targetPath);
        mainWindow?.webContents.send("srr-desktop:db-imported", { source: selectedPath });
        return { canceled: false, importedFrom: selectedPath, ...getLocalDbStatus() };
    }
    catch (err) {
        return { canceled: true, error: err.message, ...getLocalDbStatus() };
    }
}
async function handleExportDatabase() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const saveOptions = {
        title: "Download Eventos SRR Database Snapshot",
        defaultPath: `eventos-srr-db-${timestamp}.sqlite`,
        filters: [
            { name: "SQLite Database", extensions: ["sqlite", "db"] },
            { name: "All Files", extensions: ["*"] },
        ],
    };
    const result = mainWindow ? await electron_1.dialog.showSaveDialog(mainWindow, saveOptions) : await electron_1.dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) {
        return { canceled: true, ...getLocalDbStatus() };
    }
    const sourcePath = localDatabasePath();
    try {
        if (!node_fs_1.default.existsSync(sourcePath)) {
            throw new Error("No local SQLite replica exists to export.");
        }
        const validation = validateSqliteFile(sourcePath);
        if (!validation.valid) {
            throw new Error(validation.message);
        }
        node_fs_1.default.copyFileSync(sourcePath, result.filePath);
        return { canceled: false, exportedTo: result.filePath, ...getLocalDbStatus() };
    }
    catch (err) {
        return { canceled: true, error: err.message, ...getLocalDbStatus() };
    }
}
function buildApplicationMenu() {
    const template = [
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
                        electron_1.shell.openPath(localDatabaseDir());
                    },
                },
                {
                    label: "Open Presentations Cache Folder",
                    click: () => {
                        electron_1.shell.openPath(localPresentationsCacheDir());
                    },
                },
                { type: "separator" },
                {
                    label: "Exit Application",
                    accelerator: node_process_1.default.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
                    click: () => {
                        electron_1.app.quit();
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
                        electron_1.dialog.showMessageBox(mainWindow, {
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
                        const res = await electron_1.dialog.showMessageBox(mainWindow, {
                            type: "warning",
                            buttons: ["Cancel", "Clear Cache"],
                            defaultId: 0,
                            title: "Clear Presentations Cache",
                            message: "Are you sure you want to clear temporary presentation files?",
                        });
                        if (res.response === 1) {
                            const cacheDir = localPresentationsCacheDir();
                            try {
                                node_fs_1.default.rmSync(cacheDir, { recursive: true, force: true });
                                node_fs_1.default.mkdirSync(cacheDir, { recursive: true });
                                mainWindow?.webContents.send("srr-desktop:cache-cleared");
                            }
                            catch { }
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
                        electron_1.dialog.showMessageBox(mainWindow, {
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
                        electron_1.shell.openExternal("http://127.0.0.1:8001/docs");
                    },
                },
                { type: "separator" },
                {
                    label: "About EVENTOS SRR",
                    click: () => {
                        electron_1.dialog.showMessageBox(mainWindow, {
                            type: "info",
                            title: "About EVENTOS",
                            message: "EVENTOS Speaker Ready Room (SRR) Preview System",
                            detail: `Version: ${electron_1.app.getVersion()}\nElectron: ${node_process_1.default.versions.electron}\nNode: ${node_process_1.default.versions.node}\nChromium: ${node_process_1.default.versions.chrome}`,
                        });
                    },
                },
            ],
        },
    ];
    return electron_1.Menu.buildFromTemplate(template);
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 1024,
        minHeight: 700,
        fullscreen: false,
        autoHideMenuBar: false, // Visible in normal windowed mode
        title: "EVENTOS | Speaker Ready Room (SRR)",
        backgroundColor: "#070809",
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    electron_1.Menu.setApplicationMenu(buildApplicationMenu());
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
electron_1.app.whenReady().then(() => {
    mainWindow = createWindow();
    // Desktop App Metadata & Telemetry
    electron_1.ipcMain.handle("srr-desktop:get-app-info", () => {
        return {
            appVersion: electron_1.app.getVersion(),
            desktopUrl,
            isDesktop: true,
            isPackaged: electron_1.app.isPackaged,
            platform: node_process_1.default.platform,
            system: getNetworkInfo(),
            localDatabase: getLocalDbStatus(),
        };
    });
    // Real Hardware Network Interfaces
    electron_1.ipcMain.handle("srr-desktop:get-system-info", () => {
        return getNetworkInfo();
    });
    // Local Database Operations
    electron_1.ipcMain.handle("srr-desktop:get-local-database-status", () => {
        return getLocalDbStatus();
    });
    electron_1.ipcMain.handle("srr-desktop:initialize-local-database", () => {
        const dbPath = localDatabasePath();
        if (!node_fs_1.default.existsSync(dbPath)) {
            throw new Error("Local SQLite replica is not available. Import or sync a real replica first.");
        }
        const validation = validateSqliteFile(dbPath);
        if (!validation.valid) {
            throw new Error(validation.message);
        }
        return getLocalDbStatus();
    });
    electron_1.ipcMain.handle("srr-desktop:sync-local-database", async () => {
        try {
            return await downloadReplicaFromServer();
        }
        catch (err) {
            return { ...getLocalDbStatus(), error: err.message };
        }
    });
    electron_1.ipcMain.handle("srr-desktop:import-local-database", async () => {
        return await handleImportDatabase();
    });
    electron_1.ipcMain.handle("srr-desktop:export-local-database", async () => {
        return await handleExportDatabase();
    });
    electron_1.ipcMain.handle("srr-desktop:open-database-folder", () => {
        const dir = localDatabaseDir();
        electron_1.shell.openPath(dir);
        return { opened: true, path: dir };
    });
    electron_1.ipcMain.handle("srr-desktop:reset-database", async () => {
        try {
            const dbPath = localDatabasePath();
            if (node_fs_1.default.existsSync(dbPath)) {
                node_fs_1.default.rmSync(dbPath, { force: true });
            }
            const cacheDir = localPresentationsCacheDir();
            if (node_fs_1.default.existsSync(cacheDir)) {
                node_fs_1.default.rmSync(cacheDir, { recursive: true, force: true });
            }
            return { success: true, ...getLocalDbStatus() };
        }
        catch (err) {
            return { success: false, error: err.message, ...getLocalDbStatus() };
        }
    });
    // Window Actions
    electron_1.ipcMain.handle("window:minimize", () => {
        mainWindow?.minimize();
    });
    electron_1.ipcMain.handle("window:maximize", () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            }
            else {
                mainWindow.maximize();
            }
        }
    });
    electron_1.ipcMain.handle("window:close", () => {
        mainWindow?.close();
    });
    electron_1.ipcMain.handle("window:toggle-fullscreen", () => {
        if (mainWindow) {
            const isFull = mainWindow.isFullScreen();
            mainWindow.setFullScreen(!isFull);
            return !isFull;
        }
        return false;
    });
    // Native PowerPoint / Presentation File Launcher
    electron_1.ipcMain.handle("srr-desktop:open-native-file", async (_event, filePath) => {
        try {
            if (!filePath) {
                return { opened: false, error: "No file path provided" };
            }
            const localTarget = filePath.startsWith("http://") || filePath.startsWith("https://") || filePath.startsWith("/api/")
                ? await downloadPresentationToCache(filePath)
                : node_path_1.default.isAbsolute(filePath) ? filePath : node_path_1.default.join(localPresentationsCacheDir(), node_path_1.default.basename(filePath));
            if (!node_fs_1.default.existsSync(localTarget)) {
                return { opened: false, error: "Presentation file is not cached on this workstation." };
            }
            const openError = await electron_1.shell.openPath(localTarget);
            if (openError)
                return { opened: false, error: openError };
            startWatchingFile(localTarget);
            return { opened: true, localPath: localTarget };
        }
        catch (err) {
            return { opened: false, error: err.message };
        }
    });
    electron_1.ipcMain.handle("srr-desktop:upload-modified-presentation", async (_event, payload) => {
        try {
            if (!payload?.filePath || !payload.speakerId || !payload.sessionSpeakerId) {
                return { error: "Missing presentation upload context." };
            }
            return await uploadModifiedPresentation(payload);
        }
        catch (err) {
            return { error: err.message };
        }
    });
    function startWatchingFile(watchPath) {
        if (activeFileWatcher) {
            activeFileWatcher.close();
        }
        try {
            activeFileWatcher = node_fs_1.default.watch(watchPath, (eventType) => {
                if (eventType === "change") {
                    mainWindow?.webContents.send("srr-desktop:file-modified", {
                        filePath: watchPath,
                        modifiedAt: new Date().toISOString(),
                    });
                }
            });
        }
        catch { }
    }
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            mainWindow = createWindow();
        }
    });
});
electron_1.app.on("window-all-closed", () => {
    if (node_process_1.default.platform !== "darwin") {
        electron_1.app.quit();
    }
});
