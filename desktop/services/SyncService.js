const { EventEmitter } = require('events');

class SyncService extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.history = [];
    this.currentSession = null;
  }

  async init() {
    return { ready: true };
  }

  async connect() {
    this.connected = true;
    this.emit('connected');
  }

  async disconnect() {
    this.connected = false;
    this.emit('disconnected');
  }

  async startSession(durationSeconds) {
    this.currentSession = {
      startedAt: Date.now(),
      durationSeconds: Number(durationSeconds) || 0
    };

    this.pushEvent('session_start', this.currentSession);
    return this.currentSession;
  }

  async endSession() {
    if (!this.currentSession) {
      return null;
    }

    const completed = {
      ...this.currentSession,
      endedAt: Date.now()
    };

    this.currentSession = null;
    this.pushEvent('session_end', completed);

    return completed;
  }

  pushEvent(type, payload) {
    const entry = {
      type,
      payload,
      timestamp: Date.now()
    };

    this.history.push(entry);
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }

    this.emit('sync', entry);
    return entry;
  }

  getHistory() {
    return [...this.history];
  }

  isConnected() {
    return this.connected;
  }
}

module.exports = SyncService;
