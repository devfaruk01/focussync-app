// desktop/src/modules/hostsBlocker.js
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

class HostsBlocker extends EventEmitter {
  constructor() {
    super();
    this.hostsPath = this.getHostsPath();
    this.backupDir = null;
    this.backupPath = null;
    this.blockedSites = new Set();
    this.originalContent = null;
    this.isInitialized = false;
    this.blockCommentStart = '# FocusSync-Blocked-Start';
    this.blockCommentEnd = '# FocusSync-Blocked-End';
  }

  getHostsPath() {
    const platform = os.platform();
    if (platform === 'win32') {
      return 'C:\\Windows\\System32\\drivers\\etc\\hosts';
    } else if (platform === 'linux' || platform === 'darwin') {
      return '/etc/hosts';
    }
    throw new Error(`Unsupported platform: ${platform}`);
  }

  async initialize() {
    try {
      const homeDir = os.homedir();
      this.backupDir = path.join(homeDir, '.focussync', 'hosts-backups');
      await this.ensureBackupDirectory();
      
      await this.loadOriginalContent();
      await this.loadBlockedSites();
      await this.validateHostsFile();
      
      this.isInitialized = true;
      this.emit('initialized', { blockedCount: this.blockedSites.size });
      return true;
    } catch (error) {
      this.emit('error', error);
      throw new Error(`HostsBlocker initialization failed: ${error.message}`);
    }
  }

  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create backup directory: ${error.message}`);
    }
  }

  async loadOriginalContent() {
    try {
      this.originalContent = await fs.readFile(this.hostsPath, 'utf8');
      
      const backupFile = path.join(this.backupDir, `hosts_original_${Date.now()}.backup`);
      await fs.writeFile(backupFile, this.originalContent);
      this.backupPath = backupFile;
      
      this.emit('original-loaded', { backupPath: this.backupPath });
    } catch (error) {
      throw new Error(`Failed to load original hosts file: ${error.message}`);
    }
  }

  async loadBlockedSites() {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const inBlockSection = false;
      const lines = content.split('\n');
      
      let insideBlockSection = false;
      
      for (const line of lines) {
        if (line.trim() === this.blockCommentStart) {
          insideBlockSection = true;
          continue;
        }
        
        if (line.trim() === this.blockCommentEnd) {
          insideBlockSection = false;
          continue;
        }
        
        if (insideBlockSection) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const parts = trimmedLine.split(/\s+/);
            if (parts.length >= 2 && parts[0] === '127.0.0.1') {
              const domain = parts[1];
              if (domain && this.validateDomain(domain)) {
                this.blockedSites.add(domain);
              }
            }
          }
        }
      }
      
      this.emit('blocked-sites-loaded', { count: this.blockedSites.size });
    } catch (error) {
      console.error('Failed to load blocked sites:', error);
    }
  }

  async validateHostsFile() {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      
      if (!content.includes('127.0.0.1 localhost') && !content.includes('127.0.0.1\tlocalhost')) {
        console.warn('Hosts file may be corrupted or missing localhost entry');
        this.emit('warning', 'Hosts file missing localhost entry');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Hosts file validation failed: ${error.message}`);
    }
  }

  validateDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    
    const trimmedDomain = domain.trim().toLowerCase();
    
    if (trimmedDomain.length === 0 || trimmedDomain.length > 253) return false;
    
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (ipRegex.test(trimmedDomain)) return false;
    
    if (trimmedDomain === 'localhost' || trimmedDomain === 'localhost.localdomain') return false;
    
    const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(trimmedDomain);
  }

  async blockSites(domains) {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    if (!Array.isArray(domains)) {
      domains = [domains];
    }
    
    const validDomains = domains.filter(domain => this.validateDomain(domain));
    const newDomains = validDomains.filter(domain => !this.blockedSites.has(domain));
    
    if (newDomains.length === 0) {
      this.emit('block-skipped', { reason: 'No valid or new domains provided' });
      return { added: 0, skipped: domains.length - validDomains.length };
    }
    
    try {
      await this.createBackup();
      
      let content = await fs.readFile(this.hostsPath, 'utf8');
      
      let blockSectionExists = content.includes(this.blockCommentStart);
      
      if (!blockSectionExists) {
        content += `\n${this.blockCommentStart}\n`;
      }
      
      for (const domain of newDomains) {
        const blockEntry = `127.0.0.1 ${domain}\n`;
        
        if (content.includes(blockEntry.trim())) {
          continue;
        }
        
        if (blockSectionExists) {
          const blockEndIndex = content.indexOf(this.blockCommentEnd);
          if (blockEndIndex !== -1) {
            content = content.slice(0, blockEndIndex) + blockEntry + content.slice(blockEndIndex);
          } else {
            content += blockEntry;
          }
        } else {
          content += blockEntry;
        }
        
        this.blockedSites.add(domain);
      }
      
      if (!blockSectionExists) {
        content += `${this.blockCommentEnd}\n`;
      }
      
      await fs.writeFile(this.hostsPath, content);
      
      await this.flushDNS();
      
      this.emit('sites-blocked', { domains: newDomains, count: newDomains.length });
      return { added: newDomains.length, skipped: domains.length - newDomains.length };
      
    } catch (error) {
      await this.restoreFromBackup();
      this.emit('error', error);
      throw new Error(`Failed to block sites: ${error.message}`);
    }
  }

  async unblockSites(domains) {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    if (!Array.isArray(domains)) {
      domains = [domains];
    }
    
    const domainsToRemove = domains.filter(domain => this.blockedSites.has(domain));
    
    if (domainsToRemove.length === 0) {
      this.emit('unblock-skipped', { reason: 'No matching blocked domains found' });
      return { removed: 0, notFound: domains.length };
    }
    
    try {
      await this.createBackup();
      
      let content = await fs.readFile(this.hostsPath, 'utf8');
      let modified = false;
      
      for (const domain of domainsToRemove) {
        const blockEntry = `127.0.0.1 ${domain}`;
        const lines = content.split('\n');
        
        const filteredLines = lines.filter(line => {
          const trimmedLine = line.trim();
          return !trimmedLine.startsWith(blockEntry) && !trimmedLine.includes(blockEntry);
        });
        
        content = filteredLines.join('\n');
        this.blockedSites.delete(domain);
        modified = true;
      }
      
      if (modified) {
        const lines = content.split('\n');
        let insideBlockSection = false;
        let blockSectionLines = [];
        let otherLines = [];
        
        for (const line of lines) {
          if (line.trim() === this.blockCommentStart) {
            insideBlockSection = true;
            continue;
          }
          
          if (line.trim() === this.blockCommentEnd) {
            insideBlockSection = false;
            continue;
          }
          
          if (insideBlockSection) {
            if (line.trim() && !line.trim().startsWith('#')) {
              blockSectionLines.push(line);
            }
          } else {
            otherLines.push(line);
          }
        }
        
        if (blockSectionLines.length === 0) {
          content = otherLines.filter(line => 
            line.trim() !== this.blockCommentStart && 
            line.trim() !== this.blockCommentEnd
          ).join('\n');
        } else {
          content = [
            ...otherLines,
            this.blockCommentStart,
            ...blockSectionLines,
            this.blockCommentEnd
          ].join('\n');
        }
        
        await fs.writeFile(this.hostsPath, content);
        await this.flushDNS();
      }
      
      this.emit('sites-unblocked', { domains: domainsToRemove, count: domainsToRemove.length });
      return { removed: domainsToRemove.length, notFound: domains.length - domainsToRemove.length };
      
    } catch (error) {
      await this.restoreFromBackup();
      this.emit('error', error);
      throw new Error(`Failed to unblock sites: ${error.message}`);
    }
  }

  async restoreHosts() {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    try {
      if (!this.originalContent) {
        throw new Error('No original content available for restoration');
      }
      
      await this.createBackup();
      
      await fs.writeFile(this.hostsPath, this.originalContent);
      this.blockedSites.clear();
      
      await this.flushDNS();
      
      this.emit('hosts-restored', { restored: true });
      return true;
      
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to restore hosts: ${error.message}`);
    }
  }

  async backupHosts() {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    try {
      const timestamp = Date.now();
      const backupFile = path.join(this.backupDir, `hosts_backup_${timestamp}.backup`);
      
      const content = await fs.readFile(this.hostsPath, 'utf8');
      await fs.writeFile(backupFile, content);
      
      this.backupPath = backupFile;
      await this.cleanupOldBackups();
      
      this.emit('backup-created', { backupPath: backupFile });
      return backupFile;
      
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to backup hosts: ${error.message}`);
    }
  }

  async createBackup() {
    return await this.backupHosts();
  }

  async restoreFromBackup(backupFile = null) {
    const restoreFile = backupFile || this.backupPath;
    
    if (!restoreFile) {
      throw new Error('No backup file available for restoration');
    }
    
    try {
      const backupContent = await fs.readFile(restoreFile, 'utf8');
      
      if (!this.isValidHostsContent(backupContent)) {
        throw new Error('Backup content validation failed');
      }
      
      await fs.writeFile(this.hostsPath, backupContent);
      await this.loadBlockedSites();
      
      this.emit('restored-from-backup', { backupFile: restoreFile });
      return true;
      
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Failed to restore from backup: ${error.message}`);
    }
  }

  isValidHostsContent(content) {
    if (!content || typeof content !== 'string') return false;
    
    const hasLocalhost = content.includes('127.0.0.1 localhost') || 
                         content.includes('127.0.0.1\tlocalhost');
    
    const hasIpv6Localhost = content.includes('::1 localhost');
    
    return hasLocalhost || hasIpv6Localhost;
  }

  async getBlockedSites() {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    return Array.from(this.blockedSites);
  }

  async isSiteBlocked(domain) {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    const cleanDomain = domain.trim().toLowerCase();
    return this.blockedSites.has(cleanDomain);
  }

  async flushDNS() {
    const platform = os.platform();
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execPromise = promisify(exec);
      
      if (platform === 'win32') {
        await execPromise('ipconfig /flushdns');
      } else if (platform === 'linux') {
        try {
          await execPromise('which systemctl');
          await execPromise('sudo systemctl restart systemd-resolved');
        } catch {
          try {
            await execPromise('sudo killall -HUP dnsmasq');
          } catch {
            try {
              await execPromise('sudo service nscd restart');
            } catch {
              console.log('DNS flush skipped - no supported service found');
            }
          }
        }
      } else if (platform === 'darwin') {
        await execPromise('sudo dscacheutil -flushcache');
        await execPromise('sudo killall -HUP mDNSResponder');
      }
      
      this.emit('dns-flushed', { platform });
    } catch (error) {
      console.error('Failed to flush DNS:', error);
      this.emit('warning', `DNS flush failed: ${error.message}`);
    }
  }

  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(f => f.startsWith('hosts_backup_')).sort();
      
      const maxBackups = 10;
      if (backupFiles.length > maxBackups) {
        const filesToDelete = backupFiles.slice(0, backupFiles.length - maxBackups);
        
        for (const file of filesToDelete) {
          await fs.unlink(path.join(this.backupDir, file));
        }
        
        this.emit('backups-cleaned', { deleted: filesToDelete.length });
      }
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
    }
  }

  async emergencyRestore() {
    console.log('Emergency restore initiated');
    this.emit('emergency-restore-start');
    
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(f => f.startsWith('hosts_backup_')).sort().reverse();
      
      if (backupFiles.length === 0) {
        console.warn('No backup found, creating minimal hosts file');
        const minimalHosts = `# Hosts file restored by FocusSync Emergency System
127.0.0.1 localhost
127.0.0.1 localhost.localdomain
::1 localhost
`;
        await fs.writeFile(this.hostsPath, minimalHosts);
        this.emit('emergency-restore-complete', { restoredFrom: 'template' });
        return { success: true, restoredFrom: 'template' };
      }
      
      const latestBackup = backupFiles[0];
      const backupPath = path.join(this.backupDir, latestBackup);
      const backupContent = await fs.readFile(backupPath, 'utf8');
      
      if (!this.isValidHostsContent(backupContent)) {
        throw new Error('Latest backup is corrupted');
      }
      
      await fs.writeFile(this.hostsPath, backupContent);
      await this.loadBlockedSites();
      
      this.emit('emergency-restore-complete', { restoredFrom: latestBackup });
      return { success: true, restoredFrom: latestBackup };
      
    } catch (error) {
      this.emit('emergency-restore-error', error);
      throw new Error(`Emergency restore failed: ${error.message}`);
    }
  }

  async verifyBlockedSites() {
    const verificationResults = [];
    
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      
      for (const domain of this.blockedSites) {
        const isBlocked = content.includes(`127.0.0.1 ${domain}`);
        verificationResults.push({ domain, blocked: isBlocked });
      }
      
      this.emit('verification-complete', verificationResults);
      return verificationResults;
      
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Verification failed: ${error.message}`);
    }
  }

  getBlockedCount() {
    return this.blockedSites.size;
  }

  async reload() {
    this.blockedSites.clear();
    await this.loadBlockedSites();
    this.emit('reloaded', { blockedCount: this.blockedSites.size });
  }

  destroy() {
    this.isInitialized = false;
    this.blockedSites.clear();
    this.removeAllListeners();
    console.log('HostsBlocker destroyed');
  }
}

module.exports = HostsBlocker;