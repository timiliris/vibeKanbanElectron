const { contextBridge } = require('electron');

// Exposer des API sécurisées au renderer process si nécessaire
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron
});

// Intercepter et corriger TOUS les WebSocket avec des URLs relatives
// Doit être fait AVANT le DOMContentLoaded pour capturer tous les WebSockets
const OriginalWebSocket = window.WebSocket;

window.WebSocket = function(url, protocols) {
  // Si l'URL est relative (commence par /), la convertir en absolue
  if (typeof url === 'string' && url.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const absoluteUrl = `${protocol}//${host}${url}`;
    console.log('[Electron] WebSocket URL corrigée:', url, '->', absoluteUrl);
    url = absoluteUrl;
  }

  return new OriginalWebSocket(url, protocols);
};

// Copier toutes les propriétés statiques et le prototype
Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
window.WebSocket.prototype = OriginalWebSocket.prototype;
window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
window.WebSocket.OPEN = OriginalWebSocket.OPEN;
window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
