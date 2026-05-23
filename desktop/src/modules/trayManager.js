// desktop/src/modules/trayManager.js
const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

class TrayManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.tray = null;
    this.currentState = {
      focusMode: false,
      timerRemaining: 0,
      isPaused: false
    };
    this.iconPath = null;
    this.isDestroyed = false;
  }

  async initialize(iconPath = null) {
    this.iconPath = iconPath || this.getDefaultIconPath();
    
    try {
      await this.createTray();
      this.setupContextMenu();
      this.setupEventListeners();
      
      console.log('TrayManager initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize TrayManager:', error);
      throw error;
    }
  }

  getDefaultIconPath() {
    const possiblePaths = [
      path.join(__dirname, '../../assets/icons/icon.png'),
      path.join(__dirname, '../../../assets/icons/icon.png'),
      path.join(process.resourcesPath, 'icons/icon.png')
    ];
    
    for (const iconPath of possiblePaths) {
      if (fs.existsSync(iconPath)) {
        return iconPath;
      }
    }
    
    return null;
  }

  async createTray() {
    let icon = null;
    
    if (this.iconPath && fs.existsSync(this.iconPath)) {
      icon = nativeImage.createFromPath(this.iconPath);
      icon = icon.resize({ width: 16, height: 16 });
    } else {
      icon = nativeImage.createEmpty();
    }
    
    this.tray = new Tray(icon);
    this.tray.setToolTip('FocusSync - Click to open');
    
    this.tray.on('click', () => {
      this.handleTrayClick();
    });
    
    this.tray.on('double-click', () => {
      this.handleTrayDoubleClick();
    });
  }

  setupContextMenu() {
    const contextMenu = this.buildContextMenu();
    this.tray.setContextMenu(contextMenu);
  }

  buildContextMenu() {
    const template = [
      {
        label: 'FocusSync',
        enabled: false,
        icon: this.getMenuIcon('app')
      },
      { type: 'separator' },
      {
        label: this.currentState.focusMode ? 'Focus Mode: Active' : 'Focus Mode: Inactive',
        enabled: false,
        icon: this.getMenuIcon(this.currentState.focusMode ? 'focus-active' : 'focus-inactive')
      },
      {
        label: this.getTimerLabel(),
        enabled: false,
        visible: this.currentState.focusMode
      },
      { type: 'separator', visible: this.currentState.focusMode },
      {
        label: 'Start Focus Session',
        click: () => this.sendCommand('start-focus'),
        visible: !this.currentState.focusMode,
        icon: this.getMenuIcon('play')
      },
      {
        label: 'Stop Focus Session',
        click: () => this.sendCommand('stop-focus'),
        visible: this.currentState.focusMode && !this.currentState.isPaused,
        icon: this.getMenuIcon('stop')
      },
      {
        label: 'Pause Timer',
        click: () => this.sendCommand('pause-timer'),
        visible: this.currentState.focusMode && !this.currentState.isPaused,
        icon: this.getMenuIcon('pause')
      },
      {
        label: 'Resume Timer',
        click: () => this.sendCommand('resume-timer'),
        visible: this.currentState.focusMode && this.currentState.isPaused,
        icon: this.getMenuIcon('play')
      },
      { type: 'separator' },
      {
        label: 'Show App',
        click: () => this.showWindow(),
        accelerator: 'CmdOrCtrl+Shift+S',
        icon: this.getMenuIcon('show')
      },
      {
        label: 'Hide App',
        click: () => this.hideWindow(),
        icon: this.getMenuIcon('hide')
      },
      { type: 'separator' },
      {
        label: 'Quick Stats',
        submenu: [
          {
            label: 'Today\'s Focus Time',
            click: () => this.sendCommand('show-today-stats'),
            icon: this.getMenuIcon('stats')
          },
          {
            label: 'Weekly Report',
            click: () => this.sendCommand('show-weekly-stats'),
            icon: this.getMenuIcon('stats')
          }
        ]
      },
      {
        label: 'Blocked Websites',
        click: () => this.sendCommand('show-blocked-sites'),
        icon: this.getMenuIcon('block')
      },
      { type: 'separator' },
      {
        label: 'Settings',
        click: () => this.sendCommand('open-settings'),
        icon: this.getMenuIcon('settings')
      },
      {
        label: 'Sync Now',
        click: () => this.sendCommand('sync-now'),
        icon: this.getMenuIcon('sync')
      },
      { type: 'separator' },
      {
        label: 'Quit FocusSync',
        click: () => this.quitApplication(),
        icon: this.getMenuIcon('quit')
      }
    ];
    
    return Menu.buildFromTemplate(template);
  }

  getTimerLabel() {
    if (!this.currentState.focusMode) return 'No active session';
    
    const minutes = Math.floor(this.currentState.timerRemaining / 60);
    const seconds = this.currentState.timerRemaining % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    return this.currentState.isPaused ? `⏸ Paused - ${timeString}` : `⏱ Remaining - ${timeString}`;
  }

  getMenuIcon(type) {
    try {
      const iconSize = { width: 16, height: 16 };
      let iconPath = null;
      
      switch(type) {
        case 'play':
          iconPath = path.join(__dirname, '../../assets/icons/play.png');
          break;
        case 'pause':
          iconPath = path.join(__dirname, '../../assets/icons/pause.png');
          break;
        case 'stop':
          iconPath = path.join(__dirname, '../../assets/icons/stop.png');
          break;
        case 'settings':
          iconPath = path.join(__dirname, '../../assets/icons/settings.png');
          break;
        case 'sync':
          iconPath = path.join(__dirname, '../../assets/icons/sync.png');
          break;
        case 'stats':
          iconPath = path.join(__dirname, '../../assets/icons/stats.png');
          break;
        case 'block':
          iconPath = path.join(__dirname, '../../assets/icons/block.png');
          break;
        case 'show':
          iconPath = path.join(__dirname, '../../assets/icons/show.png');
          break;
        case 'hide':
          iconPath = path.join(__dirname, '../../assets/icons/hide.png');
          break;
        case 'quit':
          iconPath = path.join(__dirname, '../../assets/icons/quit.png');
          break;
        default:
          return null;
      }
      
      if (iconPath && fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        return icon.resize(iconSize);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  setupEventListeners() {
    if (this.mainWindow) {
      this.mainWindow.on('show', () => {
        this.updateTrayIcon('active');
      });
      
      this.mainWindow.on('hide', () => {
        this.updateTrayIcon('inactive');
      });
    }
  }

  handleTrayClick() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.showWindow();
      }
    }
  }

  handleTrayDoubleClick() {
    this.sendCommand('start-focus');
  }

  showWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.updateTrayIcon('active');
    }
  }

  hideWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
      this.updateTrayIcon('inactive');
    }
  }

  sendCommand(command) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tray-command', { command });
    }
  }

  updateFocusState(focusMode, timerRemaining, isPaused = false) {
    this.currentState.focusMode = focusMode;
    this.currentState.timerRemaining = timerRemaining;
    this.currentState.isPaused = isPaused;
    
    this.updateTrayTooltip();
    this.refreshContextMenu();
    this.updateTrayIcon(focusMode ? 'focus' : 'normal');
  }

  updateTimerRemaining(seconds) {
    this.currentState.timerRemaining = seconds;
    this.updateTrayTooltip();
    this.refreshContextMenu();
  }

  updateTrayTooltip() {
    if (!this.tray || this.isDestroyed) return;
    
    let tooltip = 'FocusSync';
    
    if (this.currentState.focusMode) {
      const minutes = Math.floor(this.currentState.timerRemaining / 60);
      const seconds = this.currentState.timerRemaining % 60;
      const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      if (this.currentState.isPaused) {
        tooltip += ` - Paused (${timeString})`;
      } else {
        tooltip += ` - Focus Mode (${timeString})`;
      }
    } else {
      tooltip += ' - Click to start focusing';
    }
    
    this.tray.setToolTip(tooltip);
  }

  updateTrayIcon(state) {
    if (!this.tray || this.isDestroyed) return;
    
    let iconFile = 'icon.png';
    
    if (state === 'focus' || (this.currentState.focusMode && state !== 'inactive')) {
      iconFile = 'icon-focus.png';
    } else if (state === 'active') {
      iconFile = 'icon-active.png';
    } else if (state === 'inactive') {
      iconFile = 'icon-inactive.png';
    }
    
    const iconFullPath = path.join(path.dirname(this.iconPath || ''), iconFile);
    
    if (fs.existsSync(iconFullPath)) {
      let icon = nativeImage.createFromPath(iconFullPath);
      icon = icon.resize({ width: 16, height: 16 });
      this.tray.setImage(icon);
    } else if (this.iconPath && fs.existsSync(this.iconPath)) {
      let icon = nativeImage.createFromPath(this.iconPath);
      icon = icon.resize({ width: 16, height: 16 });
      this.tray.setImage(icon);
    }
  }

  refreshContextMenu() {
    if (!this.tray || this.isDestroyed) return;
    const newMenu = this.buildContextMenu();
    this.tray.setContextMenu(newMenu);
  }

  showNotification(title, body) {
    if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isVisible()) {
      return;
    }
    
    if (this.tray && !this.isDestroyed) {
      this.tray.displayBalloon({
        title: title,
        content: body,
        iconType: 'info'
      });
    }
  }

  sendCommand(command) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tray-command', { command });
    }
  }

  quitApplication() {
    const shouldQuit = true;
    
    if (shouldQuit) {
      app.quit();
    }
  }

  destroy() {
    if (this.tray && !this.isDestroyed) {
      this.tray.destroy();
      this.tray = null;
    }
    this.isDestroyed = true;
    console.log('TrayManager destroyed');
  }

  isTrayDestroyed() {
    return this.isDestroyed;
  }
}

module.exports = TrayManager;