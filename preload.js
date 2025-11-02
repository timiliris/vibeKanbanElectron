const { contextBridge } = require('electron');

// Exposer des API sécurisées au renderer process si nécessaire
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron
});

// Note: Le fix WebSocket est injecté via executeJavaScript dans main.js
// car il nécessite l'accès au contexte window qui n'est pas disponible
// dans le preload script quand sandbox est activé
