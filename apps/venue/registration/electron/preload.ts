import { contextBridge, ipcRenderer } from "electron";

type VenueDesktopAppInfo = {
  appVersion: string;
  desktopUrl: string;
  isDesktop: true;
  isPackaged: boolean;
  platform: NodeJS.Platform;
};

type VenueDesktopNodeAgentStatus = {
  running: boolean;
  status: string;
  detail?: unknown;
};

type VenueDesktopNodeConfiguration = {
  venue_server: string;
  assignment_id: string;
  enrollment_token: string;
  replica_path?: string;
};

type VenueDesktopLocalDatabaseStatus = {
  exists: boolean;
  path: string;
  sizeBytes: number;
  updatedAt?: number;
  adminUsername?: string;
  canceled?: boolean;
  importedFrom?: string;
};

type VenueDesktopRegistrationPostgresSetup = {
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

const venueDesktop = {
  isDesktop: true as const,
  platform: process.platform,
  getAppInfo: (): Promise<VenueDesktopAppInfo> => ipcRenderer.invoke("venue-desktop:get-app-info"),
  getNodeAgentStatus: (): Promise<VenueDesktopNodeAgentStatus> => ipcRenderer.invoke("venue-desktop:get-node-agent-status"),
  saveNodeConfiguration: (config: VenueDesktopNodeConfiguration): Promise<{ configPath: string; replicaPath: string }> => ipcRenderer.invoke("venue-desktop:save-node-config", config),
  startNodeAgent: (): Promise<{ started: boolean; status: string; configPath: string; replicaPath?: string }> => ipcRenderer.invoke("venue-desktop:start-node-agent"),
  initializeLocalDatabase: (): Promise<VenueDesktopLocalDatabaseStatus> => ipcRenderer.invoke("venue-desktop:initialize-local-database"),
  getLocalDatabaseStatus: (): Promise<VenueDesktopLocalDatabaseStatus> => ipcRenderer.invoke("venue-desktop:get-local-database-status"),
  importLocalDatabase: (): Promise<VenueDesktopLocalDatabaseStatus> => ipcRenderer.invoke("venue-desktop:import-local-database"),
  exportLocalDatabase: (): Promise<VenueDesktopLocalDatabaseStatus> => ipcRenderer.invoke("venue-desktop:export-local-database"),
  openLocalDatabaseFolder: (): Promise<{ opened: boolean; path?: string; error?: string }> => ipcRenderer.invoke("venue-desktop:open-local-database-folder"),
  loadLocalSnapshot: (snapshot: unknown): Promise<VenueDesktopLocalDatabaseStatus> => ipcRenderer.invoke("venue-desktop:load-local-snapshot", snapshot),
  getRegistrationSetupStatus: (): Promise<{ configured: boolean; marker?: unknown; sharedPostgres?: unknown; validation?: unknown; localDatabase: VenueDesktopLocalDatabaseStatus; uploadedLocalDatabase?: VenueDesktopLocalDatabaseStatus }> => ipcRenderer.invoke("venue-desktop:get-registration-setup-status"),
  setupRegistrationPostgres: (setup: VenueDesktopRegistrationPostgresSetup): Promise<Record<string, unknown>> => ipcRenderer.invoke("venue-desktop:setup-registration-postgres", setup),
};

contextBridge.exposeInMainWorld("venueDesktop", venueDesktop);

export type VenueDesktopApi = typeof venueDesktop;
