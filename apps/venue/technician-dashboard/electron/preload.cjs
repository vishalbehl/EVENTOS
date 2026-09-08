const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("technicianDesktop", {
  isDesktop: true,
  platform: process.platform,
});
