# iTEC 2026 — Collaborative Coding Platform

Full-stack collaborative coding platform with:
- Real-time multi-user editing
- Project/file management
- Role-aware sharing via invites
- Collaborative terminal session control
- AI-assisted file editing
- Dockerized local and production deployment

This repository contains both frontend and backend applications plus deployment configuration.

## Table of Contents

- [What This App Is](#what-this-app-is)
- [Monorepo Layout](#monorepo-layout)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Core Features](#core-features)
- [Authentication and Authorization](#authentication-and-authorization)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Docker Development Stack](#docker-development-stack)
- [Production Deployment](#production-deployment)
- [API Surface](#api-surface)
- [Realtime Socket Events](#realtime-socket-events)
- [Data Model (Prisma/PostgreSQL)](#data-model-prismapostgresql)
- [Testing and Quality Commands](#testing-and-quality-commands)
- [Troubleshooting](#troubleshooting)
- [Operational and Security Notes](#operational-and-security-notes)

## What This App Is

The platform is designed for collaborative coding sessions where multiple users can:
- Create and manage projects
- Edit files in a Monaco-based workspace
- Synchronize edits in real time through Yjs + Socket.IO
- Use a shared terminal with ownership/access controls
- Import files from local payloads or GitHub
- Browse and restore document history snapshots/updates
- Request AI edit suggestions for the current file

## Monorepo Layout

```text
itec2026/
├── client/                     # React + Vite + TanStack frontend
├── server/                     # Express + Prisma + Socket.IO backend
├── docker/                     # Dockerfiles for client/server images
├── deploy/nginx/               # Nginx example config
├── docs/                       # Deployment/ADR docs
├── docker-compose.yml          # Local stack (postgres + dind + server + client)
├── docker-compose.prod.yml     # Production-like stack
├── .env.example                # Server-oriented environment template
└── .env.production.example     # Production environment template
```

## Tech Stack

### Frontend (`client/`)
- React 19
- Vite 7
- TypeScript
- TanStack Router + Query
- Tailwind CSS 4
- Monaco Editor + y-monaco + Yjs
- xterm.js (terminal UI)
- Auth0 React SDK
- Vitest + Testing Library

### Backend (`server/`)
- Node.js + Express
- TypeScript
- Prisma + PostgreSQL
- Socket.IO
- Yjs
- dockerode (sandbox/terminal runtime integration)
- jose (JWT verification paths)
- Zod (input validation)

### Infra
- Docker Compose for local and production orchestration
- Nginx reverse proxy example for VPS deployments

## Architecture Overview

1. Frontend calls REST endpoints on the API server for project/file/invite/AI operations.
2. Frontend opens Socket.IO connection for collaboration and terminal state/events.
3. Backend persists projects, membership, file metadata, Yjs history in PostgreSQL.
4. File content blobs are stored on disk (`FILES_STORAGE_ROOT`).
5. Workspace live-sync stores project files on disk (`COLLAB_WORKSPACE_ROOT`) for terminal execution.
6. Terminal sessions are orchestrated through Docker runtime integration.

Main entrypoints:
- Client API config: `client/src/lib/api-config.ts`
- Server bootstrap: `server/src/index.ts`
- Realtime server wiring: `server/src/ws/collab-server.ts`

## Core Features

### 1) Project and Member Management
- Create, update, delete projects
- List project dashboard summaries
- Invite collaborators by token
- Accept/revoke invites
- List and update member profile metadata
- Remove collaborators (owner-protection rule enforced)

### 2) File and Folder Management
- Create/read/update/delete files
- Folder create/rename/delete
- List files and folder paths per project
- Import files in bulk from local payload
- Import repository contents from GitHub

### 3) Realtime Collaboration
- Join/leave project presence rooms
- Join/leave document sessions
- Yjs update propagation
- Cursor and project activity broadcasting
- Dirty-state reporting
- File create/update/delete event fanout

### 4) History and Restore
- List project-level history events
- List file-level history entries
- Preview a specific history entry content
- Restore a file from a specific history event
- Yjs rewind timeline support in collaboration events

### 5) Collaborative Terminal
- Terminal listing by project
- Join terminal channels per owner
- Open/input/resize/close terminal sessions
- Request/approve/reject/revoke terminal control access
- Stream stdout/stderr/system output to participants

### 6) AI Edit Suggestion Endpoint
- Accepts prompt + file content metadata
- Calls DeepSeek provider
- Returns structured response containing summary, diff hunks, updated content, warnings

## Authentication and Authorization

- Client uses Auth0 SPA integration.
- Server parses bearer tokens and builds actor context with optional profile extraction.
- Protected routes use `requireTokenPresent` middleware.
- Token subject verification supports:
  - Auth0 RS256 verification via JWKS when `AUTH0_DOMAIN` + `AUTH0_AUDIENCE` are configured
  - Local JWT verification fallback (HS256 secret or RS256 public key) when Auth0 settings are absent
- Project/file access checks are enforced in service/router layer (`canReadProject`, `canEditProject`, and repository-backed checks).

## Environment Variables

### Root `.env.example` (server/runtime oriented)

| Variable | Purpose |
|---|---|
| `PORT` | API server port (default expected 4000) |
| `CLIENT_ORIGIN` | Allowed CORS origin for browser app |
| `DATABASE_URL` | PostgreSQL connection string for Prisma |
| `AUTH_JWT_HS256_SECRET` | Local HS256 JWT verification secret |
| `AUTH_JWT_ISSUER` | Local JWT issuer |
| `AUTH_JWT_AUDIENCE` | Local JWT audience |
| `FILES_STORAGE_ROOT` | Disk root for file/blob content |
| `COLLAB_WORKSPACE_ROOT` | Disk root for workspace sync/sandbox mount |
| `COLLAB_WORKSPACE_MAX_SYNC_FILE_BYTES` | Max file size considered for sync |
| `COLLAB_WORKSPACE_EXCLUDED_DIRS` | Excluded dirs for workspace sync |
| `COLLAB_WORKSPACE_LIVE_SYNC_DEBOUNCE_MS` | Debounce interval for sync writes |
| `COLLAB_WORKSPACE_LIVE_SYNC_POLL_MS` | Poll interval for live sync |
| `COLLAB_DOCKER_SOCKET_PATH` | Optional Docker socket path |
| `DOCKER_HOST` | Optional Docker host endpoint |
| `DOCKER_TLS_VERIFY` | Optional Docker TLS toggle |
| `COLLAB_DOCKER_LOG_LEVEL` | Docker runtime log verbosity |
| `COLLAB_TERMINAL_DOCKER_IMAGE` | Sandbox image used by terminal runtime |
| `COLLAB_TERMINAL_DOCKER_AUTO_PULL` | Auto-pull sandbox image toggle |
| `COLLAB_TERMINAL_DOCKER_UID` | UID used in sandbox |
| `COLLAB_TERMINAL_DOCKER_GID` | GID used in sandbox |
| `COLLAB_TERMINAL_DOCKER_CPU` | CPU quota for sandbox |
| `COLLAB_TERMINAL_DOCKER_MEMORY` | Memory limit for sandbox |
| `COLLAB_TERMINAL_DOCKER_PIDS_LIMIT` | PID limit for sandbox |
| `COLLAB_TERMINAL_TERM` | TERM value for sandbox shell |
| `COLLAB_TERMINAL_LANG` | LANG value |
| `COLLAB_TERMINAL_LC_ALL` | LC_ALL value |
| `COLLAB_TERMINAL_COMMAND_TIMEOUT_MS` | Terminal command timeout |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `DEEPSEEK_MODEL` | DeepSeek model name |
| `DEEPSEEK_TIMEOUT_MS` | AI request timeout |
| `DEEPSEEK_BASE_URL` | DeepSeek base URL |

### Client `client/.env.example`

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base URL (frontend calls) |
| `VITE_AUTH0_DOMAIN` | Auth0 tenant domain |
| `VITE_AUTH0_CLIENT_ID` | Auth0 SPA client ID |
| `VITE_AUTH0_AUDIENCE` | Auth0 audience/API identifier |
| `VITE_AUTH0_REDIRECT_URI` | Auth0 callback URL |
| `VITE_AUTH0_LOGOUT_RETURN_TO` | Auth0 logout return URL |
| `VITE_AUTH0_ROLES_CLAIM` | Custom JWT claim containing role list |

### Production template `.env.production.example`

Includes:
- Public URL and host allow-list settings
- Postgres credentials
- Auth0 server + client values
- Optional local JWT fallback values
- Optional DeepSeek settings

## Local Development

### Prerequisites
- Node.js 22+
- npm
- PostgreSQL 16+ (or Docker Compose local stack)
- Docker Engine (required for collaborative terminal features)

### 1) Clone and configure env files

```bash
cp .env.example .env
cp client/.env.example client/.env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item client/.env.example client/.env
```

Fill all required values (at minimum DB, Auth settings, API URL alignment).

### 2) Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 3) Database and Prisma

From `server/`:

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

### 4) Start backend and frontend

Terminal A (`server/`):

```bash
npm run dev
```

Terminal B (`client/`):

```bash
npm run dev
```

Default local URLs:
- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

## Docker Development Stack

The local compose file starts:
- `postgres`
- `dockerd` (Docker-in-Docker daemon for terminal sandboxing)
- `server`
- `client`

Start:

```bash
docker compose up --build
```

Stop:

```bash
docker compose down
```

Important local compose notes:
- PostgreSQL is exposed on `5432`
- Server is exposed on `4000`
- Client is exposed on `3000`
- Server uses mounted volumes for file and workspace persistence

## Production Deployment

Use production compose with env-file:

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Production stack behavior:
- Server runs migrations and starts compiled build
- Client builds and serves preview on port 3000
- Services bind to localhost by default in compose (`127.0.0.1:*`)
- Intended to sit behind a reverse proxy (Nginx example in `deploy/nginx/itec2026.conf.example`)

See detailed VPS flow in `docs/deployment-digitalocean-nginx.md`.

## API Surface

Base URL: `http://localhost:4000` (unless configured otherwise)

### General
- `GET /health`

### Projects (`/api/projects`)
- `GET /`
- `GET /:projectId`
- `GET /:projectId/dashboard`
- `POST /`
- `PATCH /:projectId`
- `DELETE /:projectId`
- `DELETE /:projectId/collaborators/:subject`
- `POST /:projectId/invites`
- `GET /:projectId/members`
- `PATCH /:projectId/members/me`
- `GET /:projectId/invites`
- `DELETE /:projectId/invites`

### Invites (`/api/invites`)
- `GET /:token`
- `POST /:token/accept`

### Files (`/api/files`)
- `GET /?projectId=...`
- `GET /folders?projectId=...`
- `GET /history/project?projectId=...&limit=...`
- `POST /history/project/:eventId/restore`
- `GET /history/file/:fileId?projectId=...&limit=...`
- `GET /history/file/:fileId/:entryId?projectId=...`
- `POST /history/file/:fileId/:entryId/restore`
- `GET /:fileId`
- `POST /`
- `POST /import/local`
- `POST /import/github`
- `POST /folders`
- `PATCH /folders`
- `PATCH /:fileId`
- `DELETE /folders`
- `DELETE /:fileId`

### Runner (`/api/runner`)
- `GET /health`

### AI (`/api/ai`)
- `GET /health`
- `POST /edit-current-file`

## Realtime Socket Events

Primary collaboration namespace events include:

### Connection/Presence
- `collab:connected`
- `collab:join-project`
- `collab:leave-project`
- `collab:presence`
- `collab:error`

### File and Project Activity
- `collab:file:created`
- `collab:file:updated`
- `collab:file:deleted`
- `collab:project:activity`

### Document Collaboration
- `collab:doc:join`
- `collab:doc:leave`
- `collab:doc:sync`
- `collab:doc:update`
- `collab:doc:saved`
- `collab:doc:presence`
- `collab:doc:cursor`
- `collab:doc:dirty-state`
- `collab:doc:timeline:list`
- `collab:doc:timeline`
- `collab:doc:rewind`
- `collab:doc:rewind:result`
- `collab:doc:snapshot:preview`
- `collab:doc:snapshot:preview:data`

### Terminal Collaboration
- `collab:terminal:list`
- `collab:terminal:join`
- `collab:terminal:leave`
- `collab:terminal:open`
- `collab:terminal:input`
- `collab:terminal:resize`
- `collab:terminal:close`
- `collab:terminal:state`
- `collab:terminal:output`
- `collab:terminal:access:request`
- `collab:terminal:access:requested`
- `collab:terminal:access:decision`
- `collab:terminal:control:revoke`

## Data Model (Prisma/PostgreSQL)

Main tables/models:
- `Project`
- `File`
- `ProjectMember`
- `ProjectInvite`
- `YjsAggregate`
- `YjsUpdate`
- `YjsSnapshot`
- `YjsRewind`

Highlights:
- Files are unique per project path
- Membership is unique per project+subject
- Invite token hashes are unique
- Yjs updates tracked with per-file sequence ordering
- Rewind edges are stored for history graph reconstruction

Schema location: `server/prisma/schema.prisma`

## Testing and Quality Commands

### Client (`client/`)
- `npm run test`
- `npm run lint`
- `npm run format`
- `npm run check`
- `npm run build`

### Server (`server/`)
- `npm run test`
- `npm run check`
- `npm run build`
- `npm run socket:test`
- `npm run prisma:migrate:deploy`

## Troubleshooting

- **Client cannot reach API:** verify `VITE_API_BASE_URL` and CORS `CLIENT_ORIGIN`.
- **401/authorization errors:** ensure valid bearer token is being sent and Auth0 audience/domain values match.
- **Invite link invalid/expired:** check invite lifecycle status (`consumedAt`, `revokedAt`, `expiresAt`).
- **Realtime not syncing:** confirm Socket.IO connection, project/file join authorization, and backend logs for `collab:error`.
- **Terminal unavailable:** verify Docker daemon accessibility (`DOCKER_HOST`/socket) and sandbox image availability.
- **GitHub import fails:** validate repository URL format and outbound network access from server container.
- **AI endpoint fails:** ensure `DEEPSEEK_API_KEY` is present and provider URL/model are valid.
- **Prisma issues at startup:** run `npm run prisma:generate` and required migrations in `server/`.

## Operational and Security Notes

- Never commit real secrets in `.env` files.
- Keep Docker daemon endpoints private; do not expose internal daemon ports publicly.
- The server container is highly privileged in terminal-enabled deployments; treat host hardening seriously.
- Rotate credentials immediately if leaked.
- Enforce HTTPS and reverse proxy hardening in production.

---

If you are onboarding quickly, start with:
1. `docker compose up --build`
2. Check `http://localhost:4000/health`
3. Open `http://localhost:3000`
4. Validate auth + project creation + collaborative workspace flow
