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
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_sqlite_1 = require("node:sqlite");
const DEFAULT_DESKTOP_URL = "http://127.0.0.1:3007";
const DEFAULT_VENUE_API_URL = "http://127.0.0.1:8001";
const desktopUrl = node_process_1.default.env.SRR_DESKTOP_URL || DEFAULT_DESKTOP_URL;
const venueApiUrl = node_process_1.default.env.NEXT_PUBLIC_VENUE_SERVER_URL || node_process_1.default.env.VENUE_SERVER_URL || DEFAULT_VENUE_API_URL;
const venueDeviceId = node_process_1.default.env.VENUE_DEVICE_ID || "";
const venueDeviceToken = node_process_1.default.env.VENUE_DEVICE_TOKEN || "";
const srrDeviceKey = node_process_1.default.env.SRR_DEVICE_KEY || "";
const srrStationId = node_process_1.default.env.SRR_STATION_ID || "";
const srrEventId = node_process_1.default.env.SRR_EVENT_ID || "";
const isProduction = node_process_1.default.env.NODE_ENV === "production";
const minimumFreeBytes = Number(node_process_1.default.env.SRR_MIN_FREE_BYTES || 512 * 1024 * 1024);
const allowedPresentationExtensions = new Set([
    ".ppt", ".pptx", ".pdf", ".mp4", ".webm", ".png", ".jpg", ".jpeg", ".gif",
    ".txt", ".doc", ".docx", ".xls", ".xlsx", ".odp",
]);
if (!isProduction) {
    electron_1.app.setPath("userData", node_path_1.default.join(electron_1.app.getPath("appData"), "Eventos SRR Preview Dev"));
    electron_1.app.commandLine.appendSwitch("disk-cache-dir", node_path_1.default.join(node_os_1.default.tmpdir(), "eventos-srr-preview-electron-cache"));
}
let mainWindow = null;
let activeFileWatcher = null;
let srrDeliveryTimer = null;
let srrReplicaTimer = null;
let srrRuntimeTimer = null;
let srrAccessToken = null;
async function ensureSrrAccessToken() {
    if (!srrDeviceKey || !srrStationId || srrAccessToken)
        return;
    const response = await fetch(new URL("/api/v1/auth/srr/token", venueApiUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ station_id: srrStationId, enrollment_token: srrDeviceKey }),
    });
    if (!response.ok)
        throw new Error(`SRR station enrollment failed (${response.status})`);
    const result = await response.json();
    if (!result.access_token)
        throw new Error("Venue Server did not issue an SRR station access token");
    srrAccessToken = result.access_token;
}
function localDatabaseDir() {
    const dir = node_path_1.default.join(electron_1.app.getPath("userData"), "srr-local");
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function localDatabasePath() {
    return node_path_1.default.join(localDatabaseDir(), "srr-local.db");
}
function localCacheDatabasePath() {
    return node_path_1.default.join(localDatabaseDir(), "srr-cache.sqlite");
}
function withCacheDatabase(callback) {
    const database = new node_sqlite_1.DatabaseSync(localCacheDatabasePath());
    try {
        database.exec("PRAGMA busy_timeout = 5000");
        database.exec("PRAGMA journal_mode = WAL");
        backupCacheDatabaseBeforeMigration(database);
        migrateCacheDatabase(database);
        return callback(database);
    }
    finally {
        database.close();
    }
}
function backupCacheDatabaseBeforeMigration(database) {
    const currentVersion = Number(database.prepare("PRAGMA user_version").get()?.user_version || 0);
    if (currentVersion >= 2)
        return;
    const sourcePath = localCacheDatabasePath();
    if (!node_fs_1.default.existsSync(sourcePath))
        return;
    // SQLite migrations are transactional, but keep a recoverable copy before
    // changing an existing workstation database. Checkpoint WAL content first
    // so the backup contains the latest committed state.
    database.exec("PRAGMA wal_checkpoint(FULL)");
    const backupPath = `${sourcePath}.pre-migration.bak`;
    const temporaryBackup = `${backupPath}.tmp`;
    node_fs_1.default.copyFileSync(sourcePath, temporaryBackup);
    node_fs_1.default.renameSync(temporaryBackup, backupPath);
}
function migrateCacheDatabase(database) {
    const currentVersion = Number(database.prepare("PRAGMA user_version").get()?.user_version || 0);
    if (currentVersion >= 2)
        return;
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
    }
    catch (error) {
        database.exec("ROLLBACK");
        throw error;
    }
}
function cacheKey(fileId, versionNumber) {
    return `${fileId}:v${versionNumber}`;
}
function recordCacheEntry(input) {
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
    `).run(cacheKey(input.fileId, input.versionNumber), input.fileId, input.versionNumber, input.filename, input.sha256, input.sizeBytes, input.localPath, input.state, input.sourceTransferId || null, input.state === "verified" ? now : null, input.error || null, now, now);
    });
}
function recordDeliveryAcknowledgement(input) {
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
    `).run(input.transferId, input.fileId, input.versionNumber, input.targetNode, input.targetType, input.sha256, input.sizeBytes, input.state, input.error || null, input.state === "verified" ? now : null, now);
    });
}
function recordOutboxMutation(input) {
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
    `).run(input.operationId, input.entityId, input.entityVersion ?? null, srrStationId || node_os_1.default.hostname(), JSON.stringify(input.payload), now, input.retryCount, input.status, input.serverError || null, now);
    });
}
function cacheRuntimeCursor() {
    return withCacheDatabase((database) => {
        const row = database.prepare("SELECT value FROM replica_meta WHERE key = 'server_sequence'").get();
        const cursor = Number(row?.value || 0);
        return Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
    });
}
function recordRuntimeEvents(events, cursor) {
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
                insert.run(Number(event.sequence), String(event.event_id || ""), String(event.event_type || ""), String(event.entity_type || ""), String(event.entity_id || ""), JSON.stringify(event.payload || {}), String(event.created_at || now), now);
            }
            const latest = Math.max(cursor, ...events.map((event) => Number(event.sequence) || 0));
            const upsert = database.prepare(`
        INSERT INTO replica_meta (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
            upsert.run("server_sequence", String(latest), now);
            upsert.run("last_runtime_sync_at", now, now);
            database.exec("COMMIT");
        }
        catch (error) {
            database.exec("ROLLBACK");
            throw error;
        }
    });
}
async function synchronizeSrrRuntimeEvents() {
    if (!srrDeviceKey || !srrEventId)
        return { received: 0, cursor: cacheRuntimeCursor() };
    const after = cacheRuntimeCursor();
    const response = await srrFetch(new URL(`/api/v1/venue/runtime/${srrEventId}/events?after=${after}`, venueApiUrl));
    if (!response.ok)
        throw new Error(`SRR runtime event sync failed (${response.status})`);
    const result = await response.json();
    const events = Array.isArray(result.events) ? result.events : [];
    recordRuntimeEvents(events, Number(result.cursor || after));
    return { received: events.length, cursor: cacheRuntimeCursor() };
}
function offlineUploadDir() {
    const dir = node_path_1.default.join(localDatabaseDir(), "offline-uploads");
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function offlineUploadQueuePath() {
    return node_path_1.default.join(localDatabaseDir(), "offline-upload-outbox.json");
}
function readOfflineUploadQueue() {
    const queuePath = offlineUploadQueuePath();
    if (!node_fs_1.default.existsSync(queuePath))
        return [];
    try {
        const value = JSON.parse(node_fs_1.default.readFileSync(queuePath, "utf8"));
        return Array.isArray(value) ? value : [];
    }
    catch {
        return [];
    }
}
function writeOfflineUploadQueue(queue) {
    const target = offlineUploadQueuePath();
    const temp = `${target}.${Date.now()}.tmp`;
    node_fs_1.default.writeFileSync(temp, JSON.stringify(queue, null, 2));
    node_fs_1.default.renameSync(temp, target);
}
function queueOfflineUpload(input) {
    const filename = node_path_1.default.basename(input.filePath);
    const extension = node_path_1.default.extname(filename).toLowerCase();
    if (!allowedPresentationExtensions.has(extension))
        throw new Error(`Format ${extension || "unknown"} is not supported by the SRR workstation.`);
    const operationId = input.operationId || node_crypto_1.default.randomUUID();
    const stagedPath = node_path_1.default.join(offlineUploadDir(), `${operationId}${extension}`);
    assertCacheCapacity(node_fs_1.default.statSync(input.filePath).size);
    node_fs_1.default.copyFileSync(input.filePath, stagedPath);
    const entry = { operationId, filePath: stagedPath, filename, speakerId: input.speakerId, sessionSpeakerId: input.sessionSpeakerId, expectedVersion: input.expectedVersion, queuedAt: new Date().toISOString(), retryCount: 0, status: "pending" };
    writeOfflineUploadQueue([...readOfflineUploadQueue(), entry]);
    recordOutboxMutation({ operationId, entityId: input.sessionSpeakerId, entityVersion: input.expectedVersion, payload: { file_path: stagedPath, filename, speaker_id: input.speakerId, session_speaker_id: input.sessionSpeakerId }, status: "pending", retryCount: 0 });
    return entry;
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
function localCacheCapacity() {
    const stats = node_fs_1.default.statfsSync(localPresentationsCacheDir());
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return { freeBytes, minimumFreeBytes, sufficient: freeBytes >= minimumFreeBytes };
}
function removeTemporaryCacheArtifacts() {
    const dir = localPresentationsCacheDir();
    let removed = 0;
    for (const name of node_fs_1.default.readdirSync(dir)) {
        if (!name.endsWith(".part") && !name.endsWith(".error.json") && !name.endsWith(".tmp"))
            continue;
        node_fs_1.default.rmSync(node_path_1.default.join(dir, name), { force: true });
        removed += 1;
    }
    return removed;
}
function assertCacheCapacity(bytesToWrite) {
    const capacity = localCacheCapacity();
    if (capacity.freeBytes - bytesToWrite < capacity.minimumFreeBytes) {
        throw new Error(`SRR workstation disk space is below the configured safety reserve (${Math.round(capacity.minimumFreeBytes / 1024 / 1024)} MB).`);
    }
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
    const fallbackName = node_path_1.default.basename(new URL(resolvedUrl).pathname) || `presentation-${Date.now()}.bin`;
    const safeName = node_path_1.default.basename(nameFromHeader || fallbackName);
    const extension = node_path_1.default.extname(safeName).toLowerCase();
    if (!allowedPresentationExtensions.has(extension)) {
        throw new Error(`Format ${extension || "unknown"} is not supported by the SRR workstation.`);
    }
    const target = node_path_1.default.join(localPresentationsCacheDir(), safeName);
    const tempTarget = `${target}.${Date.now()}.tmp`;
    const buffer = Buffer.from(await response.arrayBuffer());
    const expectedChecksum = response.headers.get("x-file-sha256");
    if (expectedChecksum) {
        const actualChecksum = node_crypto_1.default.createHash("sha256").update(buffer).digest("hex");
        if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
            throw new Error("Downloaded presentation checksum does not match Venue Server.");
        }
    }
    node_fs_1.default.writeFileSync(tempTarget, buffer);
    node_fs_1.default.renameSync(tempTarget, target);
    return target;
}
function resolveCachedPresentationPath(filePath) {
    const cacheRoot = node_path_1.default.resolve(localPresentationsCacheDir());
    const resolved = node_path_1.default.resolve(filePath);
    const relative = node_path_1.default.relative(cacheRoot, resolved);
    if (relative.startsWith("..") || node_path_1.default.isAbsolute(relative)) {
        throw new Error("SRR may only open files already stored in its verified presentation cache.");
    }
    const extension = node_path_1.default.extname(resolved).toLowerCase();
    if (!allowedPresentationExtensions.has(extension)) {
        throw new Error(`Format ${extension || "unknown"} is not supported by the SRR workstation.`);
    }
    return resolved;
}
function venueDeviceHeaders() {
    return {
        ...(venueDeviceId && venueDeviceToken ? { "X-Venue-Device-Id": venueDeviceId, "X-Device-Token": venueDeviceToken } : {}),
        ...(srrDeviceKey ? { "X-Device-Key": srrAccessToken || srrDeviceKey } : {}),
    };
}
async function srrFetch(input, init = {}, retry = true) {
    await ensureSrrAccessToken();
    const response = await fetch(input, {
        ...init,
        headers: { ...venueDeviceHeaders(), ...init.headers },
    });
    if (response.status === 401 && retry && srrDeviceKey && srrStationId) {
        srrAccessToken = null;
        return srrFetch(input, init, false);
    }
    return response;
}
async function sendPresentationUpload(input) {
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
    if (input.expectedVersion !== undefined)
        form.append("expected_version", String(input.expectedVersion));
    form.append("operation_id", input.operationId || node_crypto_1.default.randomUUID());
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
async function synchronizeOfflineUploads() {
    const queue = readOfflineUploadQueue();
    let uploaded = 0;
    let conflicts = 0;
    for (const entry of queue) {
        if (entry.status !== "pending")
            continue;
        if (!node_fs_1.default.existsSync(entry.filePath)) {
            entry.status = "conflict";
            entry.lastError = "Offline staged file is missing from this workstation.";
            recordOutboxMutation({ operationId: entry.operationId, entityId: entry.sessionSpeakerId, entityVersion: entry.expectedVersion, payload: { filename: entry.filename }, status: "conflict", retryCount: entry.retryCount, serverError: entry.lastError });
            conflicts += 1;
            continue;
        }
        try {
            await sendPresentationUpload({ filePath: entry.filePath, speakerId: entry.speakerId, sessionSpeakerId: entry.sessionSpeakerId, expectedVersion: entry.expectedVersion, operationId: entry.operationId });
            node_fs_1.default.rmSync(entry.filePath, { force: true });
            entry.status = "uploaded";
            entry.lastError = undefined;
            recordOutboxMutation({ operationId: entry.operationId, entityId: entry.sessionSpeakerId, entityVersion: entry.expectedVersion, payload: { filename: entry.filename }, status: "applied", retryCount: entry.retryCount });
            uploaded += 1;
        }
        catch (error) {
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
async function uploadModifiedPresentation(input) {
    const operationId = node_crypto_1.default.randomUUID();
    try {
        return await sendPresentationUpload({ ...input, operationId });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("(409)"))
            throw error;
        const queued = queueOfflineUpload({ ...input, operationId });
        return { status: "queued_offline", offline: true, operation_id: queued.operationId, filename: queued.filename, message: "Venue Server is unavailable. The presentation was staged locally for reconnect synchronization." };
    }
}
async function synchronizeSrrDeliveries() {
    if (!srrDeviceKey)
        return { processed: 0, verified: 0, failed: 0 };
    await ensureSrrAccessToken();
    await synchronizeOfflineUploads();
    const manifestResponse = await srrFetch(new URL("/api/v1/venue/distribution/manifest", venueApiUrl));
    if (!manifestResponse.ok)
        throw new Error(`SRR delivery manifest failed (${manifestResponse.status})`);
    const manifest = await manifestResponse.json();
    let verified = 0;
    let failed = 0;
    for (const transfer of manifest.transfers || []) {
        if (!["pending", "failed", "received"].includes(transfer.status))
            continue;
        let partialTarget = "";
        let expectedChecksum = "";
        let expectedSize = 0;
        try {
            const claim = await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/claim`, venueApiUrl), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner: `srr:${node_os_1.default.hostname()}` }),
            });
            if (!claim.ok)
                continue;
            const extension = node_path_1.default.extname(transfer.filename || ".bin") || ".bin";
            const target = node_path_1.default.join(localPresentationsCacheDir(), `${transfer.file_id}.v${transfer.version_number}${extension}`);
            partialTarget = `${target}.part`;
            let offset = node_fs_1.default.existsSync(partialTarget) ? node_fs_1.default.statSync(partialTarget).size : 0;
            const partialHandle = node_fs_1.default.openSync(partialTarget, "a");
            try {
                while (true) {
                    const chunk = await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/download?offset=${offset}&chunk_size=4194304`, venueApiUrl));
                    if (!chunk.ok)
                        throw new Error(`file chunk download failed (${chunk.status})`);
                    const chunkBytes = Buffer.from(await chunk.arrayBuffer());
                    expectedChecksum = chunk.headers.get("x-file-sha256") || expectedChecksum;
                    expectedSize = Number(chunk.headers.get("x-file-size") || expectedSize);
                    if (!chunkBytes.length)
                        break;
                    assertCacheCapacity(chunkBytes.length);
                    node_fs_1.default.writeSync(partialHandle, chunkBytes);
                    offset += chunkBytes.length;
                    await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/progress`, venueApiUrl), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ owner: `srr:${node_os_1.default.hostname()}`, bytes_received: offset, total_bytes: expectedSize }),
                    });
                    if (offset >= expectedSize)
                        break;
                }
            }
            finally {
                node_fs_1.default.closeSync(partialHandle);
            }
            const buffer = node_fs_1.default.readFileSync(partialTarget);
            const checksum = node_crypto_1.default.createHash("sha256").update(buffer).digest("hex");
            if (!expectedChecksum || checksum.toLowerCase() !== expectedChecksum.toLowerCase() || (expectedSize && buffer.length !== expectedSize))
                throw new Error("downloaded file checksum or size mismatch");
            node_fs_1.default.renameSync(partialTarget, target);
            node_fs_1.default.writeFileSync(`${target}.json`, JSON.stringify({ file_id: transfer.file_id, version_number: transfer.version_number, filename: transfer.filename, sha256: checksum, size_bytes: buffer.length, local_path: target, verified_at: new Date().toISOString() }, null, 2));
            recordCacheEntry({ fileId: transfer.file_id, versionNumber: transfer.version_number, filename: transfer.filename, sha256: checksum, sizeBytes: buffer.length, localPath: target, state: "received", sourceTransferId: transfer.id });
            const acknowledgement = await srrFetch(new URL(`/api/v1/venue/distribution/${transfer.id}/acknowledge`, venueApiUrl), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target_node: transfer.target_node, target_type: transfer.target_type, file_id: transfer.file_id, version_number: transfer.version_number, sha256: checksum, size_bytes: buffer.length }),
            });
            if (!acknowledgement.ok)
                throw new Error(`delivery acknowledgement failed (${acknowledgement.status})`);
            recordDeliveryAcknowledgement({ transferId: transfer.id, fileId: transfer.file_id, versionNumber: transfer.version_number, targetNode: transfer.target_node, targetType: transfer.target_type, sha256: checksum, sizeBytes: buffer.length, state: "verified" });
            recordCacheEntry({ fileId: transfer.file_id, versionNumber: transfer.version_number, filename: transfer.filename, sha256: checksum, sizeBytes: buffer.length, localPath: target, state: "verified", sourceTransferId: transfer.id });
            verified += 1;
        }
        catch (error) {
            failed += 1;
            // A completed transfer with a bad checksum must restart from byte zero.
            // Keep partial data only for transport/interruption failures so retries
            // can resume without ever appending to corrupt content.
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("checksum") || message.includes("size mismatch")) {
                try {
                    node_fs_1.default.rmSync(partialTarget, { force: true });
                }
                catch { /* best effort cleanup */ }
            }
            if (partialTarget) {
                try {
                    node_fs_1.default.writeFileSync(`${partialTarget}.error.json`, JSON.stringify({ transfer_id: transfer.id, error: message, observed_at: new Date().toISOString() }, null, 2));
                }
                catch { /* best effort diagnostic */ }
            }
            try {
                recordDeliveryAcknowledgement({ transferId: transfer.id, fileId: transfer.file_id, versionNumber: transfer.version_number, targetNode: transfer.target_node, targetType: transfer.target_type, sha256: expectedChecksum || "", sizeBytes: expectedSize || 0, state: "failed", error: message });
                if (node_fs_1.default.existsSync(partialTarget)) {
                    recordCacheEntry({ fileId: transfer.file_id, versionNumber: transfer.version_number, filename: transfer.filename, sha256: expectedChecksum || "", sizeBytes: expectedSize || 0, localPath: partialTarget, state: "failed", sourceTransferId: transfer.id, error: message });
                }
            }
            catch { /* diagnostics must not stop other transfers */ }
            console.warn("SRR delivery synchronization failed", transfer.id, error);
        }
    }
    return { processed: (manifest.transfers || []).length, verified, failed };
}
async function downloadReplicaFromServer() {
    const sourceUrl = new URL("/api/v1/srr/replica.sqlite", venueApiUrl).toString();
    const response = await srrFetch(sourceUrl);
    if (!response.ok) {
        throw new Error(`Venue Server replica download failed (${response.status})`);
    }
    const targetPath = localDatabasePath();
    const tempTarget = `${targetPath}.${Date.now()}.tmp`;
    const buffer = Buffer.from(await response.arrayBuffer());
    const expectedChecksum = response.headers.get("x-replica-sha256");
    if (!expectedChecksum)
        throw new Error("Venue Server replica response did not include an integrity checksum.");
    const actualChecksum = node_crypto_1.default.createHash("sha256").update(buffer).digest("hex");
    if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
        throw new Error("Venue Server replica checksum verification failed.");
    }
    // A server snapshot must never silently replace a local replica that still
    // contains an unacknowledged mutation or an unresolved conflict. Keep the
    // local state and let the operator reconcile it explicitly.
    const hasUnreconciledMutations = withCacheDatabase((database) => {
        const row = database.prepare("SELECT COUNT(*) AS count FROM outbox_mutations WHERE status IN ('pending', 'syncing', 'conflict')").get();
        return Number(row?.count || 0) > 0;
    });
    if (hasUnreconciledMutations) {
        throw new Error("Local SRR changes are awaiting reconciliation; the authoritative replica was not replaced.");
    }
    node_fs_1.default.writeFileSync(tempTarget, buffer);
    const validation = validateSqliteFile(tempTarget);
    if (!validation.valid) {
        node_fs_1.default.rmSync(tempTarget, { force: true });
        throw new Error(validation.message);
    }
    if (node_fs_1.default.existsSync(targetPath)) {
        node_fs_1.default.copyFileSync(targetPath, `${targetPath}.pre-sync.bak`);
    }
    node_fs_1.default.renameSync(tempTarget, targetPath);
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
async function synchronizeSrrReplica() {
    // Never replace a replica while a local presentation mutation is waiting
    // for reconciliation; the pending operation is the newer local state.
    if (readOfflineUploadQueue().some((entry) => entry.status === "pending"))
        return;
    await downloadReplicaFromServer();
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
    let ipv4 = null;
    let mac = null;
    let interfaceName = null;
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
        if (ipv4)
            break;
    }
    return {
        ipv4,
        mac: mac ? mac.toUpperCase() : null,
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
                            message: "Remove only incomplete transfer files? Verified presentation versions are protected.",
                        });
                        if (res.response === 1) {
                            try {
                                const removed = removeTemporaryCacheArtifacts();
                                mainWindow?.webContents.send("srr-desktop:cache-cleared", { removed });
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
    if (srrDeviceKey) {
        void synchronizeSrrDeliveries().catch(() => undefined);
        void synchronizeSrrRuntimeEvents().catch(() => undefined);
        srrDeliveryTimer = setInterval(() => void synchronizeSrrDeliveries().catch(() => undefined), 15000);
        srrRuntimeTimer = setInterval(() => void synchronizeSrrRuntimeEvents().catch(() => undefined), 15000);
        void synchronizeSrrReplica().catch(() => undefined);
        srrReplicaTimer = setInterval(() => void synchronizeSrrReplica().catch(() => undefined), 60000);
    }
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
    electron_1.ipcMain.handle("srr-desktop:get-cache-status", () => {
        const capacity = localCacheCapacity();
        const cache = withCacheDatabase((database) => database.prepare("SELECT COUNT(*) AS count, SUM(CASE WHEN state = 'verified' THEN 1 ELSE 0 END) AS verified, SUM(CASE WHEN state IN ('failed', 'stale') THEN 1 ELSE 0 END) AS attention FROM presentation_cache").get());
        const runtime = withCacheDatabase((database) => database.prepare("SELECT (SELECT COUNT(*) FROM incoming_server_events) AS events, (SELECT value FROM replica_meta WHERE key = 'server_sequence') AS sequence, (SELECT value FROM replica_meta WHERE key = 'last_runtime_sync_at') AS last_sync").get());
        const outbox = withCacheDatabase((database) => database.prepare("SELECT SUM(CASE WHEN status IN ('pending', 'syncing') THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflicts FROM outbox_mutations").get());
        return { ...capacity, cachedFiles: Number(cache.count || 0), verifiedFiles: Number(cache.verified || 0), attentionFiles: Number(cache.attention || 0), runtimeEvents: Number(runtime.events || 0), serverSequence: Number(runtime.sequence || 0), lastRuntimeSyncAt: runtime.last_sync || null, pendingMutations: Number(outbox.pending || 0), conflicts: Number(outbox.conflicts || 0), policy: "authoritative versions are retained; obsolete versions require explicit operator cleanup" };
    });
    electron_1.ipcMain.handle("srr-desktop:get-offline-upload-status", () => {
        const items = readOfflineUploadQueue();
        return {
            total: items.length,
            pending: items.filter((item) => item.status === "pending").length,
            uploaded: items.filter((item) => item.status === "uploaded").length,
            conflicts: items.filter((item) => item.status === "conflict").length,
            items: items.map(({ operationId, filename, status, retryCount, lastError, queuedAt }) => ({ operationId, filename, status, retryCount, lastError, queuedAt })),
        };
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
            const cacheDbPath = localCacheDatabasePath();
            if (node_fs_1.default.existsSync(cacheDbPath))
                node_fs_1.default.rmSync(cacheDbPath, { force: true });
            for (const suffix of ["-shm", "-wal"]) {
                node_fs_1.default.rmSync(`${cacheDbPath}${suffix}`, { force: true });
            }
            removeTemporaryCacheArtifacts();
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
                : resolveCachedPresentationPath(filePath);
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
    if (node_process_1.default.platform !== "darwin") {
        electron_1.app.quit();
    }
});
