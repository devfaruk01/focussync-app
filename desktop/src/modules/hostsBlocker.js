// desktop/src/modules/hostsBlocker.js
// Focus Mode Hosts Blocker - Blocks websites during focus mode
// Supports Linux and Windows with safe restore mechanism

const fs = require('fs');
const path = require('path');
const os = require('os');

class HostsBlocker {
    constructor() {
        this.isActive = false;
        this.backupPath = null;
        this.whitelist = new Set();
        this.blockedDomains = new Set();
        this.hostsPath = this.getHostsPath();
        this.backupSuffix = '.focusmode.backup';
    }

    /**
     * Get platform-specific hosts file path
     */
    getHostsPath() {
        if (os.platform() === 'win32') {
            return 'C:\\Windows\\System32\\drivers\\etc\\hosts';
        } else if (os.platform() === 'linux') {
            return '/etc/hosts';
        } else {
            throw new Error('Unsupported operating system');
        }
    }

    /**
     * Create a backup of the original hosts file
     */
    async createBackup() {
        if (!fs.existsSync(this.hostsPath)) {
            throw new Error(`Hosts file not found at ${this.hostsPath}`);
        }

        this.backupPath = this.hostsPath + this.backupSuffix;
        
        if (!fs.existsSync(this.backupPath)) {
            await fs.promises.copyFile(this.hostsPath, this.backupPath);
        }
        
        return this.backupPath;
    }

    /**
     * Restore hosts file from backup
     */
    async restoreFromBackup() {
        if (this.backupPath && fs.existsSync(this.backupPath)) {
            await fs.promises.copyFile(this.backupPath, this.hostsPath);
            return true;
        }
        return false;
    }

    /**
     * Parse existing hosts file and extract blocked entries
     */
    async parseHostsFile() {
        if (!fs.existsSync(this.hostsPath)) {
            return [];
        }

        const content = await fs.promises.readFile(this.hostsPath, 'utf8');
        const lines = content.split('\n');
        const currentBlocks = [];

        for (const line of lines) {
            if (line.includes('# FOCUSMODE_BLOCKED') && !line.trim().startsWith('#')) {
                const match = line.match(/127\.0\.0\.1\s+(\S+)/);
                if (match) {
                    currentBlocks.push(match[1]);
                }
            }
        }

        return currentBlocks;
    }

    /**
     * Add block entries for domains
     */
    async addBlockEntries(domains) {
        let content = await fs.promises.readFile(this.hostsPath, 'utf8');
        
        // Ensure content ends with newline
        if (!content.endsWith('\n')) {
            content += '\n';
        }

        // Add focus mode markers
        const markerStart = '\n# === FOCUSMODE BLOCK START ===\n';
        const markerEnd = '\n# === FOCUSMODE BLOCK END ===\n';
        
        // Remove existing focus mode block if present
        const startIndex = content.indexOf(markerStart);
        const endIndex = content.indexOf(markerEnd);
        
        if (startIndex !== -1 && endIndex !== -1) {
            const before = content.substring(0, startIndex);
            const after = content.substring(endIndex + markerEnd.length);
            content = before + after;
        }

        // Build new block entries
        let blockEntries = markerStart;
        for (const domain of domains) {
            if (!this.whitelist.has(domain)) {
                blockEntries += `127.0.0.1 ${domain} # FOCUSMODE_BLOCKED\n`;
                this.blockedDomains.add(domain);
            }
        }
        blockEntries += markerEnd;

        // Append new block entries
        content += blockEntries;

        // Write back to hosts file
        await fs.promises.writeFile(this.hostsPath, content);
    }

    /**
     * Remove block entries from hosts file
     */
    async removeBlockEntries() {
        if (!fs.existsSync(this.hostsPath)) {
            return;
        }

        let content = await fs.promises.readFile(this.hostsPath, 'utf8');
        
        const markerStart = '# === FOCUSMODE BLOCK START ===\n';
        const markerEnd = '# === FOCUSMODE BLOCK END ===\n';
        
        const startIndex = content.indexOf(markerStart);
        const endIndex = content.indexOf(markerEnd);
        
        if (startIndex !== -1 && endIndex !== -1) {
            const before = content.substring(0, startIndex);
            const after = content.substring(endIndex + markerEnd.length);
            content = before + after;
            
            // Clean up any orphaned newlines
            content = content.replace(/\n{3,}/g, '\n\n');
            
            await fs.promises.writeFile(this.hostsPath, content);
            this.blockedDomains.clear();
        }
    }

    /**
     * Add domains to whitelist
     */
    addToWhitelist(domains) {
        if (!Array.isArray(domains)) {
            domains = [domains];
        }
        
        domains.forEach(domain => {
            this.whitelist.add(domain.toLowerCase().trim());
        });
    }

    /**
     * Remove domains from whitelist
     */
    removeFromWhitelist(domains) {
        if (!Array.isArray(domains)) {
            domains = [domains];
        }
        
        domains.forEach(domain => {
            this.whitelist.delete(domain.toLowerCase().trim());
        });
    }

    /**
     * Get current whitelist
     */
    getWhitelist() {
        return Array.from(this.whitelist);
    }

    /**
     * Block websites for focus mode
     */
    async blockWebsites(domains) {
        if (this.isActive) {
            throw new Error('Focus mode already active. Call restoreWebsites() first.');
        }

        try {
            // Validate domains
            const validDomains = domains.filter(d => this.isValidDomain(d));
            
            if (validDomains.length === 0) {
                throw new Error('No valid domains provided');
            }

            // Create backup if not exists
            await this.createBackup();
            
            // Remove any existing blocks first
            await this.removeBlockEntries();
            
            // Add new blocks
            await this.addBlockEntries(validDomains);
            
            this.isActive = true;
            
            return {
                success: true,
                blocked: validDomains.filter(d => !this.whitelist.has(d)),
                whitelisted: validDomains.filter(d => this.whitelist.has(d)),
                message: `Blocked ${validDomains.filter(d => !this.whitelist.has(d)).length} websites`
            };
        } catch (error) {
            // Attempt to restore on failure
            await this.safeRestore();
            throw new Error(`Failed to block websites: ${error.message}`);
        }
    }

    /**
     * Restore original hosts file (exit focus mode)
     */
    async restoreWebsites() {
        if (!this.isActive) {
            return {
                success: true,
                message: 'Focus mode not active'
            };
        }

        try {
            await this.removeBlockEntries();
            
            // Restore from backup if needed
            const currentBlocks = await this.parseHostsFile();
            if (currentBlocks.length > 0) {
                await this.restoreFromBackup();
            }
            
            this.isActive = false;
            
            return {
                success: true,
                message: 'All websites restored successfully'
            };
        } catch (error) {
            throw new Error(`Failed to restore websites: ${error.message}`);
        }
    }

    /**
     * Safe restore with error handling
     */
    async safeRestore() {
        try {
            await this.removeBlockEntries();
            if (this.backupPath && fs.existsSync(this.backupPath)) {
                await this.restoreFromBackup();
            }
            this.isActive = false;
            return true;
        } catch (error) {
            console.error('Safe restore failed:', error.message);
            return false;
        }
    }

    /**
     * Check if a domain is valid
     */
    isValidDomain(domain) {
        if (typeof domain !== 'string') return false;
        
        const trimmed = domain.toLowerCase().trim();
        if (trimmed.length === 0 || trimmed.length > 253) return false;
        
        // Simple domain validation
        const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;
        return domainRegex.test(trimmed);
    }

    /**
     * Get current blocked domains
     */
    getBlockedDomains() {
        return Array.from(this.blockedDomains);
    }

    /**
     * Check if focus mode is active
     */
    getStatus() {
        return {
            isActive: this.isActive,
            blockedCount: this.blockedDomains.size,
            whitelistCount: this.whitelist.size
        };
    }

    /**
     * Clean up backup files
     */
    async cleanup() {
        if (this.backupPath && fs.existsSync(this.backupPath)) {
            await fs.promises.unlink(this.backupPath);
        }
    }
}

module.exports = HostsBlocker;

const fs = require("fs");
const os = require("os");
const path = require("path");

class HostsBlocker {
  constructor() {
    this.isActive = false;

    this.blockList = [
      "facebook.com",
      "www.facebook.com",
      "youtube.com",
      "www.youtube.com",
      "instagram.com",
      "www.instagram.com"
    ];

    this.whitelist = [];

    this.hostsPath = this.getHostsPath();
    this.backupPath = path.join(os.homedir(), "hosts_backup_focussync");
  }

  getHostsPath() {
    if (os.platform() === "win32") {
      return "C:\\Windows\\System32\\drivers\\etc\\hosts";
    }
    return "/etc/hosts";
  }

  backupHosts() {
    try {
      fs.copyFileSync(this.hostsPath, this.backupPath);
      console.log("Hosts backup created");
    } catch (err) {
      console.error("Backup failed:", err.message);
    }
  }

  restoreHosts() {
    try {
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.hostsPath);
        console.log("Hosts restored successfully");
      }
    } catch (err) {
      console.error("Restore failed:", err.message);
    }
  }

  blockSites() {
    try {
      let hosts = fs.readFileSync(this.hostsPath, "utf8");

      this.blockList.forEach((site) => {
        if (!hosts.includes(site)) {
          hosts += `\n127.0.0.1 ${site}`;
        }
      });

      fs.writeFileSync(this.hostsPath, hosts, "utf8");
      console.log("Sites blocked");
    } catch (err) {
      console.error("Block failed:", err.message);
    }
  }

  startFocusMode() {
    if (this.isActive) return;

    this.isActive = true;

    this.backupHosts();
    this.blockSites();

    console.log("Focus Mode STARTED 🔥");
  }

  stopFocusMode() {
    if (!this.isActive) return;

    this.isActive = false;

    this.restoreHosts();

    console.log("Focus Mode STOPPED ✅");
  }
}

module.exports = HostsBlocker;