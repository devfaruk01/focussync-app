const fs = require('fs');
const os = require('os');

class HostsBlocker {
  constructor() {
    this.isActive = false;
    this.backupPath = null;
    this.whitelist = new Set();
    this.blockedDomains = new Set();
    this.hostsPath = this.getHostsPath();
    this.blockStart = '# === FOCUSSYNC BLOCK START ===';
    this.blockEnd = '# === FOCUSSYNC BLOCK END ===';
    this.defaultDomains = [
      'facebook.com',
      'www.facebook.com',
      'youtube.com',
      'www.youtube.com',
      'instagram.com',
      'www.instagram.com',
      'x.com',
      'www.x.com'
    ];
  }

  getHostsPath() {
    if (os.platform() === 'win32') {
      return 'C:\\Windows\\System32\\drivers\\etc\\hosts';
    }

    return '/etc/hosts';
  }

  async init() {
    this.backupPath = `${this.hostsPath}.focussync.backup`;
    return {
      hostsPath: this.hostsPath,
      backupPath: this.backupPath
    };
  }

  normalizeDomain(domain) {
    return String(domain || '').trim().toLowerCase();
  }

  isValidDomain(domain) {
    const normalized = this.normalizeDomain(domain);
    if (!normalized) return false;

    const regex = /^(?!:\/\/)([a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;
    return regex.test(normalized);
  }

  addToWhitelist(domains) {
    const values = Array.isArray(domains) ? domains : [domains];
    values.forEach((domain) => {
      const normalized = this.normalizeDomain(domain);
      if (normalized) {
        this.whitelist.add(normalized);
      }
    });
  }

  removeFromWhitelist(domains) {
    const values = Array.isArray(domains) ? domains : [domains];
    values.forEach((domain) => {
      const normalized = this.normalizeDomain(domain);
      if (normalized) {
        this.whitelist.delete(normalized);
      }
    });
  }

  getWhitelist() {
    return Array.from(this.whitelist);
  }

  getBlockedDomains() {
    return Array.from(this.blockedDomains);
  }

  getStatus() {
    return {
      isActive: this.isActive,
      blockedCount: this.blockedDomains.size,
      whitelistCount: this.whitelist.size
    };
  }

  async createBackupIfMissing() {
    if (!this.backupPath) {
      this.backupPath = `${this.hostsPath}.focussync.backup`;
    }

    if (!fs.existsSync(this.backupPath)) {
      await fs.promises.copyFile(this.hostsPath, this.backupPath);
    }
  }

  stripManagedBlock(hostsContent) {
    const sectionRegex = new RegExp(
      `${this.escapeRegex(this.blockStart)}[\\s\\S]*?${this.escapeRegex(this.blockEnd)}\\n?`,
      'g'
    );
    return hostsContent.replace(sectionRegex, '').trimEnd() + '\n';
  }

  escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async enableBlocking(domains) {
    const requested = Array.isArray(domains) && domains.length > 0 ? domains : this.defaultDomains;

    const valid = requested
      .map((domain) => this.normalizeDomain(domain))
      .filter((domain) => this.isValidDomain(domain))
      .filter((domain) => !this.whitelist.has(domain));

    if (valid.length === 0) {
      return {
        success: false,
        message: 'No valid domains to block.'
      };
    }

    await this.createBackupIfMissing();

    let hostsContent = await fs.promises.readFile(this.hostsPath, 'utf8');
    hostsContent = this.stripManagedBlock(hostsContent);

    const lines = [this.blockStart, ...valid.map((domain) => `127.0.0.1 ${domain}`), this.blockEnd];

    hostsContent += `\n${lines.join('\n')}\n`;
    await fs.promises.writeFile(this.hostsPath, hostsContent, 'utf8');

    this.blockedDomains = new Set(valid);
    this.isActive = true;

    return {
      success: true,
      blocked: valid,
      message: `Blocked ${valid.length} domains.`
    };
  }

  async disableBlocking() {
    if (!fs.existsSync(this.hostsPath)) {
      return {
        success: false,
        message: 'Hosts file not found.'
      };
    }

    let hostsContent = await fs.promises.readFile(this.hostsPath, 'utf8');
    hostsContent = this.stripManagedBlock(hostsContent);
    await fs.promises.writeFile(this.hostsPath, hostsContent, 'utf8');

    this.isActive = false;
    this.blockedDomains.clear();

    return {
      success: true,
      message: 'Blocking disabled.'
    };
  }
}

module.exports = HostsBlocker;
