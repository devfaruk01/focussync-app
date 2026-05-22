# FocusSync AI Assignment System

==================================================
PROJECT MANAGER
==================================================

Human:
- Omor Faruk

Responsibilities:
- Final approval
- Git management
- Merge handling
- Testing
- Conflict resolution

==================================================
AI TEAM ASSIGNMENTS
==================================================

--------------------------------------------------
1. CLAUDE (LEAD ARCHITECT)
--------------------------------------------------

Responsibilities:
- System architecture
- Firebase architecture
- Firestore schema
- Security planning
- Realtime sync design
- Documentation
- API structure
- Backend planning

Allowed Folders:
- backend/
- docs/

Can Modify:
- MASTER_RULES.md
- FILE_REGISTRY.md
- PROJECT_STATUS.md

Must NOT Modify:
- mobile/
- extension/
- desktop renderer UI

--------------------------------------------------
2. DEEPSEEK (MAIN CODE GENERATOR)
--------------------------------------------------

Responsibilities:
- Electron core
- IPC modules
- Services
- Extension logic
- Utilities
- Shared systems

Allowed Folders:
- desktop/
- extension/
- shared/

Can Modify:
- FILE_REGISTRY.md

Must NOT Modify:
- backend architecture
- mobile native system

--------------------------------------------------
3. GEMINI (MOBILE ENGINEER)
--------------------------------------------------

Responsibilities:
- Flutter UI
- Android native services
- Accessibility service
- Usage stats system
- Mobile notifications

Allowed Folders:
- mobile/

Must NOT Modify:
- backend/
- desktop/
- extension/

--------------------------------------------------
4. CHATGPT (SECURITY + DEBUGGING)
--------------------------------------------------

Responsibilities:
- Security review
- Bug fixing
- Performance optimization
- Electron security
- Linux compatibility
- Refactoring

Allowed Folders:
- all folders (review only)

Must NOT:
- Change architecture
- Rename folders
- Replace frameworks

==================================================
GLOBAL RULES
==================================================

ALL AI MUST:

- Follow MASTER_RULES.md
- Follow UI_SYSTEM.md
- Follow SHARED_CONSTANTS.md
- Follow FILE_REGISTRY.md

NEVER:
- Rename folders
- Change architecture
- Introduce new frameworks
- Replace TailwindCSS
- Replace DaisyUI

==================================================
UI RULES
==================================================

Use:
- TailwindCSS
- DaisyUI

Theme:
- Dark
- Purple/Blue accents
- Glassmorphism
- Rounded corners
- Smooth animations

==================================================
IMPORTANT
==================================================

Before generating files:
- Read existing project structure
- Read FILE_REGISTRY.md
- Maintain consistency

After generating files:
- Update FILE_REGISTRY.md
- Explain integration
- Explain dependencies