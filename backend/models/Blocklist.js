const blocklists = new Map();

class Blocklist {
  static setForUser(userId, domains) {
    const key = String(userId || 'anonymous');
    const safeDomains = Array.isArray(domains)
      ? domains.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : [];

    blocklists.set(key, safeDomains);
    return [...safeDomains];
  }

  static getForUser(userId) {
    const key = String(userId || 'anonymous');
    return [...(blocklists.get(key) || [])];
  }
}

module.exports = Blocklist;
