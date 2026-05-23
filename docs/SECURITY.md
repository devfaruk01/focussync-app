# SECURITY.md
# FocusSync — Security Architecture & Hardening Reference
> **Classification:** Internal Engineering — Required Reading for All Contributors
> **Version:** 1.0.0 | **Authority:** MASTER_RULES.md §4 | **Last Updated:** 2026-05-22
> **Scope:** Electron Desktop (Linux + Windows) · Flutter Android · Chrome Extension · Firebase Backend

---

## SECURITY AXIOMS

These are not guidelines. They are load-bearing constraints. Violating any one of them constitutes a critical defect.

```
AXIOM 1  —  The focus lock is the product. Bypassing it is the worst bug.
AXIOM 2  —  No client is trusted. All privilege is enforced server-side.
AXIOM 3  —  Secrets never touch source control. Not even for one commit.
AXIOM 4  —  Elevation is explicit. No operation silently acquires more access than declared.
AXIOM 5  —  Every privileged action is audited. Silently succeeding is not enough.
```

---

## TABLE OF CONTENTS

1. [Hosts File Protection](#1-hosts-file-protection)
2. [Electron Security Hardening](#2-electron-security-hardening)
3. [Firebase Security Rules](#3-firebase-security-rules)
4. [Permission Model](#4-permission-model)
5. [Chrome Extension Safety](#5-chrome-extension-safety)
6. [Data Encryption Policy](#6-data-encryption-policy)
7. [Recovery System](#7-recovery-system)
8. [Threat Model](#8-threat-model)
9. [Security Audit Checklist](#9-security-audit-checklist)
10. [Incident Response](#10-incident-response)

---

## 1. HOSTS FILE PROTECTION

The hosts file is FocusSync's primary OS-level enforcement mechanism on desktop. It is the highest-privilege file the application touches. Its protection is correspondingly rigorous.

### 1.1 Architecture: Privileged Helper Process

Direct modification of the hosts file from the Electron main process is **forbidden**. Instead, a dedicated privileged helper handles all hosts file operations:

```
Renderer Process
      │  IPC (contextBridge — validated schema)
      ▼
Main Process (HostsManager.js)
      │  Spawns with elevated privileges
      ▼
Privileged Helper (focussync-hostshelper)
      │  Atomic write
      ▼
  /etc/hosts  (Linux)
  C:\Windows\System32\drivers\etc\hosts  (Windows)
```

**Why a helper process?**

The Electron renderer and main process run as the logged-in user. The hosts file requires root/Administrator. Elevating the entire Electron process to root is catastrophically unsafe. The helper is a minimal, purpose-built binary with no UI surface and a single responsibility: apply or remove FocusSync's block section.

### 1.2 Hosts File Write Protocol

Every write to the hosts file follows this exact sequence — no shortcuts:

```
Step 1 — ACQUIRE LOCK
  Write a lockfile: /tmp/focussync-hosts.lock  (Linux)
                    %TEMP%\focussync-hosts.lock (Windows)
  If lockfile already exists and process is alive → abort write, log warning
  If lockfile exists and process is dead → treat as stale, remove and continue

Step 2 — READ CURRENT STATE
  Read hosts file into memory (UTF-8)
  Parse and verify FocusSync block section markers

Step 3 — VALIDATE INPUT
  Validate every domain in the blocklist against RFC 1123 hostname rules
  Reject entries containing: path separators, wildcards not on allowlist,
    whitespace, null bytes, or entries exceeding 253 characters
  Maximum blocklist size: 10,000 entries

Step 4 — COMPUTE NEW STATE
  Construct the new FocusSync block section:

    # ── FOCUSSYNC BLOCK START ── DO NOT EDIT ──────────────────────────────
    # Session: {sessionId}  Started: {ISO-8601 timestamp}  Mode: {ACTIVE|LOCKED}
    127.0.0.1   {domain}
    127.0.0.1   www.{domain}
    ::1         {domain}
    ::1         www.{domain}
    # ── FOCUSSYNC BLOCK END ───────────────────────────────────────────────

  Preserve all content outside these markers exactly as-is

Step 5 — ATOMIC WRITE
  Write to a temp file in the same directory (same filesystem = atomic rename)
  Verify temp file integrity (checksum match)
  Rename temp file over original (atomic on POSIX; MoveFileEx on Windows)
  Never truncate-and-write — this risks corruption on power loss

Step 6 — VERIFY WRITE
  Re-read the file and confirm the block section is present and correct
  If verification fails → restore from backup (Step 2's snapshot) and alert

Step 7 — FLUSH DNS CACHE
  Linux:  systemd-resolve --flush-caches  (or resolvectl flush-caches)
  Windows: ipconfig /flushdns
  This ensures blocked domains do not remain accessible via cached lookups

Step 8 — RELEASE LOCK
  Remove the lockfile
  Log: session ID, timestamp, entry count, duration of write operation
```

### 1.3 Tamper Detection

`HostsManager.js` runs a periodic integrity check (every 60 seconds) when a session is ACTIVE or LOCKED:

- Hash the FocusSync block section and compare against the last-written hash
- If mismatch detected:
  - Log a `TAMPER_DETECTED` audit event with the diff
  - Re-apply the block section immediately
  - Notify the user via system notification
  - If Hard Mode is LOCKED: escalate to `state-locked` UI indicator

**A tamper detection failure is treated with the same severity as a crash.** It is never silently ignored.

### 1.4 Restoration on Session End

On clean session end (ACTIVE → IDLE):

1. Remove the FocusSync block section from the hosts file (same atomic protocol)
2. Flush DNS cache
3. Write a `SESSION_END` audit log entry
4. Verify restoration — the section must be fully absent

On unexpected shutdown (crash, kill signal) during an active session:

- At next startup, `HostsManager.js` checks for a stale `focussync-active-session` flag in local storage
- If found: offer user the choice to end the session cleanly or restore it
- The hosts file is **never** automatically cleaned up on crash without user confirmation in Hard Mode

### 1.5 Platform-Specific Rules

**Linux:**
- The helper process is compiled as a separate setuid binary or uses `pkexec`/`sudo` with a strict sudoers policy (see `scripts/setup-dev.sh`)
- The sudoers entry permits **only** the helper binary path — not a general sudo grant
- SELinux / AppArmor profile for the helper is provided in `build/`

**Windows:**
- The helper runs as a Windows Service with LocalSystem privileges, registered at install time
- Named pipe IPC between Electron and the helper — authenticated via process token validation
- UAC elevation prompt at install only — not at runtime

---

## 2. ELECTRON SECURITY HARDENING

### 2.1 BrowserWindow Configuration

Every `BrowserWindow` created in `main.js` **must** use this exact security baseline. No exceptions, no overrides:

```javascript
// main.js — mandatory BrowserWindow security config
const win = new BrowserWindow({
  webPreferences: {
    // MANDATORY — immutable in production
    contextIsolation: true,          // Renderer cannot access Node.js APIs
    nodeIntegration: false,          // Node.js is forbidden in renderer
    nodeIntegrationInWorker: false,  // Forbidden in web workers too
    nodeIntegrationInSubFrames: false,
    sandbox: true,                   // OS-level process sandbox
    webSecurity: true,               // Same-origin policy enforced
    allowRunningInsecureContent: false,
    experimentalFeatures: false,

    // Preload is the ONLY bridge to main process
    preload: path.join(__dirname, 'preload.js'),

    // Navigation controls
    navigateOnDragDrop: false,
  },
  // Window hardening
  autoHideMenuBar: true,   // Menu bar hidden (accessible via Alt)
  backgroundColor: '#0F0F0F',
});

// Prevent navigation to external URLs
win.webContents.on('will-navigate', (event, url) => {
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== 'focussync://app') {
    event.preventDefault();
    logger.warn('BLOCKED_NAVIGATION', { url });
  }
});

// Prevent new window creation
win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
```

### 2.2 Content Security Policy

The CSP is set as an HTTP response header on all renderer-loaded content. It is **not** set via a meta tag (meta tags can be injected; response headers cannot be):

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self'
              https://*.firebaseio.com
              https://*.googleapis.com
              https://identitytoolkit.googleapis.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'none';
  form-action 'none';
  upgrade-insecure-requests;
```

**`'unsafe-eval'` is permanently forbidden.** If a library requires `eval()`, that library is not used.

**`'unsafe-inline'` for scripts is permanently forbidden.** Inline scripts are never used.

### 2.3 contextBridge (preload.js) Contract

`preload.js` is the complete and total API surface available to the renderer. It exposes a deliberately minimal, explicitly typed set of functions. The renderer never has access to anything not on this list:

```javascript
// preload.js — complete API surface (contract, not implementation)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusSync', {

  // Focus session controls
  session: {
    start:          (config) => ipcRenderer.invoke('session:start', config),
    end:            ()       => ipcRenderer.invoke('session:end'),
    getState:       ()       => ipcRenderer.invoke('session:getState'),
    onStateChange:  (cb)     => ipcRenderer.on('session:stateChange', (_, v) => cb(v)),
  },

  // Blocklist management (read-only during active session)
  blocklist: {
    get:    ()       => ipcRenderer.invoke('blocklist:get'),
    add:    (entry)  => ipcRenderer.invoke('blocklist:add', entry),
    remove: (id)     => ipcRenderer.invoke('blocklist:remove', id),
  },

  // Auth
  auth: {
    getUser:  ()       => ipcRenderer.invoke('auth:getUser'),
    signOut:  ()       => ipcRenderer.invoke('auth:signOut'),
  },

  // Emergency unlock — requires code
  emergencyUnlock: (code) => ipcRenderer.invoke('session:emergencyUnlock', code),

  // Stats (read-only)
  stats: {
    getSummary: (range) => ipcRenderer.invoke('stats:getSummary', range),
    getHistory: (range) => ipcRenderer.invoke('stats:getHistory', range),
  },
});

// No filesystem access. No shell access. No arbitrary IPC channels.
// If it is not listed above, the renderer cannot do it.
```

### 2.4 IPC Message Validation

Every IPC handler in `main.js` validates its arguments before execution. This is the defence against a compromised renderer sending malicious payloads:

```javascript
// main.js — IPC validation pattern (required for every handler)
ipcMain.handle('session:start', async (event, config) => {
  // 1. Validate sender — must be our own renderer
  if (event.senderFrame.url !== 'focussync://app/index.html') {
    logger.error('IPC_UNAUTHORIZED_SENDER', { url: event.senderFrame.url });
    throw new Error('Unauthorized IPC sender');
  }

  // 2. Validate payload schema (using a schema validator — e.g., Zod or Ajv)
  const parsed = SessionStartSchema.safeParse(config);
  if (!parsed.success) {
    logger.error('IPC_INVALID_PAYLOAD', { errors: parsed.error });
    throw new Error('Invalid session config');
  }

  // 3. Validate business rules
  if (focusLock.getState() !== 'IDLE') {
    throw new Error('Session already active');
  }

  // 4. Execute with validated data only
  return focusLock.startSession(parsed.data);
});
```

**Every IPC handler must follow steps 1–4 in this exact order.**

### 2.5 Auto-Update Security

- Updates are fetched only from the official FocusSync update server (pinned domain)
- All update packages are signed with an Ed25519 key; the public key is embedded in the binary at build time
- A downloaded update is never applied without signature verification
- Update channels: `stable` (default), `beta` (opt-in). No unsigned or sideloaded updates

### 2.6 Renderer-Side Prohibitions

The following are categorically forbidden in any file under `src/renderer/`:

| Prohibited | Reason |
|---|---|
| `require()` / `import` of Node.js built-ins | `nodeIntegration: false` blocks this; attempting it is an architectural error |
| Direct Firebase SDK calls | All Firebase calls go through `window.focusSync.*` → IPC → main process |
| `localStorage` for session state | Session state lives in Firestore + in-memory only; localStorage is not encrypted |
| `eval()`, `Function()` | CSP blocks this; any code that needs it is disqualified |
| Hardcoded credentials, tokens, or API keys | MASTER_RULES §SEC-3 |

---

## 3. FIREBASE SECURITY RULES

### 3.1 Philosophy

Firestore Security Rules are **code**, not configuration. They are the only true authorization boundary for all database operations. Client-side permission checks are UX convenience only — they must never be relied upon for security.

Rules are maintained in `backend/firestore.rules` and deployed via `firebase deploy --only firestore:rules`. This file is version-controlled and code-reviewed on every change with the same rigor as production code.

### 3.2 Production Firestore Rules

```javascript
// firestore.rules — complete production ruleset
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helper Functions ──────────────────────────────────────────────────

    // Caller is authenticated
    function isAuthed() {
      return request.auth != null;
    }

    // Caller owns the document (their UID matches the path segment)
    function isOwner(uid) {
      return isAuthed() && request.auth.uid == uid;
    }

    // Caller has a verified email (guards against unverified sign-ups)
    function isVerified() {
      return isAuthed() && request.auth.token.email_verified == true;
    }

    // Field is not being modified in this write
    function notChanged(field) {
      return !(field in request.resource.data.diff(resource.data).affectedKeys());
    }

    // Timestamp is a valid server timestamp (not client-supplied)
    function isServerTimestamp(field) {
      return request.resource.data[field] == request.time;
    }

    // ── User Profiles ─────────────────────────────────────────────────────
    match /users/{uid} {
      // Users can only read and write their own profile
      allow read:   if isOwner(uid);
      allow create: if isOwner(uid) && isVerified();
      allow update: if isOwner(uid)
                    && notChanged('uid')         // uid is immutable
                    && notChanged('createdAt');  // creation timestamp is immutable

      // Deletion requires re-authentication (handled in Cloud Function, not here)
      allow delete: if false;
    }

    // ── Focus Sessions ────────────────────────────────────────────────────
    match /users/{uid}/sessions/{sessionId} {
      allow read:   if isOwner(uid);

      // Session creation: must supply a server timestamp and correct uid
      allow create: if isOwner(uid)
                    && isVerified()
                    && isServerTimestamp('startedAt')
                    && request.resource.data.uid == uid
                    && request.resource.data.status in ['ACTIVE', 'LOCKED']
                    && request.resource.data.keys().hasAll(['uid', 'startedAt', 'mode', 'status']);

      // Session update: cannot change uid, startedAt, or mode mid-session
      allow update: if isOwner(uid)
                    && notChanged('uid')
                    && notChanged('startedAt')
                    && notChanged('mode')
                    && request.resource.data.status in ['ACTIVE', 'LOCKED', 'COMPLETED', 'CANCELLED'];

      // Sessions are never deleted — they form the audit history
      allow delete: if false;
    }

    // ── Blocklists ────────────────────────────────────────────────────────
    match /users/{uid}/blocklists/{listId} {
      allow read:   if isOwner(uid);
      allow create: if isOwner(uid) && isVerified()
                    && request.resource.data.uid == uid
                    && request.resource.data.entries is list
                    && request.resource.data.entries.size() <= 10000;

      // Blocklist writes are forbidden during a LOCKED session
      // This is enforced via a Cloud Function transaction; Firestore rules
      // cannot query other documents, so the lock check lives in the Function.
      allow update: if isOwner(uid)
                    && notChanged('uid')
                    && request.resource.data.entries is list
                    && request.resource.data.entries.size() <= 10000;

      allow delete: if isOwner(uid);
    }

    // ── Audit Log ─────────────────────────────────────────────────────────
    match /users/{uid}/auditLog/{eventId} {
      // Write-once: create is permitted, update and delete are permanently forbidden
      allow read:   if isOwner(uid);
      allow create: if isOwner(uid)
                    && isServerTimestamp('timestamp')
                    && request.resource.data.keys().hasAll(['type', 'timestamp', 'deviceId']);
      allow update: if false;
      allow delete: if false;
    }

    // ── App Config (read-only for clients) ────────────────────────────────
    match /_meta/appConfig {
      allow read:   if isAuthed();
      allow write:  if false;  // Written only by Admin SDK (Cloud Functions)
    }

    // ── Default Deny ─────────────────────────────────────────────────────
    // Any path not explicitly matched above is denied.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 3.3 Blocklist Write Lock (Cloud Function)

Because Firestore rules cannot perform cross-document reads, the Hard Mode blocklist write lock is enforced in a Cloud Function that wraps blocklist mutations in a transaction:

```
Client → HTTPS Callable Function: updateBlocklist(listId, entries)
  → Verify auth token (Firebase Admin)
  → Transaction:
      Read users/{uid}/sessions (query: status in ['ACTIVE','LOCKED'])
      IF any session has status == 'LOCKED' → throw PERMISSION_DENIED
      IF any session has status == 'ACTIVE' AND mode == 'HARD' → throw PERMISSION_DENIED
      ELSE → write blocklist document
  → Return result to client
```

### 3.4 Firebase Auth Configuration

| Setting | Value | Rationale |
|---|---|---|
| Email/password | Enabled | Primary auth method |
| Google OAuth | Enabled | Convenience; requires `email_verified: true` |
| Anonymous sign-in | **Disabled** | No anonymous access to focus data |
| Email enumeration protection | **Enabled** | Prevents account discovery |
| Multi-factor authentication | Available (optional) | Recommended for enterprise accounts |
| Session cookie duration | 1 hour (ID token) | Short-lived; refresh token persists |
| Refresh token revocation | On password change + sign-out | Invalidates all devices |

### 3.5 Firebase Storage Rules

FocusSync does not use Firebase Storage in v1. The Storage ruleset denies all access:

```javascript
// storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 4. PERMISSION MODEL

### 4.1 Principle of Least Privilege

Every component declares the minimum permissions required for its function. Permissions are never pre-acquired speculatively.

### 4.2 Desktop Permission Boundaries

| Component | Permissions Held | Permissions Explicitly NOT Held |
|---|---|---|
| Renderer process | None — sandboxed | Filesystem, network, IPC (direct) |
| Main process (Electron) | IPC router, window manager, Firebase Auth | Hosts file write, process kill |
| HostsManager.js | Coordinates write via helper | Direct file write (delegated to helper) |
| Privileged Helper | Hosts file read/write, DNS flush | Network access, UI, arbitrary shell |
| ProcessManager.js | Process enumeration, SIGTERM/TerminateProcess | Network, filesystem |
| SyncService.js | Firebase Firestore read/write (own user only) | Admin SDK, other users' data |

### 4.3 Android Permission Declarations

Permissions in `AndroidManifest.xml` with justification for each:

```xml
<!-- Required permissions — each has a documented justification -->

<!-- Network: Firebase sync, authentication -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Foreground service: LockService persistent notification during Hard Mode -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />

<!-- Accessibility: FocusAccessibilityService detects active app for app blocking -->
<!-- Declared as an accessibility service — not requested via requestPermissions() -->
<!-- User must manually grant in Settings → Accessibility -->
<uses-permission android:name="android.permission.BIND_ACCESSIBILITY_SERVICE" />

<!-- Boot: Restore active session state after device reboot -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Notifications: Hard Mode persistent lock notification (required API 33+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Vibration: Feedback when back button is pressed during Hard Mode -->
<uses-permission android:name="android.permission.VIBRATE" />
```

**Permissions explicitly NOT requested:**

| Permission | Reason Excluded |
|---|---|
| `READ_CONTACTS` | FocusSync has no social features |
| `ACCESS_FINE_LOCATION` | No location functionality |
| `READ_CALL_LOG` | No call management |
| `CAMERA` / `MICROPHONE` | No media capture |
| `READ_EXTERNAL_STORAGE` | No file management |
| `SYSTEM_ALERT_WINDOW` | Not used — LockService + Accessibility is sufficient |
| `DEVICE_ADMIN` | Intentionally avoided — too invasive for user trust |

### 4.4 Permission Request Timing (Android)

| Permission | When Requested | Why |
|---|---|---|
| `POST_NOTIFICATIONS` | On first launch, after onboarding | Required before showing any notification |
| `BIND_ACCESSIBILITY_SERVICE` | When user first enables app blocking | In-context, with clear explanation screen |
| `FOREGROUND_SERVICE` | Implicitly on first Hard Mode session | No runtime request needed |
| `RECEIVE_BOOT_COMPLETED` | At install | Declared in manifest, no runtime request |

**Never request multiple permissions in a single dialog.** Each permission is requested individually, in context, with a human-readable explanation of why FocusSync needs it.

### 4.5 Permission Revocation Handling

If a user revokes the Accessibility permission during an active Hard Mode session:

1. `FocusAccessibilityService` receives `onServiceDisconnected`
2. App logs a `PERMISSION_REVOKED` audit event
3. App displays a non-dismissible system notification: *"FocusSync: App blocking is disabled. Your session continues."*
4. The session remains ACTIVE/LOCKED — the timer still runs
5. Hosts file blocking (on desktop) is unaffected — it is independent
6. At next foreground, the app prompts to re-grant Accessibility permission

---

## 5. CHROME EXTENSION SAFETY

### 5.1 Manifest V3 Compliance

The extension uses Manifest V3 exclusively. MV2 is deprecated and will not be used:

```json
// extension/manifest.json — security-relevant fields
{
  "manifest_version": 3,
  "name": "FocusSync",

  "permissions": [
    "storage",
    "alarms"
  ],

  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ],

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
  },

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "content_scripts": [{
    "matches": ["https://*/*", "http://*/*"],
    "js": ["content.js"],
    "run_at": "document_start",
    "all_frames": false
  }]
}
```

### 5.2 Extension Permission Justifications

| Permission | Justification | Alternatives Considered |
|---|---|---|
| `storage` | Caches active blocklist locally for offline enforcement | `localStorage` — not available in service workers |
| `alarms` | Wakes service worker at session end to remove blocks | `setInterval` — not reliable in MV3 service workers |
| `https://*/*` host permission | Must read URL of every page to check blocklist | Per-site permissions — impractical for user-defined lists |

**Permissions not requested:**

| Excluded Permission | Reason |
|---|---|
| `tabs` | URL checked via `content.js` injection, not tab queries |
| `history` | FocusSync does not read or modify browser history |
| `cookies` | No cookie access needed |
| `webRequest` (blocking) | MV3 uses Declarative Net Request instead |
| `nativeMessaging` | Communication with desktop app is via Firebase, not native messaging |

### 5.3 Declarative Net Request (DNR) for Blocking

In MV3, blocking requests uses the DNR API — not `webRequest`. This is more secure (rules declared statically, not run arbitrary JS at request time) and better for user privacy:

```javascript
// background.js — DNR rule management
async function applyBlocklist(domains) {
  // Remove all existing FocusSync DNR rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map(r => r.id);

  const newRules = domains.flatMap((domain, i) => ([
    {
      id: i * 2 + 1,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ['main_frame', 'sub_frame', 'script', 'image',
                        'stylesheet', 'font', 'xmlhttprequest', 'media']
      }
    },
    // Also block www. prefix
    {
      id: i * 2 + 2,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||www.${domain}^`,
        resourceTypes: ['main_frame', 'sub_frame', 'script', 'image',
                        'stylesheet', 'font', 'xmlhttprequest', 'media']
      }
    }
  ]));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: newRules
  });
}
```

### 5.4 Content Script Safety

`content.js` has a narrow scope and strict constraints:

- It reads only `document.location.hostname` — it does not read page content, form data, or any DOM beyond the URL
- It communicates with `background.js` only via `chrome.runtime.sendMessage` — no direct DOM mutation to inject UI
- It does not store any user data
- It does not make network requests

### 5.5 Extension ↔ Desktop App Communication

The extension does not communicate with the desktop Electron app via native messaging. Both the extension and the Electron app are Firestore listeners. State changes propagate through Firestore:

```
User starts session in Electron
    → FocusLock.js writes state to Firestore
        → Extension background.js receives onSnapshot update
            → background.js updates DNR rules
```

This avoids granting the extension `nativeMessaging` permission and eliminates a local IPC attack surface.

### 5.6 Extension Update Policy

- The extension is distributed exclusively through the Chrome Web Store
- The extension's update URL is the Chrome Web Store default — no custom update server
- Content Security Policy prevents injection of remote scripts into the extension
- The extension is reviewed before each Web Store submission using automated and manual analysis

---

## 6. DATA ENCRYPTION POLICY

### 6.1 Data Classification

| Classification | Examples | Handling |
|---|---|---|
| **Critical** | Firebase private key, signing certificates, passwords | Never stored in code or DB; secrets manager only |
| **Sensitive** | User email, session history, blocklists | Encrypted in transit (TLS 1.2+); at rest via Firebase |
| **Internal** | Session metadata, timestamps, device IDs | Stored in Firestore; access-controlled by rules |
| **Public** | App version, minimum requirements, public config | No encryption required |

### 6.2 Encryption in Transit

| Channel | Protocol | Minimum Version | Certificate Validation |
|---|---|---|---|
| Client ↔ Firebase (all platforms) | TLS | 1.2 (1.3 preferred) | Firebase CA pinned |
| Client ↔ Backend API | TLS | 1.2 (1.3 preferred) | Certificate pinned (production) |
| Extension ↔ Firestore | TLS | 1.2 | Browser handles |
| Electron main ↔ renderer | Electron IPC (in-process) | N/A | contextBridge isolation |
| Electron ↔ Helper | Named pipe (Windows) / Unix socket (Linux) | N/A | Process token validation |

**HTTP (unencrypted) is blocked at the network level in production.** `upgrade-insecure-requests` CSP directive handles any stray HTTP references in the renderer.

### 6.3 Encryption at Rest

**Firebase / Firestore:**
Firebase encrypts all data at rest using AES-256 by default (Google-managed keys). FocusSync does not implement client-side encryption over Firestore in v1 — Google's server-side encryption is the at-rest protection layer.

**For enterprise/premium tiers (v2 roadmap):** Customer-managed encryption keys (CMEK) via Google Cloud KMS will be supported, allowing organizations to revoke FocusSync's access to their data at the infrastructure level.

**Desktop Local Storage:**
`electron-store` (the only permitted local persistence mechanism on desktop) uses OS-level encryption:

```javascript
// main.js — local store initialization
const Store = require('electron-store');

const store = new Store({
  encryptionKey: 'derived-from-firebase-uid-and-device-id',
  // Key derivation: HKDF(SHA-256, firebaseUID + deviceFingerprint, "focussync-local-store")
  // The key is never stored — it is re-derived on each launch
  schema: {
    sessionState: { type: 'string', enum: ['IDLE', 'ACTIVE', 'LOCKED'] },
    activeSessionId: { type: ['string', 'null'] },
    // Blocklist cache is NOT stored locally — fetched fresh from Firestore on each launch
  }
});
```

**Prohibited local storage:**
- Raw Firebase tokens must not be written to disk in plaintext
- Blocklists must not be cached to unencrypted files
- User credentials (passwords) are never handled by FocusSync — Firebase Auth owns all credential storage

**Android:**
- `SharedPreferences` is used only for non-sensitive preferences (theme, onboarding state)
- Firebase tokens are managed by the Firebase SDK (stored in Android KeyStore via `EncryptedSharedPreferences`)
- The active session state flag (used for recovery) is stored in `EncryptedSharedPreferences`

### 6.4 Key Management

| Key Type | Storage | Rotation |
|---|---|---|
| Firebase service account private key | CI/CD secrets manager | Annually or on suspected compromise |
| Android keystore (release signing) | Encrypted offline backup + CI secret | Per policy; key is long-lived |
| Desktop code signing certificate | Hardware HSM or CI secret | Per certificate expiry |
| Local store encryption key | Derived at runtime (not stored) | Re-derived on each launch |
| Emergency unlock code | Bcrypt hash in Firestore (user's own document) | User-controlled reset |

**No key material is ever committed to the repository.** `.gitignore` enforces this. The secrets scanner (MASTER_RULES GIT-4) provides a second line of defence.

### 6.5 Data Retention Policy

| Data Type | Retention Period | Deletion Mechanism |
|---|---|---|
| Focus session records | Indefinite (user's focus history) | User-initiated account deletion |
| Audit log entries | 2 years | Automatic expiry via Firestore TTL policy |
| Authentication tokens | Per Firebase Auth defaults (1 hour ID, persistent refresh) | Sign-out or password change revokes all |
| Blocklist versions | Current version only | Overwritten on each blocklist save |
| Deleted account data | 30-day grace period, then permanent deletion | Cloud Function scheduled job |

---

## 7. RECOVERY SYSTEM

The recovery system handles two classes of failure: user-initiated recovery (forgot unlock code, session stuck) and system-initiated recovery (crash during Hard Mode, hosts file corruption).

### 7.1 Emergency Unlock Flow

Emergency unlock is the procedure for exiting a LOCKED Hard Mode session before the timer expires. It is deliberately non-trivial — it must be available but must not be easy.

```
User triggers Emergency Unlock (taps/clicks the subdued unlock button)
  ↓
Confirmation dialog:
  "This will end your Hard Mode session early.
   Your focus streak will be broken.
   This action is recorded in your audit log."
  [Cancel]  [Continue]
  ↓ (Continue)
Unlock method selection:
  ┌─────────────────────────────────────────────────────┐
  │  Method A — Emergency Code                          │
  │  Enter the 8-digit code you set when configuring    │
  │  Hard Mode. (3 attempts before 15-minute lockout)   │
  ├─────────────────────────────────────────────────────┤
  │  Method B — Email Verification                      │
  │  Send a one-time unlock link to your registered     │
  │  email address. Link expires in 10 minutes.         │
  └─────────────────────────────────────────────────────┘
  ↓ (Method selected and verified)
Cloud Function: verifyEmergencyUnlock(method, credential)
  → Validate credential (code hash comparison / OTP verification)
  → Write EMERGENCY_UNLOCK audit event (user, method, timestamp, sessionId)
  → Update session status to CANCELLED in Firestore
  → Firestore onSnapshot triggers all devices to exit LOCKED state
  ↓
All devices: FocusLock transitions LOCKED → IDLE
  → Hosts file block section removed (atomic protocol)
  → DNS cache flushed
  → UI transitions to IDLE state
  → Streak broken notification displayed
```

**Rate limiting on emergency unlock attempts:**
- 3 wrong code attempts → 15-minute lockout
- 5 wrong code attempts → 1-hour lockout + email notification
- 10 wrong code attempts → account-level flag, manual review required

### 7.2 Crash Recovery (Desktop)

On every launch, `main.js` executes a recovery check before rendering the UI:

```
Launch sequence recovery check (main.js):

1. READ CRASH FLAG
   Check electron-store: { sessionState, activeSessionId, crashFlag }
   If crashFlag == false → normal startup, skip recovery

2. DETECT ABNORMAL SHUTDOWN
   If crashFlag == true (set at startup, cleared on clean shutdown):
     → Read activeSessionId and sessionState from local store
     → Query Firestore: sessions/{activeSessionId}

3. EVALUATE REMOTE STATE
   If Firestore session status == 'COMPLETED' or 'CANCELLED':
     → Remote state is clean; clear local crash flag
     → Ensure hosts file is restored (run restoration check)
     → Normal startup

   If Firestore session status == 'ACTIVE' or 'LOCKED':
     → The session was interrupted mid-run

4. RECOVERY DIALOG
   Show recovery modal (before main UI renders):

   Mode A — Session was ACTIVE (soft focus):
     "FocusSync closed unexpectedly during a focus session.
      [Resume Session]  [End Session]"

   Mode B — Session was LOCKED (Hard Mode):
     "FocusSync closed unexpectedly during a Hard Mode session.
      Your session was {X} minutes remaining.
      Hard Mode is still enforced.
      [Resume Hard Mode]  [Emergency Unlock]"

5. ON RESUME
   Re-apply hosts file block (verify current state matches last-written state)
   Re-establish Firestore real-time listener
   Restore UI to correct state (ACTIVE or LOCKED)
   Clear crash flag

6. ON END / EMERGENCY UNLOCK
   Follow standard session end or emergency unlock flow
```

### 7.3 Hosts File Corruption Recovery

If `HostsManager.js` detects that the hosts file is corrupted (unparseable or missing expected system entries):

```
1. IMMEDIATE ACTION
   Stop all further writes to the hosts file
   Log HOSTS_CORRUPTION_DETECTED audit event

2. BACKUP CHECK
   Check for FocusSync's hosts file backup:
     Linux:   /var/lib/focussync/hosts.backup
     Windows: %ProgramData%\FocusSync\hosts.backup
   Backup is written before every FocusSync write operation

3. SYSTEM ENTRY PRESERVATION
   Parse the backup and the current corrupted file
   Extract all non-FocusSync entries from whichever is more intact
   Merge with standard localhost entries:
     127.0.0.1   localhost
     ::1         localhost
     127.0.1.1   {hostname}

4. RESTORATION
   Write the reconstructed file using the atomic write protocol
   Verify restoration
   Re-apply the active blocklist section if a session is running

5. NOTIFICATION
   Show system notification: "FocusSync repaired your hosts file"
   Log HOSTS_CORRUPTION_REPAIRED audit event with diff
   If restoration failed: notify user and disable hosts-based blocking,
     fall back to DNS-based blocking (extension DNR rules only)
```

### 7.4 Account Recovery

| Scenario | Recovery Path |
|---|---|
| Forgot password | Firebase Auth "Reset Password" email flow |
| Forgot emergency unlock code | Firebase Auth re-verification + Cloud Function to generate a new code |
| Lost access to email | Support escalation → identity verification → manual admin reset |
| Device lost during Hard Mode | Other device can end the session via the FocusSync app |
| All devices lost during Hard Mode | Web-based emergency unlock at `app.focussync.io/unlock` |
| Account deletion request | 30-day grace period; re-login before expiry cancels deletion |

### 7.5 Firebase Sync Recovery

When a client reconnects after being offline during an active session:

```
Client comes back online:
  ↓
Firestore offline persistence replays queued writes
  ↓
SyncService.js reconciliation:
  → Compare local session state with Firestore session document
  → If local state is AHEAD of remote (local edits during offline):
      Apply local state to Firestore (local wins for session state)
  → If remote state is AHEAD of local (another device ended the session):
      Accept remote state (remote wins for session termination)
  → If remote session is COMPLETED/CANCELLED and local is ACTIVE/LOCKED:
      End local session immediately, restore hosts file
  ↓
Emit SYNC_RECONCILED log entry with pre/post states
```

---

## 8. THREAT MODEL

### 8.1 Threat Actors

| Actor | Motivation | Capability |
|---|---|---|
| The user themselves | Wants to bypass focus enforcement to access blocked sites | High — they have physical access, OS credentials, and know the app |
| Malicious website | Wants to escape the blocklist or exfiltrate data | Medium — limited to renderer sandbox |
| Local process on the user's machine | Could modify hosts file or kill the app | High — OS-level |
| Network attacker (MITM) | Intercept Firebase traffic, inject malicious blocklist | Low-Medium — TLS prevents this |
| Remote attacker (account compromise) | Access session history, modify blocklists | Low — requires credential theft |

### 8.2 Key Threats and Mitigations

| Threat | Mitigation |
|---|---|
| User manually edits hosts file to remove blocks | Tamper detection (§1.3) re-applies within 60 seconds |
| User kills the Electron process during Hard Mode | Crash recovery (§7.2) restores session on next launch |
| User modifies `electron-store` local data | Encrypted store; Firestore is authoritative |
| User installs competing app that modifies hosts file | Last-write-wins; tamper detection detects and re-applies |
| XSS in renderer achieves code execution | CSP + `contextIsolation: true` + no `nodeIntegration` — renderer has no useful capabilities |
| Malicious IPC message from compromised renderer | IPC validation (§2.4) validates sender and payload |
| Stolen Firebase credential | Short-lived ID tokens; Firestore rules enforce ownership |
| Extension injected with malicious scripts | MV3 CSP prevents remote script injection |
| Emergency unlock brute force | Rate limiting — 3 attempts then lockout (§7.1) |

### 8.3 Accepted Risks (v1)

| Risk | Acceptance Rationale |
|---|---|
| Root/Administrator can always bypass hosts file | True for all hosts-file-based blocking tools; mitigated by tamper detection for standard user attempts |
| Android accessibility permission can be revoked | Session continues; hosts blocking on desktop is unaffected; documented in §4.5 |
| No client-side E2E encryption of Firestore data | Google's AES-256 at-rest encryption is the v1 boundary; CMEK is v2 roadmap |

---

## 9. SECURITY AUDIT CHECKLIST

Run this checklist on every PR that touches a security-relevant file. Required sign-off before merge.

### Electron / Desktop

- [ ] `contextIsolation: true` in all BrowserWindow configs
- [ ] `nodeIntegration: false` in all BrowserWindow configs
- [ ] `sandbox: true` in all BrowserWindow configs
- [ ] `webSecurity: true` — never disabled
- [ ] CSP header present and does not include `unsafe-eval` or `unsafe-inline` (scripts)
- [ ] All IPC handlers validate sender frame URL
- [ ] All IPC handlers validate payload with schema parser
- [ ] `preload.js` exposes no filesystem, shell, or arbitrary IPC access
- [ ] No credentials, tokens, or keys in renderer-accessible code

### Hosts File

- [ ] Writes go through the privileged helper — never from main process directly
- [ ] Atomic write protocol followed (temp file → rename)
- [ ] Tamper detection interval is active when session is ACTIVE or LOCKED
- [ ] DNS cache flush executed after every write and removal
- [ ] Backup written before every write
- [ ] All blocklist entries validated against hostname rules before write

### Firebase

- [ ] Firestore rules deployed from `backend/firestore.rules` (not console)
- [ ] `isOwner(uid)` check present on all user data reads/writes
- [ ] `allow delete: if false` on sessions and audit log
- [ ] Server timestamps enforced on all `createdAt`/`startedAt` fields
- [ ] Anonymous sign-in disabled in Firebase console
- [ ] No Admin SDK credentials in client-side code

### Android

- [ ] No undeclared permissions in `AndroidManifest.xml`
- [ ] Accessibility service declares only required event types
- [ ] `LockService` notification is non-dismissible during LOCKED state
- [ ] `EncryptedSharedPreferences` used for all sensitive local storage
- [ ] Firebase tokens not written to unencrypted storage

### Extension

- [ ] Manifest V3 confirmed
- [ ] `nativeMessaging` permission absent
- [ ] `tabs` permission absent
- [ ] `history` permission absent
- [ ] DNR used for blocking (not `webRequest` with blocking)
- [ ] Content script does not read DOM content or form data

### General

- [ ] No secrets in diff (`git secrets` scan passes)
- [ ] `EMERGENCY_UNLOCK`, `TAMPER_DETECTED`, `PERMISSION_REVOKED` audit events present in audit log schema
- [ ] Rate limiting applied to all backend routes
- [ ] TLS enforced on all external connections

---

## 10. INCIDENT RESPONSE

### 10.1 Severity Classification

| Severity | Definition | Response Time |
|---|---|---|
| **P0 — Critical** | Focus lock bypass confirmed; data breach; credential compromise | Immediate (< 1 hour) |
| **P1 — High** | Tamper detection failure; hosts corruption not auto-repaired; auth bypass | < 4 hours |
| **P2 — Medium** | Sync desync causing missed block; extension DNR rules not applied | < 24 hours |
| **P3 — Low** | Non-security bug in UI; cosmetic audit log gap | Next sprint |

### 10.2 P0/P1 Response Procedure

```
1. DETECT
   Automated alert (Firestore anomaly detection, CI security scan) or user report

2. CONTAIN
   P0: Disable affected Firebase project features via console (kill switch)
       Revoke all active sessions via Admin SDK
   P1: Disable the affected feature via remote config flag

3. ASSESS
   Identify scope: which users, which data, which time window
   Pull audit logs for affected users

4. COMMUNICATE
   Internal: Engineering lead + security lead notified within 15 minutes
   External (P0 breach): Affected users notified within 72 hours per GDPR

5. REMEDIATE
   Hotfix branch: hotfix/FS-SEC-{id}
   Deploy to staging → production with accelerated review
   Re-enable disabled features after fix is verified

6. POST-MORTEM
   Written within 5 business days
   Stored in docs/ADR/ as a security incident record
   MASTER_RULES updated if the incident reveals a gap
```

### 10.3 Reporting a Vulnerability

Security vulnerabilities should be reported privately to the engineering team — **not** as a public GitHub issue. Contact: [security channel defined in internal runbook].

Responsible disclosure window: 90 days before public disclosure.

---

*This document is a living security contract. Any change to a security boundary — Electron config, Firestore rules, Android permissions, extension manifest, or encryption policy — requires this document to be updated in the same PR.*

*Last reviewed: 2026-05-22 | Next scheduled review: 2026-08-22*