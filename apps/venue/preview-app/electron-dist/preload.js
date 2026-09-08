"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const srrDesktop = {
    isDesktop: true,
    platform: process.platform,
    getAppInfo: () => electron_1.ipcRenderer.invoke("srr-desktop:get-app-info"),
    getSystemInfo: () => electron_1.ipcRenderer.invoke("srr-desktop:get-system-info"),
    // Database Operations
    getLocalDatabaseStatus: () => electron_1.ipcRenderer.invoke("srr-desktop:get-local-database-status"),
    getCacheStatus: () => electron_1.ipcRenderer.invoke("srr-desktop:get-cache-status"),
    getOfflineUploadStatus: () => electron_1.ipcRenderer.invoke("srr-desktop:get-offline-upload-status"),
    initializeLocalDatabase: () => electron_1.ipcRenderer.invoke("srr-desktop:initialize-local-database"),
    syncLocalDatabaseFromServer: () => electron_1.ipcRenderer.invoke("srr-desktop:sync-local-database"),
    importLocalDatabase: () => electron_1.ipcRenderer.invoke("srr-desktop:import-local-database"),
    exportLocalDatabase: () => electron_1.ipcRenderer.invoke("srr-desktop:export-local-database"),
    openDatabaseFolder: () => electron_1.ipcRenderer.invoke("srr-desktop:open-database-folder"),
    resetDatabase: () => electron_1.ipcRenderer.invoke("srr-desktop:reset-database"),
    // Native PowerPoint Launcher & File Watcher
    openFileInNativeApp: (filePath) => electron_1.ipcRenderer.invoke("srr-desktop:open-native-file", filePath),
    uploadModifiedPresentation: (payload) => electron_1.ipcRenderer.invoke("srr-desktop:upload-modified-presentation", payload),
    // Window Controls
    minimizeWindow: () => electron_1.ipcRenderer.invoke("window:minimize"),
    maximizeWindow: () => electron_1.ipcRenderer.invoke("window:maximize"),
    closeWindow: () => electron_1.ipcRenderer.invoke("window:close"),
    toggleFullscreen: () => electron_1.ipcRenderer.invoke("window:toggle-fullscreen"),
    // Event Listeners
    onFileModified: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on("srr-desktop:file-modified", handler);
        return () => {
            electron_1.ipcRenderer.removeListener("srr-desktop:file-modified", handler);
        };
    },
    onDatabaseImported: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on("srr-desktop:db-imported", handler);
        return () => {
            electron_1.ipcRenderer.removeListener("srr-desktop:db-imported", handler);
        };
    },
};
electron_1.contextBridge.exposeInMainWorld("srrDesktop", srrDesktop);
