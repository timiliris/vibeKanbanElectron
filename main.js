const { app, BrowserWindow, dialog, nativeImage, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Définir le nom de l'application (doit être fait avant app.ready)
app.setName('Vibe Kanban');

// Fonction pour créer le menu macOS
function createMenu() {
  if (process.platform !== 'darwin') return;

  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'À propos de Vibe Kanban' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Masquer Vibe Kanban' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter Vibe Kanban' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Forcer le rechargement' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom réel' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Fenêtre',
      submenu: [
        { role: 'minimize', label: 'Réduire' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Tout ramener au premier plan' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

let mainWindow;
let serverProcess;
const SERVER_PORT = 58045;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(SERVER_URL, (res) => {
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startVibeKanbanServer() {
  console.log('Checking if Vibe Kanban server is already running...');

  const isRunning = await checkServerRunning();
  if (isRunning) {
    console.log('Server is already running!');
    return true;
  }

  console.log('Starting Vibe Kanban server...');

  try {
    // Tente de démarrer le serveur avec différentes commandes possibles
    const commands = [
      { cmd: 'vibe', args: ['start'] },
      { cmd: 'vibe-kanban', args: ['start'] },
      { cmd: 'npx', args: ['vibe-kanban', 'start'] }
    ];

    for (const { cmd, args } of commands) {
      try {
        serverProcess = spawn(cmd, args, {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        serverProcess.stdout.on('data', (data) => {
          console.log(`Vibe Kanban: ${data}`);
        });

        serverProcess.stderr.on('data', (data) => {
          console.error(`Vibe Kanban Error: ${data}`);
        });

        serverProcess.on('error', (error) => {
          console.error(`Failed to start server with ${cmd}:`, error.message);
        });

        // Attendre que le serveur démarre
        await waitForServer(30000); // 30 secondes max
        console.log('Server started successfully!');
        return true;
      } catch (err) {
        console.log(`Command ${cmd} failed, trying next...`);
        continue;
      }
    }

    throw new Error('Could not start Vibe Kanban server with any command');
  } catch (error) {
    console.error('Error starting server:', error);
    dialog.showErrorBox(
      'Erreur de démarrage',
      `Impossible de démarrer le serveur Vibe Kanban.\n\nAssurez-vous que Vibe Kanban est installé.\n\nErreur: ${error.message}`
    );
    return false;
  }
}

async function waitForServer(timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const isRunning = await checkServerRunning();
    if (isRunning) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error('Server did not start within timeout period');
}

function createWindow() {
  // Chercher l'icône (PNG ou SVG)
  let iconPath = null;
  const possibleIcons = [
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'assets', 'vibe-kanban-logo.svg'),
    path.join(__dirname, 'icon.png')
  ];

  for (const iconFile of possibleIcons) {
    if (fs.existsSync(iconFile)) {
      iconPath = iconFile;
      break;
    }
  }

  const windowOptions = {
    width: 1400,
    height: 900,
    backgroundColor: '#1a1a1a', // Couleur de fond sombre correspondant à Vibe Kanban
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    title: 'Vibe Kanban',
    show: false // Ne pas afficher immédiatement
  };

  // Ajouter l'icône si elle existe
  if (iconPath) {
    if (iconPath.endsWith('.svg')) {
      // Pour SVG, on utilise nativeImage
      windowOptions.icon = nativeImage.createFromPath(iconPath);
    } else {
      windowOptions.icon = iconPath;
    }
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Injecter le correctif WebSocket AVANT que la page ne charge
  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow.webContents.executeJavaScript(`
      (function() {
        const OriginalWebSocket = window.WebSocket;

        window.WebSocket = function(url, protocols) {
          if (typeof url === 'string' && url.startsWith('/')) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            url = protocol + '//' + host + url;
            console.log('[Electron] WebSocket URL corrigée:', url);
          }

          return new OriginalWebSocket(url, protocols);
        };

        Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
        window.WebSocket.prototype = OriginalWebSocket.prototype;
        window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
        window.WebSocket.OPEN = OriginalWebSocket.OPEN;
        window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
        window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
      })();
    `);
  });

  // Afficher la fenêtre une fois le contenu prêt (évite le flash blanc)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Charger l'URL du serveur Vibe Kanban
  mainWindow.loadURL(SERVER_URL);

  // Ouvrir DevTools en développement (optionnel)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Gérer les erreurs de chargement
  mainWindow.webContents.on('did-fail-load', async (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);

    // Réessayer de se connecter
    const isRunning = await checkServerRunning();
    if (isRunning) {
      mainWindow.loadURL(SERVER_URL);
    } else {
      dialog.showErrorBox(
        'Erreur de connexion',
        `Impossible de se connecter au serveur Vibe Kanban sur ${SERVER_URL}\n\nVeuillez vérifier que le serveur fonctionne correctement.`
      );
    }
  });
}

app.whenReady().then(async () => {
  // Créer le menu avec le bon nom d'application
  createMenu();

  // Définir l'icône de l'application pour le Dock (macOS)
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      app.dock.setIcon(icon);
    }
  }

  const serverStarted = await startVibeKanbanServer();

  if (serverStarted) {
    createWindow();
  } else {
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Arrêter le serveur quand l'application se ferme
  if (serverProcess && !serverProcess.killed) {
    console.log('Stopping Vibe Kanban server...');
    serverProcess.kill();
  }
});

// Gérer les crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
