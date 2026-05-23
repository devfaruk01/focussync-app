// desktop/src/modules/emergencyUnlock.js
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

class EmergencyUnlock {
  constructor() {
    this.backupPath = null;
    this.isRecoveryMode = false;
    this.unlockHistory = [];
    this.restorationPoints = [];
    this.backupRetentionDays = 7;
    this.hostsBackupPath = null;
    this.appsBackupPath = null;
    this.settingsBackupPath = null;
  }

  async initialize(basePath = null) {
    this.backupPath = basePath || path.join(__dirname, '../../backups');
    await this.ensureBackupDirectory();
    await this.loadUnlockHistory();
    return this;
  }

  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupPath, { recursive: true });
      await fs.mkdir(path.join(this.backupPath, 'hosts'), { recursive: true });
      await fs.mkdir(path.join(this.backupPath, 'apps'), { recursive: true });
      await fs.mkdir(path.join(this.backupPath, 'settings'), { recursive: true });
    } catch (error) {
      console.error('Failed to create backup directory:', error);
      throw error;
    }
  }

  async loadUnlockHistory() {
    const historyPath = path.join(this.backupPath, 'unlock_history.json');
    try {
      const data = await fs.readFile(historyPath, 'utf8');
      this.unlockHistory = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to load unlock history:', error);
      }
      this.unlockHistory = [];
    }
  }

  async saveUnlockHistory() {
    const historyPath = path.join(this.backupPath, 'unlock_history.json');
    try {
      await fs.writeFile(historyPath, JSON.stringify(this.unlockHistory, null, 2));
    } catch (error) {
      console.error('Failed to save unlock history:', error);
    }
  }

  async createEmergencyBackup(type = 'full') {
    const timestamp = Date.now();
    const backupId = `backup_${timestamp}`;
    
    try {
      if (type === 'full' || type === 'hosts') {
        await this.backupHostsFile(backupId);
      }
      
      if (type === 'full' || type === 'apps') {
        await this.backupBlockedApps(backupId);
      }
      
      if (type === 'full' || type === 'settings') {
        await this.backupSettings(backupId);
      }
      
      const restorationPoint = {
        id: backupId,
        timestamp: timestamp,
        type: type,
        components: [],
        verified: false
      };
      
      if (type === 'full' || type === 'hosts') restorationPoint.components.push('hosts');
      if (type === 'full' || type === 'apps') restorationPoint.components.push('apps');
      if (type === 'full' || type === 'settings') restorationPoint.components.push('settings');
      
      this.restorationPoints.push(restorationPoint);
      await this.cleanupOldBackups();
      
      return backupId;
    } catch (error) {
      console.error('Emergency backup creation failed:', error);
      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  async backupHostsFile(backupId) {
    const hostsPath = process.platform === 'win32' 
      ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
      : '/etc/hosts';
    
    const backupFilePath = path.join(this.backupPath, 'hosts', `${backupId}_hosts.backup`);
    
    try {
      const hostsContent = await fs.readFile(hostsPath, 'utf8');
      await fs.writeFile(backupFilePath, hostsContent);
      this.hostsBackupPath = backupFilePath;
      return true;
    } catch (error) {
      console.error('Hosts backup failed:', error);
      throw error;
    }
  }

  async backupBlockedApps(backupId) {
    const blockedAppsPath = path.join(__dirname, '../../../config/blockedApps.json');
    const backupFilePath = path.join(this.backupPath, 'apps', `${backupId}_apps.backup`);
    
    try {
      let appsData = { blockedApps: [] };
      try {
        const content = await fs.readFile(blockedAppsPath, 'utf8');
        appsData = JSON.parse(content);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Blocked apps backup warning:', error);
        }
      }
      
      await fs.writeFile(backupFilePath, JSON.stringify(appsData, null, 2));
      this.appsBackupPath = backupFilePath;
      return true;
    } catch (error) {
      console.error('Blocked apps backup failed:', error);
      throw error;
    }
  }

  async backupSettings(backupId) {
    const settingsPath = path.join(__dirname, '../../../config/settings.json');
    const backupFilePath = path.join(this.backupPath, 'settings', `${backupId}_settings.backup`);
    
    try {
      let settingsData = {};
      try {
        const content = await fs.readFile(settingsPath, 'utf8');
        settingsData = JSON.parse(content);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Settings backup warning:', error);
        }
      }
      
      await fs.writeFile(backupFilePath, JSON.stringify(settingsData, null, 2));
      this.settingsBackupPath = backupFilePath;
      return true;
    } catch (error) {
      console.error('Settings backup failed:', error);
      throw error;
    }
  }

  async performEmergencyUnlock(reason = 'user_requested') {
    const unlockId = Date.now().toString();
    
    try {
      // Create backup before unlock
      const backupId = await this.createEmergencyBackup('full');
      
      // Restore hosts file
      await this.restoreHostsFile();
      
      // Restore blocked apps
      await this.restoreBlockedApps();
      
      // Restore settings
      await this.restoreSettings();
      
      // Log the unlock
      const unlockRecord = {
        id: unlockId,
        timestamp: Date.now(),
        reason: reason,
        backupId: backupId,
        successful: true,
        componentsRestored: ['hosts', 'apps', 'settings']
      };
      
      this.unlockHistory.push(unlockRecord);
      await this.saveUnlockHistory();
      await this.cleanupOldHistory();
      
      return {
        success: true,
        unlockId: unlockId,
        backupId: backupId,
        message: 'Emergency unlock completed successfully'
      };
      
    } catch (error) {
      console.error('Emergency unlock failed:', error);
      
      // Log failed attempt
      const failedRecord = {
        id: unlockId,
        timestamp: Date.now(),
        reason: reason,
        successful: false,
        error: error.message
      };
      
      this.unlockHistory.push(failedRecord);
      await this.saveUnlockHistory();
      
      throw new Error(`Emergency unlock failed: ${error.message}`);
    }
  }

  async restoreHostsFile() {
    if (!this.hostsBackupPath) {
      // Find latest backup
      const backupDir = path.join(this.backupPath, 'hosts');
      try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files.filter(f => f.endsWith('.backup')).sort().reverse();
        
        if (backupFiles.length === 0) {
          throw new Error('No hosts backup found');
        }
        
        this.hostsBackupPath = path.join(backupDir, backupFiles[0]);
      } catch (error) {
        throw new Error('No valid hosts backup available');
      }
    }
    
    const hostsPath = process.platform === 'win32' 
      ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
      : '/etc/hosts';
    
    try {
      const backupContent = await fs.readFile(this.hostsBackupPath, 'utf8');
      
      // Validate backup content (basic check)
      if (!backupContent.includes('localhost') && !backupContent.includes('127.0.0.1')) {
        throw new Error('Invalid hosts backup content');
      }
      
      await fs.writeFile(hostsPath, backupContent);
      
      // Flush DNS cache
      if (process.platform === 'win32') {
        await execPromise('ipconfig /flushdns');
      } else if (process.platform === 'linux') {
        try {
          await execPromise('sudo systemctl restart systemd-resolved');
        } catch (e) {
          // Fallback for systems without systemd-resolved
          await execPromise('sudo killall -HUP dnsmasq');
        }
      }
      
      return true;
    } catch (error) {
      throw new Error(`Hosts restoration failed: ${error.message}`);
    }
  }

  async restoreBlockedApps() {
    if (!this.appsBackupPath) {
      const backupDir = path.join(this.backupPath, 'apps');
      try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files.filter(f => f.endsWith('.backup')).sort().reverse();
        
        if (backupFiles.length === 0) {
          throw new Error('No apps backup found');
        }
        
        this.appsBackupPath = path.join(backupDir, backupFiles[0]);
      } catch (error) {
        throw new Error('No valid apps backup available');
      }
    }
    
    const blockedAppsPath = path.join(__dirname, '../../../config/blockedApps.json');
    
    try {
      const backupContent = await fs.readFile(this.appsBackupPath, 'utf8');
      const appData = JSON.parse(backupContent);
      
      // Validate backup structure
      if (!appData || typeof appData !== 'object') {
        throw new Error('Invalid apps backup format');
      }
      
      await fs.writeFile(blockedAppsPath, JSON.stringify(appData, null, 2));
      return true;
    } catch (error) {
      throw new Error(`Blocked apps restoration failed: ${error.message}`);
    }
  }

  async restoreSettings() {
    if (!this.settingsBackupPath) {
      const backupDir = path.join(this.backupPath, 'settings');
      try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files.filter(f => f.endsWith('.backup')).sort().reverse();
        
        if (backupFiles.length === 0) {
          throw new Error('No settings backup found');
        }
        
        this.settingsBackupPath = path.join(backupDir, backupFiles[0]);
      } catch (error) {
        throw new Error('No valid settings backup available');
      }
    }
    
    const settingsPath = path.join(__dirname, '../../../config/settings.json');
    
    try {
      const backupContent = await fs.readFile(this.settingsBackupPath, 'utf8');
      const settingsData = JSON.parse(backupContent);
      
      // Validate backup structure
      if (!settingsData || typeof settingsData !== 'object') {
        throw new Error('Invalid settings backup format');
      }
      
      await fs.writeFile(settingsPath, JSON.stringify(settingsData, null, 2));
      return true;
    } catch (error) {
      throw new Error(`Settings restoration failed: ${error.message}`);
    }
  }

  async emergencyRecovery() {
    this.isRecoveryMode = true;
    
    try {
      console.log('Entering emergency recovery mode...');
      
      // Attempt to restore from most recent backup
      const latestBackup = this.getLatestBackup();
      if (latestBackup) {
        await this.restoreFromBackup(latestBackup);
        console.log('Recovery completed from backup:', latestBackup);
      } else {
        console.warn('No backup found for recovery');
      }
      
      // Validate system state
      const isValid = await this.validateSystemState();
      
      if (isValid) {
        this.isRecoveryMode = false;
        return { success: true, message: 'System recovered successfully' };
      } else {
        throw new Error('System state validation failed after recovery');
      }
      
    } catch (error) {
      console.error('Emergency recovery failed:', error);
      this.isRecoveryMode = false;
      throw error;
    }
  }

  getLatestBackup() {
    if (this.restorationPoints.length === 0) return null;
    return this.restorationPoints.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  async restoreFromBackup(restorationPoint) {
    try {
      if (restorationPoint.components.includes('hosts')) {
        await this.restoreHostsFile();
      }
      
      if (restorationPoint.components.includes('apps')) {
        await this.restoreBlockedApps();
      }
      
      if (restorationPoint.components.includes('settings')) {
        await this.restoreSettings();
      }
      
      restorationPoint.verified = true;
      return true;
    } catch (error) {
      throw new Error(`Restore from backup ${restorationPoint.id} failed: ${error.message}`);
    }
  }

  async validateSystemState() {
    const checks = [];
    
    // Check hosts file validity
    const hostsPath = process.platform === 'win32' 
      ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
      : '/etc/hosts';
    
    try {
      const hostsContent = await fs.readFile(hostsPath, 'utf8');
      const hasLocalhost = hostsContent.includes('localhost') || hostsContent.includes('127.0.0.1');
      checks.push(hasLocalhost);
    } catch (error) {
      checks.push(false);
    }
    
    // Check app config validity
    const appsPath = path.join(__dirname, '../../../config/blockedApps.json');
    try {
      const appsContent = await fs.readFile(appsPath, 'utf8');
      JSON.parse(appsContent);
      checks.push(true);
    } catch (error) {
      checks.push(false);
    }
    
    return checks.every(check => check === true);
  }

  async cleanupOldBackups() {
    const now = Date.now();
    const maxAge = this.backupRetentionDays * 24 * 60 * 60 * 1000;
    
    for (const point of this.restorationPoints) {
      if (now - point.timestamp > maxAge) {
        // Remove backup files
        const backupDirs = ['hosts', 'apps', 'settings'];
        for (const dir of backupDirs) {
          const backupPath = path.join(this.backupPath, dir, `${point.id}_${dir}.backup`);
          try {
            await fs.unlink(backupPath);
          } catch (error) {
            // File might not exist, ignore
          }
        }
        
        // Remove from array
        const index = this.restorationPoints.indexOf(point);
        if (index > -1) {
          this.restorationPoints.splice(index, 1);
        }
      }
    }
  }

  async cleanupOldHistory() {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    this.unlockHistory = this.unlockHistory.filter(record => {
      return now - record.timestamp <= maxAge;
    });
    
    await this.saveUnlockHistory();
  }

  async getUnlockHistory() {
    return this.unlockHistory.slice(-20); // Return last 20 records
  }

  async getRestorationPoints() {
    return this.restorationPoints.sort((a, b) => b.timestamp - a.timestamp);
  }

  async verifyBackupIntegrity(backupId) {
    const checks = {
      hosts: false,
      apps: false,
      settings: false
    };
    
    try {
      const hostsBackup = path.join(this.backupPath, 'hosts', `${backupId}_hosts.backup`);
      const hostsContent = await fs.readFile(hostsBackup, 'utf8');
      checks.hosts = hostsContent.includes('localhost') || hostsContent.includes('127.0.0.1');
    } catch (error) {
      // File may not exist
    }
    
    try {
      const appsBackup = path.join(this.backupPath, 'apps', `${backupId}_apps.backup`);
      const appsContent = await fs.readFile(appsBackup, 'utf8');
      JSON.parse(appsContent);
      checks.apps = true;
    } catch (error) {
      // File may not exist
    }
    
    try {
      const settingsBackup = path.join(this.backupPath, 'settings', `${backupId}_settings.backup`);
      const settingsContent = await fs.readFile(settingsBackup, 'utf8');
      JSON.parse(settingsContent);
      checks.settings = true;
    } catch (error) {
      // File may not exist
    }
    
    return checks;
  }

  isRecoveryActive() {
    return this.isRecoveryMode;
  }
}

module.exports = EmergencyUnlock;