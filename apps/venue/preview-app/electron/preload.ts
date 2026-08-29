import { contextBridge, ipcRenderer } from "electron";

export type SystemHardwareInfo = {
  ipv4: string;
  mac: string;
  interfaceName: string;
  hostname: string;
  platform: string;
  osRelease: string;
  arch: string;
  totalMemoryMB: number;
  freeMemoryMB: number;
};

export type LocalDatabaseStatus = {
  exists: boolean;
  path: string;
  sizeBytes: number;
  updatedAt?: number;
  tablesCount?: number;
  version?: number;
  isValidSqlite?: boolean;
  validationMessage?: string;
  canceled?: boolean;
  importedFrom?: string;
  exportedTo?: string;
  error?: string;
};

export type SRRDesktopAppInfo = {
  appVersion: string;
  desktopUrl: string;
  isDesktop: true;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  system: SystemHardwareInfo;
  localDatabase: LocalDatabaseStatus;
};

const srrDesktop = {
  isDesktop: true as const,
  platform: process.platform,
  getAppInfo: (): Promise<SRRDesktopAppInfo> => ipcRenderer.invoke("srr-desktop:get-app-info"),
  getSystemInfo: (): Promise<SystemHardwareInfo> => ipcRenderer.invoke("srr-desktop:get-system-info"),
  
  // Database Operations
  getLocalDatabaseStatus: (): Promise<LocalDatabaseStatus> => ipcRenderer.invoke("srr-desktop:get-local-database-status"),
  initializeLocalDatabase: (): Promise<LocalDatabaseStatus> => ipcRenderer.invoke("srr-desktop:initialize-local-database"),
  syncLocalDatabaseFromServer: (): Promise<LocalDatabaseStatus> => ipcRenderer.invoke("srr-desktop:sync-local-database"),
  importLocalDatabase: (): Promise<LocalDatabaseStatus> => ipcRenderer.invoke("srr-desktop:import-local-database"),
  exportLocalDatabase: (): Promise<LocalDatabaseStatus> => ipcRenderer.invoke("srr-desktop:export-local-database"),
  openDatabaseFolder: (): Promise<{ opened: boolean; path: string }> => ipcRenderer.invoke("srr-desktop:open-database-folder"),
  resetDatabase: (): Promise<{ success: boolean; error?: string } & LocalDatabaseStatus> => ipcRenderer.invoke("srr-desktop:reset-database"),

  // Native PowerPoint Launcher & File Watcher
  openFileInNativeApp: (filePath: string): Promise<{ opened: boolean; localPath?: string; error?: string }> =>
    ipcRenderer.invoke("srr-desktop:open-native-file", filePath),
  uploadModifiedPresentation: (payload: {
    filePath: string;
    speakerId: string;
    sessionSpeakerId: string;
    deviceKey?: string;
  }): Promise<{ file?: any; error?: string }> => ipcRenderer.invoke("srr-desktop:upload-modified-presentation", payload),
  
  // Window Controls
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: (): Promise<void> => ipcRenderer.invoke("window:maximize"),
  closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close"),
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke("window:toggle-fullscreen"),
  
  // Event Listeners
  onFileModified: (callback: (data: { filePath: string; modifiedAt: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on("srr-desktop:file-modified", handler);
    return () => {
      ipcRenderer.removeListener("srr-desktop:file-modified", handler);
    };
  },
  onDatabaseImported: (callback: (data: { source: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on("srr-desktop:db-imported", handler);
    return () => {
      ipcRenderer.removeListener("srr-desktop:db-imported", handler);
    };
  },
};

contextBridge.exposeInMainWorld("srrDesktop", srrDesktop);

export type SRRDesktopApi = typeof srrDesktop;
