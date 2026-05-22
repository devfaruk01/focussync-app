class SyncManager {
  constructor() {
    this.socket = null;
    this.listeners = [];
    this.isConnected = false;
  }

  connect() {
    try {
      // Future: Firebase or WebSocket connect
      this.isConnected = true;
      console.log("Sync Connected 🔥");
    } catch (err) {
      console.error("Sync failed:", err.message);
    }
  }

  send(payload) {
    try {
      if (!this.isConnected) return;

      // Future: send to Firebase / WS
      console.log("Sync Event:", payload);

      this.listeners.forEach((cb) => cb(payload));
    } catch (err) {
      console.error("Sync send error:", err.message);
    }
  }

  onUpdate(callback) {
    this.listeners.push(callback);
  }

  syncTimer(timerState) {
    this.send({
      type: "TIMER_SYNC",
      data: timerState,
      timestamp: Date.now()
    });
  }

  syncFocusMode(status) {
    this.send({
      type: "FOCUS_SYNC",
      data: status,
      timestamp: Date.now()
    });
  }

  syncBlockList(list) {
    this.send({
      type: "BLOCKLIST_SYNC",
      data: list,
      timestamp: Date.now()
    });
  }
}

module.exports = SyncManager;