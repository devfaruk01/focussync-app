class TimerManager {
  constructor(syncManager) {
    this.syncManager = syncManager;

    this.isRunning = false;
    this.startTime = null;
    this.duration = 0; // seconds
    this.remaining = 0;
    this.interval = null;
  }

  start(durationInMinutes = 25) {
    if (this.isRunning) return;

    this.duration = durationInMinutes * 60;
    this.remaining = this.duration;
    this.startTime = Date.now();
    this.isRunning = true;

    this.syncState();

    this.interval = setInterval(() => {
      this.tick();
    }, 1000);

    console.log("Focus Timer Started");
  }

  tick() {
    if (!this.isRunning) return;

    this.remaining--;

    this.syncState();

    if (this.remaining <= 0) {
      this.stop();
      this.onComplete();
    }
  }

  pause() {
    this.isRunning = false;
    clearInterval(this.interval);
    this.syncState();
  }

  resume() {
    if (this.isRunning) return;

    this.isRunning = true;

    this.interval = setInterval(() => {
      this.tick();
    }, 1000);

    this.syncState();
  }

  stop() {
    this.isRunning = false;
    clearInterval(this.interval);
    this.remaining = 0;

    this.syncState();
  }

  onComplete() {
    console.log("Focus Session Completed 🎉");

    // future: unlock system, notify user
    if (this.syncManager) {
      this.syncManager.send({
        type: "FOCUS_COMPLETE",
        timestamp: Date.now()
      });
    }
  }

  getState() {
    return {
      isRunning: this.isRunning,
      remaining: this.remaining,
      duration: this.duration
    };
  }

  syncState() {
    if (!this.syncManager) return;

    this.syncManager.send({
      type: "TIMER_UPDATE",
      data: this.getState()
    });
  }
}

module.exports = TimerManager;