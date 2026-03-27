# iTECify: Comprehensive App Structure & UI/UX Document

## 1. Global Design Language & Specifications
* **Visual Theme:** Multi-theme system. The app ships with several predefined themes (e.g., Lagoon Dark, Dracula, One Dark, Neutral Gray, Lagoon Light). A **Theme Drawer** in the bottom drawer section allows users to switch between themes. The default on first visit is a dark theme.
* **Core Style:** Minimalist, flat design. The UI should feel invisible, letting the code and collaborative elements take center stage.
* **Overlays & Depth:** Glassmorphism is used for modals and full-screen overlay states. Spec: light blur (`backdrop-filter: blur(10–14px)`) with a darkened overlay (`rgba(0,0,0, 0.55–0.65)`) over all non-modal content. The blur is subtle enough to hint at the workspace behind without being readable.
* **Responsiveness:** Strictly Desktop-first. The layout utilizes CSS Grid/Flexbox to dynamically allocate space across large monitors and laptop screens.
* **Animation Philosophy:** Fluid, hardware-accelerated sliding animations (e.g., `transform: translateX/Y`). Elements should feel like physical "drawers" sliding in and out of the viewport.
* **Corners:** All drawers, panels, modals, and tabs use slightly curved corners (~4–6px border-radius). Not fully rounded, not fully sharp.
* **Typography:** UI text uses `Manrope` (sans-serif). Code editor and terminal use `JetBrains Mono` (monospace), loaded via Google Fonts. Ligatures enabled by default.
* **Iconography:** Icon set chosen for clarity and aesthetic fit with the IDE context — may use `lucide-react`, Phosphor Icons, or similar. Icons should be outlined/thin-stroke style, consistent across the entire app.
* **Logo:** Text wordmark ("iTECify") for now. A graphic logo will be added later.

---

## 2. Core User Flows
* **Onboarding Flow:** User visits `/` -> Clicks "Go to Workspace" -> Redirected to `/workspace` -> Background blurs -> Auth Modals appear -> User logs in -> Blur fades, revealing the IDE.
* **Collaboration Flow:** User joins a session -> Avatars appear in the top bar -> Multi-cursor presence is established -> Real-time sync begins via WebSockets/CRDT.
* **Time-Travel Flow:** User opens History Drawer -> Selects previous commit/state -> Modal warns of timeline split -> User confirms -> Workspace reverts to the selected state -> Co-contributors receive a decision modal (Follow or Stay).

---

## 3. Landing Page (`/`)
* **Purpose:** The entry point. It sets the minimalist tone and funnels users to the core product.
* **Structure:** Composed of modular, full-width vertical blocks:
  1. **Hero Section:** Bold headline + subtitle (implementer's choice for copy — should convey "collaborative coding" and "AI-powered"). Prominent CTA button routing to `/workspace`.
  2. **Feature Block — Real-Time Collaboration:** Visual + copy explaining multi-cursor editing, presence awareness, and live sync.
  3. **Feature Block — AI-Assisted Coding:** Visual + copy explaining inline AI suggestions with accept/reject/modify/move controls.
  4. **CTA / Footer:** Final call to action + minimal footer (copyright, GitHub link if applicable).
* **Interaction:** Scrolling is smooth. The primary Call to Action ("Login / Go to Workspace") is highly visible and instantly routes the user to the `/workspace` path.

---

## 4. Workspace Auth State (`/workspace`)
Before entering the live editor, the system verifies the user token. If unauthenticated, the workspace enters a locked state.

* **Visual State:** The entire IDE UI behind the modals is darkened (`rgba(0,0,0, 0.55–0.65)`) with a light blur (`backdrop-filter: blur(10–14px)`). The workspace is visible but not readable — just enough to hint at what's behind.
* **Modal 1 (Context & Info):** Positioned center-left. Contains a brief use-case animation or text block. Includes an `X` button in the top right to dismiss.
* **Modal 2 (Authentication):** Positioned center-right, matching the exact height and width of Modal 1. Houses the Login/Register forms **built into the app's own UI** (same functionality as Auth0's hosted page, but rendered in-modal).
  * **Login / Register tabs** within the modal.
  * **Social login buttons** (Google, GitHub) displayed prominently.
  * **Forgot password** link.
  * **No guest/demo mode** — authentication is required to access the workspace.
* **Dismissal Interaction:** The user **cannot** dismiss via `Escape` — they must authenticate. If Modal 1 is closed via its `X` button, a floating `?` icon appears next to Modal 2. Clicking it slides Modal 1 back into its original position. Upon successful login in Modal 2, both modals fade out, and the background blur animates to `0px`, unlocking the UI.
* **Error States:** Login failures display an inline error message inside Modal 2 with a subtle shake animation on the form.

---

## 5. Main IDE Interface (`/workspace`)
The authenticated workspace is a highly modular, single-page application dashboard. 

### 5.1 Top Bar (5% Screen Height)
* **File Tabs:** Horizontal scrollable row showing active files. Clicking a tab switches the central Codespace context.
  * Each tab has a **close (×) button**.
  * **Unsaved files** show a dot indicator on the tab.
  * Tabs are **drag-reorderable**.
  * **Right-click context menu** on tabs: Close, Close Others, Close All.
* **Active State:** The currently viewed file is highlighted with a brighter border or background, while inactive tabs remain dimmed.
* **Profile Icon (Top-Right):** The authenticated user's profile picture (or initials fallback) is displayed in the top-right corner of the top bar. Clicking it opens a dropdown with: **Settings, Theme, Account Info, Logout**.

### 5.2 The Central Viewport (Codespace & Terminal)
This is the primary interaction zone. It dynamically resizes based on which sidebars or bottom drawers are currently open.

* **Collaborator Presence Bar:** In the horizontal strip between the top bar and the editor/terminal canvas, a row of collaborator profile pictures (or initials) is displayed. This shows all contributors currently **active in this timeline / in the project / currently online**. Avatars have colored rings matching their cursor color. Hovering shows the user's name; clicking jumps to their cursor position. Avatars collapse into a `+N` badge when space is limited.
* **Segmented View Toggle:** Located top-center of the viewport. A flat, pill-shaped toggle to switch **exclusively** between `</> Editor` and `>- Terminal`. Only one view is visible at a time (no split view).
* **Editor View (Codespace):**
    * Rendered with **Monaco Editor** using `JetBrains Mono` font at **14px** default size.
    * **Minimap** (scrollbar preview) is shown.
    * **Line numbers** are shown (absolute).
    * **Word wrap** is on by default.
    * **Multi-cursor presence:** Every collaborator viewing the same file in the same timeline has a visible cursor in the editor with different colors and floating name tags.
    * **AI Block Interaction:** When the AI agent modifies code, the affected section is rendered as a distinct, slightly elevated "block" (Notion-style) within the editor. This block is visually differentiated (e.g., subtle background tint, left-border accent). The block supports **four actions:**
      1. **Accept** (green check) — Merges the AI code into the document as normal text.
      2. **Decline** (red cross) — Removes the block entirely, reverting to the previous code.
      3. **Modify** (pencil icon) — Opens the block for inline editing before accepting.
      4. **Move** (drag handle or arrow icons) — Repositions the block to a different location in the file.
    * Accepted blocks dissolve into standard plain text with a brief green flash animation. Declined blocks collapse with a red flash.
* **Terminal View:**
    * Rendered with **xterm.js**. Terminal color scheme **matches the active app theme**.
    * Supports **multiple terminal tabs** (like VS Code) — users can open, close, and switch between terminal instances.
    * Includes a **clear** button in the terminal toolbar.
    * Users type directly into the xterm canvas (no separate input field).
    * Displays a live command-line interface streaming stdout/stderr from the Docker container.
    * **Shared Terminal / Permissions UI:** When viewing a co-worker's terminal, **input is fully disabled** until the terminal owner grants editing access. A banner at the top of the terminal clearly indicates the current permission level ("View Only" or "Full Access"). The terminal owner can grant/revoke access in real-time via the Collaboration drawer.

### 5.3 Left Sidebar (File Explorer)
* **Trigger:** Toggled via a folder icon on the far-left edge of the screen. Also toggleable via keyboard shortcut (e.g., `Ctrl+B`).
* **Animation:** Slides in from the left, smoothly pushing the Central Viewport to the right (taking up width).
* **Collapse Behavior:** When closed, the sidebar **fully disappears** — no thin rail or residual icons.
* **Width:** Resizable via a drag handle on the right edge. Min/max width constraints ensure usability.
* **Content:** A collapsible tree view of the project directory.
* **File Icons:** **Language-specific icons** for files (e.g., React logo for `.tsx`, Python snake for `.py`, JS yellow for `.js`). Folders use distinct open/closed chevron icons.
* **File Operations:** Full CRUD support:
  * **Create** new files/folders via a "+" button at the top of the sidebar AND via right-click context menu.
  * **Rename** files/folders inline (double-click or right-click → Rename).
  * **Delete** files/folders with a confirmation dialog.
  * **Drag and drop** to move files between folders.
* **Search (Emphasize This):** 
  * A prominent **filter/search bar** at the top of the file explorer for filtering the tree in real-time.
  * A **global quick-open** shorctut (`Ctrl+P`) opens a floating search modal — fuzzy-matching file names across the entire project. This should feel fast, polished, and premium (think VS Code's Quick Open but with the iTECify aesthetic). Show file path breadcrumbs, recent files, and instant preview on hover.

### 5.4 Right Sidebar (AI & History)
* **Trigger:** Toggled via icons on the far-right edge of the screen. Slides in, pushing the Central Viewport to the left. Also toggleable via keyboard shortcut.
* **Collapse Behavior:** When closed, the sidebar **fully disappears**.
* **Width:** Resizable via drag handle. Can be open simultaneously with the left sidebar.
* **Header Toggles:** Two distinct buttons to switch the sidebar's internal content.
  * **AI Agent:** Full **conversational chat interface** with message bubbles and scrollable history.
    * Chat history **persists across sessions** (saved to database).
    * Users can **reference specific files or code selections** in prompts (e.g., `@filename` mentions, or auto-context from the currently open file).
    * AI responses **stream word-by-word** (ChatGPT-style) with a **stop generation** button visible during streaming.
    * Previous messages can be edited and regenerated.
    * **Quick-action chips** displayed above the input field: "Refactor", "Explain", "Write Tests", "Fix Bug", "Optimize", "Add Comments".
  * **History Tree:** Two separate sub-views toggled within the History panel:
    * **File-Level History:** Vertical timeline / git-style branch graph showing the current file's evolution. Each node shows compacted details (timestamp, author avatar, short commit message, diff stats). Hovering a node shows a diff preview. Clicking a node opens that version of the file for viewing or editing (enabling time-travel to edit a previous version).
    * **Project-Level History:** Same visualization style but showing all project-wide changes across all files. Separate view from file-level, toggled via a sub-tab or dropdown.

### 5.5 Bottom Drawers (Functionality Hub)
Replaces the traditional top-menu bar of desktop IDEs. These act as minimized tabs anchored to the bottom edge of the screen.

* **Collapsed State:** When closed, the drawers appear as **bookmark-style horizontal text labels** sitting at the very bottom of the screen. Because they are horizontal, text labels fit naturally.
* **Open State:** Clicking a label opens the drawer panel as an **overlay above the codespace** (similar to a modal/popover) — it does **NOT** compress or resize the Central Viewport. Panels are **resizable** in height via a drag handle on the top edge. Only **one drawer** is open at a time — clicking another tab swaps the content.

#### 5.5.1 Timeline Manager
* Visual **timeline** manager (not called "branches" — the concept is **timelines**).
* Shows all active timelines in a vertical graph view. The **main timeline** ("trunk") is visually distinct (e.g., thicker line, highlighted label).
* Users can **create** a new timeline to branch off the current state and experiment safely.
* Users can **name** their timelines with custom labels.
* Users can **merge** a timeline back into the main trunk.
* Users can **delete** a timeline (with confirmation).

#### 5.5.2 Run & Debug
* **Horizontal toolbar** with Play, Stop, Restart buttons.
* Clicking **Run auto-saves** the current file before execution.
* The **language/runtime is configured at project creation** — the Docker environment is pre-built with all necessary tools for the project's language. Run is a generic action; no per-run language selector needed.
* Build status is shown as an icon + status text (e.g., "Running…", "Completed", "Failed") with optional log output below.

#### 5.5.3 Environment Settings
* Docker configuration panel for the project's sandbox container.
* **CPU/Memory sliders** are **live-updating** — changes take effect immediately without needing a manual restart.
* **Language images** available: Node.js, Python, Rust, Go, Java, and more of the most common languages/runtimes.
* **Environment variables** section: a key-value editor for defining env vars passed to the container.

#### 5.5.4 Collaboration
* Shows the same user list as the **Collaborator Presence Bar** (top of viewport), but with additional detail.
* **Terminal access toggle** is **multi-level**: None / View Only / Full Access — set per collaborator.
* The session/project owner can **kick** a user from the session.
* An **invite button** generates a **shareable link** to join the session.

#### 5.5.5 Theme
* Theme selection drawer where users switch between predefined themes (Lagoon Dark, Dracula, One Dark, Neutral Gray, Lagoon Light, etc.).

---

## 6. Project & Session Management

### 6.1 Project Creation
When a user first enters the workspace with no projects (or clicks "New Project"):
* A **project creation modal** appears.
* **Template selection:** Choose from blank, React, Python, Node.js, Rust, Go, Java, etc.
* **Import from GitHub:** Option to import an existing repository.
* **Required inputs:** Project name, description, primary language, visibility (public/private).

### 6.2 Project Dashboard
* There is a **dedicated `/projects` page** listing all the user's projects (cards or list view with metadata: name, language, last edited, collaborator count).
* Additionally, within the workspace, a **per-project dashboard "drawer"** provides quick project info and actions without leaving the editor.

### 6.3 Sessions
* A **session** is not the same as a **project**. **Multiple sessions can exist on the same project** simultaneously.
* Each session is an independent editing context — collaborators in the same session share real-time presence and cursor sync.
* Session identity is managed server-side and linked to the project.

### 6.4 Sharing & Inviting
* **Shareable link:** Users generate an invite link from the Collaboration drawer.
* **Permission levels:** Owner, Editor, Viewer.
* **Public projects:** Can be set to allow anyone with the link to join (as Viewer or Editor, configurable by the owner).
---

## 7. Layout & Responsiveness

### 7.1 Minimum Screen Size
* Minimum supported viewport: **1280×720**.

### 7.2 Space Allocation
* The **codespace (editor/terminal)** is the **primary consumer of screen real estate**. All other elements work around it:
  * The **left sidebar (file explorer)** and **right sidebar (AI/History)** take width from the sides, pushing the codespace inward.
  * The **top bar** (file tabs + profile) takes a fixed 5% height.
  * The **bottom drawer tabs** are a thin strip at the bottom.
* **Bottom drawers do NOT resize the codespace.** When a drawer opens, it appears as an **overlay above the codespace**, similar to a modal. The editor content remains fully visible underneath at its current size.
* Both sidebars can be open simultaneously. A minimum editor width constraint ensures the codespace is always usable.

### 7.3 Keyboard Shortcuts
IDE-level keyboard shortcuts are supported:
* `Ctrl+S` — Save current file
* `Ctrl+P` — Quick-open file (global fuzzy search)
* `Ctrl+Shift+P` — Command palette
* `Ctrl+B` — Toggle left sidebar (file explorer)
* `` Ctrl+` `` — Toggle editor/terminal view
* `Ctrl+/` — Toggle right sidebar (AI/History)
* Additional shortcuts can be added and customized.

---

## 8. Notifications & Toasts

* **Toast notifications** for ephemeral events: file saved, container started/stopped, user joined/left, AI response ready, errors.
* **Notification bell** (in the top bar near profile icon) for persistent events that the user may have missed.
* **Toast position:** Bottom-right corner of the viewport.
* **Auto-dismiss:** 4 seconds for info toasts, persistent until dismissed for errors.

---

## 9. Loading, Error & Empty States

### 9.1 Initial Workspace Loading
* While the IDE loads (fetching project data, connecting WebSocket, initializing Docker state), the user sees a full **skeleton UI** — gray placeholder blocks in the shape of the IDE layout (top bar, sidebar outlines, editor area, bottom tabs). This provides a sense of structure and progress.

### 9.2 WebSocket Disconnection
* If the WebSocket connection drops, a **subtle banner** slides down from the top of the codespace with an auto-reconnect countdown (e.g., "Connection lost. Reconnecting in 5s…"). The UI remains usable for local editing. Once reconnected, changes sync automatically.

### 9.3 Docker Container Crash
* If the container crashes or fails, the terminal view shows a clear **error message**: "Server Error — Docker failed to run the code." with a "Retry" button. The error is also surfaced as a toast notification.

### 9.4 Empty State — No File Selected
* When no file is open in the editor, the codespace shows a **welcome message** and a **small interactive tutorial** introducing key IDE features and shortcuts (e.g., "Press `Ctrl+P` to open a file", "Use the file explorer to browse your project").

### 9.5 Empty State — No Files in File Tree
* The file explorer shows a friendly message: e.g., "This project has no files yet" with a "+ New File" button and a hint to import from GitHub.

### 9.6 Empty State — No History
* The History Tree panel shows a message: "No modification history in this project yet" — encouraging the user to start editing to build a timeline.

---

## 10. Time-Travel Flow (Deep Dive)

### 10.1 Decision Modal for Co-Contributors ("Follow or Stay")
* When a user initiates time-travel, co-contributors in the same session receive a **toast-style popup** (not a full blocking modal).
* The toast presents two options: **"Follow"** (jump to the same historical state) or **"Stay"** (remain on the current timeline).
* If no decision is made within a time limit (e.g., 10 seconds), it **auto-defaults to "Stay"**.
* If the user choosing "Follow" has unsaved changes, those changes are **auto-saved before leaving** the current state.

### 10.2 Timeline Split Visualization
* After a time-travel action creates a new timeline, it appears in the **Timeline Manager** (bottom drawer) as a new branch forking off the main trunk at the selected point.
* The "old" timeline remains fully accessible — users can switch between timelines.
* Timelines can be compared via the History Tree diff previews.

---

## 11. Branding & Visual Identity

* **Primary brand color:** `--lagoon` (#4fb8b2 / teal) remains the primary accent color.
* **Logo:** Text wordmark ("iTECify") for now. A graphic logo will be added later.
* **Favicon:** Custom favicon (design to be determined later).

---