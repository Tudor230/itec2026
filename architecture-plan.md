# iTECify — Implementation Plan

## Vision

Build **iTECify**, a Figma-like collaborative coding platform where multiple users and AI agents can edit code together in real time, run it in secure sandboxes, and stream output live.

## Current State

- **Frontend:** TanStack Start (React) app in `client/` with Auth0 auth, TanStack Router/Query, Tailwind CSS v4, glassmorphism theme
- **Backend:** None — needs to be built from scratch
- **Infra:** None — needs Docker Compose for local + remote deployment

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Code Editor** | Monaco Editor | VS Code familiarity, strong language support, `y-monaco` Yjs binding available |
| **CRDT Library** | Yjs | Industry standard, battle-tested, good Monaco integration |
| **WebSocket** | Socket.IO | Reliable transport with fallbacks, rooms/namespaces for collaboration |
| **Backend** | Single Node.js + Express server | Fast to build, clear module separation, no microservice overhead |
| **Database** | PostgreSQL (via Docker Compose) | Production-grade, consistent with Docker-based deployment |
| **AI Provider** | DeepSeek (default), BYOK support later | Cost-effective, good code generation, extensible to other providers |
| **Container Runtime** | Docker via dockerode | Direct Docker API access for sandbox execution |
| **Deployment** | Docker Compose (local + remote) | Single `docker compose up` for the full stack |

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (React)                    │
│  TanStack Start · Monaco · Yjs · Socket.IO Client   │
└──────────────┬──────────────────┬───────────────────┘
               │ REST/WS          │ y-websocket
               ▼                  ▼
┌─────────────────────────────────────────────────────┐
│                 SERVER (Express)                     │
│                                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────────────┐  │
│  │  /auth    │ │  /collab  │ │  /runner          │  │
│  │  Auth0 JWT│ │  Yjs sync │ │  Docker lifecycle │  │
│  │  verify   │ │  Presence │ │  Stream output    │  │
│  └───────────┘ └───────────┘ └───────────────────┘  │
│  ┌───────────┐ ┌───────────────────────────────────┐ │
│  │  /ai      │ │  /projects                       │ │
│  │  DeepSeek │ │  CRUD · Files · Persistence      │ │
│  │  BYOK     │ │                                   │ │
│  └───────────┘ └───────────────────────────────────┘ │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
       ┌───────▼───────┐  ┌──────▼──────┐
       │  PostgreSQL   │  │   Docker    │
       │  Projects     │  │   Sandbox   │
       │  Files        │  │   Containers│
       │  Yjs state    │  │             │
       └───────────────┘  └─────────────┘
```

## Implementation Phases

### Phase 0: Backend Bootstrap (Days 1–2)

**Goal:** Get a working server that the frontend can talk to.

- [ ] Initialize `server/` with Express + TypeScript
- [ ] Set up module structure: `modules/auth`, `modules/projects`, `modules/collab`, `modules/runner`, `modules/ai`
- [ ] REST endpoints: health, project CRUD, file CRUD
- [ ] Socket.IO gateway for real-time events
- [ ] Auth boundary middleware (optional bearer token parsing now; Auth0 JWT verification deferred)
- [ ] PostgreSQL connection via Prisma or Drizzle ORM
- [ ] Docker Compose: `client`, `server`, `postgres`
- [ ] Wire frontend to backend via environment config

**Exit criteria:** Frontend can create, load, and save projects/files through the API.

---

### Phase 1: Collaborative Editor (Days 3–7)

**Goal:** Multiple users editing code together in real time with presence.

- [ ] Integrate Monaco Editor in the frontend
- [ ] Set up Yjs document model (one Y.Doc per file)
- [ ] Connect Yjs to server via `y-websocket` or custom Socket.IO transport
- [ ] Implement `y-monaco` binding for real-time sync
- [ ] Presence awareness: cursor positions, selections, user colors, names
- [ ] File tree UI with multi-file project support
- [ ] Persist Yjs document state to PostgreSQL (debounced snapshots)
- [ ] Reconnection and state recovery handling

**Exit criteria:** Two browser tabs can open the same project, see each other's cursors, and edit collaboratively without conflicts.

---

### Phase 2: Sandbox Execution (Days 8–12)

**Goal:** Run user code safely in Docker containers and stream output live.

- [ ] Docker integration via `dockerode` library
- [ ] Pre-built base images for Node.js and Python (Rust as stretch goal)
- [ ] Run flow: extract files → mount into container → execute → stream output
- [ ] Resource limits: `--cpus=0.5`, `--memory=256m`, `--network=none`, timeout kill (30s)
- [ ] Drop capabilities, read-only root filesystem where possible
- [ ] Run state machine: `queued` → `building` → `running` → `completed` / `failed` / `timeout`
- [ ] Stream stdout/stderr to client via Socket.IO with ANSI color rendering
- [ ] Run history and output persistence
- [ ] Frontend run panel: run button, output terminal (xterm.js), status indicator

**Exit criteria:** User clicks "Run", code executes in an isolated Docker container, output streams live to the browser. Infinite loops get killed after timeout.

---

### Phase 3: AI Integration (Days 13–16)

**Goal:** AI-assisted coding with inline suggestions that can be accepted or rejected.

- [ ] Server-side AI module with DeepSeek API integration
- [ ] BYOK (Bring Your Own Key) support: users can configure their own API key + provider
- [ ] Provider abstraction layer (DeepSeek now, OpenAI/Anthropic/Gemini later)
- [ ] AI suggestions rendered as inline Monaco decorations / diff blocks
- [ ] Accept: merge suggestion into the Yjs document
- [ ] Reject: dismiss the decoration
- [ ] AI agent appears as a named presence in the collaboration session ("AI Assistant")
- [ ] Context-aware suggestions: send current file + cursor position + optional prompt
- [ ] Chat panel for conversational AI interaction

**Exit criteria:** User can request AI help, see suggestions inline in the editor, and accept/reject them with one click.

---

### Phase 4: Polish & Side-Quests (Days 17–20)

**Goal:** Make it demo-ready and impressive.

#### Must-Do
- [ ] Error handling and loading states across the entire app
- [ ] Onboarding flow (create project → open editor → explain features)
- [ ] Responsive design for presentation on projector/large screen
- [ ] Docker Compose production config (frontend build, server, postgres, base images)
- [ ] Environment variable documentation and `.env.example`
- [ ] Demo script and talking points

#### Side-Quests (if time permits)
- [ ] **Shared terminal:** `node-pty` + `xterm.js`, broadcast via Socket.IO
- [ ] **Time-travel replay:** store Yjs update log, play back with timeline scrubber UI
- [ ] **Smart resource limits UI:** show CPU/memory usage gauges during execution
- [ ] **Pre-run vulnerability scan:** basic dependency check before container start

**Exit criteria:** A deployable, demo-ready platform that runs with `docker compose up`.

---

## Project Structure (Target)

```
itec2026/
├── client/                    # Frontend (existing TanStack Start app)
│   └── src/
│       ├── components/
│       │   ├── editor/        # Monaco + Yjs integration
│       │   ├── terminal/      # Run output / shared terminal
│       │   ├── ai/            # AI suggestion UI, chat panel
│       │   ├── project/       # File tree, project management
│       │   └── ...            # Existing components
│       ├── hooks/             # useCollaboration, useRunner, useAI
│       ├── services/          # API client, Socket.IO client
│       └── routes/            # Existing + editor route
├── server/                    # Backend (new)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/          # JWT validation, user context
│   │   │   ├── projects/      # Project + file CRUD
│   │   │   ├── collab/        # Yjs sync, presence
│   │   │   ├── runner/        # Docker lifecycle, output streaming
│   │   │   └── ai/            # DeepSeek integration, BYOK
│   │   ├── db/                # Database schema, migrations
│   │   ├── ws/                # Socket.IO setup, event routing
│   │   └── index.ts           # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── docker/                    # Dockerfiles for base images
│   ├── Dockerfile.client
│   ├── Dockerfile.server
│   ├── sandbox-node/Dockerfile
│   └── sandbox-python/Dockerfile
├── docker-compose.yml         # Full stack orchestration
├── packages/                  # Shared types (optional)
│   └── contracts/             # Shared TypeScript types/events
├── plan.md                    # This file
└── requirements.md            # Original requirements
```

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `y-monaco` integration is fiddly with cursor sync | HIGH | Start with simplest possible binding, test with 2 clients immediately, have fallback to plain text sync |
| Docker socket mount is a security concern | HIGH | Use `--network=none`, drop all capabilities, `--read-only`, memory/CPU limits, timeout kill |
| DeepSeek API latency degrades UX | MEDIUM | Show loading skeleton, stream responses, cache common suggestions |
| Auth0 JWT validation adds request overhead | LOW | Cache JWKS, use middleware only on protected routes |
| Large Yjs documents degrade performance | LOW | Unlikely at demo scale; snapshot compaction if needed |

## Success Criteria

1. ✅ Real-time collaborative editing with stable multi-cursor presence (2+ users)
2. ✅ Code executes in isolated Docker containers with enforced resource limits
3. ✅ Live run output streams reliably to all connected clients
4. ✅ AI suggestions can be requested, viewed inline, and accepted/rejected
5. ✅ Full stack deploys with a single `docker compose up`
6. ✅ Demo runs smoothly for 10+ minutes without crashes
