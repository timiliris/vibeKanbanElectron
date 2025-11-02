const { contextBridge } = require('electron');

// Expose secure APIs to renderer process if needed
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron
});

// Note: WebSocket fix is injected via executeJavaScript in main.js
// because it requires access to window context which is not available
// in the preload script when sandbox is enabled
