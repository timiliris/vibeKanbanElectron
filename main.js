const { app, BrowserWindow, dialog, nativeImage, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Fonction pour créer le menu macOS
function createMenu() {
  if (process.platform !== 'darwin') return;

  const isDev = !app.isPackaged;

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
        // DevTools uniquement en développement
        ...(isDev ? [{ role: 'toggleDevTools', label: 'Outils de développement' }] : []),
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
let serverWasStartedByApp = false; // Track si on a démarré le serveur nous-mêmes
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
    serverWasStartedByApp = false; // Le serveur était déjà en cours d'exécution
    return true;
  }

  console.log('Starting Vibe Kanban server...');
  serverWasStartedByApp = true; // On démarre le serveur nous-mêmes

  try {
    // Démarrer le serveur avec npx vibe-kanban
    console.log('Starting Vibe Kanban with npx...');

    // Filtrer les variables d'environnement pour ne passer que celles nécessaires
    const safeEnv = {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      USER: process.env.USER,
      LANG: process.env.LANG,
      PORT: SERVER_PORT.toString()
    };

    serverProcess = spawn('npx', ['vibe-kanban', 'start'], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: safeEnv
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`Vibe Kanban: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`Vibe Kanban Error: ${data}`);
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server with npx:', error.message);
      serverWasStartedByApp = false;
    });

    // Attendre que le serveur démarre
    await waitForServer(30000); // 30 secondes max
    console.log('Server started successfully!');
    console.log('serverWasStartedByApp set to:', serverWasStartedByApp);
    return true;
  } catch (error) {
    console.error('Error starting server:', error);
    // Note: On ne bloque pas avec dialog.showErrorBox pour permettre à l'app de continuer
    // L'utilisateur verra l'erreur de connexion dans la fenêtre
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
      webSecurity: true,
      sandbox: true, // Active le sandbox pour plus de sécurité
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    },
    title: 'Vibe Kanban',
    show: true, // Afficher immédiatement
    center: true, // Centrer la fenêtre
    alwaysOnTop: false,
    skipTaskbar: false
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

  // Bloquer toute navigation externe (sécurité)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // Autoriser uniquement localhost
    if (parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
      console.warn('Navigation bloquée vers:', url);
      event.preventDefault();
    }
  });

  // Bloquer l'ouverture de nouvelles fenêtres (sécurité)
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Définir une Content Security Policy stricte
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " + // Nécessaire pour Vibe Kanban
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; " +
          "connect-src 'self' ws://127.0.0.1:* ws://localhost:*; " +
          "font-src 'self' data:; " +
          "media-src 'self'; " +
          "object-src 'none'; " +
          "frame-src 'none'; " +
          "base-uri 'self';"
        ]
      }
    });
  });

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

  // Afficher la fenêtre immédiatement pour éviter qu'elle reste cachée
  mainWindow.show();

  // Sur macOS, activer l'application et mettre la fenêtre au premier plan
  if (process.platform === 'darwin') {
    app.dock.show();
    mainWindow.focus();
  }

  // Charger l'URL du serveur Vibe Kanban
  // Le gestionnaire did-fail-load gérera les reconnexions automatiques
  mainWindow.loadURL(SERVER_URL);

  // Ouvrir DevTools en développement uniquement (optionnel)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Gérer les erreurs de chargement - réessayer indéfiniment
  mainWindow.webContents.on('did-fail-load', async (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);

    // Réessayer après 3 secondes
    console.log('Retrying in 3 seconds...');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(SERVER_URL);
      }
    }, 3000);
  });

  // Quand la page charge avec succès, reset le compteur
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully!');
  });

  // Supprimer l'ancienne page d'erreur - on réessaie indéfiniment
  /*
  if (false) {  // Code désactivé
      mainWindow.loadURL(`data:text/html;charset=utf-8,
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              background: #1a1a1a;
              color: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              padding: 20px;
            }
            .container {
              text-align: center;
              max-width: 600px;
            }
            h1 { color: #ff6b6b; }
            p { line-height: 1.6; }
            .retry-btn {
              background: #4CAF50;
              color: white;
              border: none;
              padding: 12px 24px;
              font-size: 16px;
              border-radius: 4px;
              cursor: pointer;
              margin-top: 20px;
            }
            .retry-btn:hover { background: #45a049; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Serveur Vibe Kanban non disponible</h1>
            <p>Impossible de se connecter au serveur Vibe Kanban sur <code>${SERVER_URL}</code></p>
            <p>Veuillez démarrer le serveur Vibe Kanban manuellement et cliquer sur le bouton ci-dessous.</p>
            <button class="retry-btn" onclick="location.reload()">Réessayer</button>
          </div>
        </body>
        </html>
      `);
    }
  }
  */
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

  // Ouvrir la fenêtre immédiatement
  createWindow();

  // Démarrer le serveur en arrière-plan
  startVibeKanbanServer().then(serverStarted => {
    if (!serverStarted) {
      console.log('Server failed to start, but window is already open');
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

let isQuitting = false;
let quitConfirmed = false;

app.on('window-all-closed', () => {
  // Sur macOS, quitter quand toutes les fenêtres sont fermées
  // Le dialog de confirmation sera géré dans before-quit
  app.quit();
});

app.on('before-quit', (event) => {
  console.log('before-quit event fired');
  console.log('quitConfirmed:', quitConfirmed);
  console.log('serverWasStartedByApp:', serverWasStartedByApp);
  console.log('isQuitting:', isQuitting);

  // Si déjà confirmé, laisser quitter
  if (quitConfirmed) {
    console.log('Quit already confirmed, exiting');
    return;
  }

  // Si on a démarré le serveur, demander confirmation
  if (serverWasStartedByApp && !isQuitting) {
    console.log('Preventing quit to show dialog');
    event.preventDefault();
    isQuitting = true;

    // Créer une fenêtre temporaire invisible pour le dialog si nécessaire
    let dialogParent = null;
    if (!mainWindow || mainWindow.isDestroyed()) {
      dialogParent = new BrowserWindow({
        show: false,
        width: 1,
        height: 1
      });
    } else {
      dialogParent = mainWindow;
    }

    // Utiliser showMessageBoxSync pour une réponse synchrone
    const response = dialog.showMessageBoxSync(dialogParent, {
      type: 'question',
      buttons: ['Arrêter Kanban', 'Laisser tourner', 'Annuler'],
      defaultId: 0,
      title: 'Fermeture de Vibe Kanban',
      message: 'Voulez-vous arrêter le serveur Vibe Kanban ?',
      detail: 'Le serveur Vibe Kanban a été démarré par cette application. Voulez-vous l\'arrêter en fermant l\'application ?',
      cancelId: 2,
      noLink: true
    });

    // Fermer la fenêtre temporaire si on en a créé une
    if (dialogParent !== mainWindow && !dialogParent.isDestroyed()) {
      dialogParent.destroy();
    }

    if (response === 0) {
      // Arrêter le serveur
      console.log('Stopping Vibe Kanban server...');
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
      }
      serverProcess = null;
      quitConfirmed = true;
      isQuitting = false;
      app.quit();
    } else if (response === 1) {
      // Laisser le serveur tourner
      console.log('Leaving Vibe Kanban server running...');
      serverProcess = null;
      quitConfirmed = true;
      isQuitting = false;
      app.quit();
    } else {
      // Annuler
      console.log('User cancelled quit');
      isQuitting = false;
    }
  } else if (!serverWasStartedByApp && serverProcess) {
    // Si on n'a pas démarré le serveur, juste se détacher
    console.log('Detaching from Vibe Kanban server...');
    serverProcess = null;
  }
});

// Gérer les crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
