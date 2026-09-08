const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stageDesktop", {
  prepareAndOpenPresentation: (input) => ipcRenderer.invoke("stage:prepare-and-open", input),
});
