const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const HostsBlocker = require('../src/modules/hostsBlocker');

let mainWindow = null;
let hostsBlocker = null;

const DEFAULT_BLOCKED_DOMAINS = [
  'facebook.com',
  'youtube.com',
  'instagram.com',
  'x.com',
  'reddit.com',
  'tiktok.com'
];

function normalizeDomains(inputDomains) {
  if (!Array.isArray(inputDomains)) {
    return [];
  }

  return inputDomains
    .map((domain) => String(domain || '').trim().toLowerCase())
    .filter(Boolean);
}

async function ensureHostsBlocker() {
  if (!hostsBlocker) {
    hostsBlocker = new HostsBlocker();
  }

  if (!hostsBlocker.isInitialized) {
    await hostsBlocker.initialize();
  }

  return hostsBlocker;
}

function registerIpcHandlers() {
  ipcMain.handle('site-lock:start', async (_event, domains) => {
    try {
      const blocker = await ensureHostsBlocker();
      const requestedDomains = normalizeDomains(domains);
      const effectiveDomains = requestedDomains.length > 0 ? requestedDomains : DEFAULT_BLOCKED_DOMAINS;
      const validDomains = effectiveDomains.filter((domain) => blocker.validateDomain(domain));

      if (validDomains.length === 0) {
        return { success: false, error: 'No valid domains provided for blocking.' };
      }

      const result = await blocker.blockSites(validDomains);
      return { success: true, ...result, domains: validDomains };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('site-lock:stop', async () => {
    try {
      const blocker = await ensureHostsBlocker();
      await blocker.restoreHosts();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('site-lock:list', async () => {
    try {
      const blocker = await ensureHostsBlocker();
      const domains = await blocker.getBlockedSites();
      return { success: true, domains };
    } catch (error) {
      return { success: false, error: error.message, domains: [] };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, '../src/renderer/index.html'));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

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
  if (hostsBlocker && hostsBlocker.isInitialized) {
    hostsBlocker.restoreHosts().catch((error) => {
      console.error('Failed to restore hosts before quit:', error);
    });
  }
});
