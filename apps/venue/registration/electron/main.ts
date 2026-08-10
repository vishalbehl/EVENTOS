import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";

const DEFAULT_DESKTOP_URL = "http://127.0.0.1:3005";
const desktopUrl = process.env.VENUE_DESKTOP_URL || DEFAULT_DESKTOP_URL;
const isProduction = process.env.NODE_ENV === "production";
const shouldOpenDevTools = process.env.VENUE_DESKTOP_OPEN_DEVTOOLS === "1";

if (!isProduction) {
  app.setPath("userData", path.join(app.getPath("appData"), "Eventos Venue Dev"));
  app.commandLine.appendSwitch("disk-cache-dir", path.join(os.tmpdir(), "eventos-venue-registration-electron-cache"));
}

let mainWindow: BrowserWindow | null = null;
let nodeAgentProcess: ChildProcessWithoutNullStreams | null = null;
let venueServerProcess: ChildProcessWithoutNullStreams | null = null;

type NodeConfiguration = {
  venue_server: string;
  assignment_id: string;
  enrollment_token: string;
  replica_path?: string;
};

type LocalDatabaseStatus = {
  exists: boolean;
  path: string;
  sizeBytes: number;
  updatedAt?: number;
  adminUsername?: string;
};

type RegistrationPostgresSetup = {
  local_admin_username: string;
  local_admin_password: string;
  host: string;
  port: number;
  database: string;
  postgres_user: string;
  postgres_password: string;
  maintenance_database?: string;
  create_if_missing?: boolean;
};

function appRoot(): string {
  return path.resolve(__dirname, "..");
}

function repoRoot(): string {
  return path.resolve(appRoot(), "..", "..", "..");
}

function nodeConfigPath(): string {
  return path.join(app.getPath("userData"), "node-config.json");
}

function defaultReplicaPath(): string {
  return uploadedRegistrationDatabasePath();
}

function bootstrapLocalDatabasePath(): string {
  return path.join(app.getPath("userData"), "bootstrap", "bootstrap-admin.db");
}

function uploadedRegistrationDatabasePath(): string {
  return path.join(app.getPath("userData"), "registration-local", "uploaded-registration.db");
}

function registrationDbConfigPath(): string {
  return path.join(app.getPath("userData"), "registration-shared-postgres.json");
}

function setupMarkerPath(): string {
  return path.join(app.getPath("userData"), "registration-setup.json");
}

function registrationPostgresSecretPath(): string {
  return path.join(app.getPath("userData"), "registration-shared-postgres.secret");
}

function localDatabaseStatus(databasePath = bootstrapLocalDatabasePath()): LocalDatabaseStatus {
  if (!fs.existsSync(databasePath)) {
    return { exists: false, path: databasePath, sizeBytes: 0 };
  }
  const stat = fs.statSync(databasePath);
  return {
    exists: true,
    path: databasePath,
    sizeBytes: stat.size,
    updatedAt: stat.mtimeMs,
  };
}

function serviceRuntime(): { serviceRoot: string; pythonExe: string; runtimeSource: string; runtimeAvailable: boolean; checkedPaths: string[] } {
  const serviceRoot = path.join(repoRoot(), "services", "registration-server");
  const configuredPython = process.env.REGISTRATION_SERVER_PYTHON || process.env.VENUE_REGISTRATION_PYTHON;
  const candidates = [
    configuredPython,
    path.join(serviceRoot, ".venv", "Scripts", "python.exe"),
    path.join(repoRoot(), "services", "venue-server", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot(), "services", "backend", ".venv", "Scripts", "python.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const pythonExe = candidates.find((candidate) => fs.existsSync(candidate));
  return {
    serviceRoot,
    pythonExe: pythonExe || "python",
    runtimeSource: pythonExe || "system-python",
    runtimeAvailable: Boolean(pythonExe),
    checkedPaths: candidates,
  };
}

function runPowerShell(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function runPythonJson(scriptPath: string, args: string[]): Promise<Record<string, unknown>> {
  const runtime = serviceRuntime();
  const { serviceRoot, pythonExe } = runtime;
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Registration Server helper script is missing: ${scriptPath}`));
      return;
    }
    if (!runtime.runtimeAvailable && pythonExe !== "python") {
      reject(new Error(`Registration Server Python runtime is missing. Checked: ${runtime.checkedPaths.join(", ")}`));
      return;
    }

    const child = spawn(pythonExe, [scriptPath, ...args], {
      cwd: serviceRoot,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python helper exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error("Python helper returned invalid JSON."));
      }
    });
    child.once("error", (error) => {
      reject(new Error(`Registration Server Python runtime is missing or cannot start: ${error.message}`));
    });
  });
}

function runtimeStatus(): Record<string, unknown> {
  const runtime = serviceRuntime();
  return {
    serviceRoot: runtime.serviceRoot,
    pythonExe: runtime.pythonExe,
    runtimeSource: runtime.runtimeSource,
    runtimeAvailable: runtime.runtimeAvailable,
    checkedPaths: runtime.checkedPaths,
  };
}

async function initializeLocalDatabase(): Promise<LocalDatabaseStatus> {
  const scriptPath = path.join(repoRoot(), "services", "registration-server", "scripts", "node", "initialize_local_db.py");
  const result = await runPythonJson(scriptPath, [bootstrapLocalDatabasePath()]);
  return {
    ...localDatabaseStatus(bootstrapLocalDatabasePath()),
    adminUsername: typeof result.adminUsername === "string" ? result.adminUsername : "admin",
  };
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeSetupMarker(payload: Record<string, unknown>): Record<string, unknown> {
  const marker = {
    ...payload,
    configuredAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(setupMarkerPath()), { recursive: true });
  fs.writeFileSync(setupMarkerPath(), JSON.stringify(marker, null, 2), "utf-8");
  return marker;
}

function savePostgresPassword(password: string): void {
  if (!password) return;
  fs.mkdirSync(path.dirname(registrationPostgresSecretPath()), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(registrationPostgresSecretPath(), safeStorage.encryptString(password).toString("base64"), "utf-8");
  } else {
    fs.writeFileSync(registrationPostgresSecretPath(), JSON.stringify({ insecureDevPassword: password }), "utf-8");
  }
}

function postgresAsyncUrl(setup: RegistrationPostgresSetup): string {
  const user = encodeURIComponent(setup.postgres_user);
  const password = encodeURIComponent(setup.postgres_password);
  return `postgresql+asyncpg://${user}:${password}@${setup.host}:${setup.port}/${setup.database}`;
}

function writeVenueServerDatabaseUrlValue(databaseUrl: string): string {
  const serviceRoot = path.join(repoRoot(), "services", "registration-server");
  const envPath = path.join(serviceRoot, ".env");
  const line = `DATABASE_URL=${databaseUrl}`;
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
  if (/^DATABASE_URL=.*$/m.test(content)) {
    content = content.replace(/^DATABASE_URL=.*$/m, line);
  } else {
    content = `${content.trimEnd()}${content.trimEnd() ? "\n" : ""}${line}\n`;
  }
  fs.writeFileSync(envPath, content, "utf-8");
  return envPath;
}

function writeVenueServerDatabaseUrl(setup: RegistrationPostgresSetup): string {
  return writeVenueServerDatabaseUrlValue(postgresAsyncUrl(setup));
}

function writeVenueServerDatabaseUrlFromRememberedConfig(config: Record<string, unknown>, password: string): string | null {
  const host = String(config.host || "");
  const port = Number(config.port || 5432);
  const database = String(config.database || "");
  const postgresUser = String(config.postgresUser || "");
  if (!host || !database || !postgresUser || !password) return null;
  const databaseUrl = `postgresql+asyncpg://${encodeURIComponent(postgresUser)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  return writeVenueServerDatabaseUrlValue(databaseUrl);
}

function readPostgresPassword(): string {
  if (!fs.existsSync(registrationPostgresSecretPath())) return "";
  try {
    const value = fs.readFileSync(registrationPostgresSecretPath(), "utf-8");
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    }
    return String(JSON.parse(value).insecureDevPassword || "");
  } catch {
    return "";
  }
}

async function registrationSetupStatus(): Promise<Record<string, unknown>> {
  const marker = readJsonFile(setupMarkerPath());
  const sharedPostgres = readJsonFile(registrationDbConfigPath());
  const rememberedPassword = readPostgresPassword();
  if (marker?.mode === "shared_postgres") {
    writeVenueServerDatabaseUrlFromRememberedConfig(marker, rememberedPassword);
  }
  let validation: Record<string, unknown> = { configured: false, reason: "setup_marker_missing" };
  if (marker) {
    const scriptPath = path.join(repoRoot(), "services", "registration-server", "scripts", "node", "validate_registration_setup.py");
    validation = await runPythonJson(scriptPath, [uploadedRegistrationDatabasePath(), setupMarkerPath(), rememberedPassword]);
  }
  return {
    configured: Boolean(validation.configured),
    marker,
    sharedPostgres,
    validation,
    localDatabase: localDatabaseStatus(bootstrapLocalDatabasePath()),
    uploadedLocalDatabase: localDatabaseStatus(uploadedRegistrationDatabasePath()),
  };
}

function stopNodeAgent(): void {
  if (nodeAgentProcess && !nodeAgentProcess.killed) {
    nodeAgentProcess.kill("SIGTERM");
  }
  nodeAgentProcess = null;
}

async function stopVenueServerOnPort(port = 8001): Promise<void> {
  if (venueServerProcess && !venueServerProcess.killed) {
    venueServerProcess.kill("SIGTERM");
  }
  venueServerProcess = null;

  const command = `
    $connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue;
    foreach ($connection in $connections) {
      $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue;
      if ($processInfo -and ($processInfo.CommandLine -match 'uvicorn|app\\.main:app|python')) {
        Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue;
      }
    }
  `;
  await runPowerShell(command);
}

function startVenueServer(): { started: boolean; status: string; port: number } {
  const { serviceRoot, pythonExe, runtimeAvailable } = serviceRuntime();
  if (!runtimeAvailable && pythonExe !== "python") {
    return { started: false, status: "runtime_missing", port: 8001 };
  }
  venueServerProcess = spawn(pythonExe, ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8001"], {
    cwd: serviceRoot,
    env: process.env,
  });
  venueServerProcess.stdout.on("data", (chunk) => console.log(`[registration-server] ${chunk}`.trim()));
  venueServerProcess.stderr.on("data", (chunk) => console.error(`[registration-server] ${chunk}`.trim()));
  venueServerProcess.once("exit", () => {
    venueServerProcess = null;
  });
  return { started: true, status: "started", port: 8001 };
}

async function waitForVenueServer(timeoutMs = 15000): Promise<{ ready: boolean; status: string }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fetch("http://127.0.0.1:8001/api/v1/auth/verify", { headers: { "X-Venue-Key": "venue_secret_key" } });
      return { ready: true, status: "ready" };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return { ready: false, status: "timeout" };
}

async function restartVenueServer(): Promise<Record<string, unknown>> {
  await stopVenueServerOnPort(8001);
  const start = startVenueServer();
  const readiness = await waitForVenueServer();
  return { ...start, ...readiness, restartRequired: false };
}

function normalizeNodeConfig(config: NodeConfiguration): Required<NodeConfiguration> {
  return {
    ...config,
    venue_server: config.venue_server.replace(/\/$/, ""),
    replica_path: config.replica_path || defaultReplicaPath(),
  };
}

function saveNodeConfig(config: NodeConfiguration): Required<NodeConfiguration> {
  const normalized = normalizeNodeConfig(config);
  fs.mkdirSync(path.dirname(nodeConfigPath()), { recursive: true });
  fs.writeFileSync(nodeConfigPath(), JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

function startNodeAgent(): { started: boolean; status: string; configPath: string; replicaPath?: string } {
  if (nodeAgentProcess && !nodeAgentProcess.killed) {
    return { started: false, status: "already_running", configPath: nodeConfigPath(), replicaPath: defaultReplicaPath() };
  }
  if (!fs.existsSync(nodeConfigPath())) {
    return { started: false, status: "missing_config", configPath: nodeConfigPath() };
  }

  const { serviceRoot, pythonExe, runtimeAvailable } = serviceRuntime();
  const scriptPath = path.join(serviceRoot, "scripts", "node", "run_node_agent.py");
  if ((!runtimeAvailable && pythonExe !== "python") || !fs.existsSync(scriptPath)) {
    return { started: false, status: "runtime_missing", configPath: nodeConfigPath(), replicaPath: defaultReplicaPath() };
  }

  nodeAgentProcess = spawn(pythonExe, [scriptPath, nodeConfigPath()], {
    cwd: serviceRoot,
    env: process.env,
  });
  nodeAgentProcess.stdout.on("data", (chunk) => console.log(`[venue-node] ${chunk}`.trim()));
  nodeAgentProcess.stderr.on("data", (chunk) => console.error(`[venue-node] ${chunk}`.trim()));
  nodeAgentProcess.once("exit", () => {
    nodeAgentProcess = null;
  });
  return { started: true, status: "started", configPath: nodeConfigPath(), replicaPath: defaultReplicaPath() };
}

function isAppOwnedUrl(url: string): boolean {
  if (url.startsWith("blob:")) return true;
  return new URL(url).origin === new URL(desktopUrl).origin;
}

function createPdfWindow(url: string): void {
  const pdfWindow = new BrowserWindow({
    width: 980,
    height: 900,
    minWidth: 720,
    minHeight: 640,
    title: "Eventos PDF Preview",
    backgroundColor: "#2b2b2b",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void pdfWindow.loadURL(url);
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    title: "Eventos Venue",
    backgroundColor: "#0f172a",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (!isProduction && shouldOpenDevTools) {
      mainWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("blob:")) {
      createPdfWindow(url);
      return { action: "deny" };
    }

    if (isAppOwnedUrl(url)) {
      return { action: "allow" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppOwnedUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(desktopUrl);
}

ipcMain.handle("venue-desktop:get-app-info", () => ({
  appVersion: app.getVersion(),
  desktopUrl,
  isDesktop: true,
  isPackaged: app.isPackaged,
  platform: process.platform,
}));

ipcMain.handle("venue-desktop:get-node-agent-status", async () => {
  try {
    const response = await fetch("http://127.0.0.1:8011/health");
    if (!response.ok) {
      return { running: false, status: `unhealthy:${response.status}` };
    }
    return { running: true, status: "ok", detail: await response.json() };
  } catch {
    return { running: false, status: "not_started" };
  }
});

ipcMain.handle("venue-desktop:save-node-config", (_event, config: NodeConfiguration) => {
  const saved = saveNodeConfig(config);
  return { config: saved, configPath: nodeConfigPath(), replicaPath: saved.replica_path };
});

ipcMain.handle("venue-desktop:start-node-agent", () => startNodeAgent());

ipcMain.handle("venue-desktop:initialize-local-database", async () => initializeLocalDatabase());

ipcMain.handle("venue-desktop:get-local-database-status", () => localDatabaseStatus());

ipcMain.handle("venue-desktop:import-local-database", async () => {
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
    return { canceled: true, ...localDatabaseStatus() };
  }

  stopNodeAgent();
  fs.mkdirSync(path.dirname(uploadedRegistrationDatabasePath()), { recursive: true });
  fs.copyFileSync(result.filePaths[0], uploadedRegistrationDatabasePath());
  await initializeLocalDatabase();
  const markScriptPath = path.join(repoRoot(), "services", "registration-server", "scripts", "node", "mark_registration_sqlite_setup.py");
  await runPythonJson(markScriptPath, [uploadedRegistrationDatabasePath()]);
  const marker = writeSetupMarker({ mode: "uploaded_local_db", importedFrom: result.filePaths[0], sqlitePath: uploadedRegistrationDatabasePath() });
  const agent = fs.existsSync(nodeConfigPath()) ? startNodeAgent() : { started: false, status: "missing_config", configPath: nodeConfigPath() };
  return { canceled: false, importedFrom: result.filePaths[0], marker, agent, ...localDatabaseStatus(uploadedRegistrationDatabasePath()) };
});

ipcMain.handle("venue-desktop:export-local-database", async () => {
  await initializeLocalDatabase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const saveOptions: SaveDialogOptions = {
    title: "Download updated local database",
    defaultPath: `eventos-venue-local-db-${timestamp}.sqlite`,
    filters: [
      { name: "SQLite database", extensions: ["sqlite", "db"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, saveOptions) : await dialog.showSaveDialog(saveOptions);
  if (result.canceled || !result.filePath) {
    return { canceled: true, ...localDatabaseStatus() };
  }

  const scriptPath = path.join(repoRoot(), "services", "registration-server", "scripts", "node", "export_local_db.py");
  const sourcePath = fs.existsSync(uploadedRegistrationDatabasePath()) ? uploadedRegistrationDatabasePath() : bootstrapLocalDatabasePath();
  const exported = await runPythonJson(scriptPath, [sourcePath, result.filePath]);
  return { canceled: false, ...exported };
});

ipcMain.handle("venue-desktop:open-local-database-folder", async () => {
  const sourcePath = fs.existsSync(uploadedRegistrationDatabasePath()) ? uploadedRegistrationDatabasePath() : bootstrapLocalDatabasePath();
  const folderPath = path.dirname(sourcePath);
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    const error = await shell.openPath(folderPath);
    return error ? { opened: false, path: folderPath, error } : { opened: true, path: folderPath };
  } catch (error) {
    return {
      opened: false,
      path: folderPath,
      error: error instanceof Error ? error.message : "Unable to open local database folder.",
    };
  }
});

ipcMain.handle("venue-desktop:load-local-snapshot", async (_event, snapshot: unknown) => {
  await initializeLocalDatabase();
  const snapshotPath = path.join(app.getPath("userData"), `local-db-snapshot-${Date.now()}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf-8");
  try {
    const scriptPath = path.join(repoRoot(), "services", "registration-server", "scripts", "node", "load_local_snapshot.py");
    const loaded = await runPythonJson(scriptPath, [uploadedRegistrationDatabasePath(), snapshotPath]);
    const markScriptPath = path.join(repoRoot(), "services", "registration-server", "scripts", "node", "mark_registration_sqlite_setup.py");
    await runPythonJson(markScriptPath, [uploadedRegistrationDatabasePath()]);
    return { ...localDatabaseStatus(uploadedRegistrationDatabasePath()), ...loaded };
  } finally {
    fs.rmSync(snapshotPath, { force: true });
  }
});

ipcMain.handle("venue-desktop:get-registration-setup-status", async () => {
  try {
    await initializeLocalDatabase();
    return {
      ...(await registrationSetupStatus()),
      runtime: runtimeStatus(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration setup status failed.";
    return {
      configured: false,
      marker: readJsonFile(setupMarkerPath()),
      sharedPostgres: readJsonFile(registrationDbConfigPath()),
      validation: {
        configured: false,
        reason: "runtime_missing",
        error: message,
      },
      runtime: runtimeStatus(),
      localDatabase: localDatabaseStatus(bootstrapLocalDatabasePath()),
      uploadedLocalDatabase: localDatabaseStatus(uploadedRegistrationDatabasePath()),
    };
  }
});

ipcMain.handle("venue-desktop:setup-registration-postgres", async (_event, setup: RegistrationPostgresSetup) => {
  await initializeLocalDatabase();
  const setupPayloadPath = path.join(app.getPath("userData"), `registration-postgres-setup-${Date.now()}.json`);
  fs.writeFileSync(setupPayloadPath, JSON.stringify(setup), "utf-8");
  try {
    const scriptPath = path.join(repoRoot(), "services", "registration-server", "scripts", "node", "setup_registration_postgres.py");
    const result = await runPythonJson(scriptPath, [bootstrapLocalDatabasePath(), setupPayloadPath]);
    const safeConfig = {
      mode: "shared_postgres",
      host: setup.host,
      port: setup.port,
      database: setup.database,
      postgresUser: setup.postgres_user,
      configuredAt: new Date().toISOString(),
    };
    fs.writeFileSync(registrationDbConfigPath(), JSON.stringify(safeConfig, null, 2), "utf-8");
    savePostgresPassword(setup.postgres_password);
    const serverEnvPath = writeVenueServerDatabaseUrl(setup);
    const marker = writeSetupMarker(safeConfig);
    const serverRestart = await restartVenueServer();
    return { ...result, marker, configPath: registrationDbConfigPath(), serverEnvPath, serverRestart };
  } finally {
    fs.rmSync(setupPayloadPath, { force: true });
  }
});

app.whenReady().then(() => {
  void initializeLocalDatabase().catch((error) => console.error(`[venue-local-db] ${error}`));
  startNodeAgent();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (nodeAgentProcess && !nodeAgentProcess.killed) {
    nodeAgentProcess.kill("SIGTERM");
  }
  if (venueServerProcess && !venueServerProcess.killed) {
    venueServerProcess.kill("SIGTERM");
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
