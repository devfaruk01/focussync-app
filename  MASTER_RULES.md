# MASTER_RULES.md — FocusSync

> Single source of truth for architecture decisions, conventions, and constraints.
> All contributors must read and follow this document before writing any code.

---

## 1. Project Overview

**FocusSync** is a cross-platform productivity application with a desktop shell (Electron), a mobile/embedded UI layer (Flutter), real-time cloud backend (Firebase), and a design system built on TailwindCSS + DaisyUI.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Desktop Shell | Electron | Native desktop app (Windows, macOS, Linux) |
| UI / Mobile | Flutter | Cross-platform UI & mobile apps (iOS, Android) |
| Backend / Realtime | Firebase | Auth, Firestore, Storage, Cloud Functions |
| Styling (web/Electron) | TailwindCSS + DaisyUI | Utility-first CSS + component theming |

---

## 3. Repository Structure

```
focussync/
├── electron/               # Electron main process, preload scripts, IPC handlers
│   ├── main/
│   ├── preload/
│   └── ipc/
├── flutter/                # Flutter app (all platforms)
│   ├── lib/
│   │   ├── core/           # App-wide utilities, constants, theme
│   │   ├── features/       # Feature-first folder structure
│   │   └── shared/         # Shared widgets and services
│   └── test/
├── web/                    # Web renderer used inside Electron (HTML/JS/CSS)
│   ├── src/
│   └── tailwind.config.js
├── firebase/               # Firebase config, rules, Cloud Functions
│   ├── functions/
│   ├── firestore.rules
│   └── storage.rules
├── shared/                 # Shared types, contracts, constants (language-agnostic)
│   └── schema/
└── MASTER_RULES.md
```

---

## 4. Naming Conventions

### General
- All file and folder names: `kebab-case` for web/Electron assets, `snake_case` for Flutter/Dart files.
- No abbreviations unless universally understood (e.g., `auth`, `id`, `ui`).
- Never use `temp`, `test2`, `newFile`, or similar placeholder names in committed code.

### Electron
- Main process files: `kebab-case.ts` (e.g., `window-manager.ts`)
- IPC channel names: `SCREAMING_SNAKE_CASE` constants defined in `electron/ipc/channels.ts`
- Preload scripts: one per window type, named `<window-name>.preload.ts`

### Flutter / Dart
- Files: `snake_case.dart`
- Classes: `PascalCase`
- Variables / functions: `camelCase`
- Constants: `kCamelCase` (Flutter convention, e.g., `kDefaultPadding`)
- Feature folders follow the pattern: `features/<feature_name>/{data,domain,presentation}/`

### Firebase
- Firestore collections: `camelCase` (e.g., `focusSessions`, `userProfiles`)
- Firestore document fields: `camelCase`
- Cloud Function names: `camelCase` verbs (e.g., `onSessionComplete`, `scheduleDailyDigest`)
- Storage paths: `{uid}/{resource-type}/{filename}` (e.g., `abc123/avatars/profile.jpg`)

### TailwindCSS / DaisyUI
- Custom CSS classes (if any): `fs-` prefix (e.g., `fs-card`, `fs-sidebar`)
- DaisyUI component variants are preferred over custom CSS.
- No inline `style=` attributes unless absolutely required by a third-party component.

---

## 5. Architecture Rules

### 5.1 Electron
- **Main process is privileged.** All Node.js / OS operations happen here only.
- **Renderer process has no direct Node access.** Use IPC via preload scripts exclusively.
- **contextIsolation: true** and **nodeIntegration: false** are non-negotiable security settings.
- All IPC channels must be declared in `electron/ipc/channels.ts` before use.
- Window state (size, position) must be persisted with `electron-store` or equivalent.
- No business logic in the main process — delegate to services in `electron/main/services/`.

### 5.2 Flutter
- Feature-first folder structure is mandatory. No flat `screens/` or `widgets/` top-level dumps.
- State management: **Riverpod** (no exceptions; do not introduce Bloc, Provider, or GetX).
- Navigation: **go_router** only.
- All Firebase calls are wrapped in repository classes inside `features/<name>/data/`.
- No `BuildContext` passed into non-widget classes (repositories, services, notifiers).
- All user-facing strings must be defined in `lib/core/l10n/` — no hardcoded strings in widgets.

### 5.3 Firebase
- Firestore security rules must be updated alongside any schema change — never ship a schema change with open rules.
- All reads/writes go through typed repository classes; no raw `FirebaseFirestore.instance` calls outside of repositories.
- Cloud Functions are TypeScript only (`firebase/functions/src/`).
- Use Firebase Emulator Suite locally. Connecting to production from `localhost` is prohibited.
- Firestore documents must never exceed 1 MB. Paginate or subcollection before that limit.
- Authentication state is the single source of truth for user identity. Never store UID redundantly in local state without syncing from Firebase Auth.

### 5.4 TailwindCSS + DaisyUI (Electron web renderer)
- Tailwind config lives at `web/tailwind.config.js`. No duplicate configs.
- DaisyUI theme tokens are extended in `tailwind.config.js`; do not override them with hardcoded hex values in markup.
- Dark mode is controlled by DaisyUI's `data-theme` attribute on `<html>`. No manual `dark:` class juggling outside of the theme switcher.
- Responsive breakpoints follow Tailwind defaults (`sm`, `md`, `lg`, `xl`, `2xl`). No custom breakpoints unless approved and documented here.

---

## 6. Data & State Rules

- **Firebase is the system of record.** Local state is a cache, not a source of truth.
- Optimistic UI updates are allowed but must handle rollback on failure.
- Sensitive user data (focus goals, session history) must never be logged to the console in production builds.
- User settings are stored in Firestore under `userProfiles/{uid}/settings` — not in `localStorage` or `SharedPreferences`.
- Offline support is required for core focus-session features. Use Firestore's offline persistence.

---

## 7. Security Rules

- No API keys, service account credentials, or secrets in source code or committed `.env` files.
- Use environment variables injected at build time (via CI/CD) for all secrets.
- Firebase App Check must be enabled for production builds.
- Electron's `webContents.executeJavaScript` must not be called with user-supplied input.
- All external URLs opened from Electron must go through a allowlist check before `shell.openExternal()`.
- Storage rules must enforce `{uid}` path ownership — users may not read or write other users' files.

---

## 8. Code Quality Standards

- **TypeScript strict mode** is enabled for all Electron and Firebase Functions code. No `any` without a comment explaining why.
- **Dart analysis** runs with `flutter analyze` — zero warnings policy on `lib/`.
- All public functions and classes require doc comments (`/** */` in TS, `///` in Dart).
- Maximum function length: 40 lines. Extract helpers if exceeded.
- Maximum file length: 300 lines. Split by responsibility if exceeded.
- No commented-out code in commits. Use `git stash` or feature flags instead.

---

## 9. Testing Requirements

| Layer | Minimum Coverage | Tooling |
|---|---|---|
| Electron (main) | Unit tests for all IPC handlers | Vitest |
| Flutter | Widget tests for all screens; unit tests for all notifiers & repos | flutter_test, mocktail |
| Firebase Functions | Unit tests for all callable/triggered functions | Jest |
| Firestore Rules | Rules tests for all collections | `@firebase/rules-unit-testing` |

- CI must pass all tests before any merge to `main`.
- Mocks are used for all external dependencies (Firebase, OS APIs) in unit tests.
- No `expect(true).toBe(true)` placeholder tests.

---

## 10. Git & Branching

- **Branches:** `main` (production), `develop` (integration), `feature/<name>`, `fix/<name>`, `chore/<name>`
- **Commits:** Conventional Commits format — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- **PRs:** Require at least one reviewer approval and passing CI before merge.
- **No force-pushing** to `main` or `develop`.
- Feature flags (not long-lived branches) for incomplete features.

---

## 11. Performance Constraints

- Electron app cold-start target: **< 2 seconds** on reference hardware (mid-tier laptop, SSD).
- Flutter app frame budget: **16 ms** (60 fps). No `setState` / `ref.watch` in build methods that trigger full-tree rebuilds unnecessarily.
- Firestore reads must use collection-group queries sparingly; prefer shallow reads with pagination.
- TailwindCSS build must use PurgeCSS (content paths configured) — no unused utilities shipped.
- Bundle size for the Electron renderer: **< 500 KB** gzipped (excluding vendor chunks).

---

## 12. Accessibility

- All interactive elements in the Electron web renderer must have visible focus styles (do not remove Tailwind's `focus:ring`).
- Flutter widgets must set `Semantics` labels on all icons, images, and custom interactive components.
- Color contrast must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text).
- DaisyUI theme choices must be validated against contrast requirements before shipping.

---

## 13. Environment Configuration

| Variable | Where set | Used by |
|---|---|---|
| `FIREBASE_PROJECT_ID` | CI/CD secrets | Electron, Flutter |
| `FIREBASE_API_KEY` | CI/CD secrets | Web renderer |
| `FIREBASE_APP_CHECK_KEY` | CI/CD secrets | Electron, Flutter |
| `SENTRY_DSN` | CI/CD secrets | Electron, Flutter |
| `NODE_ENV` | Build script | Electron |

- `.env.example` is committed with all variable names and placeholder values.
- `.env` and `.env.local` are gitignored without exception.

---

## 14. Prohibited Patterns

- ❌ `any` type in TypeScript without justification comment
- ❌ `dynamic` type in Dart without justification comment
- ❌ Direct Firestore calls outside repository classes
- ❌ Hardcoded user IDs, document IDs, or collection names outside `shared/schema/`
- ❌ Business logic in Flutter widgets or Electron renderer HTML/JS
- ❌ `nodeIntegration: true` in any Electron `BrowserWindow`
- ❌ Storing secrets in code, comments, or commit history
- ❌ Shipping with Firebase Emulator URLs in production config
- ❌ Inline `style=` overrides for values that DaisyUI theme tokens cover
- ❌ Skipping Firestore rule updates when adding a new collection

---

## 15. Decision Log

| Date | Decision | Rationale |
|---|---|---|
| — | Riverpod over Bloc | Less boilerplate; better composability for FocusSync's async data patterns |
| — | go_router over Navigator 2.0 raw | Declarative, URL-based, simpler deep-link handling |
| — | DaisyUI over raw Tailwind components | Speeds up theming; dark mode handled at config level |
| — | Electron + web renderer over native desktop | Shared UI logic with web; team has stronger JS/TS expertise |
| — | Firestore over Realtime Database | Richer querying; better offline support; scales to FocusSync's document model |

*Add new decisions here with date and rationale before implementing.*

---

*Last updated: see git blame. All rule changes require a PR and team sign-off.*