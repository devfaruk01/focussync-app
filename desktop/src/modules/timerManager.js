// desktop/src/modules/timerManager.js
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs').promises;

class TimerManager extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.currentState = {
      mode: 'idle', // idle, work, shortBreak, longBreak, paused
      timeRemaining: 0,
      totalDuration: 0,
      startTime: null,
      pausedTime: null,
      pausedRemaining: 0,
      completedSessions: 0,
      currentCycle: 1,
      isRunning: false,
      lastTick: null
    };
    
    this.settings = {
      workDuration: 25 * 60,
      shortBreakDuration: 5 * 60,
      longBreakDuration: 15 * 60,
      cyclesBeforeLongBreak: 4,
      autoStartBreaks: true,
      autoStartWork: true,
      enableNotifications: true,
      tickInterval: 1000,
      saveStateOnTick: false
    };
    
    this.statistics = {
      today: {
        totalFocusMinutes: 0,
        completedSessions: 0,
        totalBreaks: 0,
        longestSession: 0,
        startTime: null,
        endTime: null
      },
      lastSaved: null
    };
    
    this.stateFilePath = null;
    this.statsFilePath = null;
    this.isInitialized = false;
  }

  async initialize(statePath = null) {
    try {
      const userDataPath = process.env.APPDATA || 
                          process.env.XDG_CONFIG_HOME || 
                          path.join(require('os').homedir(), '.focussync');
      
      this.stateFilePath = statePath || path.join(userDataPath, 'timer-state.json');
      this.statsFilePath = path.join(path.dirname(this.stateFilePath), 'timer-stats.json');
      
      await this.ensureDirectoryExists(path.dirname(this.stateFilePath));
      await this.restoreState();
      await this.loadStatistics();
      
      this.isInitialized = true;
      this.emit('initialized', this.getCurrentState());
      return true;
    } catch (error) {
      console.error('TimerManager initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async ensureDirectoryExists(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  startTimer(duration = null) {
    if (this.currentState.isRunning) {
      this.stopTimer();
    }
    
    const workDuration = duration || this.settings.workDuration;
    
    if (workDuration <= 0 || workDuration > 12 * 3600) {
      this.emit('error', new Error('Invalid duration specified'));
      return false;
    }
    
    this.clearInterval();
    
    this.currentState = {
      mode: 'work',
      timeRemaining: workDuration,
      totalDuration: workDuration,
      startTime: Date.now(),
      pausedTime: null,
      pausedRemaining: 0,
      completedSessions: this.currentState.completedSessions,
      currentCycle: this.currentState.currentCycle,
      isRunning: true,
      lastTick: Date.now()
    };
    
    this.startInterval();
    this.emit('timer-started', {
      mode: 'work',
      duration: workDuration,
      cycle: this.currentState.currentCycle
    });
    
    this.saveState();
    return true;
  }

  startBreak(breakType = null) {
    if (this.currentState.isRunning) {
      this.stopTimer();
    }
    
    const isLongBreak = breakType === 'long' || 
                       (breakType === null && this.currentState.currentCycle >= this.settings.cyclesBeforeLongBreak);
    const breakDuration = isLongBreak ? this.settings.longBreakDuration : this.settings.shortBreakDuration;
    
    this.clearInterval();
    
    this.currentState = {
      mode: isLongBreak ? 'longBreak' : 'shortBreak',
      timeRemaining: breakDuration,
      totalDuration: breakDuration,
      startTime: Date.now(),
      pausedTime: null,
      pausedRemaining: 0,
      completedSessions: this.currentState.completedSessions,
      currentCycle: this.currentState.currentCycle,
      isRunning: true,
      lastTick: Date.now()
    };
    
    this.startInterval();
    this.emit('break-started', {
      mode: this.currentState.mode,
      duration: breakDuration,
      cycle: this.currentState.currentCycle
    });
    
    this.saveState();
    return true;
  }

  pauseTimer() {
    if (!this.currentState.isRunning) {
      this.emit('warning', 'Timer is not running');
      return false;
    }
    
    this.clearInterval();
    
    this.currentState.isRunning = false;
    this.currentState.pausedTime = Date.now();
    this.currentState.pausedRemaining = this.currentState.timeRemaining;
    
    this.emit('timer-paused', {
      mode: this.currentState.mode,
      remaining: this.currentState.timeRemaining
    });
    
    this.saveState();
    return true;
  }

  resumeTimer() {
    if (this.currentState.isRunning) {
      this.emit('warning', 'Timer is already running');
      return false;
    }
    
    if (this.currentState.mode === 'idle') {
      this.emit('warning', 'No active session to resume');
      return false;
    }
    
    this.currentState.isRunning = true;
    this.currentState.startTime = Date.now();
    this.currentState.lastTick = Date.now();
    this.currentState.pausedTime = null;
    
    this.startInterval();
    this.emit('timer-resumed', {
      mode: this.currentState.mode,
      remaining: this.currentState.timeRemaining
    });
    
    this.saveState();
    return true;
  }

  stopTimer() {
    if (!this.currentState.isRunning && this.currentState.mode === 'idle') {
      return false;
    }
    
    this.clearInterval();
    
    const previousState = { ...this.currentState };
    
    this.currentState = {
      mode: 'idle',
      timeRemaining: 0,
      totalDuration: 0,
      startTime: null,
      pausedTime: null,
      pausedRemaining: 0,
      completedSessions: this.currentState.completedSessions,
      currentCycle: this.currentState.currentCycle,
      isRunning: false,
      lastTick: null
    };
    
    this.emit('timer-stopped', previousState);
    this.saveState();
    return true;
  }

  resetTimer() {
    this.stopTimer();
    
    this.currentState = {
      mode: 'idle',
      timeRemaining: 0,
      totalDuration: 0,
      startTime: null,
      pausedTime: null,
      pausedRemaining: 0,
      completedSessions: 0,
      currentCycle: 1,
      isRunning: false,
      lastTick: null
    };
    
    this.emit('timer-reset');
    this.saveState();
    return true;
  }

  skipBreak() {
    if (this.currentState.mode !== 'shortBreak' && this.currentState.mode !== 'longBreak') {
      this.emit('warning', 'Not in break mode');
      return false;
    }
    
    this.handleTimeComplete();
    this.emit('break-skipped', { mode: this.currentState.mode });
    return true;
  }

  skipWork() {
    if (this.currentState.mode !== 'work') {
      this.emit('warning', 'Not in work mode');
      return false;
    }
    
    this.handleTimeComplete();
    this.emit('work-skipped', { cycle: this.currentState.currentCycle });
    return true;
  }

  startInterval() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    this.timer = setInterval(() => {
      this.tick();
    }, this.settings.tickInterval);
  }

  clearInterval() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tick() {
    if (!this.currentState.isRunning) return;
    
    const now = Date.now();
    const elapsed = Math.floor((now - this.currentState.startTime) / 1000);
    const remaining = this.currentState.totalDuration - elapsed;
    
    if (remaining <= 0) {
      this.handleTimeComplete();
      return;
    }
    
    this.currentState.timeRemaining = remaining;
    this.currentState.lastTick = now;
    
    const progress = ((this.currentState.totalDuration - remaining) / this.currentState.totalDuration) * 100;
    
    this.emit('tick', {
      mode: this.currentState.mode,
      remaining: remaining,
      total: this.currentState.totalDuration,
      progress: progress,
      formattedTime: this.formatTime(remaining)
    });
    
    if (this.settings.saveStateOnTick && remaining % 60 === 0) {
      this.saveState();
    }
  }

  async handleTimeComplete() {
    this.clearInterval();
    
    const completedMode = this.currentState.mode;
    const completedDuration = this.currentState.totalDuration;
    const completedCycle = this.currentState.currentCycle;
    
    if (completedMode === 'work') {
      this.currentState.completedSessions++;
      this.statistics.today.completedSessions++;
      
      const focusMinutes = Math.floor(completedDuration / 60);
      this.statistics.today.totalFocusMinutes += focusMinutes;
      
      if (focusMinutes > this.statistics.today.longestSession) {
        this.statistics.today.longestSession = focusMinutes;
      }
      
      if (this.currentState.completedSessions >= this.settings.cyclesBeforeLongBreak) {
        this.currentState.currentCycle++;
        this.currentState.completedSessions = 0;
      }
      
      await this.saveStatistics();
      
      this.emit('work-completed', {
        duration: completedDuration,
        sessionsCompleted: this.currentState.completedSessions,
        totalSessions: this.currentState.completedSessions,
        cycle: completedCycle
      });
      
      if (this.settings.autoStartBreaks) {
        this.startBreak();
      } else {
        this.currentState.mode = 'idle';
        this.currentState.isRunning = false;
        this.emit('work-complete-waiting', {
          cycle: completedCycle,
          nextBreak: this.currentState.currentCycle >= this.settings.cyclesBeforeLongBreak ? 'long' : 'short'
        });
      }
      
    } else if (completedMode === 'shortBreak' || completedMode === 'longBreak') {
      this.statistics.today.totalBreaks++;
      await this.saveStatistics();
      
      this.emit('break-completed', {
        type: completedMode,
        duration: completedDuration,
        cycle: completedCycle
      });
      
      if (this.settings.autoStartWork) {
        this.startTimer();
      } else {
        this.currentState.mode = 'idle';
        this.currentState.isRunning = false;
        this.emit('break-complete-waiting', {
          type: completedMode,
          cycle: completedCycle
        });
      }
    }
    
    this.saveState();
  }

  addTime(seconds) {
    if (!this.currentState.isRunning) {
      this.emit('warning', 'Timer is not running');
      return false;
    }
    
    if (seconds <= 0 || seconds > 3600) {
      this.emit('warning', 'Invalid time addition');
      return false;
    }
    
    this.currentState.totalDuration += seconds;
    this.currentState.timeRemaining += seconds;
    
    this.emit('time-added', {
      added: seconds,
      newRemaining: this.currentState.timeRemaining,
      formattedAdded: this.formatTime(seconds)
    });
    
    this.saveState();
    return true;
  }

  subtractTime(seconds) {
    if (!this.currentState.isRunning) {
      this.emit('warning', 'Timer is not running');
      return false;
    }
    
    if (seconds <= 0 || seconds > this.currentState.timeRemaining) {
      this.emit('warning', 'Invalid time subtraction');
      return false;
    }
    
    const newRemaining = this.currentState.timeRemaining - seconds;
    
    if (newRemaining <= 0) {
      this.handleTimeComplete();
    } else {
      this.currentState.totalDuration -= seconds;
      this.currentState.timeRemaining = newRemaining;
      
      this.emit('time-subtracted', {
        subtracted: seconds,
        newRemaining: newRemaining,
        formattedSubtracted: this.formatTime(seconds)
      });
    }
    
    this.saveState();
    return true;
  }

  formatTime(seconds) {
    if (seconds < 0) seconds = 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getCurrentState() {
    return {
      mode: this.currentState.mode,
      timeRemaining: this.currentState.timeRemaining,
      totalDuration: this.currentState.totalDuration,
      isRunning: this.currentState.isRunning,
      completedSessions: this.currentState.completedSessions,
      currentCycle: this.currentState.currentCycle,
      formattedTime: this.formatTime(this.currentState.timeRemaining),
      formattedTotal: this.formatTime(this.currentState.totalDuration),
      progress: this.currentState.totalDuration > 0 
        ? ((this.currentState.totalDuration - this.currentState.timeRemaining) / this.currentState.totalDuration) * 100
        : 0,
      settings: { ...this.settings },
      statistics: { ...this.statistics.today }
    };
  }

  async saveState() {
    if (!this.stateFilePath) return;
    
    const stateToSave = {
      mode: this.currentState.mode,
      timeRemaining: this.currentState.timeRemaining,
      totalDuration: this.currentState.totalDuration,
      startTime: this.currentState.startTime,
      pausedTime: this.currentState.pausedTime,
      pausedRemaining: this.currentState.pausedRemaining,
      completedSessions: this.currentState.completedSessions,
      currentCycle: this.currentState.currentCycle,
      isRunning: this.currentState.isRunning,
      lastTick: this.currentState.lastTick,
      settings: this.settings,
      savedAt: Date.now()
    };
    
    try {
      await fs.writeFile(this.stateFilePath, JSON.stringify(stateToSave, null, 2));
      this.emit('state-saved', { path: this.stateFilePath });
    } catch (error) {
      console.error('Failed to save timer state:', error);
      this.emit('error', error);
    }
  }

  async restoreState() {
    try {
      const exists = await fs.access(this.stateFilePath).then(() => true).catch(() => false);
      
      if (!exists) {
        this.emit('no-state-found', 'Starting with fresh state');
        return;
      }
      
      const data = await fs.readFile(this.stateFilePath, 'utf8');
      const savedState = JSON.parse(data);
      
      const age = Date.now() - savedState.savedAt;
      const maxAge = 24 * 60 * 60 * 1000;
      
      if (age > maxAge) {
        this.emit('state-expired', 'Saved state is too old, starting fresh');
        return;
      }
      
      this.currentState = {
        mode: savedState.mode,
        timeRemaining: savedState.timeRemaining,
        totalDuration: savedState.totalDuration,
        startTime: savedState.startTime,
        pausedTime: savedState.pausedTime,
        pausedRemaining: savedState.pausedRemaining,
        completedSessions: savedState.completedSessions || 0,
        currentCycle: savedState.currentCycle || 1,
        isRunning: false,
        lastTick: savedState.lastTick
      };
      
      if (savedState.settings) {
        this.settings = { ...this.settings, ...savedState.settings };
      }
      
      if (this.currentState.mode !== 'idle' && this.currentState.timeRemaining > 0) {
        if (this.currentState.pausedTime) {
          this.currentState.isRunning = false;
          this.emit('state-restored-paused', this.getCurrentState());
        } else {
          const elapsed = Date.now() - this.currentState.startTime;
          const remaining = this.currentState.totalDuration - Math.floor(elapsed / 1000);
          
          if (remaining > 0) {
            this.currentState.timeRemaining = remaining;
            this.currentState.isRunning = true;
            this.startInterval();
            this.emit('state-restored-running', this.getCurrentState());
          } else {
            this.currentState.mode = 'idle';
            this.emit('state-restored-expired', 'Session expired during inactivity');
          }
        }
      }
      
      this.emit('state-restored', this.getCurrentState());
    } catch (error) {
      console.error('Failed to restore timer state:', error);
      this.emit('error', error);
    }
  }

  async saveStatistics() {
    if (!this.statsFilePath) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    if (!this.statistics.today.startTime) {
      this.statistics.today.startTime = Date.now();
    }
    
    this.statistics.today.endTime = Date.now();
    this.statistics.lastSaved = Date.now();
    
    const statsToSave = {
      [today]: this.statistics.today,
      lastSaved: this.statistics.lastSaved,
      version: '1.0.0'
    };
    
    try {
      let existingStats = {};
      const exists = await fs.access(this.statsFilePath).then(() => true).catch(() => false);
      
      if (exists) {
        const data = await fs.readFile(this.statsFilePath, 'utf8');
        existingStats = JSON.parse(data);
      }
      
      const mergedStats = { ...existingStats, ...statsToSave };
      await fs.writeFile(this.statsFilePath, JSON.stringify(mergedStats, null, 2));
      
      this.emit('statistics-saved', this.statistics.today);
    } catch (error) {
      console.error('Failed to save statistics:', error);
      this.emit('error', error);
    }
  }

  async loadStatistics() {
    try {
      const exists = await fs.access(this.statsFilePath).then(() => true).catch(() => false);
      
      if (!exists) {
        this.emit('no-statistics-found', 'Starting fresh statistics');
        return;
      }
      
      const data = await fs.readFile(this.statsFilePath, 'utf8');
      const savedStats = JSON.parse(data);
      
      const today = new Date().toISOString().split('T')[0];
      
      if (savedStats[today]) {
        this.statistics.today = savedStats[today];
      }
      
      this.emit('statistics-loaded', this.statistics.today);
    } catch (error) {
      console.error('Failed to load statistics:', error);
      this.emit('error', error);
    }
  }

  async resetTodayStatistics() {
    this.statistics.today = {
      totalFocusMinutes: 0,
      completedSessions: 0,
      totalBreaks: 0,
      longestSession: 0,
      startTime: Date.now(),
      endTime: null
    };
    
    await this.saveStatistics();
    this.emit('statistics-reset', this.statistics.today);
  }

  updateSettings(newSettings) {
    const oldSettings = { ...this.settings };
    this.settings = { ...this.settings, ...newSettings };
    
    this.emit('settings-updated', {
      old: oldSettings,
      new: this.settings
    });
    
    this.saveState();
  }

  isWorkMode() {
    return this.currentState.mode === 'work' && this.currentState.isRunning;
  }

  isBreakMode() {
    return (this.currentState.mode === 'shortBreak' || this.currentState.mode === 'longBreak') && this.currentState.isRunning;
  }

  isIdle() {
    return this.currentState.mode === 'idle';
  }

  isPaused() {
    return !this.currentState.isRunning && this.currentState.mode !== 'idle';
  }

  getRemainingSeconds() {
    return this.currentState.timeRemaining;
  }

  getRemainingPercentage() {
    if (this.currentState.totalDuration === 0) return 0;
    return (this.currentState.timeRemaining / this.currentState.totalDuration) * 100;
  }

  getStatistics() {
    return { ...this.statistics.today };
  }

  async syncWithExternal(syncManager) {
    if (!syncManager) {
      this.emit('warning', 'No sync manager provided');
      return false;
    }
    
    try {
      const currentSession = {
        id: `timer_${Date.now()}`,
        type: this.currentState.mode,
        duration: this.currentState.totalDuration,
        remaining: this.currentState.timeRemaining,
        completed: this.currentState.completedSessions,
        timestamp: Date.now()
      };
      
      await syncManager.syncFocusSession(currentSession);
      this.emit('synced', currentSession);
      return true;
    } catch (error) {
      console.error('Failed to sync with external manager:', error);
      this.emit('error', error);
      return false;
    }
  }

  destroy() {
    this.clearInterval();
    this.saveState();
    this.saveStatistics();
    this.removeAllListeners();
    this.isInitialized = false;
    console.log('TimerManager destroyed');
  }
}

module.exports = TimerManager;