// extension/popup/popup.js
let currentState = {
  focusMode: false,
  focusModeLocked: false,
  blockedDomains: [],
  currentDomain: null,
  stats: { today: [], totalBlocked: 0, focusMode: false }
};

let updateInterval = null;
const DEFAULT_FOCUS_DURATION_MINUTES = 25;

const DOM = {
  startBtn: document.getElementById('startFocusBtn'),
  stopBtn: document.getElementById('stopFocusBtn'),
  syncBtn: document.getElementById('syncNowBtn'),
  addDomainBtn: document.getElementById('addDomainBtn'),
  domainList: document.getElementById('domainList'),
  syncStatus: document.getElementById('syncStatus'),
  focusStatusText: document.getElementById('focusStatusText'),
  currentSiteText: document.getElementById('currentSiteText'),
  focusStatusIcon: document.getElementById('focusStatusIcon'),
  focusTimeValue: document.getElementById('focusTimeValue'),
  blockedCountValue: document.getElementById('blockedCountValue'),
  blockedDomainsValue: document.getElementById('blockedDomainsValue'),
  progressFill: document.querySelector('.progress-ring-fill'),
  lockNote: document.getElementById('lockNote')
};

const LOCKED_TEXT = 'Focus mode lock is active. You cannot turn it off right now.';

const setSyncStatus = (status, message = '') => {
  if (!DOM.syncStatus) return;
  DOM.syncStatus.className = 'sync-status ' + status;
  const textSpan = DOM.syncStatus.querySelector('span:last-child');
  if (textSpan) {
    textSpan.textContent = message || (status === 'syncing' ? 'Syncing...' : status === 'error' ? 'Error' : 'Synced');
  }
};

const sendMessage = async (type, data = {}) => {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response || {});
        }
      });
    } catch (error) {
      resolve({ error: error.message });
    }
  });
};

const loadState = async () => {
  try {
    const response = await sendMessage('GET_STATE');
    if (!response.error) {
      currentState = { ...currentState, ...response };
      updateUI();
    }
    
    const stats = await sendMessage('GET_STATS');
    if (!stats.error) {
      currentState.stats = stats;
      updateStats();
    }
  } catch (error) {
    console.error('Load state error:', error);
  }
};

const updateUI = () => {
  const isLockedNow = !!currentState.focusMode && !!currentState.focusModeLocked;

  if (currentState.focusMode) {
    DOM.focusStatusText.textContent = 'Focus Mode Active';
    DOM.focusStatusIcon.innerHTML = '🎯';
    if (DOM.progressFill) DOM.progressFill.style.strokeDashoffset = '0';
    if (DOM.startBtn) DOM.startBtn.disabled = true;
    if (DOM.stopBtn) {
      DOM.stopBtn.disabled = isLockedNow;
      DOM.stopBtn.title = isLockedNow ? LOCKED_TEXT : '';
    }
  } else {
    DOM.focusStatusText.textContent = 'Focus Mode Off';
    DOM.focusStatusIcon.innerHTML = '⚡';
    if (DOM.progressFill) DOM.progressFill.style.strokeDashoffset = '219.9';
    if (DOM.startBtn) DOM.startBtn.disabled = false;
    if (DOM.stopBtn) DOM.stopBtn.disabled = true;
  }
  
  DOM.currentSiteText.textContent = currentState.currentDomain 
    ? `Current: ${currentState.currentDomain}` 
    : 'No active session';
  
  if (DOM.blockedDomainsValue) {
    DOM.blockedDomainsValue.textContent = currentState.blockedDomains.length;
  }

  if (DOM.addDomainBtn) {
    DOM.addDomainBtn.disabled = isLockedNow;
    DOM.addDomainBtn.title = isLockedNow ? 'Blocked domains cannot be edited while focus mode is locked.' : '';
  }

  if (DOM.lockNote) {
    DOM.lockNote.textContent = isLockedNow
      ? LOCKED_TEXT
      : 'Focus mode can be started from here.';
  }

  renderDomainList();
};

const renderDomainList = () => {
  if (!DOM.domainList) return;
  
  if (!currentState.blockedDomains.length) {
    DOM.domainList.innerHTML = '<div class="empty-state">No blocked domains yet</div>';
    return;
  }
  
  DOM.domainList.innerHTML = currentState.blockedDomains.map(domain => `
    <div class="domain-item">
      <span>${escapeHtml(domain)}</span>
      <button class="remove-domain" data-domain="${escapeHtml(domain)}" ${currentState.focusMode && currentState.focusModeLocked ? 'disabled title="Locked during focus mode"' : ''}>✕</button>
    </div>
  `).join('');
  
  document.querySelectorAll('.remove-domain').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = btn.getAttribute('data-domain');
      if (domain) await removeBlockedDomain(domain);
    });
  });
};

const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
};

const updateStats = () => {
  const todayStats = currentState.stats.today || [];
  const totalFocusSeconds = todayStats
    .filter(a => !a.isBlocked)
    .reduce((sum, a) => sum + (a.duration || 0), 0);
  
  const focusMinutes = Math.floor(totalFocusSeconds / 60);
  if (DOM.focusTimeValue) DOM.focusTimeValue.textContent = focusMinutes;
  if (DOM.blockedCountValue) DOM.blockedCountValue.textContent = currentState.stats.totalBlocked || 0;
};

const startFocusMode = async () => {
  setSyncStatus('syncing', 'Starting...');
  try {
    const response = await sendMessage('SET_FOCUS_MODE', {
      enabled: true,
      domains: currentState.blockedDomains,
      durationMinutes: DEFAULT_FOCUS_DURATION_MINUTES
    });
    if (!response.error) {
      if (Array.isArray(response.blockedDomains)) {
        currentState.blockedDomains = response.blockedDomains;
      }
      currentState.focusModeLocked = !!response.focusModeLocked;
      currentState.focusMode = true;
      updateUI();
      setSyncStatus('synced', 'Focus Started');
      setTimeout(() => setSyncStatus('synced', 'Synced'), 2000);
    } else {
      setSyncStatus('error', 'Failed');
      console.error('Start focus error:', response.error);
    }
  } catch (error) {
    setSyncStatus('error', 'Error');
    console.error('Start focus error:', error);
  }
};

const stopFocusMode = async () => {
  if (currentState.focusModeLocked) {
    setSyncStatus('error', 'Locked');
    return;
  }

  setSyncStatus('syncing', 'Stopping...');
  try {
    const response = await sendMessage('SET_FOCUS_MODE', { enabled: false, domains: [] });
    if (!response.error) {
      if (Array.isArray(response.blockedDomains)) {
        currentState.blockedDomains = response.blockedDomains;
      }
      currentState.focusModeLocked = !!response.focusModeLocked;
      currentState.focusMode = false;
      updateUI();
      setSyncStatus('synced', 'Focus Stopped');
      setTimeout(() => setSyncStatus('synced', 'Synced'), 2000);
    } else {
      setSyncStatus('error', 'Failed');
      console.error('Stop focus error:', response.error);
    }
  } catch (error) {
    setSyncStatus('error', 'Error');
    console.error('Stop focus error:', error);
  }
};

const addBlockedDomain = async () => {
  if (currentState.focusMode && currentState.focusModeLocked) {
    setSyncStatus('error', 'Locked');
    return;
  }

  const domain = prompt('Enter domain to block (e.g., youtube.com):');
  if (!domain || !domain.trim()) return;
  
  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  
  setSyncStatus('syncing', 'Adding...');
  try {
    const response = await sendMessage('ADD_BLOCKED_DOMAIN', { domain: cleanDomain });
    if (!response.error) {
      currentState.blockedDomains = response.blockedDomains;
      if (DOM.blockedDomainsValue) DOM.blockedDomainsValue.textContent = currentState.blockedDomains.length;
      renderDomainList();
      setSyncStatus('synced', 'Added');
      setTimeout(() => setSyncStatus('synced', 'Synced'), 2000);
    } else {
      setSyncStatus('error', 'Failed');
    }
  } catch (error) {
    setSyncStatus('error', 'Error');
    console.error('Add domain error:', error);
  }
};

const removeBlockedDomain = async (domain) => {
  if (currentState.focusMode && currentState.focusModeLocked) {
    setSyncStatus('error', 'Locked');
    return;
  }

  setSyncStatus('syncing', 'Removing...');
  try {
    const response = await sendMessage('REMOVE_BLOCKED_DOMAIN', { domain });
    if (!response.error) {
      currentState.blockedDomains = response.blockedDomains;
      if (DOM.blockedDomainsValue) DOM.blockedDomainsValue.textContent = currentState.blockedDomains.length;
      renderDomainList();
      setSyncStatus('synced', 'Removed');
      setTimeout(() => setSyncStatus('synced', 'Synced'), 2000);
    } else {
      setSyncStatus('error', 'Failed');
    }
  } catch (error) {
    setSyncStatus('error', 'Error');
    console.error('Remove domain error:', error);
  }
};

const syncNow = async () => {
  setSyncStatus('syncing', 'Syncing...');
  try {
    await sendMessage('SYNC_NOW');
    await loadState();
    setSyncStatus('synced', 'Synced');
    setTimeout(() => setSyncStatus('synced', 'Synced'), 2000);
  } catch (error) {
    setSyncStatus('error', 'Failed');
    console.error('Sync error:', error);
  }
};

const setupEventListeners = () => {
  if (DOM.startBtn) DOM.startBtn.addEventListener('click', startFocusMode);
  if (DOM.stopBtn) DOM.stopBtn.addEventListener('click', stopFocusMode);
  if (DOM.syncBtn) DOM.syncBtn.addEventListener('click', syncNow);
  if (DOM.addDomainBtn) DOM.addDomainBtn.addEventListener('click', addBlockedDomain);
};

const startRealtimeUpdates = () => {
  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(async () => {
    await loadState();
  }, 5000);
};

const init = async () => {
  setupEventListeners();
  await loadState();
  startRealtimeUpdates();
  
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FOCUS_MODE_CHANGE') {
      currentState.focusMode = message.data.enabled;
      if (typeof message.data.locked !== 'undefined') {
        currentState.focusModeLocked = !!message.data.locked;
      }
      updateUI();
    } else if (message.type === 'SITE_CHANGE') {
      currentState.currentDomain = message.data.domain;
      if (DOM.currentSiteText) {
        DOM.currentSiteText.textContent = currentState.currentDomain 
          ? `Current: ${currentState.currentDomain}` 
          : 'No active session';
      }
    }
    return true;
  });
};

init().catch(console.error);
