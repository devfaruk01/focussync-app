const HostsBlocker = require('../src/modules/hostsBlocker');

class HostsManager {
  constructor() {
    this.blocker = new HostsBlocker();
    this.defaultDomains = [
      'facebook.com',
      'youtube.com',
      'instagram.com',
      'x.com'
    ];
  }

  async init() {
    return this.blocker.init();
  }

  async enableBlocking(customDomains) {
    const domains = Array.isArray(customDomains) && customDomains.length > 0
      ? customDomains
      : this.defaultDomains;

    return this.blocker.enableBlocking(domains);
  }

  async disableBlocking() {
    return this.blocker.disableBlocking();
  }

  addToWhitelist(domains) {
    this.blocker.addToWhitelist(domains);
  }

  removeFromWhitelist(domains) {
    this.blocker.removeFromWhitelist(domains);
  }

  getStatus() {
    return this.blocker.getStatus();
  }
}

module.exports = HostsManager;
