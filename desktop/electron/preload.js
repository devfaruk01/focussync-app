const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('FocusSync', {
  appName: 'FocusSync Desktop',
  appVersion: '1.0.0',
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});
