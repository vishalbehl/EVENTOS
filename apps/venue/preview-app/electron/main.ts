import { app, BrowserWindow, ipcMain, shell, Menu, dialog, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DESKTOP_URL = "http://127.0.0.1:3007";
const DEFAULT_VENUE_API_URL = "http://127.0.0.1:8001";
const desktopUrl = process.env.SRR_DESKTOP_URL || DEFAULT_DESKTOP_URL;
const venueApiUrl = process.env.NEXT_PUBLIC_VENUE_SERVER_URL || process.env.VENUE_SERVER_URL || DEFAULT_VENUE_API_URL;
const venueDeviceId = process.env.VENUE_DEVICE_ID || "";
const venueDeviceToken = process.env.VENUE_DEVICE_TOKEN || "";
const srrDeviceKey = process.env.SRR_DEVICE_KEY || "";
const srrStationId = process.env.SRR_STATION_ID || "";
const srrEventId = process.env.SRR_EVENT_ID || "";
const isProduction = process.env.NODE_ENV === "production";
const minimumFreeBytes = Number(process.env.SRR_MIN_FREE_BYTES || 512 * 1024 * 1024);
const allowedPresentationExtensions = new Set([
  ".ppt", ".pptx", ".pdf", ".mp4", ".webm", ".png", ".jpg", ".jpeg", ".gif",
  ".txt", ".doc", ".docx", ".xls", ".xlsx", ".odp",
]);

if (!isProduction) {
  app.setPath("userData", path.join(app.getPath("appData"), "Eventos SRR Preview Dev"));
  app.commandLine.appendSwitch("disk-cache-dir", path.join(os.tmpdir(), "eventos-srr-preview-electron-cache"));
}

let mainWindow: BrowserWindow | null = null;
let activeFileWatcher: fs.FSWatcher | null = null;
let srrDeliveryTimer: NodeJS.Timeout | null = null;
let srrReplicaTimer: NodeJS.Timeout | null = null;
let srrRuntimeTimer: NodeJS.Timeout | null = null;
let srrAccessToken: string | null = null;

async function ensureSrrAccessToken(): Promise<void> {
  if (!srrDeviceKey || !srrStationId || srrAccessToken) return;
  const response = await fetch(new URL("/api/v1/auth/srr/token", venueApiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ station_id: srrStationId, enrollment_token: srrDeviceKey }),
  });
  if (!response.ok) throw new Error(`SRR station enrollment failed (${response.status})`);
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("Venue Server did not issue an SRR station access token");
  srrAccessToken = result.access_token;
}

function localDatabaseDir(): string {
  const dir = path.join(app.getPath("userData"), "srr-local");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function localDatabasePath(): string {
  return path.join(localDatabaseDir(), "srr-local.db");
}

function localCacheDatabasePath(): string {
  return path.join(localDatabaseDir(), "srr-cache.sqlite");
}

type CacheDatabase = InstanceType<typeof DatabaseSync>;

function withCacheDatabase<T>(callback: (database: CacheDatabase) => T): T {
  const database = new DatabaseSync(localCacheDatabasePath());
  try {
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("PRAGMA journal_mode = WAL");
    backupCacheDatabaseBeforeMigration(database);
    migrateCacheDatabase(database);
    return callback(database);
  } finally {
    database.close();
  }
}

function backupCacheDatabaseBeforeMigration(database: CacheDatabase): void {
  const currentVersion = Number(database.prepare("PRAGMA user_version").get()?.user_version || 0);
  if (currentVersion >= 2) return;
  const sourcePath = localCacheDatabasePath();
  if (!fs.existsSync(sourcePath)) return;

  // SQLite migrations are transactional, but keep a recoverable copy before
  // changing an existing workstation database. Checkpoint WAL content first
  // so the backup contains the latest committed state.
  database.exec("PRAGMA wal_checkpoint(FULL)");
  const backupPath = `${sourcePath}.pre-migration.bak`;
  const temporaryBackup = `${backupPath}.tmp`;
  fs.copyFileSync(sourcePath, temporaryBackup);
  fs.renameSync(temporaryBackup, backupPath);
}

function migrateCacheDatabase(database: CacheDatabase): void {
  const currentVersion = Number(database.prepare("PRAGMA user_version").get()?.user_version || 0);
  if (currentVersion >= 2) return;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS presentation_cache (
        cache_key TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        filename TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        local_path TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('received', 'verified', 'failed', 'stale')),
        source_transfer_id TEXT,
        last_verified_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (file_id, version_number)
      );
      CREATE INDEX IF NOT EXISTS idx_presentation_cache_file ON presentation_cache(file_id, version_number);
      CREATE INDEX IF NOT EXISTS idx_presentation_cache_state ON presentation_cache(state, updated_at);
      CREATE TABLE IF NOT EXISTS delivery_acknowledgements (
        transfer_id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        target_node TEXT NOT NULL,
        target_type TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('received', 'verified', 'failed')),
        error TEXT,
        acknowledged_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_delivery_ack_file ON delivery_acknowledgements(file_id, version_number);
      CREATE TABLE IF NOT EXISTS replica_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS incoming_server_events (
        sequence INTEGER PRIMARY KEY,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_incoming_events_event ON incoming_server_events(event_id, sequence);
      CREATE TABLE IF NOT EXISTS outbox_mutations (
        operation_id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        entity_version INTEGER,
        device_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        local_timestamp TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('pending', 'syncing', 'applied', 'conflict', 'failed')),
        server_error TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_mutations_status ON outbox_mutations(status, updated_at);
      CREATE TABLE IF NOT EXISTS replica_conflicts (
        id TEXT PRIMARY KEY,
        operation_id TEXT,
        entity_id TEXT,
        reason TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_replica_conflicts_operation ON replica_conflicts(operation_id, created_at);
      PRAGMA user_version = 2;
    `);
    database.exec("COMMIT");
    const migratedAt = new Date().toISOString();
    database.prepare(`
      INSERT INTO replica_meta (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run("local_schema_version", "2", migratedAt);
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function cacheKey(fileId: string, versionNumber: number): string {
  return `${fileId}:v${versionNumber}`;
}

function recordCacheEntry(input: {
  fileId: string;
  versionNumber: number;
  filename: string;
  sha256: string;
  sizeBytes: number;
  localPath: string;
  state: "received" | "verified" | "failed" | "stale";
  sourceTransferId?: string;
  error?: string;
}): void {
  const now = new Date().toISOString();
  withCacheDatabase((database) => {
    database.prepare(`
      INSERT INTO presentation_cache
        (cache_key, file_id, version_number, filename, sha256, size_bytes, local_path, state, source_transfer_id, last_verified_at, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_id, version_number) DO UPDATE SET
        filename = excluded.filename,
        sha256 = excluded.sha256,
        size_bytes = excluded.size_bytes,
        local_path = excluded.local_path,
        state = excluded.state,
        source_transfer_id = excluded.source_transfer_id,
        last_verified_at = excluded.last_verified_at,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `).run(
      cacheKey(input.fileId, input.versionNumber), input.fileId, input.versionNumber, input.filename,
      input.sha256, input.sizeBytes, input.localPath, input.state, input.sourceTransferId || null,
      input.state === "verified" ? now : null, input.error || null, now, now,
    );
  });
}

function recordDeliveryAcknowledgement(input: {
  transferId: string;
  fileId: string;
  versionNumber: number;
  targetNode: string;
  targetType: string;
  sha256: string;
  sizeBytes: number;
  state: "received" | "verified" | "failed";
  error?: string;
}): void {
  const now = new Date().toISOString();
  withCacheDatabase((database) => {
    database.prepare(`
      INSERT INTO delivery_acknowledgements
        (transfer_id, file_id, version_number, target_node, target_type, sha256, size_bytes, state, error, acknowledged_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transfer_id) DO UPDATE SET
        state = excluded.state,
        sha256 = excluded.sha256,
        size_bytes = excluded.size_bytes,
        error = excluded.error,
        acknowledged_at = excluded.acknowledged_at,
        updated_at = excluded.updated_at
    `).run(
      input.transferId, input.fileId, input.versionNumber, input.targetNode, input.targetType,
      input.sha256, input.sizeBytes, input.state, input.error || null,
      input.state === "verified" ? now : null, now,
    );
  });
}

function recordOutboxMutation(input: {
  operationId: string;
  entityId: string;
  entityVersion?: number;
  payload: Record<string, unknown>;
  status: "pending" | "syncing" | "applied" | "conflict" | "failed";
  retryCount: number;
  serverError?: string;
}): void {
  const now = new Date().toISOString();
  withCacheDatabase((database) => {
    database.prepare(`
      INSERT INTO outbox_mutations
        (operation_id, entity_id, entity_version, device_id, payload, local_timestamp, retry_count, status, server_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(operation_id) DO UPDATE SET
        retry_count = excluded.retry_count,
        status = excluded.status,
        server_error = excluded.server_error,
        updated_at = excluded.updated_at
    `).run(
      input.operationId, input.entityId, input.entityVersion ?? null, srrStationId || os.hostname(),
      JSON.stringify(input.payload), now, input.retryCount, input.status, input.serverError || null, now,
    );
  });
}

function cacheRuntimeCursor(): number {
  return withCacheDatabase((database) => {
    const row = database.prepare("SELECT value FROM replica_meta WHERE key = 'server_sequence'").get() as { value?: string } | undefined;
    const cursor = Number(row?.value || 0);
    return Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
  });
}

function recordRuntimeEvents(events: Array<any>, cursor: number): void {
  withCacheDatabase((database) => {
    const now = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      const insert = database.prepare(`
        INSERT OR IGNORE INTO incoming_server_events
          (sequence, event_id, event_type, entity_type, entity_id, payload, created_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const event of events) {
        insert.run(
          Number(event.sequence), String(event.event_id || ""), String(event.event_type || ""),
          String(event.entity_type || ""), String(event.entity_id || ""),
          JSON.stringify(event.payload || {}), String(event.created_at || now), now,
        );
      }
      const latest = Math.max(cursor, ...events.map((event) => Number(event.sequence) || 0));
      const upsert = database.prepare(`
        INSERT INTO replica_meta (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      upsert.run("server_sequence", String(latest), now);
      upsert.run("last_runtime_sync_at", now, now);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  });
}

async function synchronizeSrrRuntimeEvents(): Promise<{ received: number; cursor: number }> {
  if (!srrDeviceKey || !srrEventId) return { received: 0, cursor: cacheRuntimeCursor() };
  const after = cacheRuntimeCursor();
  const response = await srrFetch(new URL(`/api/v1/venue/runtime/${srrEventId}/events?after=${after}`, venueApiUrl));
  if (!response.ok) throw new Error(`SRR runtime event sync failed (${response.status})`);
  const result = await response.json() as { events?: Array<any>; cursor?: number };
  const events = Array.isArray(result.events) ? result.events : [];
  recordRuntimeEvents(events, Number(result.cursor || after));
  return { received: events.length, cursor: cacheRuntimeCursor() };
}

function offlineUploadDir(): string {
  const dir = path.join(localDatabaseDir(), "offline-uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function offlineUploadQueuePath(): string {
  return path.join(localDatabaseDir(), "offline-upload-outbox.json");
}

type OfflineUpload = {
  operationId: string;
  filePath: string;
  filename: string;
  speakerId: string;
  sessionSpeakerId: string;
  expectedVersion?: number;
  queuedAt: string;
  retryCount: number;
  lastError?: string;
  status: "pending" | "uploaded" | "conflict";
};

function readOfflineUploadQueue(): OfflineUpload[] {
  const queuePath = offlineUploadQueuePath();
  if (!fs.existsSync(queuePath)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(queuePath, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeOfflineUploadQueue(queue: OfflineUpload[]): void {
  const target = offlineUploadQueuePath();
  const temp = `${target}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(queue, null, 2));
  fs.renameSync(temp, target);
}

function queueOfflineUpload(input: { filePath: string; speakerId: string; sessionSpeakerId: string; expectedVersion?: number; operationId?: string }): OfflineUpload {
  const filename = path.basename(input.filePath);
  const extension = path.extname(filename).toLowerCase();
  if (!allowedPresentationExtensions.has(extension)) throw new Error(`Format ${extension || "unknown"} is not supported by the SRR workstation.`);
  const operationId = input.operationId || crypto.randomUUID();
  const stagedPath = path.join(offlineUploadDir(), `${operationId}${extension}`);
  assertCacheCapacity(fs.statSync(input.filePath).size);
  fs.copyFileSync(input.filePath, stagedPath);
  const entry: OfflineUpload = { operationId, filePath: stagedPath, filename, speakerId: input.speakerId, sessionSpeakerId: input.sessionSpeakerId, expectedVersion: input.expectedVersion, queuedAt: new Date().toISOString(), retryCount: 0, status: "pending" };
  writeOfflineUploadQueue([...readOfflineUploadQueue(), entry]);
  recordOutboxMutation({ operationId, entityId: input.sessionSpeakerId, entityVersion: input.expectedVersion, payload: { file_path: stagedPath, filename, speaker_id: input.speakerId, session_speaker_id: input.sessionSpeakerId }, status: "pending", retryCount: 0 });
  return entry;
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

function localCacheCapacity() {
  const stats = fs.statfsSync(localPresentationsCacheDir());
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  return { freeBytes, minimumFreeBytes, sufficient: freeBytes >= minimumFreeBytes };
}

function removeTemporaryCacheArtifacts(): number {
  const dir = localPresentationsCacheDir();
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".part") && !name.endsWith(".error.json") && !name.endsWith(".tmp")) continue;
    fs.rmSync(path.join(dir, name), { force: true });
    removed += 1;
  }
  return removed;
}

function assertCacheCapacity(bytesToWrite: number): void {
  const capacity = localCacheCapacity();
  if (capacity.freeBytes - bytesToWrite < capacity.minimumFreeBytes) {
    throw new Error(`SRR workstation disk space is below the configured safety reserve (${Math.round(capacity.minimumFreeBytes / 1024 / 1024)} MB).`);
  }
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
  const parsedUrl = new URL(resolvedUrl);
  if (parsedUrl.origin !== new URL(venueApiUrl).origin || !parsedUrl.pathname.startsWith("/api/v1/")) {
    throw new Error("SRR may only download presentations from the configured Venue Server API.");
  }
  // Native opening is also a server download path. Always use the short-lived
  // station token exchange and retry behavior; never send the enrollment key
  // directly when the installed client is running outside local development.
  const response = await srrFetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Venue Server download failed (${response.status})`);
  }
  const nameFromHeader = filenameFromDisposition(response.headers.get("content-disposition"));
  const fallbackName = path.basename(new URL(resolvedUrl).pathname) || `presentation-${Date.now()}.bin`;
  const safeName = path.basename(nameFromHeader || fallbackName);
  const extension = path.extname(safeName).toLowerCase();
  if (!allowedPresentationExtensions.has(extension)) {
    throw new Error(`Format ${extension || "unknown"} is not supported by the SRR workstation.`);
  }
  const target = path.join(localPresentationsCacheDir(), safeName);
  const tempTarget = `${target}.${Date.now()}.tmp`;
  const buffer = Buffer.from(await response.arrayBuffer());
  const expectedChecksum = response.headers.get("x-file-sha256");
  if (expectedChecksum) {
    const actualChecksum = crypto.createHash("sha256").update(buffer).digest("hex");
    if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
      throw new Error("Downloaded presentation checksum does not match Venue Server.");
    }
  }
  fs.writeFileSync(tempTarget, buffer);
  fs.renameSync(tempTarget, target);
  return target;
}

function resolveCachedPresentationPath(filePath: string): string {
  const cacheRoot = path.resolve(localPresentationsCacheDir());
  const resolved = path.resolve(filePath);
  const relative = path.relative(cacheRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("SRR may only open files already stored in its verified presentation cache.");
  }
  const extension = path.extname(resolved).toLowerCase();
  if (!allowedPresentationExtensions.has(extension)) {
    throw new Error(`Format ${extension || "unknown"} is not supported by the SRR workstation.`);
  }
  return resolved;
}

function venueDeviceHeaders(): Record<string, string> {
  return {
    ...(venueDeviceId && venueDeviceToken ? { "X-Venue-Device-Id": venueDeviceId, "X-Device-Token": venueDeviceToken } : {}),
    ...(srrDeviceKey ? { "X-Device-Key": srrAccessToken || srrDeviceKey } : {}),
  };
}

async function srrFetch(input: string | URL, init: RequestInit = {}, retry = true): Promise<Response> {
  await ensureSrrAccessToken();
  const response = await fetch(input, {
    ...init,
    headers: { ...venueDeviceHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (response.status === 401 && retry && srrDeviceKey && srrStationId) {
    srrAccessToken = null;
    return srrFetch(input, init, false);
  }
  return response;
}

async function sendPresentationUpload(input: {
  filePath: string;
  speakerId: string;
  sessionSpeakerId: string;
  expectedVersion?: number;
  operationId?: string;
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
  if (input.expectedVersion !== undefined) form.append("expected_version", String(input.expectedVersion));
  form.append("operation_id", input.operationId || crypto.randomUUID());
  form.append("file", new Blob([buffer]), filename);

  const response = await srrFetch(new URL("/api/v1/srr/files/upload", venueApiUrl), {
    method: "POST",
    body: form,
    headers: venueDeviceHeaders(),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Venue Server upload failed (${response.status}): ${detail || response.statusText}`);
  }
  return response.json();
}

async function synchronizeOfflineUploads(): Promise<{ processed: number; uploaded: number; conflicts: number }> {
  const queue = readOfflineUploadQueue();
  let uploaded = 0;
  let conflicts = 0;
  for (const entry of queue) {
    if (entry.status !== "pending") continue;
    if (!fs.existsSync(entry.filePath)) {
      entry.status = "conflict";
      entry.lastError = "Offline staged file is missing from this workstation.";
      recordOutboxMutation({ operationId: entry.operationId, entityId: entry.sessionSpeakerId, entityVersion: entry.expectedVersion, payload: { filename: entry.filename }, status: "conflict", retryCount: entry.retryCount, serverError: entry.lastError });
      conflicts += 1;
      continue;
    }
    try {
      await sendPresentationUpload({ filePath: entry.filePath, speakerId: entry.speakerId, sessionSpeakerId: entry.sessionSpeakerId, expectedVersion: entry.expectedVersion, operationId: entry.operationId });
      fs.rmSync(entry.filePath, { force: true });
      entry.status = "uploaded";
      entry.lastError = undefined;
      recordOutboxMutation({ operationId: entry.operationId, entityId: entry.sessionSpeakerId, entityVersion: entry.expectedVersion, payload: { filename: entry.filename }, status: "applied", retryCount: entry.retryCount });
      uploaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      entry.retryCount += 1;
      entry.lastError = message;
      if (message.includes("(409)")) {
        entry.status = "conflict";
        recordOutboxMutation({ operationId: entry.operationId, entityId: entry.sessionSpeakerId, entityVersion: entry.expectedVersion, payload: { filename: entry.filename }, status: "conflict", retryCount: entry.retryCount, serverError: entry.lastError });
        conflicts += 1;
      }
    }
  }
  writeOfflineUploadQueue(queue);
  return { processed: queue.length, uploaded, conflicts };
}

async function uploadModifiedPresentation(input: {
  filePath: string;
  speakerId: string;
  sessionSpeakerId: string;
  expectedVersion?: number;
}): Promise<any> {
  const operationId = crypto.randomUUID();
  try {
    return await sendPresentationUpload({ ...input, operationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("(409)")) throw error;
    const queued = queueOfflineUpload({ ...input, operationId });
    return { status: "queued_offline", offline: true, operation_id: queued.operationId, filename: queued.filename, message: "Venue Server is unavailable. The presentation was staged locally for reconnect synchronization." };
  }
}

async function synchronizeSrrDeliveries(): Promise<{ processed: number; verified: number; failed: number }> {
  if (!srrDeviceKey) return { processed: 0, verified: 0, failed: 0 };
  await ensureSrrAccessToken();
  await synchronizeOfflineUploads();
  const manifestResponse = await srrFetch(new URL("/api/v1/venue/distribution/manifest", venueApiUrl));
  if (!manifestResponse.ok) throw new Error(`SRR delivery manifest failed (${manifestResponse.status})`);
  const manifest = await manifestResponse.json() as { transfers?: Array<any> };
  let verified = 0;
  let failed = 0;
  for (const transfer of manifest.transfers || []) {
    if (!["pending", "failed", "received"].includes(transfer.status)) continue;
    let partialTarget = "";
    let expectedChecksum = "";
    let expectedSize = 0;
    try {
      const claim = await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/claim`, venueApiUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: `srr:${os.hostname()}` }),
      });
      if (!claim.ok) continue;
      const extension = path.extname(transfer.filename || ".bin") || ".bin";
      const target = path.join(localPresentationsCacheDir(), `${transfer.file_id}.v${transfer.version_number}${extension}`);
      partialTarget = `${target}.part`;
      let offset = fs.existsSync(partialTarget) ? fs.statSync(partialTarget).size : 0;
      const partialHandle = fs.openSync(partialTarget, "a");
      try {
        while (true) {
          const chunk = await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/download?offset=${offset}&chunk_size=4194304`, venueApiUrl));
          if (!chunk.ok) throw new Error(`file chunk download failed (${chunk.status})`);
          const chunkBytes = Buffer.from(await chunk.arrayBuffer());
          expectedChecksum = chunk.headers.get("x-file-sha256") || expectedChecksum;
          expectedSize = Number(chunk.headers.get("x-file-size") || expectedSize);
          if (!chunkBytes.length) break;
          assertCacheCapacity(chunkBytes.length);
          fs.writeSync(partialHandle, chunkBytes);
          offset += chunkBytes.length;
          await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/progress`, venueApiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner: `srr:${os.hostname()}`, bytes_received: offset, total_bytes: expectedSize }),
          });
          if (offset >= expectedSize) break;
        }
      } finally {
        fs.closeSync(partialHandle);
      }
      const buffer = fs.readFileSync(partialTarget);
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
      if (!expectedChecksum || checksum.toLowerCase() !== expectedChecksum.toLowerCase() || (expectedSize && buffer.length !== expectedSize)) throw new Error("downloaded file checksum or size mismatch");
      fs.renameSync(partialTarget, target);
      fs.writeFileSync(`${target}.json`, JSON.stringify({ file_id: transfer.file_id, version_number: transfer.version_number, filename: transfer.filename, sha256: checksum, size_bytes: buffer.length, local_path: target, verified_at: new Date().toISOString() }, null, 2));
      recordCacheEntry({ fileId: transfer.file_id, versionNumber: transfer.version_number, filename: transfer.filename, sha256: checksum, sizeBytes: buffer.length, localPath: target, state: "received", sourceTransferId: transfer.id });
      const acknowledgement = await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/acknowledge`, venueApiUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_node: transfer.target_node, target_type: transfer.target_type, file_id: transfer.file_id, version_number: transfer.version_number, sha256: checksum, size_bytes: buffer.length }),
      });
      if (!acknowledgement.ok) throw new Error(`delivery acknowledgement failed (${acknowledgement.status})`);
      recordDeliveryAcknowledgement({ transferId: transfer.id, fileId: transfer.file_id, versionNumber: transfer.version_number, targetNode: transfer.target_node, targetType: transfer.target_type, sha256: checksum, sizeBytes: buffer.length, state: "verified" });
      recordCacheEntry({ fileId: transfer.file_id, versionNumber: transfer.version_number, filename: transfer.filename, sha256: checksum, sizeBytes: buffer.length, localPath: target, state: "verified", sourceTransferId: transfer.id });
      verified += 1;
    } catch (error) {
      failed += 1;
      // A completed transfer with a bad checksum must restart from byte zero.
      // Keep partial data only for transport/interruption failures so retries
      // can resume without ever appending to corrupt content.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("checksum") || message.includes("size mismatch")) {
        try { fs.rmSync(partialTarget, { force: true }); } catch { /* best effort cleanup */ }
      }
      if (partialTarget) {
        try {
          fs.writeFileSync(`${partialTarget}.error.json`, JSON.stringify({ transfer_id: transfer.id, error: message, observed_at: new Date().toISOString() }, null, 2));
        } catch { /* best effort diagnostic */ }
      }
      try {
        recordDeliveryAcknowledgement({ transferId: transfer.id, fileId: transfer.file_id, versionNumber: transfer.version_number, targetNode: transfer.target_node, targetType: transfer.target_type, sha256: expectedChecksum || "", sizeBytes: expectedSize || 0, state: "failed", error: message });
        if (fs.existsSync(partialTarget)) {
          recordCacheEntry({ fileId: transfer.file_id, versionNumber: transfer.version_number, filename: transfer.filename, sha256: expectedChecksum || "", sizeBytes: expectedSize || 0, localPath: partialTarget, state: "failed", sourceTransferId: transfer.id, error: message });
        }
      } catch { /* diagnostics must not stop other transfers */ }
      console.warn("SRR delivery synchronization failed", transfer.id, error);
    }
  }
  return { processed: (manifest.transfers || []).length, verified, failed };
}

async function downloadReplicaFromServer(): Promise<ReturnType<typeof getLocalDbStatus> & { syncedFrom?: string; error?: string }> {
  const sourceUrl = new URL("/api/v1/srr/replica.sqlite", venueApiUrl).toString();
  const response = await srrFetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Venue Server replica download failed (${response.status})`);
  }
  const targetPath = localDatabasePath();
  const tempTarget = `${targetPath}.${Date.now()}.tmp`;
  const buffer = Buffer.from(await response.arrayBuffer());
  const expectedChecksum = response.headers.get("x-replica-sha256");
  if (!expectedChecksum) throw new Error("Venue Server replica response did not include an integrity checksum.");
  const actualChecksum = crypto.createHash("sha256").update(buffer).digest("hex");
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error("Venue Server replica checksum verification failed.");
  }
  // A server snapshot must never silently replace a local replica that still
  // contains an unacknowledged mutation or an unresolved conflict. Keep the
  // local state and let the operator reconcile it explicitly.
  const hasUnreconciledMutations = withCacheDatabase((database) => {
    const row = database.prepare("SELECT COUNT(*) AS count FROM outbox_mutations WHERE status IN ('pending', 'syncing', 'conflict')").get() as { count?: number };
    return Number(row?.count || 0) > 0;
  });
  if (hasUnreconciledMutations) {
    throw new Error("Local SRR changes are awaiting reconciliation; the authoritative replica was not replaced.");
  }
  fs.writeFileSync(tempTarget, buffer);
  const validation = validateSqliteFile(tempTarget);
  if (!validation.valid) {
    fs.rmSync(tempTarget, { force: true });
    throw new Error(validation.message);
  }
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, `${targetPath}.pre-sync.bak`);
  }
  fs.renameSync(tempTarget, targetPath);
  withCacheDatabase((database) => {
    const now = new Date().toISOString();
    const statement = database.prepare(`
      INSERT INTO replica_meta (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    statement.run("last_sync_at", now, now);
    statement.run("last_sync_source", sourceUrl, now);
    statement.run("replica_schema_version", "4", now);
  });
  return { ...getLocalDbStatus(), syncedFrom: sourceUrl };
}

async function synchronizeSrrReplica(): Promise<void> {
  // Never replace a replica while a local presentation mutation is waiting
  // for reconciliation; the pending operation is the newer local state.
  if (readOfflineUploadQueue().some((entry) => entry.status === "pending")) return;
  await downloadReplicaFromServer();
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
  let ipv4: string | null = null;
  let mac: string | null = null;
  let interfaceName: string | null = null;

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
    if (ipv4) break;
  }

  return {
    ipv4,
    mac: mac ? mac.toUpperCase() : null,
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
              message: "Remove only incomplete transfer files? Verified presentation versions are protected.",
            });
            if (res.response === 1) {
              try {
                const removed = removeTemporaryCacheArtifacts();
                mainWindow?.webContents.send("srr-desktop:cache-cleared", { removed });
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
  if (srrDeviceKey) {
    void synchronizeSrrDeliveries().catch(() => undefined);
    void synchronizeSrrRuntimeEvents().catch(() => undefined);
    srrDeliveryTimer = setInterval(() => void synchronizeSrrDeliveries().catch(() => undefined), 15000);
    srrRuntimeTimer = setInterval(() => void synchronizeSrrRuntimeEvents().catch(() => undefined), 15000);
    void synchronizeSrrReplica().catch(() => undefined);
    srrReplicaTimer = setInterval(() => void synchronizeSrrReplica().catch(() => undefined), 60000);
  }

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

  ipcMain.handle("srr-desktop:get-cache-status", () => {
    const capacity = localCacheCapacity();
    const cache = withCacheDatabase((database) => database.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN state = 'verified' THEN 1 ELSE 0 END) AS verified, SUM(CASE WHEN state IN ('failed', 'stale') THEN 1 ELSE 0 END) AS attention FROM presentation_cache").get() as { count?: number; verified?: number; attention?: number });
    const runtime = withCacheDatabase((database) => database.prepare("SELECT (SELECT COUNT(*) FROM incoming_server_events) AS events, (SELECT value FROM replica_meta WHERE key = 'server_sequence') AS sequence, (SELECT value FROM replica_meta WHERE key = 'last_runtime_sync_at') AS last_sync").get() as { events?: number; sequence?: string; last_sync?: string });
    const outbox = withCacheDatabase((database) => database.prepare("SELECT SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflicts FROM outbox_mutations").get() as { pending?: number; conflicts?: number });
    return { ...capacity, cachedFiles: Number(cache.count || 0), verifiedFiles: Number(cache.verified || 0), attentionFiles: Number(cache.attention || 0), runtimeEvents: Number(runtime.events || 0), serverSequence: Number(runtime.sequence || 0), lastRuntimeSyncAt: runtime.last_sync || null, pendingMutations: Number(outbox.pending || 0), conflicts: Number(outbox.conflicts || 0), policy: "authoritative versions are retained; obsolete versions require explicit operator cleanup" };
  });

  ipcMain.handle("srr-desktop:get-offline-upload-status", () => {
    const items = readOfflineUploadQueue();
    return {
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      uploaded: items.filter((item) => item.status === "uploaded").length,
      conflicts: items.filter((item) => item.status === "conflict").length,
      items: items.map(({ operationId, filename, status, retryCount, lastError, queuedAt }) => ({ operationId, filename, status, retryCount, lastError, queuedAt })),
    };
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
      const cacheDbPath = localCacheDatabasePath();
      if (fs.existsSync(cacheDbPath)) fs.rmSync(cacheDbPath, { force: true });
      for (const suffix of ["-shm", "-wal"]) {
        fs.rmSync(`${cacheDbPath}${suffix}`, { force: true });
      }
      removeTemporaryCacheArtifacts();
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
        : resolveCachedPresentationPath(filePath);
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
    expectedVersion?: number;
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
  if (srrDeliveryTimer) {
    clearInterval(srrDeliveryTimer);
    srrDeliveryTimer = null;
  }
  if (srrReplicaTimer) {
    clearInterval(srrReplicaTimer);
    srrReplicaTimer = null;
  }
  if (srrRuntimeTimer) {
    clearInterval(srrRuntimeTimer);
    srrRuntimeTimer = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
