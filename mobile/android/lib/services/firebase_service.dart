import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// Custom exception for Firebase service operations to ensure clean architecture
/// and proper error boundary management.
class FirebaseServiceException implements Exception {
  final String message;
  final Object? originalError;

  FirebaseServiceException(this.message, [this.originalError]);

  @override
  String toString() =>
      'FirebaseServiceException: $message ${originalError != null ? '($originalError)' : ''}';
}

/// A singleton service to handle all Firebase Authentication and Firestore operations.
class FirebaseService {
  static final FirebaseService _instance = FirebaseService._internal();

  factory FirebaseService() {
    return _instance;
  }

  FirebaseService._internal();

  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Helper to get the current authenticated user's ID securely.
  String get _uid {
    final user = _auth.currentUser;
    if (user == null) {
      throw FirebaseServiceException('User is not authenticated.');
    }
    return user.uid;
  }

  /// Initializes the Firebase app.
  /// Must be called before using any other Firebase services.
  Future<void> initializeFirebase() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      throw FirebaseServiceException('Failed to initialize Firebase', e);
    }
  }

  /// Authenticates the user anonymously.
  /// Ideal for users who want to start tracking focus without creating an account immediately.
  Future<User?> signInAnonymously() async {
    try {
      final userCredential = await _auth.signInAnonymously();
      
      // Initialize basic user document if it's a new user
      if (userCredential.additionalUserInfo?.isNewUser ?? false) {
        await _firestore.collection('users').doc(userCredential.user!.uid).set({
          'createdAt': FieldValue.serverTimestamp(),
          'accountType': 'anonymous',
        }, SetOptions(merge: true));
      }

      return userCredential.user;
    } on FirebaseAuthException catch (e) {
      throw FirebaseServiceException('Firebase Auth Error: ${e.message}', e);
    } catch (e) {
      throw FirebaseServiceException('Failed to sign in anonymously', e);
    }
  }

  /// Saves a completed (or partial) focus session to Firestore.
  Future<void> saveFocusSession({
    required int durationInSeconds,
    required String sessionType,
    required bool isHardMode,
    bool completed = true,
  }) async {
    try {
      await _firestore
          .collection('users')
          .doc(_uid)
          .collection('focus_sessions')
          .add({
        'durationInSeconds': durationInSeconds,
        'sessionType': sessionType,
        'isHardMode': isHardMode,
        'completed': completed,
        'timestamp': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw FirebaseServiceException('Failed to save focus session', e);
    }
  }

  /// Fetches historical focus sessions for the current user.
  Future<List<Map<String, dynamic>>> getFocusSessions({int limit = 50}) async {
    try {
      final snapshot = await _firestore
          .collection('users')
          .doc(_uid)
          .collection('focus_sessions')
          .orderBy('timestamp', descending: true)
          .limit(limit)
          .get();

      return snapshot.docs.map((doc) {
        final data = doc.data();
        data['id'] = doc.id; // Inject the document ID for reference
        return data;
      }).toList();
    } catch (e) {
      throw FirebaseServiceException('Failed to fetch focus sessions', e);
    }
  }

  /// Provides a real-time stream of focus sessions for the current user.
  Stream<List<Map<String, dynamic>>> streamFocusSessions({int limit = 50}) {
    try {
      return _firestore
          .collection('users')
          .doc(_uid)
          .collection('focus_sessions')
          .orderBy('timestamp', descending: true)
          .limit(limit)
          .snapshots()
          .map((snapshot) => snapshot.docs.map((doc) {
                final data = doc.data();
                data['id'] = doc.id;
                return data;
              }).toList());
    } catch (e) {
      throw FirebaseServiceException('Failed to stream focus sessions', e);
    }
  }

  /// Syncs the user's blocked applications list to Firestore for cross-device consistency.
  Future<void> syncBlockedApps(List<String> apps) async {
    try {
      await _firestore.collection('users').doc(_uid).set({
        'settings': {
          'blockedApps': apps,
          'lastSynced': FieldValue.serverTimestamp(),
        }
      }, SetOptions(merge: true));
    } catch (e) {
      throw FirebaseServiceException('Failed to sync blocked apps', e);
    }
  }

  /// Syncs the user's blocked websites list to Firestore.
  Future<void> syncBlockedSites(List<String> sites) async {
    try {
      await _firestore.collection('users').doc(_uid).set({
        'settings': {
          'blockedSites': sites,
          'lastSynced': FieldValue.serverTimestamp(),
        }
      }, SetOptions(merge: true));
    } catch (e) {
      throw FirebaseServiceException('Failed to sync blocked sites', e);
    }
  }

  /// Provides a real-time stream of the user's sync settings.
  Stream<Map<String, dynamic>?> streamUserSettings() {
    try {
      return _firestore.collection('users').doc(_uid).snapshots().map((doc) {
        if (!doc.exists) return null;
        return doc.data()?['settings'] as Map<String, dynamic>?;
      });
    } catch (e) {
      throw FirebaseServiceException('Failed to stream user settings', e);
    }
  }
}