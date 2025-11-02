const { app, BrowserWindow, dialog, nativeImage, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isWindows = process.platform === 'win32';

const LOADING_SCREEN_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Vibe Kanban</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #32322E;
    color: #d8dde9;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .brand {
    font-size: clamp(2.4rem, 4vw, 3.6rem);
    letter-spacing: 0.55rem;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.82);
    font-weight: 600;
    text-align: center;
    text-shadow: 0 18px 30px rgba(0, 0, 0, 0.45);
  }
  .status-pill {
    position: fixed;
    right: 28px;
    bottom: 28px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    background: rgba(14, 14, 13, 0.72);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    box-shadow: 0 18px 34px rgba(3, 3, 2, 0.6);
    backdrop-filter: blur(18px);
    max-width: min(360px, 70vw);
  }
  .indicator {
    content: '';
    position: relative;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: linear-gradient(135deg, #8b74ff, #5b9dff);
    box-shadow: 0 0 18px rgba(91, 157, 255, 0.5);
  }
  .indicator::after {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    background: rgba(91, 157, 255, 0.28);
    opacity: 0.75;
    animation: pulse 2.6s ease-out infinite;
  }
  @keyframes pulse {
    0% { transform: scale(0.5); opacity: 0.75; }
    80% { transform: scale(1.4); opacity: 0; }
    100% { transform: scale(1.4); opacity: 0; }
  }
  .status-text {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  h1 {
    font-size: 0.95rem;
    margin: 0;
    font-weight: 600;
    letter-spacing: 0.01em;
    color: rgba(237, 240, 252, 0.95);
  }
  p {
    margin: 0;
    line-height: 1.4;
    color: rgba(204, 212, 230, 0.82);
    font-size: 0.85rem;
  }
  .detail { font-size: 0.85rem; }
  .subtle { font-size: 0.78rem; color: rgba(168, 180, 202, 0.78); }
  .state-info { color: #91a3ff; }
  .state-warn { color: #ffb347; }
  .state-error { color: #ff8080; }
</style>
</head>
<body>
  <div class="brand">VIBE KANBAN</div>
  <div class="status-pill">
    <div class="indicator" aria-hidden="true"></div>
    <div class="status-text">
      <h1 id="status-title">Initializing Vibe Kanban…</h1>
      <p id="status-detail" class="detail">Preparing local server.</p>
      <p id="status-sub" class="detail subtle" style="display:none;"></p>
    </div>
  </div>
<script>
  window.__updateStatus = function(payload) {
    if (!payload) return;

    var titleEl = document.getElementById('status-title');
    var detailEl = document.getElementById('status-detail');
    var subEl = document.getElementById('status-sub');

    if (payload.title) {
      titleEl.textContent = payload.title;
    }

    if (payload.state) {
      titleEl.className = 'state-' + payload.state;
    } else {
      titleEl.className = '';
    }

    if (payload.detail) {
      detailEl.textContent = payload.detail;
      detailEl.style.display = 'block';
    } else {
      detailEl.style.display = 'none';
    }

    if (payload.subDetail) {
      subEl.textContent = payload.subDetail;
      subEl.style.display = 'block';
    } else {
      subEl.style.display = 'none';
    }
  };
</script>
</body>
</html>
`;

const LOADING_SCREEN_URL = `data:text/html;charset=utf-8,${encodeURIComponent(LOADING_SCREEN_HTML)}`;

let loadingScreenActive = false;
let loadingScreenReady = false;
let lastLoadingPayload = null;
const pendingLoadingMessages = [];

const LOADING_STATE_PRIORITY = { error: 3, warn: 2, info: 1 };

let currentLoadingSeverity = 0;
let loadingStatusHoldUntil = 0;
let loadingStatusReleaseTimer = null;
let queuedStatusAfterHold = null;
let queuedStatusPayloadKey = null;

function isLoadingScreen(url = '') {
  return typeof url === 'string' && url.startsWith('data:text/html');
}

function getLoadingSeverity(status) {
  if (!status || !status.state) {
    return 1;
  }
  return LOADING_STATE_PRIORITY[status.state] || 1;
}

function clearLoadingStatusHold() {
  currentLoadingSeverity = 0;
  loadingStatusHoldUntil = 0;
  queuedStatusAfterHold = null;
  queuedStatusPayloadKey = null;
  if (loadingStatusReleaseTimer) {
    clearTimeout(loadingStatusReleaseTimer);
    loadingStatusReleaseTimer = null;
  }
}

function queueStatusAfterHold(status, payloadKey) {
  if (queuedStatusPayloadKey === payloadKey) {
    return;
  }

  queuedStatusAfterHold = status;
  queuedStatusPayloadKey = payloadKey;
  scheduleLoadingStatusRelease();
}

function scheduleLoadingStatusRelease() {
  if (!loadingStatusHoldUntil) {
    processQueuedStatusAfterHold();
    return;
  }

  const delay = Math.max(0, loadingStatusHoldUntil - Date.now());

  if (loadingStatusReleaseTimer) {
    clearTimeout(loadingStatusReleaseTimer);
  }

  loadingStatusReleaseTimer = setTimeout(() => {
    loadingStatusReleaseTimer = null;
    processQueuedStatusAfterHold();
  }, delay || 0);
}

function processQueuedStatusAfterHold() {
  if (loadingStatusHoldUntil && Date.now() < loadingStatusHoldUntil) {
    scheduleLoadingStatusRelease();
    return;
  }

  loadingStatusHoldUntil = 0;
  currentLoadingSeverity = 0;

  if (queuedStatusAfterHold) {
    const status = queuedStatusAfterHold;
    const payloadKey = queuedStatusPayloadKey;
    queuedStatusAfterHold = null;
    queuedStatusPayloadKey = null;
    sendLoadingStatus(status, { force: true, payloadKey });
  } else {
    flushPendingLoadingMessages();
  }
}

function sanitizeCliMessage(message) {
  if (!message) {
    return '';
  }

  const normalized = message
    .replace(/\r/g, '\n')
    .replace(/[\u001b\u009b][\[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u0007/g, '')
    .replace(/\n{2,}/g, '\n');

  return normalized.trim();
}

function summarizeCliMessage(message, { maxLength = 160 } = {}) {
  const sanitized = sanitizeCliMessage(message);
  if (!sanitized) {
    return '';
  }

  const firstLine = sanitized.split('\n')[0].trim();
  if (!firstLine) {
    return '';
  }

  if (firstLine.length <= maxLength) {
    return firstLine;
  }

  return `${firstLine.slice(0, maxLength - 1)}…`;
}

function resetLoadingScreenState() {
  loadingScreenActive = true;
  loadingScreenReady = false;
  lastLoadingPayload = null;
  pendingLoadingMessages.length = 0;
  clearLoadingStatusHold();
}

function deactivateLoadingScreen() {
  loadingScreenActive = false;
  loadingScreenReady = false;
  lastLoadingPayload = null;
  pendingLoadingMessages.length = 0;
  clearLoadingStatusHold();
}

async function flushPendingLoadingMessages() {
  if (!loadingScreenActive) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!loadingScreenReady) return;

  const currentUrl = mainWindow.webContents.getURL();
  if (!isLoadingScreen(currentUrl)) {
    pendingLoadingMessages.length = 0;
    return;
  }

  while (pendingLoadingMessages.length > 0) {
    const message = pendingLoadingMessages[0];
    const result = await sendLoadingStatus(message, {
      fromPendingQueue: true
    });

    if (result === 'sent' || result === 'duplicate' || result === 'error') {
      pendingLoadingMessages.shift();
      continue;
    }

    if (result === 'inactive' || result === 'pending' || result === 'queued') {
      break;
    }

    pendingLoadingMessages.shift();
  }
}

async function sendLoadingStatus(status, options = {}) {
  if (!loadingScreenActive) {
    return 'inactive';
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return 'inactive';
  }

  const {
    force = false,
    payloadKey: providedPayloadKey,
    fromPendingQueue = false
  } = options;

  const payloadKey = providedPayloadKey || JSON.stringify(status);

  if (!force && payloadKey === lastLoadingPayload) {
    return 'duplicate';
  }

  const severity = getLoadingSeverity(status);
  const now = Date.now();

  if (!force && loadingStatusHoldUntil && now < loadingStatusHoldUntil && severity < currentLoadingSeverity) {
    queueStatusAfterHold(status, payloadKey);
    return 'queued';
  }

  if (loadingStatusHoldUntil && now >= loadingStatusHoldUntil) {
    loadingStatusHoldUntil = 0;
    currentLoadingSeverity = 0;
  }

  const currentUrl = mainWindow.webContents.getURL();
  if (!isLoadingScreen(currentUrl)) {
    if (!fromPendingQueue) {
      pendingLoadingMessages.push(status);
    }
    return 'pending';
  }

  if (!loadingScreenReady) {
    if (!fromPendingQueue) {
      pendingLoadingMessages.push(status);
    }
    return 'pending';
  }

  try {
    await mainWindow.webContents.executeJavaScript(
      `window.__updateStatus && window.__updateStatus(${JSON.stringify(status)})`
    );
  } catch (error) {
    console.error('Failed to update loading screen:', error);
    return 'error';
  }

  lastLoadingPayload = payloadKey;
  currentLoadingSeverity = severity;

  if (severity >= 2) {
    loadingStatusHoldUntil = now + (severity === 3 ? 8000 : 4000);
    scheduleLoadingStatusRelease();
  } else {
    loadingStatusHoldUntil = 0;
    queuedStatusAfterHold = null;
    queuedStatusPayloadKey = null;
    if (loadingStatusReleaseTimer) {
      clearTimeout(loadingStatusReleaseTimer);
      loadingStatusReleaseTimer = null;
    }
  }

  if (!fromPendingQueue) {
    flushPendingLoadingMessages();
  }

  return 'sent';
}

async function showLoadingScreen(initialStatus) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  resetLoadingScreenState();

  try {
    await mainWindow.loadURL(LOADING_SCREEN_URL);
  } catch (error) {
    console.error('Failed to load loading screen:', error);
    return;
  }

  if (initialStatus) {
    await sendLoadingStatus(initialStatus);
  }
}

async function loadVibeKanbanUI() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    await mainWindow.loadURL(SERVER_URL);
  } catch (error) {
    console.error('Failed to load Vibe Kanban UI:', error);
  }
}

function killProcessTree(pid, { force = false } = {}) {
  if (pid === undefined || pid === null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    if (isWindows) {
      const args = ['/PID', String(pid), '/T'];
      if (force) {
        args.push('/F');
      }

      const killer = spawn('taskkill', args);
      killer.once('exit', () => resolve());
      killer.once('error', (error) => {
        console.error('taskkill failed:', error);
        resolve();
      });
      return;
    }

    try {
      process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
      resolve();
    } catch (groupError) {
      if (groupError.code === 'ESRCH') {
        resolve();
        return;
      }

      if (groupError.code === 'EINVAL' || groupError.code === 'EPERM') {
        try {
          process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
        } catch (childError) {
          if (childError.code !== 'ESRCH') {
            console.error('Failed to kill process pid', pid, childError);
          }
        }
      } else {
        console.error('Failed to kill process group', groupError);
      }

      resolve();
    }
  });
}

function stopServerProcess({ force = false } = {}) {
  if (!serverProcess) {
    return Promise.resolve();
  }

  const processRef = serverProcess;

  return new Promise((resolve) => {
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;

      if (serverProcess === processRef) {
        serverProcess = null;
      }

      serverWasStartedByApp = false;
      resolve();
    };

    const clearListeners = () => {
      processRef.removeListener('exit', onExit);
      processRef.removeListener('close', onExit);
      processRef.removeListener('error', onError);
    };

    const onExit = () => {
      clearTimeout(forceTimer);
      clearListeners();
      finalize();
    };

    const onError = (error) => {
      console.error('Server process error while stopping:', error);
      clearTimeout(forceTimer);
      clearListeners();
      finalize();
    };

    processRef.once('exit', onExit);
    processRef.once('close', onExit);
    processRef.once('error', onError);

    killProcessTree(processRef.pid, { force }).then(() => {
      if (force) {
        setTimeout(() => {
          clearListeners();
          finalize();
        }, 500);
      }
    });

    const forceTimer = setTimeout(() => {
      killProcessTree(processRef.pid, { force: true }).finally(() => {
        setTimeout(() => {
          clearListeners();
          finalize();
        }, 500);
      });
    }, force ? 0 : 3500);
  });
}

function resolveExecutable(executableName, { extraDirs = [] } = {}) {
  const searchDirs = new Set();

  const envPath = process.env.PATH || '';
  for (const segment of envPath.split(path.delimiter)) {
    if (segment) {
      searchDirs.add(segment);
    }
  }

  for (const dir of extraDirs) {
    if (dir) {
      searchDirs.add(dir);
    }
  }

  if (!searchDirs.size) {
    return null;
  }

  const extensions = isWindows
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  for (const directory of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(directory, isWindows ? executableName + ext : executableName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

// Function to create the macOS menu
function createMenu() {
  if (process.platform !== 'darwin') return;

  const isDev = !app.isPackaged;

  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: 'About Vibe Kanban' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide Vibe Kanban' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit Vibe Kanban',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        // DevTools only in development
        ...(isDev ? [{ role: 'toggleDevTools', label: 'Developer Tools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Full Screen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Bring All to Front' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

let mainWindow;
let serverProcess;
let serverWasStartedByApp = false; // Track if we started the server ourselves
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

  await sendLoadingStatus({
    title: 'Looking for Vibe Kanban server…',
    detail: 'Checking for existing process.'
  });

  const isRunning = await checkServerRunning();
  if (isRunning) {
    console.log('Server is already running!');
    serverWasStartedByApp = false;

    await sendLoadingStatus({
      title: 'Connecting to Vibe Kanban…',
      detail: 'Local server is already running.'
    });

    return true;
  }

  console.log('Starting Vibe Kanban server...');

  await sendLoadingStatus({
    title: 'Starting Vibe Kanban server…',
    detail: 'Initializing via npx. This may take a moment.'
  });

  const knownNpxLocations = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/opt/homebrew/bin',
    path.join(process.env.HOME || '', '.npm-packages', 'bin'),
    path.join(process.env.HOME || '', '.local', 'bin')
  ];

  const npxExecutable = resolveExecutable('npx', { extraDirs: knownNpxLocations });

  if (!npxExecutable) {
    await sendLoadingStatus({
      title: 'npx not found',
      detail: 'Unable to locate npx executable on this machine.',
      subDetail: 'Install Node.js (including npm/npx) or add its path to PATH.',
      state: 'error'
    });

    console.error('Unable to locate npx executable');
    return false;
  }

  const env = {
    ...process.env,
    PORT: SERVER_PORT.toString(),
    npm_config_yes: 'true'
  };

  const defaultPathSegments = knownNpxLocations.filter(Boolean);
  const envPathSegments = (env.PATH || '').split(path.delimiter).filter(Boolean);
  const mergedPath = Array.from(new Set([...envPathSegments, ...defaultPathSegments]));
  env.PATH = mergedPath.join(path.delimiter);

  let processRef;

  try {
    processRef = spawn(npxExecutable, ['--yes', 'vibe-kanban', 'start'], {
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    });
  } catch (error) {
    console.error('Failed to spawn Vibe Kanban server:', error);
    serverProcess = null;
    serverWasStartedByApp = false;

    await sendLoadingStatus({
      title: 'Failed to start Vibe Kanban',
      detail: error.message,
      state: 'error'
    });

    return false;
  }

  serverProcess = processRef;
  serverWasStartedByApp = true;

  let startupComplete = false;
  let lastStdoutSnippet = '';
  let lastStderrSnippet = '';

  const handleOutput = (chunk, stream) => {
    const text = chunk.toString();
    if (!text) {
      return;
    }

    const sanitized = sanitizeCliMessage(text);
    if (!sanitized) {
      return;
    }

    const snippet = summarizeCliMessage(sanitized, { maxLength: 140 });

    if (stream === 'stderr') {
      console.error(`Vibe Kanban Error: ${sanitized}`);
    } else {
      console.log(`Vibe Kanban: ${sanitized}`);
    }

    if (startupComplete || !loadingScreenActive) {
      return;
    }

    const lower = sanitized.toLowerCase();

    if (/need to install|installing|downloading/.test(lower)) {
      sendLoadingStatus({
        title: 'Installing Vibe Kanban…',
        detail: 'Downloading required dependencies (first launch).',
        subDetail: snippet,
        state: 'info'
      });
      return;
    }

    if (stream === 'stderr') {
      if (snippet && snippet !== lastStderrSnippet) {
        lastStderrSnippet = snippet;
        sendLoadingStatus({
          title: 'Starting server…',
          detail: 'Just a few more seconds…',
          subDetail: snippet,
          state: 'warn'
        });
      }
      return;
    }

    if (snippet && snippet !== lastStdoutSnippet) {
      lastStdoutSnippet = snippet;
      sendLoadingStatus({
        title: 'Starting Vibe Kanban server…',
        detail: snippet
      });
    }
  };

  if (processRef.stdout) {
    processRef.stdout.setEncoding('utf8');
    processRef.stdout.on('data', (chunk) => handleOutput(chunk, 'stdout'));
  }

  if (processRef.stderr) {
    processRef.stderr.setEncoding('utf8');
    processRef.stderr.on('data', (chunk) => handleOutput(chunk, 'stderr'));
  }

  processRef.once('exit', (code, signal) => {
    console.log(`Vibe Kanban process exited (code=${code}, signal=${signal})`);

    if (serverProcess === processRef) {
      serverProcess = null;
    }

    serverWasStartedByApp = false;

    if (!startupComplete && loadingScreenActive) {
      sendLoadingStatus({
        title: 'Failed to start Vibe Kanban',
        detail: 'Server stopped unexpectedly.',
        subDetail: code !== null ? `Exit code: ${code}` : undefined,
        state: 'error'
      });
    }
  });

  processRef.once('error', (error) => {
    console.error('Server process error:', error);

    if (serverProcess === processRef) {
      serverProcess = null;
    }

    serverWasStartedByApp = false;

    if (!startupComplete && loadingScreenActive) {
      sendLoadingStatus({
        title: 'Erreur lors du lancement de Vibe Kanban',
        detail: error.message,
        state: 'error'
      });
    }
  });

  try {
    await waitForServer(45000);
    startupComplete = true;

    await sendLoadingStatus({
      title: 'Server ready!',
      detail: 'Loading Vibe Kanban…',
      state: 'info'
    });

    return true;
  } catch (error) {
    console.error('Error starting server:', error);

    await sendLoadingStatus({
      title: 'Unable to start Vibe Kanban',
      detail: 'Server did not respond in time.',
      subDetail: error.message,
      state: 'error'
    });

    await stopServerProcess({ force: true });

    return false;
  }
}

async function waitForServer(timeout = 45000) {
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

async function createWindow() {
  // Look for icon (PNG or SVG)
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
    backgroundColor: '#1a1a1a', // Dark background matching Vibe Kanban
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: true, // Enable sandbox for better security
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    },
    title: 'Vibe Kanban',
    show: true, // Show immediately
    center: true, // Center the window
    alwaysOnTop: false,
    skipTaskbar: false
  };

  // Add icon if it exists
  if (iconPath) {
    if (iconPath.endsWith('.svg')) {
      // For SVG, use nativeImage
      windowOptions.icon = nativeImage.createFromPath(iconPath);
    } else {
      windowOptions.icon = iconPath;
    }
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Block all external navigation (security)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    // Only allow localhost
    if (parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
      console.warn('Blocked navigation to:', url);
      event.preventDefault();
    }
  });

  // Block opening new windows (security)
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Set strict Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " + // Required for Vibe Kanban
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
            console.log('[Electron] WebSocket URL fixed:', url);
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

  mainWindow.webContents.on('did-finish-load', () => {
    const currentUrl = mainWindow.webContents.getURL();
    if (isLoadingScreen(currentUrl)) {
      loadingScreenReady = true;
      flushPendingLoadingMessages();
    } else {
      deactivateLoadingScreen();
      console.log('Page loaded successfully!');
    }
  });

  // Open DevTools in development only (optional)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle loading errors - retry indefinitely
  mainWindow.webContents.on('did-fail-load', async (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);

    const currentUrl = mainWindow ? mainWindow.webContents.getURL() : '';
    if (isLoadingScreen(currentUrl)) {
      return;
    }

    // Retry after 3 seconds
    console.log('Retrying in 3 seconds...');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !loadingScreenActive) {
        mainWindow.loadURL(SERVER_URL);
      }
    }, 3000);
  });

  // Remove old error page - retry indefinitely
  /*
  if (false) {  // Code disabled
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
            <h1>Vibe Kanban Server Unavailable</h1>
            <p>Unable to connect to Vibe Kanban server at <code>${SERVER_URL}</code></p>
            <p>Please start the Vibe Kanban server manually and click the button below.</p>
            <button class="retry-btn" onclick="location.reload()">Retry</button>
          </div>
        </body>
        </html>
      `);
    }
  }
  */

  await showLoadingScreen({
    title: 'Initializing Vibe Kanban…',
    detail: 'Preparing local server.'
  });

  // Show window immediately to prevent it from staying hidden
  mainWindow.show();

  // On macOS, activate the app and bring window to front
  if (process.platform === 'darwin') {
    app.dock.show();
    mainWindow.focus();
  }
}

app.whenReady().then(async () => {
  // Create menu with proper app name
  createMenu();

  // Set app icon for Dock (macOS)
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      app.dock.setIcon(icon);
    }
  }

  await createWindow();

  const serverStarted = await startVibeKanbanServer();
  if (serverStarted) {
    await sendLoadingStatus({
      title: 'Connecting to Vibe Kanban…',
      detail: 'Loading interface.'
    });

    await loadVibeKanbanUI();
  } else {
    console.log('Server failed to start, keeping loading screen visible');
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      const restarted = await startVibeKanbanServer();
      if (restarted) {
        await sendLoadingStatus({
          title: 'Connecting to Vibe Kanban…',
          detail: 'Loading interface.'
        });
        await loadVibeKanbanUI();
      }
    }
  });
});

let isQuitting = false;
let quitConfirmed = false;

app.on('window-all-closed', () => {
  // On macOS, quit when all windows are closed
  // Confirmation dialog will be handled in before-quit
  app.quit();
});

app.on('before-quit', async (event) => {
  console.log('before-quit event fired');
  console.log('quitConfirmed:', quitConfirmed);
  console.log('serverWasStartedByApp:', serverWasStartedByApp);
  console.log('isQuitting:', isQuitting);

  // If already confirmed, let it quit
  if (quitConfirmed) {
    console.log('Quit already confirmed, exiting');
    return;
  }

  // If we started the server, ask for confirmation
  if (serverWasStartedByApp && serverProcess && !isQuitting) {
    console.log('Preventing quit to show dialog');
    event.preventDefault();
    isQuitting = true;

    // Create temporary invisible window for dialog if needed
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

    // Use showMessageBoxSync for synchronous response
    const response = dialog.showMessageBoxSync(dialogParent, {
      type: 'question',
      buttons: ['Stop Kanban', 'Keep Running', 'Cancel'],
      defaultId: 0,
      title: 'Closing Vibe Kanban',
      message: 'Do you want to stop the Vibe Kanban server?',
      detail: 'The Vibe Kanban server was started by this application. Do you want to stop it when closing the app?',
      cancelId: 2,
      noLink: true
    });

    // Close temporary window if we created one
    if (dialogParent !== mainWindow && !dialogParent.isDestroyed()) {
      dialogParent.destroy();
    }

    if (response === 0) {
      // Stop the server
      console.log('Stopping Vibe Kanban server...');
      try {
        await stopServerProcess({ force: false });
      } catch (error) {
        console.error('Failed to stop server cleanly:', error);
      }

      quitConfirmed = true;
      isQuitting = false;
      app.quit();
      return;
    } else if (response === 1) {
      // Keep server running
      console.log('Leaving Vibe Kanban server running...');
      serverProcess = null;
      serverWasStartedByApp = false;
      quitConfirmed = true;
      isQuitting = false;
      app.quit();
      return;
    } else {
      // Cancel
      console.log('User cancelled quit');
      isQuitting = false;
      return;
    }
  } else if (!serverWasStartedByApp && serverProcess) {
    // If we didn't start the server, just detach
    console.log('Detaching from Vibe Kanban server...');
    serverProcess = null;
  }
});

// Handle crashes
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
