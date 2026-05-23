class FocusLock {
  constructor() {
    this.isActive = false;
    this.subscribers = [];
    this.session = {
      startTime: null,
      endTime: null
    };
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.subscribers.push(callback);
    }
  }

  notify() {
    const snapshot = this.getState();
    this.subscribers.forEach((callback) => {
      callback(snapshot);
    });
  }

  startFocus() {
    if (this.isActive) return;

    this.isActive = true;
    this.session.startTime = Date.now();
    this.session.endTime = null;
    this.notify();
  }

  stopFocus() {
    if (!this.isActive) return;

    this.isActive = false;
    this.session.endTime = Date.now();
    this.notify();
  }

  getDuration() {
    if (!this.session.startTime) return 0;

    const end = this.session.endTime || Date.now();
    return Math.max(0, Math.floor((end - this.session.startTime) / 1000));
  }

  getState() {
    return {
      isActive: this.isActive,
      duration: this.getDuration(),
      session: { ...this.session }
    };
  }
}

const focusLock = new FocusLock();

if (typeof window !== 'undefined') {
  window.FocusLock = focusLock;
}

module.exports = focusLock;
