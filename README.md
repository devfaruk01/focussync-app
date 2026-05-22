focusflow/
├── desktop/
│   ├── electron/
│   │   ├── main.js
│   │   ├── preload.js
│   │   └── package.json
│   ├── src/
│   │   ├── renderer/
│   │   │   ├── index.html
│   │   │   ├── styles.css
│   │   │   ├── app.js
│   │   │   └── components/
│   │   │       ├── Dashboard.js
│   │   │       ├── FocusMode.js
│   │   │       ├── Settings.js
│   │   │       └── Stats.js
│   │   └── assets/
│   │       ├── icons/
│   │       └── fonts/
│   ├── services/
│   │   ├── HostsManager.js
│   │   ├── ProcessManager.js
│   │   ├── FocusLock.js
│   │   └── SyncService.js
│   └── build/
│       ├── installer.nsi
│       └── linux.deb
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   └── styles.css
├── mobile/
│   ├── android/
│   │   ├── app/
│   │   │   ├── src/
│   │   │   │   ├── main/
│   │   │   │   │   ├── java/com/focusflow/
│   │   │   │   │   │   ├── MainActivity.kt
│   │   │   │   │   │   ├── services/
│   │   │   │   │   │   │   ├── FocusAccessibilityService.kt
│   │   │   │   │   │   │   ├── LockService.kt
│   │   │   │   │   │   │   └── SyncWorker.kt
│   │   │   │   │   │   └── utils/
│   │   │   │   │   └── res/
│   │   │   │   └── AndroidManifest.xml
│   │   │   └── build.gradle
│   │   └── gradle/
│   |
│   └── shared/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── routes/
│   │   ├── auth.js
│   │   ├── sync.js
│   │   └── stats.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Session.js
│   │   └── Blocklist.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── rateLimit.js
│   └── config/
│       └── database.js
├── scripts/
│   ├── build-all.sh
│   ├── setup-dev.sh
│   └── deploy.sh
└── docs/
    ├── INSTALLATION.md
    └── API.md