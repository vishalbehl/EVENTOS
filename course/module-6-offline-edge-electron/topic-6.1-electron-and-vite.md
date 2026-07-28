# Module 6 - Topic 6.1: Electron Desktop Architecture, IPC Bridge & Vite + React

## 1. Introduction & Learning Objectives
Welcome to **Topic 6.1**. In this chapter, you will master standalone desktop application development using **Electron** and **Vite + React** ([apps/venue/kiosk-app](file:///d:/DEV/conf-platform/apps/venue/kiosk-app) and [apps/venue/technician-dashboard](file:///d:/DEV/conf-platform/apps/venue/technician-dashboard)).

### Learning Outcomes:
- Differentiate between Electron Main Process and Renderer Process.
- Configure secure IPC bridge communications using `contextBridge` and `preload.js`.
- Build fast, lightweight React single-page apps using Vite.

---

## 2. Electron Dual-Process Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Electron Main Process                │
│  - Node.js Environment                                 │
│  - File System, Native Hardware & Window Lifecycle     │
└───────────────────────────┬────────────────────────────┘
                            │ IPC Bridge (preload.js)
┌───────────────────────────▼────────────────────────────┐
│                 Electron Renderer Process              │
│  - Chromium Web Engine                                 │
│  - React 18 UI / DOM Execution                         │
└────────────────────────────────────────────────────────┘
```

---

## 3. Secure Preload & IPC Bridge (`contextBridge`)

### 3.1 Main Process (`main.js`)
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL('http://localhost:5173'); // Vite dev server
}

ipcMain.handle('print-badge', async (event, badgeData) => {
  console.log("Printing badge hardware command:", badgeData);
  return { success: true, printedAt: new Date().toISOString() };
});

app.whenReady().then(createWindow);
```

### 3.2 Preload Script (`preload.js`)
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  printBadge: (badgeData) => ipcRenderer.invoke('print-badge', badgeData),
});
```

### 3.3 Consuming in React Renderer
```tsx
declare global {
  interface Window {
    electronAPI: {
      printBadge: (data: any) => Promise<{ success: boolean }>;
    };
  }
}

export function PrintButton({ attendee }: any) {
  const handlePrint = async () => {
    const res = await window.electronAPI.printBadge(attendee);
    if (res.success) alert("Badge Printed!");
  };

  return <button onClick={handlePrint}>Print Check-in Badge</button>;
}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Add an IPC channel `get-hardware-info` in `main.js` returning OS memory and platform specs using Node.js `os` module.
2. Call `window.electronAPI.getHardwareInfo()` from React and display specs on screen.

---

## 5. Chapter Summary & Next Steps
You have mastered Electron main/renderer processes, IPC bridges, and Vite desktop apps. Next, move to **[Topic 6.2: Offline Edge Server & Delta Sync](./topic-6.2-venue-server-and-delta-sync.md)**.
