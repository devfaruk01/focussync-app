import 'dart:async';
import 'dart:developer' as developer;
import 'dart:math' as math;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Represents the current state of the synchronization engine.
enum SyncStatus {
  idle,
  connecting,
  syncing,
  synced,
  offline,
  error,
}

/// Custom exception for Sync operations.
class SyncException implements Exception {
  final String message;
  final Object? originalError;

  SyncException(this.message, [this.originalError]);

  @override
  String toString() => 'SyncException: $message ${originalError ?? ''}';
}

/// A highly resilient service responsible for synchronizing data across
/// Desktop and Mobile platforms using Firebase Firestore real-time capabilities.
/// Supports offline persistence, background syncing, and automatic retries.
class SyncService {
  static final SyncService _instance = SyncService._internal();

  factory SyncService() {
    return _instance;
  }

  SyncService._internal() {
    _initOfflinePersistence();
    _authSubscription = _auth.authStateChanges().listen((user) {
      if (user != null) {
        _uid = user.uid;
        _updateStatus(SyncStatus.synced);
      } else {
        _uid = null;
        _updateStatus(SyncStatus.offline);
      }
    });
  }

  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  String? _uid;
  StreamSubscription<User?>? _authSubscription;

  final StreamController<SyncStatus> _statusController =
      StreamController<SyncStatus>.broadcast();

  /// Stream of the current synchronization status.
  Stream<SyncStatus> get syncStatusStream => _statusController.stream;

  /// Ensures offline persistence is explicitly enabled for offline-first architecture.
  void _initOfflinePersistence() {
    try {
      _firestore.settings = const Settings(
        persistenceEnabled: true,
        cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
      );
    } catch (e) {
      developer.log('Firestore persistence already enabled or failed: $e');
    }
  }

  void _updateStatus(SyncStatus status) {
    if (!_statusController.isClosed) {
      _statusController.add(status);
    }
  }

  void dispose() {
    _authSubscription?.cancel();
    _statusController.close();
  }

  void _checkAuth() {
    if (_uid == null) {
      throw SyncException('User is not authenticated. Cannot perform sync.');
    }
  }

  // ===========================================================================
  // REAL-TIME LISTENERS (DESKTOP <-> MOBILE)
  // ===========================================================================

  /// Listens to real-time session state to sync active focus timers across devices.
  Stream<Map<String, dynamic>?> streamActiveSession() {
    _checkAuth();
    return _firestore
        .collection('users')
        .doc(_uid)
        .collection('sync_state')
        .doc('active_session')
        .snapshots()
        .map((doc) => doc.exists ? doc.data() : null)
        .handleError((error) {
      _updateStatus(SyncStatus.error);
      throw SyncException('Failed to stream active session', error);
    });
  }

  /// Listens to real-time changes in blocked applications.
  Stream<List<String>> streamBlockedApps() {
    _checkAuth();
    return _firestore
        .collection('users')
        .doc(_uid)
        .collection('sync_state')
        .doc('blocked_apps')
        .snapshots()
        .map((doc) {
      if (!doc.exists) return <String>[];
      final data = doc.data();
      return List<String>.from(data?['apps'] ?? []);
    }).handleError((error) {
      throw SyncException('Failed to stream blocked apps', error);
    });
  }

  /// Listens to real-time changes in blocked websites.
  Stream<List<String>> streamBlockedSites() {
    _checkAuth();
    return _firestore
        .collection('users')
        .doc(_uid)
        .collection('sync_state')
        .doc('blocked_sites')
        .snapshots()
        .map((doc) {
      if (!doc.exists) return <String>[];
      final data = doc.data();
      return List<String>.from(data?['sites'] ?? []);
    }).handleError((error) {
      throw SyncException('Failed to stream blocked sites', error);
    });
  }

  /// Streams real-time Todo items.
  Stream<List<Map<String, dynamic>>> streamTodos() {
    _checkAuth();
    return _firestore
        .collection('users')
        .doc(_uid)
        .collection('todos')
        .orderBy('updatedAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) {
              final data = doc.data();
              data['id'] = doc.id;
              return data;
            }).toList())
        .handleError((error) {
      throw SyncException('Failed to stream todos', error);
    });
  }

  /// Streams real-time Notes items.
  Stream<List<Map<String, dynamic>>> streamNotes() {
    _checkAuth();
    return _firestore
        .collection('users')
        .doc(_uid)
        .collection('notes')
        .orderBy('updatedAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) {
              final data = doc.data();
              data['id'] = doc.id;
              return data;
            }).toList())
        .handleError((error) {
      throw SyncException('Failed to stream notes', error);
    });
  }

  // ===========================================================================
  // DATA MUTATIONS WITH RETRY MECHANISM
  // ===========================================================================

  /// Updates the active focus session state globally across all user devices.
  Future<void> syncActiveSessionState(Map<String, dynamic> sessionData) async {
    _checkAuth();
    sessionData['updatedAt'] = FieldValue.serverTimestamp();
    
    await _executeWithRetry(() async {
      await _firestore
          .collection('users')
          .doc(_uid)
          .collection('sync_state')
          .doc('active_session')
          .set(sessionData, SetOptions(merge: true));
    });
  }

  /// Syncs the list of blocked apps.
  Future<void> syncBlockedApps(List<String> apps) async {
    _checkAuth();
    await _executeWithRetry(() async {
      await _firestore
          .collection('users')
          .doc(_uid)
          .collection('sync_state')
          .doc('blocked_apps')
          .set({
        'apps': apps,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });
  }

  /// Syncs the list of blocked websites.
  Future<void> syncBlockedSites(List<String> sites) async {
    _checkAuth();
    await _executeWithRetry(() async {
      await _firestore
          .collection('users')
          .doc(_uid)
          .collection('sync_state')
          .doc('blocked_sites')
          .set({
        'sites': sites,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
    });
  }

  /// Adds or updates a Todo item across devices.
  Future<void> syncTodo(String id, Map<String, dynamic> todoData) async {
    _checkAuth();
    todoData['updatedAt'] = FieldValue.serverTimestamp();
    
    await _executeWithRetry(() async {
      await _firestore
          .collection('users')
          .doc(_uid)
          .collection('todos')
          .doc(id)
          .set(todoData, SetOptions(merge: true));
    });
  }

  /// Adds or updates a Note across devices.
  Future<void> syncNote(String id, Map<String, dynamic> noteData) async {
    _checkAuth();
    noteData['updatedAt'] = FieldValue.serverTimestamp();
    
    await _executeWithRetry(() async {
      await _firestore
          .collection('users')
          .doc(_uid)
          .collection('notes')
          .doc(id)
          .set(noteData, SetOptions(merge: true));
    });
  }

  // ===========================================================================
  // BACKGROUND / LIFECYCLE MANAGEMENT
  // ===========================================================================

  /// To be called by a background execution manager (e.g. Workmanager) to ensure
  /// offline cached writes are pushed to the server if network is available.
  Future<bool> performBackgroundSync() async {
    try {
      _updateStatus(SyncStatus.syncing);
      // Wait for Auth to initialize if called from a cold background isolate
      if (_auth.currentUser == null) {
        await _auth.authStateChanges().firstWhere((user) => user != null);
      }
      _uid = _auth.currentUser?.uid;
      _checkAuth();
      
      // Attempting to reconnect the network forces Firestore to flush local writes
      await _firestore.enableNetwork();
      
      // Do a lightweight read to ensure connection is actually alive
      await _firestore
          .collection('users')
          .doc(_uid)
          .collection('sync_state')
          .doc('ping')
          .set({'lastPing': FieldValue.serverTimestamp()});
          
      _updateStatus(SyncStatus.synced);
      return true;
    } catch (e) {
      _updateStatus(SyncStatus.error);
      developer.log('Background sync failed: $e');
      return false; // Tells background worker to retry later
    }
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /// Executes a Future with an exponential backoff retry mechanism.
  /// Safeguards against transient network drops while writing.
  Future<void> _executeWithRetry(
    Future<void> Function() action, {
    int maxAttempts = 3,
  }) async {
    int attempt = 0;
    while (attempt < maxAttempts) {
      try {
        if (attempt == 0) {
          _updateStatus(SyncStatus.syncing);
        }
        await action();
        _updateStatus(SyncStatus.synced);
        return;
      } catch (e) {
        attempt++;
        if (attempt >= maxAttempts) {
          _updateStatus(SyncStatus.error);
          throw SyncException('Operation failed after $maxAttempts attempts', e);
        }
        // Exponential backoff: 2s, 4s, 8s...
        final delayMs = math.pow(2, attempt) * 1000;
        _updateStatus(SyncStatus.offline);
        developer.log('Sync action failed, retrying in ${delayMs}ms...', error: e);
        await Future.delayed(Duration(milliseconds: delayMs.toInt()));
      }
    }
  }
}
