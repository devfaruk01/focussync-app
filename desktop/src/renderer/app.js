(function initFocusSyncApp() {
  const STORAGE_KEY = 'focussync_state_v1';

  const state = {
    currentView: 'dashboard',
    focusDurationMinutes: 25,
    focusActive: false,
    remainingSeconds: 25 * 60,
    timerId: null,
    timerStartedAt: null,
    sessions: []
  };

  const elements = {
    navButtons: [],
    pageTitle: null,
    viewContainer: null,
    syncButton: null,
    focusStatus: null
  };

  const PAGE_TITLES = {
    dashboard: 'Dashboard',
    focus: 'Focus Mode',
    stats: 'Statistics',
    settings: 'Settings'
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw);

      if (typeof saved.focusDurationMinutes === 'number' && saved.focusDurationMinutes > 0) {
        state.focusDurationMinutes = saved.focusDurationMinutes;
      }

      if (Array.isArray(saved.sessions)) {
        state.sessions = saved.sessions;
      }

      if (saved.currentView && PAGE_TITLES[saved.currentView]) {
        state.currentView = saved.currentView;
      }
    } catch (error) {
      console.warn('Failed to load saved state:', error);
    }

    state.remainingSeconds = state.focusDurationMinutes * 60;
  }

  function saveState() {
    const payload = {
      currentView: state.currentView,
      focusDurationMinutes: state.focusDurationMinutes,
      sessions: state.sessions
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function captureElements() {
    elements.navButtons = Array.from(document.querySelectorAll('.nav-item[data-view]'));
    elements.pageTitle = document.getElementById('pageTitle');
    elements.viewContainer = document.getElementById('viewContainer');
    elements.syncButton = document.getElementById('syncBtn');
    elements.focusStatus = document.getElementById('focusStatus');

    if (!elements.viewContainer) {
      throw new Error('Missing #viewContainer in renderer HTML');
    }
  }

  function attachBaseListeners() {
    elements.navButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        if (view && PAGE_TITLES[view]) {
          switchView(view);
        }
      });
    });

    if (elements.syncButton) {
      elements.syncButton.addEventListener('click', () => {
        const now = new Date();
        showTransientSyncLabel(now.toLocaleTimeString());
      });
    }

    window.addEventListener('beforeunload', () => {
      stopTimer(false);
      saveState();
    });
  }

  function switchView(viewName) {
    state.currentView = viewName;

    elements.navButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.view === viewName);
    });

    if (elements.pageTitle) {
      elements.pageTitle.textContent = PAGE_TITLES[viewName];
    }

    renderView(viewName);
    saveState();
  }

  function renderView(viewName) {
    if (viewName === 'dashboard') {
      renderDashboardView();
      return;
    }

    if (viewName === 'focus') {
      renderFocusView();
      return;
    }

    if (viewName === 'stats') {
      renderStatsView();
      return;
    }

    if (viewName === 'settings') {
      renderSettingsView();
    }
  }

  function getTodayKey(dateValue) {
    const date = new Date(dateValue);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function getSessionSummary() {
    const todayKey = getTodayKey(Date.now());
    const todaySessions = state.sessions.filter((session) => getTodayKey(session.endedAt) === todayKey);
    const totalMinutes = Math.floor(
      state.sessions.reduce((total, session) => total + session.durationSeconds, 0) / 60
    );
    const todayMinutes = Math.floor(
      todaySessions.reduce((total, session) => total + session.durationSeconds, 0) / 60
    );

    return {
      todayCount: todaySessions.length,
      todayMinutes,
      totalCount: state.sessions.length,
      totalMinutes
    };
  }

  function renderDashboardView() {
    const summary = getSessionSummary();

    elements.viewContainer.innerHTML = `
      <section>
        <div class="stats-grid">
          <article class="stat-card glass-card">
            <p class="stat-title">Today's Sessions</p>
            <h2 class="stat-value">${summary.todayCount}</h2>
            <p class="stat-change">Focus blocks completed today</p>
          </article>

          <article class="stat-card glass-card">
            <p class="stat-title">Today's Focus Time</p>
            <h2 class="stat-value">${summary.todayMinutes}m</h2>
            <p class="stat-change">Minutes completed today</p>
          </article>

          <article class="stat-card glass-card">
            <p class="stat-title">All Sessions</p>
            <h2 class="stat-value">${summary.totalCount}</h2>
            <p class="stat-change">Total sessions recorded</p>
          </article>

          <article class="stat-card glass-card">
            <p class="stat-title">All Focus Time</p>
            <h2 class="stat-value">${summary.totalMinutes}m</h2>
            <p class="stat-change">Lifetime focus minutes</p>
          </article>
        </div>

        <div class="card glass-card">
          <div class="card-header">
            <h3 class="card-title">Quick Actions</h3>
          </div>
          <div class="card-content">
            <button class="btn-primary" id="goToFocusBtn">Start a Focus Session</button>
          </div>
        </div>
      </section>
    `;

    const goToFocusButton = document.getElementById('goToFocusBtn');
    if (goToFocusButton) {
      goToFocusButton.addEventListener('click', () => switchView('focus'));
    }
  }

  function formatTimeParts(totalSeconds) {
    const seconds = Math.max(0, totalSeconds);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainderSeconds = seconds % 60;

    return {
      hours: String(hours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(remainderSeconds).padStart(2, '0')
    };
  }

  function updateTimerDOM() {
    const hoursElement = document.getElementById('timerHours');
    const minutesElement = document.getElementById('timerMinutes');
    const secondsElement = document.getElementById('timerSeconds');

    if (!hoursElement || !minutesElement || !secondsElement) {
      return;
    }

    const parts = formatTimeParts(state.remainingSeconds);
    hoursElement.textContent = `${parts.hours}:`;
    minutesElement.textContent = `${parts.minutes}`;
    secondsElement.textContent = `:${parts.seconds}`;
  }

  function recordSession(durationSeconds) {
    if (durationSeconds <= 0) {
      return;
    }

    state.sessions.push({
      durationSeconds,
      endedAt: Date.now()
    });

    if (state.sessions.length > 500) {
      state.sessions = state.sessions.slice(-500);
    }

    saveState();
  }

  function startTimer() {
    if (state.focusActive) {
      return;
    }

    if (state.remainingSeconds <= 0) {
      state.remainingSeconds = state.focusDurationMinutes * 60;
    }

    state.focusActive = true;
    state.timerStartedAt = Date.now();
    updateFocusIndicator();

    const startButton = document.getElementById('startFocusBtn');
    const stopButton = document.getElementById('stopFocusBtn');
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;

    state.timerId = window.setInterval(() => {
      state.remainingSeconds -= 1;
      updateTimerDOM();

      if (state.remainingSeconds <= 0) {
        stopTimer(true);
      }
    }, 1000);
  }

  function stopTimer(markCompleted) {
    if (state.timerId) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }

    if (!state.focusActive) {
      return;
    }

    state.focusActive = false;

    const startedAt = state.timerStartedAt || Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const plannedSeconds = state.focusDurationMinutes * 60;
    const completedSeconds = markCompleted ? plannedSeconds : Math.min(elapsedSeconds, plannedSeconds);

    recordSession(completedSeconds);

    state.timerStartedAt = null;
    state.remainingSeconds = state.focusDurationMinutes * 60;

    updateFocusIndicator();

    const startButton = document.getElementById('startFocusBtn');
    const stopButton = document.getElementById('stopFocusBtn');
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;

    updateTimerDOM();

    if (markCompleted) {
      notifyCompletion();
    }
  }

  function notifyCompletion() {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Focus session complete', {
        body: 'Great work. Your session has finished.'
      });
      return;
    }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }

  function renderFocusView() {
    const parts = formatTimeParts(state.remainingSeconds);

    elements.viewContainer.innerHTML = `
      <section class="card glass-card">
        <div class="card-header">
          <h3 class="card-title">Focus Timer</h3>
        </div>
        <div class="card-content">
          <div class="focus-timer">
            <div class="timer-circle">
              <div class="timer-display">
                <span id="timerHours" class="hours">${parts.hours}:</span>
                <span id="timerMinutes" class="minutes">${parts.minutes}</span>
                <span id="timerSeconds" class="seconds">:${parts.seconds}</span>
                <p class="timer-label">Deep Work Session</p>
              </div>
            </div>

            <div class="control-buttons">
              <button id="startFocusBtn" class="btn-primary" ${state.focusActive ? 'disabled' : ''}>Start Focus</button>
              <button id="stopFocusBtn" class="btn-danger" ${state.focusActive ? '' : 'disabled'}>Stop Focus</button>
            </div>
          </div>
        </div>
      </section>
    `;

    const startButton = document.getElementById('startFocusBtn');
    const stopButton = document.getElementById('stopFocusBtn');

    if (startButton) {
      startButton.addEventListener('click', startTimer);
    }

    if (stopButton) {
      stopButton.addEventListener('click', () => stopTimer(false));
    }

    updateTimerDOM();
  }

  function renderStatsView() {
    const summary = getSessionSummary();
    const recent = state.sessions.slice(-10).reverse();

    elements.viewContainer.innerHTML = `
      <section class="card glass-card">
        <div class="card-header">
          <h3 class="card-title">Focus Stats</h3>
        </div>
        <div class="card-content">
          <div class="stats-grid" style="margin-bottom: 24px;">
            <article class="stat-card">
              <p class="stat-title">Total Sessions</p>
              <h2 class="stat-value">${summary.totalCount}</h2>
            </article>
            <article class="stat-card">
              <p class="stat-title">Total Focus</p>
              <h2 class="stat-value">${summary.totalMinutes}m</h2>
            </article>
          </div>

          <canvas id="statsChart" height="120"></canvas>

          <div style="margin-top: 24px;">
            <h4 class="card-title" style="margin-bottom: 12px;">Recent Sessions</h4>
            <div id="recentSessions"></div>
          </div>
        </div>
      </section>
    `;

    const recentContainer = document.getElementById('recentSessions');
    if (recentContainer) {
      if (recent.length === 0) {
        recentContainer.innerHTML = '<p style="color: var(--text-tertiary);">No session history yet.</p>';
      } else {
        recentContainer.innerHTML = recent
          .map((session) => {
            const minutes = Math.max(1, Math.round(session.durationSeconds / 60));
            return `
              <div class="card" style="padding: 12px 16px; margin-bottom: 10px;">
                <strong>${minutes}m</strong>
                <span style="float:right; color: var(--text-tertiary);">${new Date(session.endedAt).toLocaleString()}</span>
              </div>
            `;
          })
          .join('');
      }
    }

    drawStatsChart();
  }

  function drawStatsChart() {
    if (!window.Chart) {
      return;
    }

    const chartCanvas = document.getElementById('statsChart');
    if (!chartCanvas) {
      return;
    }

    const dailyMinutes = new Map();

    state.sessions.forEach((session) => {
      const key = getTodayKey(session.endedAt);
      const current = dailyMinutes.get(key) || 0;
      dailyMinutes.set(key, current + Math.round(session.durationSeconds / 60));
    });

    const sortedEntries = Array.from(dailyMinutes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const lastSeven = sortedEntries.slice(-7);

    const labels = lastSeven.map(([date]) => date.slice(5));
    const values = lastSeven.map(([, minutes]) => minutes);

    if (window.focusStatsChart) {
      window.focusStatsChart.destroy();
    }

    window.focusStatsChart = new window.Chart(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Focus Minutes',
            data: values,
            borderColor: '#8B5CF6',
            backgroundColor: 'rgba(139, 92, 246, 0.2)',
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#ffffff'
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.08)'
            }
          },
          y: {
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.08)'
            }
          }
        }
      }
    });
  }

  function renderSettingsView() {
    elements.viewContainer.innerHTML = `
      <section class="card glass-card">
        <div class="card-header">
          <h3 class="card-title">Settings</h3>
        </div>

        <div class="card-content">
          <div class="settings-section">
            <div class="settings-group">
              <label for="focusDurationInput" class="settings-label">Default Focus Duration (minutes)</label>
              <input
                id="focusDurationInput"
                class="settings-input"
                type="number"
                min="5"
                max="240"
                step="5"
                value="${state.focusDurationMinutes}"
              />
            </div>

            <div class="settings-group">
              <label class="settings-label" for="desktopNotificationToggle">Desktop Notifications</label>
              <label class="toggle-switch">
                <input id="desktopNotificationToggle" type="checkbox" checked />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <button id="saveSettingsBtn" class="btn-primary">Save Settings</button>
          </div>
        </div>
      </section>
    `;

    const saveButton = document.getElementById('saveSettingsBtn');
    if (!saveButton) {
      return;
    }

    saveButton.addEventListener('click', () => {
      const input = document.getElementById('focusDurationInput');
      if (!input) {
        return;
      }

      const numeric = Number(input.value);
      if (!Number.isFinite(numeric) || numeric < 5 || numeric > 240) {
        input.focus();
        return;
      }

      state.focusDurationMinutes = numeric;

      if (!state.focusActive) {
        state.remainingSeconds = numeric * 60;
      }

      saveState();
      switchView('focus');
    });
  }

  function updateFocusIndicator() {
    if (!elements.focusStatus) {
      return;
    }

    const textElement = elements.focusStatus.querySelector('span');
    const dotElement = elements.focusStatus.querySelector('.status-dot');

    if (state.focusActive) {
      if (textElement) textElement.textContent = 'Focus Running';
      if (dotElement) dotElement.style.background = 'var(--warning)';
      document.title = 'FocusFlow - Focus Running';
      return;
    }

    if (textElement) textElement.textContent = 'Ready';
    if (dotElement) dotElement.style.background = 'var(--success)';
    document.title = 'FocusFlow - Deep Work Assistant';
  }

  function showTransientSyncLabel(timeText) {
    if (!elements.syncButton) {
      return;
    }

    const label = elements.syncButton.querySelector('span');
    if (!label) {
      return;
    }

    const oldText = label.textContent;
    label.textContent = `Synced ${timeText}`;

    window.setTimeout(() => {
      label.textContent = oldText;
    }, 1400);
  }

  function start() {
    loadState();
    captureElements();
    attachBaseListeners();
    switchView(state.currentView);
    updateFocusIndicator();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();


const Dashboard = require("./components/Dashboard");
const FocusMode = require("./components/FocusMode");

const viewContainer = document.getElementById("viewContainer");
const navItems = document.querySelectorAll(".nav-item");
const pageTitle = document.getElementById("pageTitle");

/*
|--------------------------------------------------------------------------
| Render Functions
|--------------------------------------------------------------------------
*/

function renderDashboard() {
  pageTitle.innerText = "Dashboard";

  viewContainer.innerHTML = Dashboard();
}

function renderFocusMode() {
  pageTitle.innerText = "Focus Mode";

  viewContainer.innerHTML = FocusMode();

  initializeFocusEvents();
}

/*
|--------------------------------------------------------------------------
| Focus Events
|--------------------------------------------------------------------------
*/

function initializeFocusEvents() {
  const startBtn = document.getElementById("startFocusBtn");
  const stopBtn = document.getElementById("stopFocusBtn");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      console.log("Focus Started 🔥");
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      console.log("Focus Stopped ✅");
    });
  }
}

/*
|--------------------------------------------------------------------------
| Navigation System
|--------------------------------------------------------------------------
*/

function initializeNavigation() {
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((nav) => {
        nav.classList.remove("active");
      });

      item.classList.add("active");

      const view = item.dataset.view;

      switch (view) {
        case "dashboard":
          renderDashboard();
          break;

        case "focus":
          renderFocusMode();
          break;

        default:
          renderDashboard();
      }
    });
  });
}

/*
|--------------------------------------------------------------------------
| App Init
|--------------------------------------------------------------------------
*/

function initializeFocusEvents() {
  const startBtn = document.getElementById("startFocusBtn");
  const stopBtn = document.getElementById("stopFocusBtn");
  const timerElement = document.getElementById("focusTimer");

  let timerInterval = null;

  if (startBtn) {
    startBtn.addEventListener("click", () => {

      timerManager.start(25);

      hostsBlocker.startFocusMode();

      syncManager.syncFocusMode(true);

      console.log("Focus Started 🔥");

      timerInterval = setInterval(() => {

        const state = timerManager.getState();

        const minutes = Math.floor(state.remaining / 60);
        const seconds = state.remaining % 60;

        timerElement.innerText =
          `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

        if (!state.isRunning) {
          clearInterval(timerInterval);

          hostsBlocker.stopFocusMode();

          syncManager.syncFocusMode(false);
        }

      }, 1000);

    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {

      timerManager.stop();

      hostsBlocker.stopFocusMode();

      syncManager.syncFocusMode(false);

      clearInterval(timerInterval);

      timerElement.innerText = "25:00";

      console.log("Focus Stopped ✅");
    });
  }
}

const TimerManager = require("../../modules/timerManager");
const HostsBlocker = require("../../modules/hostsBlocker");
const SyncManager = require("../../modules/syncManager");

const syncManager = new SyncManager();

const timerManager = new TimerManager(syncManager);

const hostsBlocker = new HostsBlocker();

syncManager.connect();

// desktop/src/renderer/app.js
// FocusFlow - Main Renderer Application
// Production-ready, Electron compatible, Modular architecture

import TimerManager from '../services/TimerManager.js';
import HostsBlocker from '../services/HostsManager.js';
import SyncManager from '../services/SyncService.js';

// Import UI Components
import Dashboard from './components/Dashboard.js';
import FocusMode from './components/FocusMode.js';
import Settings from './components/Settings.js';
import Stats from './components/Stats.js';

class FocusApp {
    constructor() {
        // Core Services
        this.timerManager = new TimerManager();
        this.hostsBlocker = new HostsBlocker();
        this.syncManager = new SyncManager();
        
        // UI State
        this.currentView = 'dashboard';
        this.isFocusModeActive = false;
        this.currentDuration = 25 * 60; // 25 minutes default
        
        // DOM Elements
        this.elements = {
            appContainer: null,
            navButtons: null,
            views: null,
            focusButton: null,
            stopButton: null,
            timerDisplay: null,
            statusMessage: null
        };
        
        // Bind methods
        this.handleTimerTick = this.handleTimerTick.bind(this);
        this.handleTimerComplete = this.handleTimerComplete.bind(this);
        this.startFocus = this.startFocus.bind(this);
        this.stopFocus = this.stopFocus.bind(this);
        this.switchView = this.switchView.bind(this);
        
        // Initialize application
        this.init();
    }
    
    async init() {
        try {
            await this.initializeServices();
            this.captureElements();
            this.attachEventListeners();
            this.renderInitialUI();
            await this.loadUserPreferences();
            console.log('FocusApp initialized successfully');
        } catch (error) {
            console.error('Failed to initialize FocusApp:', error);
            this.showError('Failed to initialize application. Please restart.');
        }
    }
    
    async initializeServices() {
        try {
            // Initialize Timer Manager
            await this.timerManager.init();
            this.timerManager.on('tick', this.handleTimerTick);
            this.timerManager.on('complete', this.handleTimerComplete);
            
            // Initialize Hosts Blocker
            await this.hostsBlocker.init();
            
            // Initialize Sync Manager
            await this.syncManager.init();
            await this.syncManager.connect();
            
        } catch (error) {
            console.error('Service initialization failed:', error);
            throw error;
        }
    }
    
    captureElements() {
        this.elements.appContainer = document.getElementById('app');
        if (!this.elements.appContainer) {
            throw new Error('App container not found');
        }
        
        this.elements.navButtons = document.querySelectorAll('[data-nav]');
        this.elements.views = {
            dashboard: document.getElementById('view-dashboard'),
            focus: document.getElementById('view-focus'),
            settings: document.getElementById('view-settings'),
            stats: document.getElementById('view-stats')
        };
        
        this.elements.focusButton = document.getElementById('btn-start-focus');
        this.elements.stopButton = document.getElementById('btn-stop-focus');
        this.elements.timerDisplay = document.getElementById('timer-display');
        this.elements.statusMessage = document.getElementById('status-message');
    }
    
    attachEventListeners() {
        // Navigation listeners
        if (this.elements.navButtons) {
            this.elements.navButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const view = btn.dataset.nav;
                    if (view) this.switchView(view);
                });
            });
        }
        
        // Focus control listeners
        if (this.elements.focusButton) {
            this.elements.focusButton.addEventListener('click', this.startFocus);
        }
        
        if (this.elements.stopButton) {
            this.elements.stopButton.addEventListener('click', this.stopFocus);
        }
        
        // Window unload cleanup
        window.addEventListener('beforeunload', () => {
            if (this.isFocusModeActive) {
                this.stopFocus();
            }
        });
    }
    
    renderInitialUI() {
        // Render dashboard by default
        this.switchView('dashboard');
        
        // Initialize UI Components
        if (window.DashboardComponent) {
            new Dashboard(this.elements.views.dashboard, {
                timerManager: this.timerManager,
                syncManager: this.syncManager,
                onStartFocus: this.startFocus
            });
        }
        
        if (window.FocusModeComponent) {
            new FocusMode(this.elements.views.focus, {
                timerManager: this.timerManager,
                hostsBlocker: this.hostsBlocker,
                onStopFocus: this.stopFocus
            });
        }
        
        if (window.SettingsComponent) {
            new Settings(this.elements.views.settings, {
                hostsBlocker: this.hostsBlocker,
                syncManager: this.syncManager,
                onSettingsChange: this.handleSettingsChange.bind(this)
            });
        }
        
        if (window.StatsComponent) {
            new Stats(this.elements.views.stats, {
                timerManager: this.timerManager,
                syncManager: this.syncManager
            });
        }
    }
    
    async loadUserPreferences() {
        try {
            const savedDuration = localStorage.getItem('focusDuration');
            if (savedDuration) {
                this.currentDuration = parseInt(savedDuration);
                this.updateTimerDisplay(this.currentDuration);
            }
            
            const lastView = localStorage.getItem('lastView');
            if (lastView && this.elements.views[lastView]) {
                this.switchView(lastView);
            }
            
            const autoBlock = localStorage.getItem('autoBlockHosts') === 'true';
            if (autoBlock) {
                await this.hostsBlocker.enableBlocking();
            }
            
        } catch (error) {
            console.warn('Failed to load user preferences:', error);
        }
    }
    
    async startFocus() {
        try {
            if (this.isFocusModeActive) {
                this.showStatus('Focus mode already active', 'warning');
                return;
            }
            
            // Get duration from UI if available
            const durationInput = document.getElementById('focus-duration');
            if (durationInput && durationInput.value) {
                this.currentDuration = parseInt(durationInput.value) * 60;
                localStorage.setItem('focusDuration', this.currentDuration);
            }
            
            // Enable hosts blocking
            await this.hostsBlocker.enableBlocking();
            
            // Start timer
            await this.timerManager.start(this.currentDuration);
            
            this.isFocusModeActive = true;
            
            // Switch to focus view
            this.switchView('focus');
            
            // Update UI state
            if (this.elements.focusButton) {
                this.elements.focusButton.disabled = true;
            }
            if (this.elements.stopButton) {
                this.elements.stopButton.disabled = false;
            }
            
            this.showStatus('Focus mode activated! Stay productive.', 'success');
            
            // Sync session start
            await this.syncManager.startSession(this.currentDuration);
            
        } catch (error) {
            console.error('Failed to start focus mode:', error);
            this.showError('Failed to start focus mode. Check permissions.');
        }
    }
    
    async stopFocus() {
        try {
            if (!this.isFocusModeActive) {
                return;
            }
            
            // Stop timer
            await this.timerManager.stop();
            
            // Disable hosts blocking
            await this.hostsBlocker.disableBlocking();
            
            this.isFocusModeActive = false;
            
            // Update UI state
            if (this.elements.focusButton) {
                this.elements.focusButton.disabled = false;
            }
            if (this.elements.stopButton) {
                this.elements.stopButton.disabled = true;
            }
            
            // Reset timer display
            this.updateTimerDisplay(this.currentDuration);
            
            this.showStatus('Focus mode ended. Good work!', 'info');
            
            // Sync session end
            await this.syncManager.endSession();
            
            // Show completion stats
            this.showCompletionStats();
            
        } catch (error) {
            console.error('Failed to stop focus mode:', error);
            this.showError('Error stopping focus mode.');
        }
    }
    
    handleTimerTick(timeLeft) {
        this.updateTimerDisplay(timeLeft);
        
        // Update progress if available
        const progressBar = document.getElementById('focus-progress');
        if (progressBar) {
            const progress = ((this.currentDuration - timeLeft) / this.currentDuration) * 100;
            progressBar.style.width = `${progress}%`;
        }
        
        // Update status for last minute
        if (timeLeft <= 60 && timeLeft > 0) {
            const secondsLeft = timeLeft;
            if (secondsLeft === 60) {
                this.showStatus('One minute remaining!', 'warning');
            } else if (secondsLeft <= 10) {
                this.showStatus(`${secondsLeft} seconds remaining...`, 'warning');
            }
        }
    }
    
    handleTimerComplete() {
        this.showStatus('Focus session complete! Great job! 🎉', 'success');
        this.stopFocus();
        
        // Play notification sound if available
        this.playNotificationSound();
        
        // Show browser notification
        this.showNotification('Focus Session Complete', 'You have completed your focus session. Time for a break!');
    }
    
    updateTimerDisplay(seconds) {
        if (!this.elements.timerDisplay) return;
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        let displayText = '';
        if (hours > 0) {
            displayText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            displayText = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        this.elements.timerDisplay.textContent = displayText;
        
        // Update document title with timer
        if (this.isFocusModeActive) {
            document.title = `(${displayText}) FocusFlow - Stay Focused`;
        } else {
            document.title = 'FocusFlow - Productivity App';
        }
    }
    
    switchView(viewName) {
        // Validate view exists
        if (!this.elements.views[viewName]) {
            console.error(`View "${viewName}" not found`);
            return;
        }
        
        // Hide all views
        Object.values(this.elements.views).forEach(view => {
            if (view) view.classList.add('hidden');
        });
        
        // Show selected view
        this.elements.views[viewName].classList.remove('hidden');
        
        // Update active nav button
        if (this.elements.navButtons) {
            this.elements.navButtons.forEach(btn => {
                if (btn.dataset.nav === viewName) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        
        this.currentView = viewName;
        localStorage.setItem('lastView', viewName);
        
        // Trigger view-specific actions
        if (viewName === 'stats' && this.isFocusModeActive) {
            // Don't refresh stats during focus mode
            console.log('Stats view accessed during focus mode');
        }
    }
    
    showStatus(message, type = 'info') {
        if (!this.elements.statusMessage) return;
        
        this.elements.statusMessage.textContent = message;
        this.elements.statusMessage.className = `status-message status-${type}`;
        
        // Auto-hide after 3 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                if (this.elements.statusMessage && this.elements.statusMessage.textContent === message) {
                    this.elements.statusMessage.textContent = '';
                    this.elements.statusMessage.className = 'status-message';
                }
            }, 3000);
        }
    }
    
    showError(message) {
        this.showStatus(message, 'error');
        console.error(message);
    }
    
    async showNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/assets/icons/icon-128.png' });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
            await Notification.requestPermission();
            if (Notification.permission === 'granted') {
                new Notification(title, { body, icon: '/assets/icons/icon-128.png' });
            }
        }
    }
    
    playNotificationSound() {
        const audio = new Audio('/assets/sounds/notification.mp3');
        audio.play().catch(err => console.warn('Could not play notification sound:', err));
    }
    
    showCompletionStats() {
        // This would typically fetch from syncManager or timerManager
        const sessionDuration = this.currentDuration / 60;
        this.showStatus(`Completed ${sessionDuration} minute focus session! 🎯`, 'success');
    }
    
    async handleSettingsChange(setting, value) {
        switch(setting) {
            case 'duration':
                this.currentDuration = value * 60;
                localStorage.setItem('focusDuration', this.currentDuration);
                this.updateTimerDisplay(this.currentDuration);
                break;
            case 'autoBlock':
                if (value) {
                    await this.hostsBlocker.enableBlocking();
                } else {
                    await this.hostsBlocker.disableBlocking();
                }
                localStorage.setItem('autoBlockHosts', value);
                break;
            case 'syncEnabled':
                if (value) {
                    await this.syncManager.connect();
                } else {
                    await this.syncManager.disconnect();
                }
                break;
            default:
                console.log(`Setting "${setting}" changed to:`, value);
        }
    }
}

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.focusApp = new FocusApp();
    });
} else {
    window.focusApp = new FocusApp();
}

// Export for testing/module usage
export default FocusApp;