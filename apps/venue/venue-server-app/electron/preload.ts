import { contextBridge, ipcRenderer } from "electron";

const venueDesktop = {
  isDesktop: true as const,
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  checkServerHealth: (url: string) => ipcRenderer.invoke("server:health", url),
  setupVenueDatabases: (setup: any) => ipcRenderer.invoke("venue:setup-databases", setup),
  importLocalDatabase: () => ipcRenderer.invoke("venue:import-local-database"),
  resetVenueDatabase: () => ipcRenderer.invoke("venue:reset-venue-database"),
};

contextBridge.exposeInMainWorld("venueDesktop", venueDesktop);

export type VenueDesktopApi = typeof venueDesktop;
