// shared/constants.js
// FocusSync Shared Constants
// Cross-platform application constants

// App Metadata
const APP_METADATA = {
  name: 'FocusSync',
  version: '2.0.0',
  author: 'FocusSync Team',
  description: 'Cross-platform productivity and focus management application',
  repository: 'https://github.com/devfaruk01/focussync-app',
  website: 'https://focussync.app',
  copyright: `© ${new Date().getFullYear()} FocusSync`,
  platforms: ['windows', 'linux', 'macos', 'chrome-extension', 'android']
};

// Focus Mode Constants
const FOCUS_MODE = {
  STATES: {
    INACTIVE: 'inactive',
    ACTIVE: 'active',
    PAUSED: 'paused',
    BREAK: 'break',
    EMERGENCY: 'emergency'
  },
  DEFAULT_DURATION: 60, // minutes
  MIN_DURATION: 5,
  MAX_DURATION: 480, // 8 hours
  BREAK_DURATION: 5, // minutes
  LONG_BREAK_DURATION: 15,
  SESSIONS_BEFORE_LONG_BREAK: 4,
  COUNTDOWN_TICK: 1000, // milliseconds
  REMINDER_INTERVAL: 300000, // 5 minutes
  IDLE_THRESHOLD: 300000 // 5 minutes
};

// Timer Defaults
const TIMER = {
  DEFAULT_WORK: 25, // Pomodoro work duration (minutes)
  DEFAULT_SHORT_BREAK: 5,
  DEFAULT_LONG_BREAK: 15,
  POMODORO_CYCLES: 4,
  UPDATE_INTERVAL: 100, // milliseconds
  SYNC_INTERVAL: 30000, // 30 seconds
  RETRY_DELAY: 5000, // 5 seconds
  MAX_RETRIES: 5,
  BACKOFF_MULTIPLIER: 2
};

// Notification Constants
const NOTIFICATIONS = {
  TYPES: {
    FOCUS_START: 'focus-start',
    FOCUS_END: 'focus-end',
    BREAK_REMINDER: 'break-reminder',
    ACHIEVEMENT: 'achievement',
    SYNC_COMPLETE: 'sync-complete',
    SYNC_ERROR: 'sync-error',
    EMERGENCY_UNLOCK: 'emergency-unlock',
    BLOCKED_ATTEMPT: 'blocked-attempt',
    PRODUCTIVITY_REPORT: 'productivity-report'
  },
  PRIORITIES: {
    LOW: 'low',
    NORMAL: 'normal',
    HIGH: 'high',
    URGENT: 'urgent'
  },
  DEFAULTS: {
    TIMEOUT: 5000, // milliseconds
    ICON_SIZE: 48,
    MAX_QUEUE_SIZE: 100
  }
};

// IPC Channel Names
const IPC_CHANNELS = {
  // Main -> Renderer
  FOCUS_STATE_CHANGED: 'focus-state-changed',
  TIMER_TICK: 'timer-tick',
  SESSION_COMPLETE: 'session-complete',
  BLOCKED_WEBSITE: 'blocked-website',
  SYNC_STATUS: 'sync-status',
  NOTIFICATION_TRIGGER: 'notification-trigger',
  ACTIVITY_UPDATE: 'activity-update',
  PRODUCTIVITY_SCORE: 'productivity-score',
  
  // Renderer -> Main
  START_FOCUS: 'start-focus',
  STOP_FOCUS: 'stop-focus',
  PAUSE_FOCUS: 'pause-focus',
  ADD_BLOCKED_DOMAIN: 'add-blocked-domain',
  REMOVE_BLOCKED_DOMAIN: 'remove-blocked-domain',
  REQUEST_STATS: 'request-stats',
  EMERGENCY_UNLOCK: 'emergency-unlock',
  SYNC_NOW: 'sync-now',
  
  // Bidirectional
  AUTH_STATUS: 'auth-status',
  USER_SETTINGS: 'user-settings',
  BLOCKLIST_UPDATE: 'blocklist-update'
};

// Firebase Collection Names
const FIREBASE_COLLECTIONS = {
  USERS: 'users',
  SESSIONS: 'focusSessions',
  ACTIVITIES: 'activities',
  BLOCKLIST: 'blocklists',
  TODOS: 'todos',
  NOTES: 'notes',
  STATS: 'statistics',
  ACHIEVEMENTS: 'achievements',
  SETTINGS: 'userSettings',
  SYNC_METADATA: 'syncMetadata',
  BLOCKED_ATTEMPTS: 'blockedAttempts',
  PRODUCTIVITY_REPORTS: 'productivityReports'
};

// Sync Event Names
const SYNC_EVENTS = {
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  SESSION_UPDATE: 'session:update',
  BLOCKLIST_ADD: 'blocklist:add',
  BLOCKLIST_REMOVE: 'blocklist:remove',
  TODO_CREATE: 'todo:create',
  TODO_UPDATE: 'todo:update',
  TODO_DELETE: 'todo:delete',
  NOTE_CREATE: 'note:create',
  NOTE_UPDATE: 'note:update',
  NOTE_DELETE: 'note:delete',
  ACTIVITY_LOG: 'activity:log',
  STATS_UPDATE: 'stats:update',
  SETTINGS_UPDATE: 'settings:update',
  SYNC_COMPLETE: 'sync:complete',
  SYNC_ERROR: 'sync:error',
  OFFLINE_QUEUE: 'offline:queue',
  CONFLICT_DETECTED: 'conflict:detected'
};

// Storage Keys
const STORAGE_KEYS = {
  USER_PREFS: 'userPreferences',
  BLOCKED_DOMAINS: 'blockedDomains',
  BLOCKED_APPS: 'blockedApps',
  FOCUS_HISTORY: 'focusHistory',
  ACTIVITY_LOG: 'activityLog',
  SYNC_QUEUE: 'syncQueue',
  LAST_SYNC: 'lastSyncTime',
  FOCUS_SETTINGS: 'focusSettings',
  NOTIFICATION_SETTINGS: 'notificationSettings',
  AUTH_TOKEN: 'authToken',
  USER_PROFILE: 'userProfile',
  OFFLINE_DATA: 'offlineData'
};

// API Endpoints
const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    VERIFY: '/api/auth/verify'
  },
  SYNC: {
    UPLOAD: '/api/sync/upload',
    DOWNLOAD: '/api/sync/download',
    CONFLICT: '/api/sync/conflict',
    STATUS: '/api/sync/status'
  },
  STATS: {
    DAILY: '/api/stats/daily',
    WEEKLY: '/api/stats/weekly',
    MONTHLY: '/api/stats/monthly',
    PRODUCTIVITY: '/api/stats/productivity'
  },
  BLOCKLIST: {
    GET: '/api/blocklist',
    ADD: '/api/blocklist/add',
    REMOVE: '/api/blocklist/remove',
    SYNC: '/api/blocklist/sync'
  }
};

// Error Codes
const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_FAILED: 'AUTH_FAILED',
  SYNC_FAILED: 'SYNC_FAILED',
  INVALID_CONFIG: 'INVALID_CONFIG',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  OFFLINE_MODE: 'OFFLINE_MODE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// Productivity Categories
const PRODUCTIVITY = {
  CATEGORIES: {
    HIGHLY_PRODUCTIVE: 'highly_productive',
    PRODUCTIVE: 'productive',
    NEUTRAL: 'neutral',
    DISTRACTED: 'distracted',
    HIGHLY_DISTRACTED: 'highly_distracted'
  },
  SCORES: {
    HIGHLY_PRODUCTIVE: 90,
    PRODUCTIVE: 70,
    NEUTRAL: 50,
    DISTRACTED: 30,
    HIGHLY_DISTRACTED: 10
  },
  WEIGHTS: {
    CODING: 1.2,
    LEARNING: 1.1,
    COMMUNICATION: 1.0,
    ENTERTAINMENT: 0.5,
    SOCIAL_MEDIA: 0.3,
    GAMING: 0.2
  }
};

// Platform Specific Paths
const PLATFORM_PATHS = {
  WINDOWS: {
    HOSTS: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
    APPDATA: '%APPDATA%\\FocusSync',
    LOCALAPPDATA: '%LOCALAPPDATA%\\FocusSync'
  },
  LINUX: {
    HOSTS: '/etc/hosts',
    CONFIG: '~/.config/focussync',
    DATA: '~/.local/share/focussync'
  },
  MACOS: {
    HOSTS: '/etc/hosts',
    CONFIG: '~/Library/Application Support/FocusSync',
    DATA: '~/Library/Application Support/FocusSync/data'
  }
};

// Logging Levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
};

// Default Settings
const DEFAULT_SETTINGS = {
  startOnBoot: false,
  minimizeToTray: true,
  showNotifications: true,
  playSounds: true,
  autoSync: true,
  syncInterval: 300, // seconds
  darkMode: true,
  language: 'en',
  timeFormat24h: true,
  weekStartMonday: true,
  dataRetentionDays: 30,
  maxOfflineEntries: 1000,
  allowEmergencyUnlock: true,
  requireConfirmation: true,
  logBlockedAttempts: true,
  anonymousAnalytics: false
};

// Export all constants
module.exports = {
  APP_METADATA,
  FOCUS_MODE,
  TIMER,
  NOTIFICATIONS,
  IPC_CHANNELS,
  FIREBASE_COLLECTIONS,
  SYNC_EVENTS,
  STORAGE_KEYS,
  API_ENDPOINTS,
  ERROR_CODES,
  PRODUCTIVITY,
  PLATFORM_PATHS,
  LOG_LEVELS,
  DEFAULT_SETTINGS
};