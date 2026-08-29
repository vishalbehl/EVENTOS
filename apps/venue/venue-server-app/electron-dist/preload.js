"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const venueDesktop = {
    isDesktop: true,
    platform: process.platform,
    minimize: () => electron_1.ipcRenderer.send("window:minimize"),
    maximize: () => electron_1.ipcRenderer.send("window:maximize"),
    close: () => electron_1.ipcRenderer.send("window:close"),
    getAppInfo: () => electron_1.ipcRenderer.invoke("app:info"),
    checkServerHealth: (url) => electron_1.ipcRenderer.invoke("server:health", url),
    setupVenueDatabases: (setup) => electron_1.ipcRenderer.invoke("venue:setup-databases", setup),
    importLocalDatabase: () => electron_1.ipcRenderer.invoke("venue:import-local-database"),
    resetVenueDatabase: () => electron_1.ipcRenderer.invoke("venue:reset-venue-database"),
};
electron_1.contextBridge.exposeInMainWorld("venueDesktop", venueDesktop);
