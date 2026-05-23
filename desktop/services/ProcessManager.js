class ProcessManager {
  constructor() {
    this.blockedProcesses = new Set();
    this.runningProcesses = new Map();
  }

  addBlockedProcess(processName) {
    const name = String(processName || '').trim();
    if (name) {
      this.blockedProcesses.add(name);
    }
  }

  removeBlockedProcess(processName) {
    const name = String(processName || '').trim();
    if (name) {
      this.blockedProcesses.delete(name);
    }
  }

  listBlockedProcesses() {
    return Array.from(this.blockedProcesses);
  }

  markRunning(processName, pid) {
    const name = String(processName || '').trim();
    if (!name) return;

    this.runningProcesses.set(name, {
      pid: Number(pid) || null,
      updatedAt: Date.now()
    });
  }

  markStopped(processName) {
    const name = String(processName || '').trim();
    if (name) {
      this.runningProcesses.delete(name);
    }
  }

  getRunningProcesses() {
    return Array.from(this.runningProcesses.entries()).map(([name, metadata]) => ({
      name,
      ...metadata
    }));
  }

  getStatus() {
    return {
      blockedCount: this.blockedProcesses.size,
      runningCount: this.runningProcesses.size
    };
  }
}

module.exports = ProcessManager;
