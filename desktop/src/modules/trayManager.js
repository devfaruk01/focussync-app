// desktop/src/modules/trayManager.js
const { Tray, Menu, nativeImage, app, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

class TrayManager extends EventEmitter {
  constructor(mainWindow) {
    super();
    this.mainWindow = mainWindow;
    this.tray = null;
    this.timerManager = null;
    this.syncManager = null;
    this.currentState = {
      focusMode: false,
      timerRemaining: 0,
      isPaused: false,
      mode: 'idle',
      completedSessions: 0,
      currentCycle: 1,
      syncStatus: 'connected',
      lastSyncTime: null
    };
    this.iconPath = null;
    this.isDestroyed = false;
    this.menuUpdateInterval = null;
    this.eventListeners = new Map();
  }

  async initialize(timerManager, syncManager, iconPath = null) {
    this.timerManager = timerManager;
    this.syncManager = syncManager;
    this.iconPath = iconPath || this.getDefaultIconPath();
    
    try {
      await this.createTray();
      this.setupContextMenu();
      this.setupEventListeners();
      this.startMenuUpdates();
      
      this.emit('initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize TrayManager:', error);
      this.emit('error', error);
      throw error;
    }
  }

  getDefaultIconPath() {
    const possiblePaths = [
      path.join(__dirname, '../../assets/icons/icon.png'),
      path.join(__dirname, '../../../assets/icons/icon.png'),
      path.join(process.resourcesPath, 'icons/icon.png'),
      path.join(__dirname, '../assets/icons/icon.png')
    ];
    
    for (const iconPath of possiblePaths) {
      if (fs.existsSync(iconPath)) {
        return iconPath;
      }
    }
    
    return null;
  }

  async createTray() {
    if (this.tray) {
      this.tray.destroy();
    }
    
    let icon = this.getTrayIcon();
    
    this.tray = new Tray(icon);
    this.tray.setToolTip('FocusSync - Click to open dashboard');
    
    this.tray.on('click', () => {
      this.handleTrayClick();
    });
    
    this.tray.on('double-click', () => {
      this.handleTrayDoubleClick();
    });
    
    this.tray.on('right-click', (event) => {
      this.handleTrayRightClick();
    });
  }

  getTrayIcon() {
    try {
      let iconFile = 'icon.png';
      
      if (this.currentState.focusMode && !this.currentState.isPaused) {
        iconFile = 'icon-focus.png';
      } else if (this.currentState.focusMode && this.currentState.isPaused) {
        iconFile = 'icon-paused.png';
      } else if (this.currentState.syncStatus === 'syncing') {
        iconFile = 'icon-syncing.png';
      }
      
      let iconFullPath = this.iconPath;
      if (iconFile !== 'icon.png') {
        const iconDir = path.dirname(this.iconPath || '');
        iconFullPath = path.join(iconDir, iconFile);
      }
      
      if (iconFullPath && fs.existsSync(iconFullPath)) {
        let icon = nativeImage.createFromPath(iconFullPath);
        icon = icon.resize({ width: 16, height: 16 });
        return icon;
      }
      
      if (this.iconPath && fs.existsSync(this.iconPath)) {
        let icon = nativeImage.createFromPath(this.iconPath);
        icon = icon.resize({ width: 16, height: 16 });
        return icon;
      }
      
      return nativeImage.createEmpty();
    } catch (error) {
      console.error('Failed to create tray icon:', error);
      return nativeImage.createEmpty();
    }
  }

  setupContextMenu() {
    const contextMenu = this.buildContextMenu();
    this.tray.setContextMenu(contextMenu);
  }

  buildContextMenu() {
    const template = this.getMenuTemplate();
    return Menu.buildFromTemplate(template);
  }

  getMenuTemplate() {
    const template = [
      {
        label: 'FocusSync',
        enabled: false,
        icon: this.getMenuIcon('app')
      },
      { type: 'separator' },
      {
        label: this.getStatusLabel(),
        enabled: false,
        icon: this.getMenuIcon(this.currentState.focusMode ? 'focus-active' : 'focus-inactive')
      },
      {
        label: this.getTimerLabel(),
        enabled: false,
        visible: this.currentState.focusMode,
        icon: this.getMenuIcon('timer')
      },
      {
        label: `Sessions: ${this.currentState.completedSessions}`,
        enabled: false,
        visible: this.currentState.focusMode,
        icon: this.getMenuIcon('sessions')
      },
      { type: 'separator', visible: this.currentState.focusMode },
      {
        label: 'Start Focus',
        click: () => this.sendCommand('start-focus'),
        visible: !this.currentState.focusMode,
        icon: this.getMenuIcon('play')
      },
      {
        label: 'Pause Focus',
        click: () => this.sendCommand('pause-timer'),
        visible: this.currentState.focusMode && !this.currentState.isPaused,
        icon: this.getMenuIcon('pause')
      },
      {
        label: 'Resume Focus',
        click: () => this.sendCommand('resume-timer'),
        visible: this.currentState.focusMode && this.currentState.isPaused,
        icon: this.getMenuIcon('resume')
      },
      {
        label: 'Stop Focus',
        click: () => this.sendCommand('stop-focus'),
        visible: this.currentState.focusMode,
        icon: this.getMenuIcon('stop')
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => this.showWindow(),
        accelerator: 'CmdOrCtrl+Shift+D',
        icon: this.getMenuIcon('dashboard')
      },
      {
        label: 'Hide Dashboard',
        click: () => this.hideWindow(),
        visible: this.mainWindow && this.mainWindow.isVisible(),
        icon: this.getMenuIcon('hide')
      },
      { type: 'separator' },
      {
        label: 'Quick Stats',
        submenu: this.getStatsSubmenu(),
        icon: this.getMenuIcon('stats')
      },
      {
        label: 'Blocked Sites',
        click: () => this.sendCommand('show-blocked-sites'),
        icon: this.getMenuIcon('block')
      },
      { type: 'separator' },
      {
        label: 'Sync Status',
        submenu: this.getSyncSubmenu(),
        icon: this.getMenuIcon('sync')
      },
      {
        label: 'Settings',
        click: () => this.sendCommand('open-settings'),
        icon: this.getMenuIcon('settings')
      },
      { type: 'separator' },
      {
        label: 'About FocusSync',
        click: () => this.showAboutDialog(),
        icon: this.getMenuIcon('about')
      },
      {
        label: 'Quit FocusSync',
        click: () => this.quitApplication(),
        icon: this.getMenuIcon('quit')
      }
    ];
    
    return template;
  }

  getStatusLabel() {
    if (this.currentState.focusMode) {
      return this.currentState.isPaused ? 'Focus Mode: Paused' : 'Focus Mode: Active';
    }
    return 'Focus Mode: Inactive';
  }

  getTimerLabel() {
    if (!this.currentState.focusMode) return 'No active session';
    
    const minutes = Math.floor(this.currentState.timerRemaining / 60);
    const seconds = this.currentState.timerRemaining % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    const modeLabel = this.currentState.mode === 'work' ? 'Focus' : 'Break';
    
    return `${modeLabel} - ${timeString}`;
  }

  getStatsSubmenu() {
    return [
      {
        label: `Today's Focus: ${this.getTodayFocusTime()} min`,
        click: () => this.sendCommand('show-today-stats'),
        icon: this.getMenuIcon('today')
      },
      {
        label: `Sessions Today: ${this.currentState.completedSessions}`,
        enabled: false,
        icon: this.getMenuIcon('sessions')
      },
      { type: 'separator' },
      {
        label: 'Weekly Report',
        click: () => this.sendCommand('show-weekly-stats'),
        icon: this.getMenuIcon('weekly')
      },
      {
        label: 'Monthly Report',
        click: () => this.sendCommand('show-monthly-stats'),
        icon: this.getMenuIcon('monthly')
      }
    ];
  }

  getSyncSubmenu() {
    const syncStatusText = this.getSyncStatusText();
    const syncIcon = this.getSyncStatusIcon();
    
    return [
      {
        label: `Status: ${syncStatusText}`,
        enabled: false,
        icon: this.getMenuIcon(syncIcon)
      },
      {
        label: this.currentState.lastSyncTime ? 
          `Last Sync: ${this.formatTimeAgo(this.currentState.lastSyncTime)}` : 
          'Last Sync: Never',
        enabled: false,
        icon: this.getMenuIcon('time')
      },
      { type: 'separator' },
      {
        label: 'Sync Now',
        click: () => this.sendCommand('sync-now'),
        icon: this.getMenuIcon('sync-now')
      },
      {
        label: 'Force Full Sync',
        click: () => this.sendCommand('force-sync'),
        icon: this.getMenuIcon('force-sync')
      }
    ];
  }

  getTodayFocusTime() {
    if (this.timerManager && this.timerManager.getStatistics) {
      const stats = this.timerManager.getStatistics();
      return stats.totalFocusMinutes || 0;
    }
    return 0;
  }

  getSyncStatusText() {
    switch(this.currentState.syncStatus) {
      case 'connected': return 'Connected';
      case 'syncing': return 'Syncing...';
      case 'error': return 'Connection Error';
      case 'offline': return 'Offline Mode';
      default: return 'Unknown';
    }
  }

  getSyncStatusIcon() {
    switch(this.currentState.syncStatus) {
      case 'connected': return 'sync-success';
      case 'syncing': return 'sync-syncing';
      case 'error': return 'sync-error';
      case 'offline': return 'sync-offline';
      default: return 'sync';
    }
  }

  formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  }

  getMenuIcon(type) {
    try {
      const iconSize = { width: 16, height: 16 };
      let iconPath = null;
      
      const iconMap = {
        'app': 'icon.png',
        'play': 'play.png',
        'pause': 'pause.png',
        'resume': 'resume.png',
        'stop': 'stop.png',
        'dashboard': 'dashboard.png',
        'hide': 'hide.png',
        'stats': 'stats.png',
        'block': 'block.png',
        'sync': 'sync.png',
        'sync-now': 'sync.png',
        'force-sync': 'sync-force.png',
        'sync-success': 'sync-success.png',
        'sync-syncing': 'sync-syncing.png',
        'sync-error': 'sync-error.png',
        'sync-offline': 'sync-offline.png',
        'settings': 'settings.png',
        'about': 'about.png',
        'quit': 'quit.png',
        'today': 'today.png',
        'weekly': 'weekly.png',
        'monthly': 'monthly.png',
        'time': 'time.png',
        'timer': 'timer.png',
        'sessions': 'sessions.png',
        'focus-active': 'focus-active.png',
        'focus-inactive': 'focus-inactive.png',
        'focus-paused': 'focus-paused.png'
      };
      
      const iconFile = iconMap[type];
      if (iconFile) {
        const iconDir = path.dirname(this.iconPath || '');
        iconPath = path.join(iconDir, iconFile);
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
    if (this.timerManager) {
      const timerHandlers = {
        'tick': this.onTimerTick.bind(this),
        'timer-started': this.onTimerStarted.bind(this),
        'timer-paused': this.onTimerPaused.bind(this),
        'timer-resumed': this.onTimerResumed.bind(this),
        'timer-stopped': this.onTimerStopped.bind(this),
        'work-completed': this.onWorkCompleted.bind(this),
        'break-started': this.onBreakStarted.bind(this)
      };
      
      for (const [event, handler] of Object.entries(timerHandlers)) {
        this.timerManager.on(event, handler);
        this.eventListeners.set(`timer:${event}`, { event, handler, target: this.timerManager });
      }
    }
    
    if (this.syncManager) {
      const syncHandlers = {
        'sync-complete': this.onSyncComplete.bind(this),
        'sync-start': this.onSyncStart.bind(this),
        'sync-error': this.onSyncError.bind(this),
        'offline-mode': this.onOfflineMode.bind(this)
      };
      
      for (const [event, handler] of Object.entries(syncHandlers)) {
        this.syncManager.on(event, handler);
        this.eventListeners.set(`sync:${event}`, { event, handler, target: this.syncManager });
      }
    }
    
    if (this.mainWindow) {
      this.mainWindow.on('closed', () => {
        if (!this.isDestroyed) {
          this.destroy();
        }
      });
    }
  }

  onTimerTick(state) {
    if (state && state.remaining !== undefined) {
      this.currentState.timerRemaining = state.remaining;
      this.currentState.mode = state.mode || 'work';
      this.updateTray();
    }
  }

  onTimerStarted(data) {
    this.currentState.focusMode = true;
    this.currentState.isPaused = false;
    this.currentState.mode = data.mode || 'work';
    this.updateTray();
    this.showNotification('Focus Session Started', 'Stay productive!');
  }

  onTimerPaused(data) {
    this.currentState.isPaused = true;
    this.updateTray();
    this.showNotification('Focus Session Paused', 'Take a moment to breathe');
  }

  onTimerResumed(data) {
    this.currentState.isPaused = false;
    this.updateTray();
    this.showNotification('Focus Session Resumed', 'Back to work!');
  }

  onTimerStopped(data) {
    this.currentState.focusMode = false;
    this.currentState.isPaused = false;
    this.currentState.mode = 'idle';
    this.updateTray();
    this.showNotification('Focus Session Ended', 'Great work today!');
  }

  onWorkCompleted(data) {
    this.currentState.completedSessions++;
    this.updateTray();
    this.showNotification('Focus Session Complete', `Great job! Break time in ${data.nextBreak || 'short'} minutes`);
  }

  onBreakStarted(data) {
    this.currentState.mode = data.mode || 'shortBreak';
    this.updateTray();
    this.showNotification('Break Time Started', 'Take a moment to rest and recharge');
  }

  onSyncComplete(data) {
    this.currentState.syncStatus = 'connected';
    this.currentState.lastSyncTime = Date.now();
    this.updateTray();
  }

  onSyncStart() {
    this.currentState.syncStatus = 'syncing';
    this.updateTray();
  }

  onSyncError(error) {
    this.currentState.syncStatus = 'error';
    this.updateTray();
    console.error('Sync error in tray:', error);
  }

  onOfflineMode() {
    this.currentState.syncStatus = 'offline';
    this.updateTray();
  }

  updateTray() {
    if (this.isDestroyed || !this.tray) return;
    
    const newIcon = this.getTrayIcon();
    this.tray.setImage(newIcon);
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
        tooltip += ` - Focusing (${timeString})`;
      }
      
      tooltip += ` | Sessions: ${this.currentState.completedSessions}`;
    } else {
      tooltip += ' - Ready to focus';
    }
    
    if (this.currentState.syncStatus !== 'connected') {
      tooltip += ` | Sync: ${this.currentState.syncStatus}`;
    }
    
    this.tray.setToolTip(tooltip);
  }

  refreshContextMenu() {
    if (!this.tray || this.isDestroyed) return;
    const newMenu = this.buildContextMenu();
    this.tray.setContextMenu(newMenu);
  }

  startMenuUpdates() {
    if (this.menuUpdateInterval) {
      clearInterval(this.menuUpdateInterval);
    }
    
    this.menuUpdateInterval = setInterval(() => {
      if (!this.isDestroyed && this.tray) {
        this.refreshContextMenu();
      }
    }, 1000);
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
    if (!this.currentState.focusMode) {
      this.sendCommand('start-focus');
    } else if (this.currentState.isPaused) {
      this.sendCommand('resume-timer');
    } else if (this.currentState.focusMode) {
      this.sendCommand('pause-timer');
    }
  }

  handleTrayRightClick() {
    this.refreshContextMenu();
  }

  showWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show();
      this.mainWindow.focus();
      this.emit('window-shown');
    }
  }

  hideWindow() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
      this.emit('window-hidden');
    }
  }

  sendCommand(command) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('tray-command', { command });
      this.emit('command-sent', command);
    }
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

  showAboutDialog() {
    const { dialog } = require('electron');
    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'About FocusSync',
      message: 'FocusSync',
      detail: 'Version 2.0.0\n\nCross-platform productivity and focus management application\n\n© 2024 FocusSync Team',
      buttons: ['OK']
    });
  }

  quitApplication() {
    const { dialog } = require('electron');
    
    const result = dialog.showMessageBoxSync(this.mainWindow, {
      type: 'question',
      title: 'Quit FocusSync',
      message: 'Are you sure you want to quit FocusSync?',
      detail: 'Any ongoing focus session will be stopped.',
      buttons: ['Quit', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    });
    
    if (result === 0) {
      this.destroy();
      app.quit();
    }
  }

  updateFocusState(state) {
    this.currentState.focusMode = state.focusMode;
    this.currentState.timerRemaining = state.timerRemaining || 0;
    this.currentState.isPaused = state.isPaused || false;
    this.currentState.mode = state.mode || 'idle';
    this.currentState.completedSessions = state.completedSessions || 0;
    this.currentState.currentCycle = state.currentCycle || 1;
    this.updateTray();
  }

  updateSyncStatus(status) {
    this.currentState.syncStatus = status.status || 'connected';
    if (status.lastSyncTime) {
      this.currentState.lastSyncTime = status.lastSyncTime;
    }
    this.updateTray();
  }

  destroy() {
    if (this.isDestroyed) return;
    
    if (this.menuUpdateInterval) {
      clearInterval(this.menuUpdateInterval);
      this.menuUpdateInterval = null;
    }
    
    for (const [key, { event, handler, target }] of this.eventListeners) {
      if (target && !target.isDestroyed) {
        target.removeListener(event, handler);
      }
    }
    this.eventListeners.clear();
    
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.destroy();
      this.tray = null;
    }
    
    this.isDestroyed = true;
    this.removeAllListeners();
    console.log('TrayManager destroyed');
  }

  isTrayDestroyed() {
    return this.isDestroyed;
  }
}

module.exports = TrayManager;