// desktop/firebase/firebaseConfig.js
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore, connectFirestoreEmulator, enableIndexedDbPersistence } = require('firebase/firestore');
const { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence } = require('firebase/auth');
const { getDatabase, connectDatabaseEmulator } = require('firebase/database');
const { getStorage, connectStorageEmulator } = require('firebase/storage');
const fs = require('fs');
const path = require('path');

class FirebaseConfig {
  constructor() {
    this.app = null;
    this.db = null;
    this.auth = null;
    this.realtimeDb = null;
    this.storage = null;
    this.isInitialized = false;
    this.useEmulators = false;
    this.configPath = null;
  }

  async initialize(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../../config/firebase.json');
    
    try {
      const firebaseConfig = await this.loadFirebaseConfig();
      
      if (!firebaseConfig || !this.validateConfig(firebaseConfig)) {
        throw new Error('Invalid Firebase configuration');
      }
      
      // Initialize or get existing app
      this.app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      
      // Initialize services
      this.db = getFirestore(this.app);
      this.auth = getAuth(this.app);
      this.realtimeDb = getDatabase(this.app);
      this.storage = getStorage(this.app);
      
      // Enable offline persistence for Firestore
      if (typeof window !== 'undefined' && this.db) {
        await enableIndexedDbPersistence(this.db).catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
          } else if (err.code === 'unimplemented') {
            console.warn('The current browser does not support all of the features required for persistence');
          }
        });
      }
      
      // Set auth persistence
      if (this.auth) {
        await setPersistence(this.auth, browserLocalPersistence);
      }
      
      // Setup emulators for development
      if (this.useEmulators && process.env.NODE_ENV === 'development') {
        this.setupEmulators();
      }
      
      this.isInitialized = true;
      console.log('Firebase initialized successfully');
      
      return {
        app: this.app,
        db: this.db,
        auth: this.auth,
        realtimeDb: this.realtimeDb,
        storage: this.storage
      };
      
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      throw new Error(`Firebase initialization error: ${error.message}`);
    }
  }

  async loadFirebaseConfig() {
    try {
      // Try to load from environment variables first
      if (process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID) {
        return {
          apiKey: process.env.FIREBASE_API_KEY,
          authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
          projectId: process.env.FIREBASE_PROJECT_ID,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
          messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.FIREBASE_APP_ID,
          measurementId: process.env.FIREBASE_MEASUREMENT_ID,
          databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
        };
      }
      
      // Try to load from config file
      if (fs.existsSync(this.configPath)) {
        const configData = await fs.promises.readFile(this.configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Check if emulators should be used
        this.useEmulators = config.useEmulators || false;
        
        return {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
          measurementId: config.measurementId,
          databaseURL: config.databaseURL
        };
      }
      
      throw new Error('No Firebase configuration found');
      
    } catch (error) {
      console.error('Failed to load Firebase config:', error);
      throw error;
    }
  }

  validateConfig(config) {
    const requiredFields = ['apiKey', 'projectId'];
    const missingFields = requiredFields.filter(field => !config[field]);
    
    if (missingFields.length > 0) {
      console.error(`Missing required Firebase config fields: ${missingFields.join(', ')}`);
      return false;
    }
    
    // Validate API key format (basic check)
    if (config.apiKey && !config.apiKey.match(/^AIza[0-9A-Za-z\-_]{35}$/)) {
      console.warn('Firebase API key format looks invalid');
    }
    
    return true;
  }

  setupEmulators() {
    try {
      // Firestore emulator
      if (this.db && process.env.FIREBASE_EMULATOR_HOST) {
        connectFirestoreEmulator(this.db, 'localhost', 8080);
      }
      
      // Auth emulator
      if (this.auth && process.env.FIREBASE_AUTH_EMULATOR_HOST) {
        connectAuthEmulator(this.auth, 'http://localhost:9099');
      }
      
      // Realtime Database emulator
      if (this.realtimeDb && process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
        connectDatabaseEmulator(this.realtimeDb, 'localhost', 9000);
      }
      
      // Storage emulator
      if (this.storage && process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
        connectStorageEmulator(this.storage, 'localhost', 9199);
      }
      
      console.log('Firebase emulators connected');
    } catch (error) {
      console.error('Failed to setup emulators:', error);
    }
  }

  async checkConnection() {
    try {
      if (!this.isInitialized) {
        return { connected: false, error: 'Firebase not initialized' };
      }
      
      // Test Firestore connection
      const testDocRef = this.db.collection('_test').doc('connection');
      await testDocRef.set({ timestamp: Date.now() });
      await testDocRef.delete();
      
      return { connected: true, latency: Date.now() - this._lastTestTime };
    } catch (error) {
      console.error('Firebase connection check failed:', error);
      return { connected: false, error: error.message };
    }
  }

  async signOut() {
    try {
      if (this.auth) {
        await this.auth.signOut();
        return { success: true };
      }
      return { success: false, error: 'Auth not initialized' };
    } catch (error) {
      console.error('Sign out failed:', error);
      return { success: false, error: error.message };
    }
  }

  getCurrentUser() {
    if (this.auth && this.auth.currentUser) {
      return {
        uid: this.auth.currentUser.uid,
        email: this.auth.currentUser.email,
        displayName: this.auth.currentUser.displayName,
        photoURL: this.auth.currentUser.photoURL,
        emailVerified: this.auth.currentUser.emailVerified
      };
    }
    return null;
  }

  async onAuthStateChange(callback) {
    if (this.auth) {
      return this.auth.onAuthStateChange(callback);
    }
    return () => {};
  }

  destroy() {
    this.isInitialized = false;
    this.app = null;
    this.db = null;
    this.auth = null;
    this.realtimeDb = null;
    this.storage = null;
  }
}

module.exports = new FirebaseConfig();