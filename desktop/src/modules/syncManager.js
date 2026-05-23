// desktop/src/modules/syncManager.js
const { EventEmitter } = require('events');
const { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, updateDoc, deleteDoc, Timestamp, writeBatch } = require('firebase/firestore');
const { getDatabase, ref, set, onValue, off, push, update } = require('firebase/database');
const fs = require('fs').promises;
const path = require('path');

class SyncManager extends EventEmitter {
  constructor(firebaseConfig, activityTracker) {
    super();
    this.firebase = firebaseConfig;
    this.activityTracker = activityTracker;
    this.db = null;
    this.realtimeDb = null;
    this.userId = null;
    this.isSyncing = false;
    this.syncQueue = [];
    this.retryQueue = [];
    this.listeners = new Map();
    this.offlineQueue = [];
    this.lastSyncTime = null;
    this.syncInterval = null;
    this.conflictResolutionStrategy = 'server-wins'; // or 'client-wins', 'manual'
    this.batchSize = 50;
    this.maxRetries = 5;
    this.retryDelay = 5000;
    this.isInitialized = false;
  }

  async initialize(userId) {
    if (!this.firebase.isInitialized) {
      await this.firebase.initialize();
    }
    
    this.db = this.firebase.db;
    this.realtimeDb = this.firebase.realtimeDb;
    this.userId = userId;
    
    await this.loadOfflineQueue();
    await this.startRealtimeListeners();
    this.startAutoSync();
    
    this.isInitialized = true;
    console.log('SyncManager initialized for user:', userId);
    
    return this;
  }

  async startRealtimeListeners() {
    if (!this.userId || !this.db) return;
    
    // Listen for focus sessions
    this.setupRealtimeListener('sessions', this.handleSessionChange.bind(this));
    
    // Listen for blocklist changes
    this.setupRealtimeListener('blocklist', this.handleBlocklistChange.bind(this));
    
    // Listen for todo changes
    this.setupRealtimeListener('todos', this.handleTodoChange.bind(this));
    
    // Listen for note changes
    this.setupRealtimeListener('notes', this.handleNoteChange.bind(this));
    
    // Listen for settings changes
    this.setupRealtimeListener('settings', this.handleSettingsChange.bind(this));
  }

  setupRealtimeListener(collectionName, callback) {
    const collectionRef = collection(this.db, `${FIREBASE_COLLECTIONS[collectionName.toUpperCase()]}_${this.userId}`);
    
    const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const data = { id: change.doc.id, ...change.doc.data() };
        callback(change.type, data);
      });
    }, (error) => {
      console.error(`Realtime listener error for ${collectionName}:`, error);
      this.emit('sync-error', { collection: collectionName, error: error.message });
    });
    
    this.listeners.set(collectionName, unsubscribe);
  }

  async handleSessionChange(changeType, sessionData) {
    this.emit('session-sync', { type: changeType, data: sessionData });
    
    if (changeType === 'added' || changeType === 'modified') {
      await this.activityTracker.logActivity('session_synced', sessionData);
    }
  }

  async handleBlocklistChange(changeType, blocklistData) {
    this.emit('blocklist-sync', { type: changeType, data: blocklistData });
    
    // Update local blocklist cache
    const blocklistPath = path.join(__dirname, '../../../config/blocklist_cache.json');
    try {
      let currentBlocklist = [];
      const exists = await fs.access(blocklistPath).then(() => true).catch(() => false);
      
      if (exists) {
        const data = await fs.readFile(blocklistPath, 'utf8');
        currentBlocklist = JSON.parse(data);
      }
      
      if (changeType === 'added') {
        currentBlocklist.push(blocklistData);
      } else if (changeType === 'modified') {
        const index = currentBlocklist.findIndex(item => item.id === blocklistData.id);
        if (index !== -1) currentBlocklist[index] = blocklistData;
      } else if (changeType === 'removed') {
        currentBlocklist = currentBlocklist.filter(item => item.id !== blocklistData.id);
      }
      
      await fs.writeFile(blocklistPath, JSON.stringify(currentBlocklist, null, 2));
    } catch (error) {
      console.error('Failed to update local blocklist cache:', error);
    }
  }

  async handleTodoChange(changeType, todoData) {
    this.emit('todo-sync', { type: changeType, data: todoData });
  }

  async handleNoteChange(changeType, noteData) {
    this.emit('note-sync', { type: changeType, data: noteData });
  }

  async handleSettingsChange(changeType, settingsData) {
    this.emit('settings-sync', { type: changeType, data: settingsData });
  }

  async syncFocusSession(session) {
    if (!this.userId || !this.db) {
      await this.queueForSync('session', session);
      return null;
    }
    
    try {
      const sessionRef = doc(this.db, `${FIREBASE_COLLECTIONS.SESSIONS}_${this.userId}`, session.id);
      const sessionDoc = await getDoc(sessionRef);
      
      if (sessionDoc.exists()) {
        // Resolve conflicts
        const resolvedData = await this.resolveConflict(sessionDoc.data(), session);
        await updateDoc(sessionRef, resolvedData);
      } else {
        await setDoc(sessionRef, {
          ...session,
          createdAt: Timestamp.fromDate(new Date(session.startTime)),
          updatedAt: Timestamp.now(),
          deviceId: process.env.DEVICE_ID || 'desktop'
        });
      }
      
      this.emit('sync-complete', { type: 'session', id: session.id });
      return { success: true, id: session.id };
      
    } catch (error) {
      console.error('Session sync failed:', error);
      await this.queueForRetry('session', session);
      this.emit('sync-error', { type: 'session', error: error.message });
      return { success: false, error: error.message };
    }
  }

  async syncBlocklist(blocklist) {
    if (!this.userId || !this.db) {
      await this.queueForSync('blocklist', blocklist);
      return null;
    }
    
    try {
      const batch = writeBatch(this.db);
      const blocklistRef = collection(this.db, `${FIREBASE_COLLECTIONS.BLOCKLIST}_${this.userId}`);
      
      for (const item of blocklist) {
        const docRef = doc(blocklistRef, item.id);
        batch.set(docRef, {
          ...item,
          updatedAt: Timestamp.now(),
          deviceId: process.env.DEVICE_ID || 'desktop'
        });
      }
      
      await batch.commit();
      this.emit('sync-complete', { type: 'blocklist', count: blocklist.length });
      return { success: true, count: blocklist.length };
      
    } catch (error) {
      console.error('Blocklist sync failed:', error);
      await this.queueForRetry('blocklist', blocklist);
      this.emit('sync-error', { type: 'blocklist', error: error.message });
      return { success: false, error: error.message };
    }
  }

  async syncActivityLog(activities) {
    if (!this.userId || !this.db || activities.length === 0) {
      if (activities.length > 0) await this.queueForSync('activities', activities);
      return null;
    }
    
    try {
      const batch = writeBatch(this.db);
      const activitiesRef = collection(this.db, `${FIREBASE_COLLECTIONS.ACTIVITIES}_${this.userId}`);
      
      for (const activity of activities.slice(0, this.batchSize)) {
        const docRef = doc(activitiesRef);
        batch.set(docRef, {
          ...activity,
          timestamp: Timestamp.fromDate(new Date(activity.timestamp)),
          deviceId: process.env.DEVICE_ID || 'desktop'
        });
      }
      
      await batch.commit();
      this.emit('sync-complete', { type: 'activities', count: Math.min(activities.length, this.batchSize) });
      return { success: true, count: Math.min(activities.length, this.batchSize) };
      
    } catch (error) {
      console.error('Activity sync failed:', error);
      await this.queueForRetry('activities', activities);
      this.emit('sync-error', { type: 'activities', error: error.message });
      return { success: false, error: error.message };
    }
  }

  async syncTodo(todo) {
    if (!this.userId || !this.db) {
      await this.queueForSync('todo', todo);
      return null;
    }
    
    try {
      const todoRef = doc(this.db, `${FIREBASE_COLLECTIONS.TODOS}_${this.userId}`, todo.id);
      await setDoc(todoRef, {
        ...todo,
        updatedAt: Timestamp.now(),
        deviceId: process.env.DEVICE_ID || 'desktop'
      });
      
      this.emit('sync-complete', { type: 'todo', id: todo.id });
      return { success: true, id: todo.id };
      
    } catch (error) {
      console.error('Todo sync failed:', error);
      await this.queueForRetry('todo', todo);
      this.emit('sync-error', { type: 'todo', error: error.message });
      return { success: false, error: error.message };
    }
  }

  async syncNote(note) {
    if (!this.userId || !this.db) {
      await this.queueForSync('note', note);
      return null;
    }
    
    try {
      const noteRef = doc(this.db, `${FIREBASE_COLLECTIONS.NOTES}_${this.userId}`, note.id);
      await setDoc(noteRef, {
        ...note,
        updatedAt: Timestamp.now(),
        deviceId: process.env.DEVICE_ID || 'desktop'
      });
      
      this.emit('sync-complete', { type: 'note', id: note.id });
      return { success: true, id: note.id };
      
    } catch (error) {
      console.error('Note sync failed:', error);
      await this.queueForRetry('note', note);
      this.emit('sync-error', { type: 'note', error: error.message });
      return { success: false, error: error.message };
    }
  }

  async resolveConflict(serverData, clientData) {
    switch (this.conflictResolutionStrategy) {
      case 'server-wins':
        return serverData;
      
      case 'client-wins':
        return clientData;
      
      case 'manual':
        this.emit('conflict-detected', { server: serverData, client: clientData });
        // Return merged data with timestamps
        return {
          ...clientData,
          ...serverData,
          serverTimestamp: serverData.updatedAt,
          clientTimestamp: clientData.updatedAt,
          mergedAt: Timestamp.now()
        };
      
      default:
        // Default to last write wins based on timestamp
        const serverTime = serverData.updatedAt?.toDate?.() || new Date(0);
        const clientTime = new Date(clientData.updatedAt || 0);
        return clientTime > serverTime ? clientData : serverData;
    }
  }

  async queueForSync(type, data) {
    this.syncQueue.push({
      id: `${type}_${Date.now()}_${Math.random()}`,
      type,
      data,
      timestamp: Date.now(),
      attempts: 0
    });
    
    await this.saveSyncQueue();
    this.processSyncQueue();
  }

  async queueForRetry(type, data) {
    this.retryQueue.push({
      id: `${type}_retry_${Date.now()}_${Math.random()}`,
      type,
      data,
      timestamp: Date.now(),
      attempts: 0
    });
    
    await this.saveRetryQueue();
    this.processRetryQueue();
  }

  async processSyncQueue() {
    if (this.isSyncing || this.syncQueue.length === 0) return;
    
    this.isSyncing = true;
    const item = this.syncQueue.shift();
    
    try {
      switch (item.type) {
        case 'session':
          await this.syncFocusSession(item.data);
          break;
        case 'blocklist':
          await this.syncBlocklist(item.data);
          break;
        case 'activities':
          await this.syncActivityLog(item.data);
          break;
        case 'todo':
          await this.syncTodo(item.data);
          break;
        case 'note':
          await this.syncNote(item.data);
          break;
      }
      
      await this.saveSyncQueue();
    } catch (error) {
      console.error('Queue processing error:', error);
      this.syncQueue.unshift(item);
    } finally {
      this.isSyncing = false;
      if (this.syncQueue.length > 0) {
        setTimeout(() => this.processSyncQueue(), 1000);
      }
    }
  }

  async processRetryQueue() {
    if (this.retryQueue.length === 0) return;
    
    for (let i = 0; i < this.retryQueue.length; i++) {
      const item = this.retryQueue[i];
      
      if (item.attempts >= this.maxRetries) {
        this.retryQueue.splice(i, 1);
        this.emit('sync-failed', { type: item.type, id: item.id });
        continue;
      }
      
      item.attempts++;
      const delay = this.retryDelay * Math.pow(this.retryBackoffMultiplier, item.attempts);
      
      setTimeout(async () => {
        try {
          switch (item.type) {
            case 'session':
              await this.syncFocusSession(item.data);
              break;
            case 'blocklist':
              await this.syncBlocklist(item.data);
              break;
            case 'activities':
              await this.syncActivityLog(item.data);
              break;
          }
          
          const index = this.retryQueue.findIndex(q => q.id === item.id);
          if (index !== -1) this.retryQueue.splice(index, 1);
          await this.saveRetryQueue();
          
        } catch (error) {
          console.error(`Retry ${item.attempts} failed for ${item.type}:`, error);
        }
      }, delay);
    }
  }

  async saveSyncQueue() {
    const queuePath = path.join(__dirname, '../../../data/sync_queue.json');
    try {
      await fs.writeFile(queuePath, JSON.stringify(this.syncQueue, null, 2));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  async saveRetryQueue() {
    const retryPath = path.join(__dirname, '../../../data/retry_queue.json');
    try {
      await fs.writeFile(retryPath, JSON.stringify(this.retryQueue, null, 2));
    } catch (error) {
      console.error('Failed to save retry queue:', error);
    }
  }

  async loadOfflineQueue() {
    const queuePath = path.join(__dirname, '../../../data/sync_queue.json');
    const retryPath = path.join(__dirname, '../../../data/retry_queue.json');
    
    try {
      const queueData = await fs.readFile(queuePath, 'utf8');
      this.syncQueue = JSON.parse(queueData);
    } catch (error) {
      this.syncQueue = [];
    }
    
    try {
      const retryData = await fs.readFile(retryPath, 'utf8');
      this.retryQueue = JSON.parse(retryData);
    } catch (error) {
      this.retryQueue = [];
    }
  }

  startAutoSync() {
    this.syncInterval = setInterval(async () => {
      if (navigator.onLine !== false) {
        await this.processSyncQueue();
        await this.processRetryQueue();
        await this.syncMetadata();
      }
    }, TIMER.SYNC_INTERVAL);
  }

  async syncMetadata() {
    if (!this.userId || !this.db) return;
    
    try {
      const metadataRef = doc(this.db, `${FIREBASE_COLLECTIONS.SYNC_METADATA}_${this.userId}`, 'latest');
      await setDoc(metadataRef, {
        lastSync: Timestamp.now(),
        deviceId: process.env.DEVICE_ID || 'desktop',
        syncVersion: APP_METADATA.version
      }, { merge: true });
      
      this.lastSyncTime = Date.now();
      this.emit('metadata-synced', { lastSync: this.lastSyncTime });
      
    } catch (error) {
      console.error('Metadata sync failed:', error);
    }
  }

  async forceFullSync() {
    this.emit('full-sync-start');
    
    try {
      // Sync all pending data
      await this.processSyncQueue();
      await this.processRetryQueue();
      
      // Sync current session
      const currentSession = this.activityTracker.getCurrentSession();
      if (currentSession) {
        await this.syncFocusSession(currentSession);
      }
      
      // Sync today's stats
      const todayStats = await this.activityTracker.getDailyReport();
      await this.syncActivityLog([todayStats]);
      
      this.emit('full-sync-complete');
      return { success: true };
      
    } catch (error) {
      console.error('Full sync failed:', error);
      this.emit('full-sync-error', error);
      return { success: false, error: error.message };
    }
  }

  stopRealtimeListeners() {
    for (const [name, unsubscribe] of this.listeners) {
      try {
        unsubscribe();
      } catch (error) {
        console.error(`Failed to stop listener for ${name}:`, error);
      }
    }
    this.listeners.clear();
  }

  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    this.stopRealtimeListeners();
    this.isInitialized = false;
    console.log('SyncManager destroyed');
  }

  getSyncStatus() {
    return {
      isInitialized: this.isInitialized,
      isSyncing: this.isSyncing,
      queueLength: this.syncQueue.length,
      retryQueueLength: this.retryQueue.length,
      lastSyncTime: this.lastSyncTime,
      userId: this.userId
    };
  }
}

module.exports = SyncManager;