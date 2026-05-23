// desktop/src/modules/hostsBlocker.js
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class HostsBlocker {
  constructor() {
    this.hostsPath = this.getHostsPath();
    this.backupPath = null;
    this.backupDir = null;
    this.blockedDomains = new Set();
    this.originalContent = null;
    this.isInitialized = false;
    this.commentMarker = '# FocusSync-Blocked';
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
      this.backupDir = path.join(os.homedir(), '.focussync', 'backups');
      await this.ensureBackupDirectory();
      
      await this.loadOriginalHosts();
      await this.loadExistingBlocks();
      
      this.isInitialized = true;
      console.log('HostsBlocker initialized');
      return true;
    } catch (error) {
      console.error('Failed to initialize HostsBlocker:', error);
      throw error;
    }
  }

  async ensureBackupDirectory() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create backup directory:', error);
      throw error;
    }
  }

  async loadOriginalHosts() {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      this.originalContent = content;
      
      const backupFile = path.join(this.backupDir, `hosts_original_${Date.now()}.backup`);
      await fs.writeFile(backupFile, content);
      this.backupPath = backupFile;
      
    } catch (error) {
      console.error('Failed to load original hosts file:', error);
      throw error;
    }
  }

  async loadExistingBlocks() {
    try {
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.includes(this.commentMarker) && line.includes('127.0.0.1')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && parts[0] === '127.0.0.1') {
            const domain = parts[1];
            if (domain && !domain.startsWith('#')) {
              this.blockedDomains.add(domain);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load existing blocks:', error);
    }
  }

  validateDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    
    const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/;
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    
    const cleanDomain = domain.trim().toLowerCase();
    
    if (ipRegex.test(cleanDomain)) return false;
    
    if (cleanDomain === 'localhost') return false;
    
    return domainRegex.test(cleanDomain);
  }

  async addBlockedDomain(domain) {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    const cleanDomain = domain.trim().toLowerCase();
    
    if (!this.validateDomain(cleanDomain)) {
      throw new Error(`Invalid domain: ${domain}`);
    }
    
    if (this.blockedDomains.has(cleanDomain)) {
      console.log(`Domain already blocked: ${cleanDomain}`);
      return false;
    }
    
    try {
      await this.createBackup();
      
      const entry = `127.0.0.1 ${cleanDomain} ${this.commentMarker}\n`;
      await fs.appendFile(this.hostsPath, entry);
      
      this.blockedDomains.add(cleanDomain);
      
      console.log(`Blocked domain: ${cleanDomain}`);
      return true;
      
    } catch (error) {
      console.error(`Failed to block domain ${cleanDomain}:`, error);
      await this.restoreFromBackup();
      throw error;
    }
  }

  async addMultipleDomains(domains) {
    if (!Array.isArray(domains)) {
      throw new Error('Domains must be an array');
    }
    
    const validDomains = domains.filter(d => this.validateDomain(d));
    const newDomains = validDomains.filter(d => !this.blockedDomains.has(d));
    
    if (newDomains.length === 0) {
      return { added: 0, skipped: domains.length - validDomains.length };
    }
    
    try {
      await this.createBackup();
      
      let content = await fs.readFile(this.hostsPath, 'utf8');
      
      for (const domain of newDomains) {
        content += `127.0.0.1 ${domain} ${this.commentMarker}\n`;
        this.blockedDomains.add(domain);
      }
      
      await fs.writeFile(this.hostsPath, content);
      
      console.log(`Blocked ${newDomains.length} domains`);
      return { added: newDomains.length, skipped: domains.length - newDomains.length };
      
    } catch (error) {
      console.error('Failed to add multiple domains:', error);
      await this.restoreFromBackup();
      throw error;
    }
  }

  async removeBlockedDomain(domain) {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    const cleanDomain = domain.trim().toLowerCase();
    
    if (!this.blockedDomains.has(cleanDomain)) {
      console.log(`Domain not blocked: ${cleanDomain}`);
      return false;
    }
    
    try {
      await this.createBackup();
      
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const lines = content.split('\n');
      
      const filteredLines = lines.filter(line => {
        return !(line.includes(cleanDomain) && line.includes(this.commentMarker));
      });
      
      await fs.writeFile(this.hostsPath, filteredLines.join('\n'));
      
      this.blockedDomains.delete(cleanDomain);
      
      console.log(`Unblocked domain: ${cleanDomain}`);
      return true;
      
    } catch (error) {
      console.error(`Failed to remove domain ${cleanDomain}:`, error);
      await this.restoreFromBackup();
      throw error;
    }
  }

  async removeAllBlocks() {
    if (!this.isInitialized) {
      throw new Error('HostsBlocker not initialized');
    }
    
    try {
      await this.createBackup();
      
      const content = await fs.readFile(this.hostsPath, 'utf8');
      const lines = content.split('\n');
      
      const filteredLines = lines.filter(line => {
        return !line.includes(this.commentMarker);
      });
      
      await fs.writeFile(this.hostsPath, filteredLines.join('\n'));
      
      this.blockedDomains.clear();
      
      console.log('Removed all blocked domains');
      return true;
      
    } catch (error) {
      console.error('Failed to remove all blocks:', error);
      await this.restoreFromBackup();
      throw error;
    }
  }

  async createBackup() {
    try {
      const timestamp = Date.now();
      const backupFile = path.join(this.backupDir, `hosts_backup_${timestamp}.backup`);
      
      const content = await fs.readFile(this.hostsPath, 'utf8');
      await fs.writeFile(backupFile, content);
      
      this.backupPath = backupFile;
      await this.cleanupOldBackups();
      
      return backupFile;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw error;
    }
  }

  async restoreFromBackup(backupFile = null) {
    const restoreFile = backupFile || this.backupPath;
    
    if (!restoreFile) {
      throw new Error('No backup file available for restoration');
    }
    
    try {
      const backupContent = await fs.readFile(restoreFile, 'utf8');
      
      if (!this.validateHostsContent(backupContent)) {
        throw new Error('Backup content validation failed');
      }
      
      await fs.writeFile(this.hostsPath, backupContent);
      
      await this.loadExistingBlocks();
      
      console.log(`Restored hosts file from: ${restoreFile}`);
      return true;
      
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      throw error;
    }
  }

  async restoreOriginal() {
    if (!this.originalContent) {
      throw new Error('No original content available');
    }
    
    try {
      await fs.writeFile(this.hostsPath, this.originalContent);
      this.blockedDomains.clear();
      
      console.log('Restored original hosts file');
      return true;
      
    } catch (error) {
      console.error('Failed to restore original:', error);
      throw error;
    }
  }

  validateHostsContent(content) {
    if (!content || typeof content !== 'string') return false;
    
    const lines = content.split('\n');
    let localhostFound = false;
    
    for (const line of lines) {
      if (line.includes('127.0.0.1') && (line.includes('localhost') || line.includes('localhost.localdomain'))) {
        localhostFound = true;
        break;
      }
    }
    
    return localhostFound;
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
        
        console.log(`Cleaned up ${filesToDelete.length} old backups`);
      }
    } catch (error) {
      console.error('Failed to cleanup old backups:', error);
    }
  }

  async emergencyRestore() {
    console.log('Performing emergency restore...');
    
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files.filter(f => f.startsWith('hosts_backup_')).sort().reverse();
      
      if (backupFiles.length === 0) {
        console.warn('No backup found, restoring original template');
        const templateContent = `# Hosts file restored by FocusSync Emergency System\n127.0.0.1 localhost\n::1 localhost\n`;
        await fs.writeFile(this.hostsPath, templateContent);
        return { success: true, restoredFrom: 'template' };
      }
      
      const latestBackup = backupFiles[0];
      await this.restoreFromBackup(path.join(this.backupDir, latestBackup));
      
      return { success: true, restoredFrom: latestBackup };
      
    } catch (error) {
      console.error('Emergency restore failed:', error);
      throw error;
    }
  }

  async checkBlockedDomain(domain) {
    const cleanDomain = domain.trim().toLowerCase();
    return this.blockedDomains.has(cleanDomain);
  }

  getBlockedDomains() {
    return Array.from(this.blockedDomains);
  }

  getBlockedCount() {
    return this.blockedDomains.size;
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
          await execPromise('sudo systemctl restart systemd-resolved');
        } catch {
          try {
            await execPromise('sudo killall -HUP dnsmasq');
          } catch {
            console.log('DNS flush not available');
          }
        }
      } else if (platform === 'darwin') {
        await execPromise('sudo dscacheutil -flushcache');
        await execPromise('sudo killall -HUP mDNSResponder');
      }
      
      console.log('DNS cache flushed');
    } catch (error) {
      console.error('Failed to flush DNS:', error);
    }
  }

  async verifyBlocks() {
    const results = [];
    
    for (const domain of this.blockedDomains) {
      try {
        const content = await fs.readFile(this.hostsPath, 'utf8');
        const isBlocked = content.includes(`127.0.0.1 ${domain}`);
        results.push({ domain, blocked: isBlocked });
      } catch (error) {
        results.push({ domain, blocked: false, error: error.message });
      }
    }
    
    return results;
  }

  destroy() {
    this.isInitialized = false;
    this.blockedDomains.clear();
    console.log('HostsBlocker destroyed');
  }
}

module.exports = HostsBlocker;