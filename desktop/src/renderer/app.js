(function initFocusSyncApp() {
  const STORAGE_KEY = 'focussync_state_v1';
  const DEFAULT_BLOCKED_DOMAINS = [
    'facebook.com',
    'youtube.com',
    'instagram.com',
    'x.com',
    'reddit.com',
    'tiktok.com'
  ];

  const state = {
    currentView: 'dashboard',
    focusDurationMinutes: 25,
    focusActive: false,
    remainingSeconds: 25 * 60,
    timerId: null,
    timerStartedAt: null,
    sessions: [],
    blockedDomains: [...DEFAULT_BLOCKED_DOMAINS],
    siteLockActive: false
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

      if (Array.isArray(saved.blockedDomains) && saved.blockedDomains.length > 0) {
        state.blockedDomains = saved.blockedDomains
          .map((domain) => normalizeDomain(domain))
          .filter(Boolean);
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
      sessions: state.sessions,
      blockedDomains: state.blockedDomains
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

  function normalizeDomain(input) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');
  }

  function parseDomains(rawValue) {
    return String(rawValue || '')
      .split(/[\n,]+/)
      .map((value) => normalizeDomain(value))
      .filter((value, index, values) => value && values.indexOf(value) === index);
  }

  async function startSiteLock() {
    if (!window.FocusSync || typeof window.FocusSync.startSiteLock !== 'function') {
      return;
    }

    const domains = state.blockedDomains.length > 0 ? state.blockedDomains : DEFAULT_BLOCKED_DOMAINS;
    const response = await window.FocusSync.startSiteLock(domains);

    if (!response || !response.success) {
      state.siteLockActive = false;
      const message = response && response.error ? response.error : 'Unknown error';
      console.warn('Site lock could not be enabled:', message);
      return;
    }

    state.siteLockActive = true;
  }

  async function stopSiteLock() {
    if (!window.FocusSync || typeof window.FocusSync.stopSiteLock !== 'function') {
      return;
    }

    if (!state.siteLockActive) {
      return;
    }

    const response = await window.FocusSync.stopSiteLock();
    if (!response || !response.success) {
      const message = response && response.error ? response.error : 'Unknown error';
      console.warn('Site lock could not be disabled:', message);
      return;
    }

    state.siteLockActive = false;
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
    startSiteLock().catch((error) => {
      console.warn('Site lock start failed:', error);
    });

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
    stopSiteLock().catch((error) => {
      console.warn('Site lock stop failed:', error);
    });

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

            <div class="settings-group">
              <label for="blockedDomainsInput" class="settings-label">Blocked Domains (comma/new line separated)</label>
              <textarea
                id="blockedDomainsInput"
                class="settings-input"
                rows="5"
                placeholder="youtube.com&#10;facebook.com"
              >${state.blockedDomains.join('\n')}</textarea>
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
      const blockedInput = document.getElementById('blockedDomainsInput');
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

      const parsedDomains = parseDomains(blockedInput ? blockedInput.value : '');
      state.blockedDomains = parsedDomains.length > 0 ? parsedDomains : [...DEFAULT_BLOCKED_DOMAINS];

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
