const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('FocusSync', {
  appName: 'FocusSync Desktop',
  appVersion: '1.0.0',
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  startSiteLock: (domains) => ipcRenderer.invoke('site-lock:start', domains),
  stopSiteLock: () => ipcRenderer.invoke('site-lock:stop'),
  getBlockedSites: () => ipcRenderer.invoke('site-lock:list')
});
