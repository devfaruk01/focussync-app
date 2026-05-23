// desktop/src/modules/activityTracker.js
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class ActivityTracker {
  constructor() {
    this.currentSession = null;
    this.dailyStats = {};
    this.activityLog = [];
    this.idleTimer = null;
    this.isIdle = false;
    this.idleThreshold = 300000; // 5 minutes
    this.lastActivityTime = Date.now();
    this.trackingInterval = null;
    this.productivityScore = 0;
    this.focusSessions = [];
    this.blockedAttempts = [];
  }

  async initialize(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../../data/activityData.json');
    await this.loadActivityData();
    this.setupIdleDetection();
    this.startTracking();
    return this;
  }

  async loadActivityData() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(data);
      this.dailyStats = parsed.dailyStats || {};
      this.activityLog = parsed.activityLog || [];
      this.focusSessions = parsed.focusSessions || [];
      this.blockedAttempts = parsed.blockedAttempts || [];
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to load activity data:', error);
      }
      this.dailyStats = this.getEmptyDailyStats();
    }
  }

  async saveActivityData() {
    try {
      const data = {
        dailyStats: this.dailyStats,
        activityLog: this.activityLog.slice(-10000), // Keep last 10000 entries
        focusSessions: this.focusSessions.slice(-1000),
        blockedAttempts: this.blockedAttempts.slice(-5000),
        lastUpdated: Date.now()
      };
      
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save activity data:', error);
    }
  }

  getEmptyDailyStats() {
    const today = this.getTodayKey();
    return {
      [today]: {
        focusMinutes: 0,
        productiveMinutes: 0,
        distractedMinutes: 0,
        blockedAttempts: 0,
        sessions: 0,
        productivityScore: 0
      }
    };
  }

  getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  getCurrentStats() {
    const today = this.getTodayKey();
    if (!this.dailyStats[today]) {
      this.dailyStats[today] = this.getEmptyDailyStats()[today];
    }
    return this.dailyStats[today];
  }

  updateDailyStats(type, value = 1) {
    const today = this.getTodayKey();
    if (!this.dailyStats[today]) {
      this.dailyStats[today] = this.getEmptyDailyStats()[today];
    }
    
    switch(type) {
      case 'focusMinutes':
        this.dailyStats[today].focusMinutes += value;
        break;
      case 'productiveMinutes':
        this.dailyStats[today].productiveMinutes += value;
        break;
      case 'distractedMinutes':
        this.dailyStats[today].distractedMinutes += value;
        break;
      case 'blockedAttempts':
        this.dailyStats[today].blockedAttempts += value;
        break;
      case 'sessions':
        this.dailyStats[today].sessions += value;
        break;
    }
    
    this.updateProductivityScore();
    this.saveActivityData();
  }

  updateProductivityScore() {
    const stats = this.getCurrentStats();
    const totalMinutes = stats.productiveMinutes + stats.distractedMinutes;
    
    if (totalMinutes > 0) {
      stats.productivityScore = Math.round((stats.productiveMinutes / totalMinutes) * 100);
    } else {
      stats.productivityScore = 100;
    }
    
    this.productivityScore = stats.productivityScore;
  }

  setupIdleDetection() {
    this.idleTimer = setInterval(() => {
      const now = Date.now();
      const idleTime = now - this.lastActivityTime;
      
      if (idleTime > this.idleThreshold && !this.isIdle) {
        this.isIdle = true;
        this.onUserIdle();
      } else if (idleTime <= this.idleThreshold && this.isIdle) {
        this.isIdle = false;
        this.onUserActive();
      }
    }, 60000); // Check every minute
  }

  onUserIdle() {
    if (this.currentSession) {
      this.logActivity('idle_start', { idleDuration: Date.now() - this.lastActivityTime });
    }
  }

  onUserActive() {
    if (this.currentSession) {
      this.logActivity('idle_end', { idleDuration: Date.now() - this.lastActivityTime });
    }
    this.lastActivityTime = Date.now();
  }

  startTracking() {
    this.trackingInterval = setInterval(() => {
      this.trackCurrentActivity();
    }, 30000); // Track every 30 seconds
  }

  async trackCurrentActivity() {
    try {
      const activeWindow = await this.getActiveWindow();
      const activity = this.classifyActivity(activeWindow);
      
      if (this.currentSession && this.currentSession.active) {
        const now = Date.now();
        const duration = Math.floor((now - this.currentSession.startTime) / 60000);
        
        if (duration >= 1) {
          this.updateSessionActivity(activity);
        }
      }
      
      this.logActivity('track', {
        timestamp: Date.now(),
        activity: activity,
        window: activeWindow
      });
      
      this.lastActivityTime = Date.now();
    } catch (error) {
      console.error('Tracking error:', error);
    }
  }

  async getActiveWindow() {
    // Platform-specific active window detection
    try {
      if (process.platform === 'win32') {
        return await this.getWindowsActiveWindow();
      } else if (process.platform === 'linux') {
        return await this.getLinuxActiveWindow();
      }
      return { title: 'unknown', process: 'unknown' };
    } catch (error) {
      return { title: 'unknown', process: 'unknown', error: error.message };
    }
  }

  async getWindowsActiveWindow() {
    // Windows-specific implementation using PowerShell
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);
    
    try {
      const { stdout } = await execPromise(
        'powershell -Command "(Get-Process -Id (Get-Process -Name explorer).MainWindowHandle).MainWindowTitle"'
      );
      return {
        title: stdout.trim() || 'Unknown',
        process: 'active_window'
      };
    } catch (error) {
      return { title: 'unknown', process: 'unknown' };
    }
  }

  async getLinuxActiveWindow() {
    // Linux-specific implementation using xdotool or wmctrl
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);
    
    try {
      const { stdout } = await execPromise('xdotool getwindowfocus getwindowname');
      return {
        title: stdout.trim() || 'Unknown',
        process: 'active_window'
      };
    } catch (error) {
      return { title: 'unknown', process: 'unknown' };
    }
  }

  classifyActivity(windowInfo) {
    const title = windowInfo.title?.toLowerCase() || '';
    const process = windowInfo.process?.toLowerCase() || '';
    
    // Define productivity categories
    const productiveKeywords = ['code', 'editor', 'document', 'excel', 'word', 'powerpoint', 'terminal', 'vscode', 'intellij', 'slack', 'teams'];
    const distractingKeywords = ['facebook', 'twitter', 'instagram', 'youtube', 'reddit', 'netflix', 'twitch', 'game', 'tiktok'];
    
    for (const keyword of productiveKeywords) {
      if (title.includes(keyword) || process.includes(keyword)) {
        return { type: 'productive', confidence: 0.8, label: 'productive' };
      }
    }
    
    for (const keyword of distractingKeywords) {
      if (title.includes(keyword) || process.includes(keyword)) {
        return { type: 'distracted', confidence: 0.9, label: 'distracting' };
      }
    }
    
    return { type: 'neutral', confidence: 0.5, label: 'neutral' };
  }

  updateSessionActivity(activity) {
    if (!this.currentSession) return;
    
    const minutesToAdd = 1;
    
    if (activity.type === 'productive') {
      this.updateDailyStats('productiveMinutes', minutesToAdd);
      this.currentSession.productiveTime = (this.currentSession.productiveTime || 0) + minutesToAdd;
    } else if (activity.type === 'distracted') {
      this.updateDailyStats('distractedMinutes', minutesToAdd);
      this.currentSession.distractedTime = (this.currentSession.distractedTime || 0) + minutesToAdd;
    }
    
    this.currentSession.lastActivity = Date.now();
  }

  startFocusSession(duration = 60) {
    this.currentSession = {
      id: Date.now().toString(),
      startTime: Date.now(),
      duration: duration * 60000,
      active: true,
      productiveTime: 0,
      distractedTime: 0,
      lastActivity: Date.now(),
      completionTime: null
    };
    
    this.updateDailyStats('sessions', 1);
    this.logActivity('focus_session_start', { duration });
    
    return this.currentSession;
  }

  async endFocusSession(completed = true) {
    if (!this.currentSession || !this.currentSession.active) return null;
    
    const endTime = Date.now();
    const actualDuration = Math.floor((endTime - this.currentSession.startTime) / 60000);
    
    this.currentSession.active = false;
    this.currentSession.completionTime = endTime;
    this.currentSession.completed = completed;
    this.currentSession.actualDuration = actualDuration;
    
    this.updateDailyStats('focusMinutes', actualDuration);
    
    this.logActivity('focus_session_end', {
      duration: actualDuration,
      completed,
      productiveTime: this.currentSession.productiveTime,
      distractedTime: this.currentSession.distractedTime
    });
    
    this.focusSessions.push(this.currentSession);
    await this.saveActivityData();
    
    const session = this.currentSession;
    this.currentSession = null;
    
    return session;
  }

  logActivity(type, data) {
    const logEntry = {
      timestamp: Date.now(),
      type: type,
      data: data,
      sessionId: this.currentSession?.id || null
    };
    
    this.activityLog.push(logEntry);
    
    if (this.activityLog.length > 10000) {
      this.activityLog = this.activityLog.slice(-10000);
    }
  }

  logBlockedAttempt(domain, attemptType = 'website') {
    const attempt = {
      timestamp: Date.now(),
      domain: domain,
      type: attemptType,
      sessionId: this.currentSession?.id || null
    };
    
    this.blockedAttempts.push(attempt);
    this.updateDailyStats('blockedAttempts', 1);
    this.logActivity('blocked_attempt', { domain, attemptType });
    
    return attempt;
  }

  async getDailyReport(date = null) {
    const targetDate = date || this.getTodayKey();
    const stats = this.dailyStats[targetDate] || this.getEmptyDailyStats()[targetDate];
    
    const dailyLogs = this.activityLog.filter(log => {
      const logDate = new Date(log.timestamp).toISOString().split('T')[0];
      return logDate === targetDate;
    });
    
    return {
      date: targetDate,
      stats: stats,
      productivityScore: stats.productivityScore,
      focusSessions: this.focusSessions.filter(session => {
        const sessionDate = new Date(session.startTime).toISOString().split('T')[0];
        return sessionDate === targetDate;
      }),
      blockedAttempts: this.blockedAttempts.filter(attempt => {
        const attemptDate = new Date(attempt.timestamp).toISOString().split('T')[0];
        return attemptDate === targetDate;
      }),
      activityTimeline: dailyLogs.slice(-100)
    };
  }

  async getWeeklyReport() {
    const weeklyStats = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const report = await this.getDailyReport(dateKey);
      weeklyStats.push(report);
    }
    
    const totalProductive = weeklyStats.reduce((sum, day) => sum + day.stats.productiveMinutes, 0);
    const totalDistracted = weeklyStats.reduce((sum, day) => sum + day.stats.distractedMinutes, 0);
    const totalFocus = weeklyStats.reduce((sum, day) => sum + day.stats.focusMinutes, 0);
    const totalBlocked = weeklyStats.reduce((sum, day) => sum + day.stats.blockedAttempts, 0);
    
    const averageProductivity = totalProductive + totalDistracted > 0
      ? Math.round((totalProductive / (totalProductive + totalDistracted)) * 100)
      : 100;
    
    return {
      weekStart: weeklyStats[0]?.date,
      weekEnd: weeklyStats[6]?.date,
      dailyStats: weeklyStats,
      totals: {
        productiveMinutes: totalProductive,
        distractedMinutes: totalDistracted,
        focusMinutes: totalFocus,
        blockedAttempts: totalBlocked,
        averageProductivity: averageProductivity
      }
    };
  }

  updateActivity() {
    this.lastActivityTime = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      this.onUserActive();
    }
  }

  stopTracking() {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
    
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    
    if (this.currentSession && this.currentSession.active) {
      this.endFocusSession(false);
    }
    
    this.saveActivityData();
  }

  async resetTodayStats() {
    const today = this.getTodayKey();
    this.dailyStats[today] = this.getEmptyDailyStats()[today];
    await this.saveActivityData();
  }

  getProductivityScore() {
    return this.productivityScore;
  }

  getCurrentSession() {
    return this.currentSession;
  }
}

module.exports = ActivityTracker;