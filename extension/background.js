// extension/background.js
// FocusSync Background Service Worker - Manifest V3

// ============================================
// IMPORTS & INITIALIZATION
// ============================================

let currentTabId = null;
let currentDomain = null;
let sessionStartTime = null;
let isFocusMode = false;
let blockedDomains = [];
let activityQueue = [];
let syncInterval = null;
let desktopWS = null;
let reconnectAttempts = 0;

const SYNC_INTERVAL_MS = 30000;
const ACTIVITY_BATCH_SIZE = 50;
const MAX_RECONNECT_ATTEMPTS = 5;
const IDLE_THRESHOLD_SECONDS = 60;

// ============================================
// HELPER FUNCTIONS
// ============================================

const extractDomain = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

const isValidMessage = (message, requiredFields = []) => {
  if (!message || typeof message !== 'object') return false;
  return requiredFields.every(field => field in message);
};

const sendToFirebase = async (collection, data) => {
  try {
    const settings = await chrome.storage.local.get(['firebaseConfig', 'userId']);
    if (!settings.firebaseConfig || !settings.userId) return;
    
    const { apiKey, projectId } = settings.firebaseConfig;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        fields: {
          ...data,
          userId: { stringValue: settings.userId },
          timestamp: { timestampValue: new Date().toISOString() }
        }
      })
    });
    
    if (!response.ok) throw new Error('Firebase sync failed');
    return await response.json();
  } catch (error) {
    console.error('Firebase sync error:', error);
    return null;
  }
};

const getAuthToken = async () => {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      resolve(token || null);
    });
  });
};

const flushActivityQueue = async () => {
  if (activityQueue.length === 0) return;
  
  const batch = activityQueue.slice(0, ACTIVITY_BATCH_SIZE);
  activityQueue = activityQueue.slice(batch.length);
  
  for (const activity of batch) {
    await sendToFirebase('activities', activity);
  }
};

const logActivity = async (domain, duration, isBlocked = false) => {
  const activity = {
    domain,
    duration,
    isBlocked,
    timestamp: Date.now(),
    focusMode: isFocusMode
  };
  
  activityQueue.push(activity);
  
  if (activityQueue.length >= ACTIVITY_BATCH_SIZE) {
    await flushActivityQueue();
  }
  
  // Send to desktop app if connected
  if (desktopWS && desktopWS.readyState === WebSocket.OPEN) {
    desktopWS.send(JSON.stringify({
      type: 'ACTIVITY_UPDATE',
      data: activity
    }));
  }
};

const updateCurrentSession = async (tabId, url) => {
  if (!url || !url.startsWith('http')) return;
  
  const newDomain = extractDomain(url);
  const now = Date.now();
  
  // End current session
  if (currentDomain && sessionStartTime && currentDomain !== newDomain) {
    const duration = Math.floor((now - sessionStartTime) / 1000);
    if (duration > 0) {
      await logActivity(currentDomain, duration, isBlockedDomain(currentDomain));
    }
  }
  
  // Start new session
  currentDomain = newDomain;
  sessionStartTime = now;
  currentTabId = tabId;
  
  // Check if blocked
  if (isFocusMode && isBlockedDomain(newDomain)) {
    await redirectBlockedSite(tabId, url);
  }
  
  // Notify listeners
  await chrome.runtime.sendMessage({
    type: 'SITE_CHANGE',
    data: { domain: newDomain, isBlocked: isBlockedDomain(newDomain) }
  }).catch(() => {});
};

const isBlockedDomain = (domain) => {
  if (!domain) return false;
  return blockedDomains.some(blocked => 
    domain.includes(blocked) || blocked.includes(domain)
  );
};

const redirectBlockedSite = async (tabId, url) => {
  const redirectUrl = chrome.runtime.getURL('blocked.html');
  await chrome.tabs.update(tabId, { url: redirectUrl });
  
  await logActivity(extractDomain(url), 0, true);
};

const handleTabUpdate = async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active && tab.url) {
    await updateCurrentSession(tabId, tab.url);
  }
};

const handleTabActivated = async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab && tab.url) {
    await updateCurrentSession(activeInfo.tabId, tab.url);
  }
};

const checkIdleState = async () => {
  const idleState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
  
  if (idleState === 'idle' && currentDomain && sessionStartTime) {
    await logActivity(currentDomain, Math.floor((Date.now() - sessionStartTime) / 1000), isBlockedDomain(currentDomain));
    sessionStartTime = null;
    currentDomain = null;
  } else if (idleState === 'active' && !currentDomain && currentTabId) {
    const tab = await chrome.tabs.get(currentTabId);
    if (tab && tab.url) {
      await updateCurrentSession(currentTabId, tab.url);
    }
  }
};

// ============================================
// FOCUS MODE MANAGEMENT
// ============================================

const updateFocusMode = async (enabled, domains = []) => {
  isFocusMode = enabled;
  blockedDomains = domains;
  
  await chrome.storage.local.set({ 
    focusModeEnabled: enabled,
    blockedDomains: domains 
  });
  
  // If enabling focus mode, check current tab
  if (enabled) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && isBlockedDomain(extractDomain(tab.url))) {
      await redirectBlockedSite(tab.id, tab.url);
    }
  }
  
  await chrome.runtime.sendMessage({
    type: 'FOCUS_MODE_CHANGE',
    data: { enabled, domains }
  }).catch(() => {});
  
  // Sync to Firebase
  await sendToFirebase('focusSessions', {
    enabled: { booleanValue: enabled },
    domains: { arrayValue: { values: domains.map(d => ({ stringValue: d })) } },
    startTime: { timestampValue: new Date().toISOString() }
  });
};

// ============================================
// DESKTOP APP COMMUNICATION
// ============================================

const initDesktopWebSocket = () => {
  if (desktopWS && desktopWS.readyState === WebSocket.OPEN) return;
  
  desktopWS = new WebSocket('ws://localhost:8765');
  
  desktopWS.onopen = () => {
    console.log('Desktop app connected');
    reconnectAttempts = 0;
  };
  
  desktopWS.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      if (isValidMessage(message, ['type'])) {
        switch (message.type) {
          case 'SET_FOCUS_MODE':
            await updateFocusMode(message.enabled, message.domains);
            break;
          case 'REQUEST_STATS':
            await sendStatsToDesktop();
            break;
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };
  
  desktopWS.onerror = () => {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(initDesktopWebSocket, 5000 * Math.pow(2, reconnectAttempts));
      reconnectAttempts++;
    }
  };
  
  desktopWS.onclose = () => {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(initDesktopWebSocket, 5000);
      reconnectAttempts++;
    }
  };
};

const sendStatsToDesktop = async () => {
  if (!desktopWS || desktopWS.readyState !== WebSocket.OPEN) return;
  
  const stats = await getActivityStats();
  desktopWS.send(JSON.stringify({
    type: 'STATS_RESPONSE',
    data: stats
  }));
};

const getActivityStats = async () => {
  const now = Date.now();
  const today = new Date().setHours(0, 0, 0, 0);
  
  return {
    today: activityQueue.filter(a => a.timestamp > today),
    totalBlocked: activityQueue.filter(a => a.isBlocked).length,
    focusMode: isFocusMode,
    currentDomain
  };
};

// ============================================
// MESSAGE HANDLING
// ============================================

const messageHandlers = {
  'GET_STATE': async () => ({
    focusMode: isFocusMode,
    blockedDomains,
    currentDomain,
    active: !!currentDomain
  }),
  
  'SET_FOCUS_MODE': async (message) => {
    if (!isValidMessage(message, ['enabled'])) return { error: 'Invalid message' };
    await updateFocusMode(message.enabled, message.domains || []);
    return { success: true };
  },
  
  'ADD_BLOCKED_DOMAIN': async (message) => {
    if (!isValidMessage(message, ['domain'])) return { error: 'Invalid message' };
    if (!blockedDomains.includes(message.domain)) {
      blockedDomains.push(message.domain);
      await chrome.storage.local.set({ blockedDomains });
    }
    return { success: true, blockedDomains };
  },
  
  'REMOVE_BLOCKED_DOMAIN': async (message) => {
    if (!isValidMessage(message, ['domain'])) return { error: 'Invalid message' };
    blockedDomains = blockedDomains.filter(d => d !== message.domain);
    await chrome.storage.local.set({ blockedDomains });
    return { success: true, blockedDomains };
  },
  
  'SYNC_NOW': async () => {
    await flushActivityQueue();
    return { success: true };
  },
  
  'GET_STATS': async () => await getActivityStats(),
  
  'LOG_MANUAL': async (message) => {
    if (!isValidMessage(message, ['domain', 'duration'])) return { error: 'Invalid message' };
    await logActivity(message.domain, message.duration, message.isBlocked || false);
    return { success: true };
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isValidMessage(message, ['type'])) {
    sendResponse({ error: 'Invalid message format' });
    return true;
  }
  
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true;
  }
  
  sendResponse({ error: 'Unknown message type' });
  return true;
});

// ============================================
// ALARM & PERIODIC TASKS
// ============================================

const initAlarms = () => {
  chrome.alarms.create('flushActivityQueue', { periodInMinutes: 0.5 });
  chrome.alarms.create('idleCheck', { periodInMinutes: 1 });
  chrome.alarms.create('syncFirebase', { periodInMinutes: 2 });
};

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case 'flushActivityQueue':
      await flushActivityQueue();
      break;
    case 'idleCheck':
      await checkIdleState();
      break;
    case 'syncFirebase':
      await flushActivityQueue();
      // Also sync focus mode state
      await sendToFirebase('focusSessions', {
        active: { booleanValue: isFocusMode },
        timestamp: { timestampValue: new Date().toISOString() }
      });
      break;
  }
});

// ============================================
// STORAGE & INITIALIZATION
// ============================================

const loadSettings = async () => {
  const data = await chrome.storage.local.get([
    'focusModeEnabled', 
    'blockedDomains',
    'firebaseConfig',
    'userId'
  ]);
  
  isFocusMode = data.focusModeEnabled || false;
  blockedDomains = data.blockedDomains || [];
  
  if (data.firebaseConfig && data.userId) {
    initDesktopWebSocket();
    syncInterval = setInterval(flushActivityQueue, SYNC_INTERVAL_MS);
  }
};

// ============================================
// EVENT LISTENERS
// ============================================

chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.tabs.onActivated.addListener(handleTabActivated);
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === currentTabId && currentDomain && sessionStartTime) {
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    if (duration > 0) {
      await logActivity(currentDomain, duration, isBlockedDomain(currentDomain));
    }
    currentDomain = null;
    sessionStartTime = null;
    currentTabId = null;
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    if (currentDomain && sessionStartTime) {
      const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
      await logActivity(currentDomain, duration, isBlockedDomain(currentDomain));
      currentDomain = null;
      sessionStartTime = null;
    }
  } else {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab && tab.url) {
      await updateCurrentSession(tab.id, tab.url);
    }
  }
});

// ============================================
// SERVICE WORKER LIFECYCLE
// ============================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
  loadSettings();
  initAlarms();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
  loadSettings();
});

loadSettings().catch(console.error);