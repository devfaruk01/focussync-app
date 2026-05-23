// desktop/src/modules/notificationManager.js
const { Notification, nativeImage, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

class NotificationManager {
  constructor() {
    this.notificationQueue = [];
    this.isProcessingQueue = false;
    this.tray = null;
    this.pendingNotifications = new Map();
    this.notificationSound = null;
    this.soundsEnabled = true;
    this.lastNotificationTime = new Map();
    this.notificationCooldown = 5000; // 5 seconds cooldown between same type notifications
  }

  initialize(mainWindow, appIconPath) {
    this.mainWindow = mainWindow;
    this.appIconPath = appIconPath;
    this.createTray(appIconPath);
    this.loadSettings();
    this.setupSound();
  }

  async loadSettings() {
    try {
      const settingsPath = path.join(__dirname, '../../config/notificationSettings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        this.soundsEnabled = settings.soundsEnabled !== false;
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error);
    }
  }

  setupSound() {
    try {
      const soundPath = path.join(__dirname, '../../assets/sounds/notification.wav');
      if (fs.existsSync(soundPath)) {
        this.notificationSound = soundPath;
      }
    } catch (error) {
      console.error('Sound setup error:', error);
    }
  }

  createTray(iconPath) {
    try {
      let trayIcon;
      if (iconPath && fs.existsSync(iconPath)) {
        trayIcon = nativeImage.createFromPath(iconPath);
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      } else {
        trayIcon = nativeImage.createEmpty();
      }
      
      this.tray = new Tray(trayIcon);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show FocusSync', click: () => this.mainWindow?.show() },
        { label: 'Start Focus Mode', click: () => this.sendFocusCommand('start') },
        { label: 'Stop Focus Mode', click: () => this.sendFocusCommand('stop') },
        { type: 'separator' },
        { label: 'Quit', click: () => this.sendFocusCommand('quit') }
      ]);
      
      this.tray.setToolTip('FocusSync - Stay Productive');
      this.tray.setContextMenu(contextMenu);
      
      this.tray.on('click', () => {
        this.mainWindow?.isVisible() ? this.mainWindow?.hide() : this.mainWindow?.show();
      });
    } catch (error) {
      console.error('Tray creation error:', error);
    }
  }

  sendFocusCommand(command) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('focus-command', { command });
    }
  }

  canSendNotification(type) {
    const lastTime = this.lastNotificationTime.get(type);
    if (!lastTime) return true;
    return (Date.now() - lastTime) >= this.notificationCooldown;
  }

  updateLastNotificationTime(type) {
    this.lastNotificationTime.set(type, Date.now());
  }

  async sendNotification(title, body, options = {}) {
    return new Promise((resolve) => {
      try {
        const notificationId = Date.now().toString();
        
        const notificationOptions = {
          title: title,
          body: body,
          icon: this.getNotificationIcon(options.type),
          silent: !this.soundsEnabled || options.silent,
          urgency: options.urgency || 'normal',
          timeoutType: options.timeoutType || 'default',
          ...options
        };

        if (options.type === 'focus-start') {
          notificationOptions.body = `🔒 Focus session started\n${body}`;
        } else if (options.type === 'focus-end') {
          notificationOptions.body = `✅ Focus session completed\n${body}`;
        } else if (options.type === 'break-reminder') {
          notificationOptions.body = `🌿 Break time!\n${body}`;
        }

        const notification = new Notification(notificationOptions);
        
        notification.on('click', () => {
          this.handleNotificationClick(options.type, notificationId);
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        });
        
        notification.on('close', () => {
          this.pendingNotifications.delete(notificationId);
        });
        
        notification.show();
        
        this.pendingNotifications.set(notificationId, notification);
        
        if (this.soundsEnabled && !options.silent && this.notificationSound) {
          this.playNotificationSound();
        }
        
        resolve({ success: true, notificationId });
      } catch (error) {
        console.error('Notification error:', error);
        resolve({ success: false, error: error.message });
      }
    });
  }

  getNotificationIcon(type) {
    try {
      let iconPath;
      switch(type) {
        case 'focus-start':
          iconPath = path.join(__dirname, '../../assets/icons/focus-start.png');
          break;
        case 'focus-end':
          iconPath = path.join(__dirname, '../../assets/icons/focus-end.png');
          break;
        case 'break-reminder':
          iconPath = path.join(__dirname, '../../assets/icons/break.png');
          break;
        default:
          iconPath = path.join(__dirname, '../../assets/icons/icon.png');
      }
      
      if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath);
      }
      return nativeImage.createEmpty();
    } catch (error) {
      return nativeImage.createEmpty();
    }
  }

  playNotificationSound() {
    try {
      const { exec } = require('child_process');
      if (process.platform === 'win32') {
        exec(`powershell -c (New-Object Media.SoundPlayer "${this.notificationSound}").PlaySync()`);
      } else if (process.platform === 'linux') {
        exec(`aplay "${this.notificationSound}"`);
      }
    } catch (error) {
      console.error('Sound playback error:', error);
    }
  }

  handleNotificationClick(type, notificationId) {
    console.log(`Notification clicked: ${type}`);
    this.pendingNotifications.delete(notificationId);
    
    if (type === 'break-reminder' && this.mainWindow) {
      this.mainWindow.webContents.send('break-reminder-clicked');
    }
  }

  async sendFocusStartNotification(duration = 60) {
    if (!this.canSendNotification('focus-start')) return null;
    this.updateLastNotificationTime('focus-start');
    
    return await this.sendNotification(
      'Focus Mode Activated',
      `Your focus session has started. Duration: ${duration} minutes. Stay productive!`,
      { type: 'focus-start', urgency: 'normal' }
    );
  }

  async sendFocusEndNotification(achievement = null) {
    if (!this.canSendNotification('focus-end')) return null;
    this.updateLastNotificationTime('focus-end');
    
    let body = 'Great job! Your focus session has ended.';
    if (achievement) {
      body = `🎉 ${achievement}\n${body}`;
    }
    
    return await this.sendNotification(
      'Focus Session Complete',
      body,
      { type: 'focus-end', urgency: 'normal' }
    );
  }

  async sendBreakReminderNotification(minutesWorking = 60) {
    if (!this.canSendNotification('break-reminder')) return null;
    this.updateLastNotificationTime('break-reminder');
    
    return await this.sendNotification(
      'Time for a Break',
      `You've been focused for ${minutesWorking} minutes. Take a 5-minute break to recharge!`,
      { type: 'break-reminder', urgency: 'high', timeoutType: 'never' }
    );
  }

  async sendAchievementNotification(achievement) {
    return await this.sendNotification(
      '🏆 Achievement Unlocked',
      achievement,
      { type: 'achievement', urgency: 'low' }
    );
  }

  async sendWarningNotification(warning, details) {
    return await this.sendNotification(
      `⚠️ ${warning}`,
      details,
      { type: 'warning', urgency: 'high', timeoutType: 'never' }
    );
  }

  async sendSyncNotification(status) {
    return await this.sendNotification(
      'Sync Status',
      status === 'success' ? 'Data synced successfully' : 'Sync failed. Retrying...',
      { type: 'sync', urgency: 'low', silent: true }
    );
  }

  dismissAllNotifications() {
    for (const [id, notification] of this.pendingNotifications) {
      try {
        notification.close();
      } catch (error) {
        console.error(`Failed to dismiss notification ${id}:`, error);
      }
    }
    this.pendingNotifications.clear();
  }

  dismissNotification(notificationId) {
    const notification = this.pendingNotifications.get(notificationId);
    if (notification) {
      try {
        notification.close();
        this.pendingNotifications.delete(notificationId);
      } catch (error) {
        console.error(`Failed to dismiss notification ${notificationId}:`, error);
      }
    }
  }

  updateTrayTooltip(tooltip) {
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.setToolTip(tooltip);
    }
  }

  updateTrayIcon(iconPath) {
    try {
      if (this.tray && !this.tray.isDestroyed() && iconPath && fs.existsSync(iconPath)) {
        let newIcon = nativeImage.createFromPath(iconPath);
        newIcon = newIcon.resize({ width: 16, height: 16 });
        this.tray.setImage(newIcon);
      }
    } catch (error) {
      console.error('Tray icon update error:', error);
    }
  }

  destroy() {
    this.dismissAllNotifications();
    if (this.tray && !this.tray.isDestroyed()) {
      this.tray.destroy();
    }
  }
}

module.exports = NotificationManager;