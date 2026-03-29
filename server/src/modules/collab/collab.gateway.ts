import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import * as Y from 'yjs'
import { z } from 'zod'
import type { ActorContext } from '../auth/actor-context.js'
import {
  registerCollabFileCreatedListener,
  registerCollabFileDeletedListener,
  registerCollabFileUpdatedListener,
} from './collab-events.js'
import { TerminalSessionManager } from './terminal/terminal-session-manager.js'

export type SocketActorResolver = (socket: Socket) => Promise<ActorContext>
export type ProjectJoinAuthorizer = (
  actor: ActorContext,
  projectId: string,
) => Promise<boolean>
export type FileJoinAuthorizer = (
  actor: ActorContext,
  projectId: string,
  fileId: string,
) => Promise<boolean>
export type FileContentLoader = (
  actor: ActorContext,
  projectId: string,
  fileId: string,
) => Promise<string | null>
export type YjsHistoryState = {
  snapshot: Uint8Array | null
  updates: Uint8Array[]
  lastSequence: number
}
export type YjsHistoryLoader = (
  actor: ActorContext,
  projectId: string,
  fileId: string,
) => Promise<YjsHistoryState | null>
export type YjsUpdateAppender = (
  actor: ActorContext,
  projectId: string,
  fileId: string,
  update: Uint8Array,
) => Promise<{ sequence: number }>
export type YjsSnapshotSaver = (
  actor: ActorContext,
  projectId: string,
  fileId: string,
  sequence: number,
  update: Uint8Array,
) => Promise<void>
export type TerminalCommandAuthorizer = (
  actor: ActorContext,
  projectId: string,
) => Promise<boolean>

export interface CollabProjectSyncHooks {
  onProjectJoin?: (projectId: string) => Promise<void> | void
  onProjectLeave?: (projectId: string) => Promise<void> | void
}

export type ExternalDocResetPersister = (
  projectId: string,
  fileId: string,
  update: Uint8Array,
) => Promise<{ sequence: number } | null | void>

type ConnectedEvent = {
  actorType: ActorContext['type']
  socketId: string
  subject?: string
}

type ErrorEvent = {
  message: string
}

const projectJoinSchema = z.string().trim().min(1)

const docJoinSchema = z.object({
  projectId: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
})

const docUpdateSchema = z.object({
  projectId: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
  update: z.string().trim().min(1).max(400_000),
})

const docSavedSchema = z.object({
  projectId: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
})

const projectLeaveSchema = z.string().trim().min(1)

const docCursorSchema = z.object({
  projectId: z.string().trim().min(1),
  fileId: z.string().trim().min(1),
  lineNumber: z.number().int().min(1).max(1_000_000),
  column: z.number().int().min(1).max(1_000_000),
  selectionStartLineNumber: z.number().int().min(1).max(1_000_000).optional(),
  selectionStartColumn: z.number().int().min(1).max(1_000_000).optional(),
  selectionEndLineNumber: z.number().int().min(1).max(1_000_000).optional(),
  selectionEndColumn: z.number().int().min(1).max(1_000_000).optional(),
})

const projectActivitySchema = z.object({
  projectId: z.string().trim().min(1),
  fileId: z.string().trim().min(1).nullable(),
})

const terminalListSchema = z.object({
  projectId: z.string().trim().min(1),
})

const terminalJoinSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
})

const terminalOpenSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
  cols: z.number().int().min(1).max(1000).optional(),
  rows: z.number().int().min(1).max(1000).optional(),
})

const terminalInputSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
  input: z.string().min(1).max(4096),
})

const terminalResizeSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
})

const terminalCloseSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
})

const terminalAccessRequestSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
})

const terminalAccessDecisionSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
  requesterSubject: z.string().trim().min(1),
  approve: z.boolean(),
})

const terminalRevokeControlSchema = z.object({
  projectId: z.string().trim().min(1),
  ownerSubject: z.string().trim().min(1),
})

interface DocSession {
  doc: Y.Doc
  clients: Set<string>
  authorizedSubjects: Set<string>
  lastSequence: number
  updatesSinceSnapshot: number
  snapshotInFlight: boolean
}

interface RateCounter {
  windowStart: number
  count: number
}

interface DocJoinPayload {
  projectId: string
  fileId: string
}

interface DocSyncPayload {
  projectId: string
  fileId: string
  update: string
}

interface DocUpdatePayload {
  projectId: string
  fileId: string
  update: string
}

interface DocDirtyStatePayload {
  projectId: string
  fileId: string
  isDirty: boolean
  updatedAt: string
}

interface DocCursorPayload {
  projectId: string
  fileId: string
  socketId: string
  subject: string
  lineNumber: number
  column: number
  selectionStartLineNumber?: number
  selectionStartColumn?: number
  selectionEndLineNumber?: number
  selectionEndColumn?: number
  updatedAt: string
  cleared?: boolean
}

interface ProjectActivityPayload {
  projectId: string
  fileId: string | null
  socketId: string
  subject: string
  updatedAt: string
  cleared?: boolean
}

interface DocExternalChangePayload {
  projectId: string
  fileId: string
  state: 'stale' | 'reloaded'
  updatedAt: string
}

interface TerminalListPayload {
  projectId: string
  terminals: Array<{
    ownerSubject: string
    activeControllerSubject: string
    pendingRequestCount: number
  }>
}

interface TerminalStatePayload {
  projectId: string
  ownerSubject: string
  activeControllerSubject: string
  isSessionOpen: boolean
  pendingRequests: Array<{
    requesterSubject: string
    requestedAt: string
  }>
}

interface TerminalOutputPayload {
  projectId: string
  ownerSubject: string
  stream: 'stdout' | 'stderr' | 'system'
  chunk: string
  timestamp: string
}

interface TerminalAccessRequestedPayload {
  projectId: string
  ownerSubject: string
  requesterSubject: string
  requestedAt: string
}

interface TerminalAccessDecisionPayload {
  projectId: string
  ownerSubject: string
  requesterSubject: string
  status: 'approved' | 'rejected' | 'revoked'
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function consumeRateLimit(
  counters: Map<string, RateCounter>,
  key: string,
  maxRequests: number,
  windowMs: number,
) {
  const now = Date.now()
  const existing = counters.get(key)

  if (!existing || now - existing.windowStart >= windowMs) {
    counters.set(key, {
      windowStart: now,
      count: 1,
    })
    return true
  }

  if (existing.count >= maxRequests) {
    return false
  }

  existing.count += 1
  counters.set(key, existing)
  return true
}

function toPublicFileUpdatedPayload(file: {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
  source?: 'api' | 'workspace_sync'
}) {
  return {
    id: file.id,
    projectId: file.projectId,
    path: file.path,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    source: file.source,
  }
}

async function runQueuedLock<T>(
  locks: Map<string, Promise<void>>,
  key: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()

  let result: T | null = null
  let actionError: unknown = null

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        result = await action()
      } catch (error) {
        actionError = error
      }
    })
    .finally(() => {
      if (locks.get(key) === next) {
        locks.delete(key)
      }
    })

  locks.set(key, next)
  await next

  if (actionError) {
    throw actionError
  }

  return result as T
}

export function createCollabGateway(
  httpServer: HttpServer,
  resolveActor: SocketActorResolver,
  canJoinProject: ProjectJoinAuthorizer,
  canJoinFile: FileJoinAuthorizer,
  loadFileContent: FileContentLoader,
  loadYjsHistory: YjsHistoryLoader,
  appendYjsUpdate: YjsUpdateAppender,
  saveYjsSnapshot: YjsSnapshotSaver,
  canUseTerminal: TerminalCommandAuthorizer,
  terminalSessionManager: TerminalSessionManager,
  projectSyncHooks: CollabProjectSyncHooks = {},
  persistExternalDocReset?: ExternalDocResetPersister,
) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
    },
  })
  const docSessions = new Map<string, DocSession>()
  const dirtySocketsByDocRoom = new Map<string, Set<string>>()
  const projectMemberCounts = new Map<string, number>()
  const projectMemberLocks = new Map<string, Promise<void>>()
  const docUpdateLocks = new Map<string, Promise<void>>()
  const pendingSessionInitializations = new Map<string, Promise<DocSession | null>>()
  const maxDocSessions = readPositiveInt(process.env.COLLAB_MAX_DOC_SESSIONS, 200)
  const maxDocsPerSocket = readPositiveInt(process.env.COLLAB_MAX_DOCS_PER_SOCKET, 12)
  const maxDocUpdatesPerSecond = readPositiveInt(process.env.COLLAB_MAX_DOC_UPDATES_PER_SECOND, 120)
  const maxJoinsPerTenSeconds = readPositiveInt(process.env.COLLAB_MAX_DOC_JOINS_PER_10S, 40)
  const snapshotIntervalUpdates = readPositiveInt(process.env.COLLAB_SNAPSHOT_INTERVAL_UPDATES, 200)
  const maxTerminalInputsPerSecond = readPositiveInt(process.env.COLLAB_MAX_TERMINAL_INPUTS_PER_SECOND, 10)
  const maxTerminalRequestsPerTenSeconds = readPositiveInt(process.env.COLLAB_MAX_TERMINAL_REQUESTS_PER_10S, 20)
  const maxCursorUpdatesPerSecond = readPositiveInt(process.env.COLLAB_MAX_CURSOR_UPDATES_PER_SECOND, 40)
  const maxActivityUpdatesPerSecond = readPositiveInt(process.env.COLLAB_MAX_ACTIVITY_UPDATES_PER_SECOND, 10)
  const unregisterFileCreatedListener = registerCollabFileCreatedListener((file) => {
    io.to(projectRoom(file.projectId)).emit('collab:file:created', file)
  })
  const unregisterFileUpdatedListener = registerCollabFileUpdatedListener((file) => {
    if (file.source === 'workspace_sync' && file.content !== undefined) {
      const nextContent = file.content
      const roomPrefix = `doc:${file.projectId}:`
      const updatedAt = file.updatedAt

      docSessions.forEach((session, room) => {
        if (!room.startsWith(roomPrefix)) {
          return
        }

        const key = parseDocRoom(room)
        if (!key || key.fileId !== file.id) {
          return
        }

        const hasDirtyClients = (dirtySocketsByDocRoom.get(room)?.size ?? 0) > 0
        if (hasDirtyClients) {
          io.to(projectRoom(file.projectId)).emit('collab:doc:external-change', {
            projectId: file.projectId,
            fileId: file.id,
            state: 'stale',
            updatedAt,
          } satisfies DocExternalChangePayload)
          return
        }

        void runQueuedLock(docUpdateLocks, room, async () => {
          const isDirtyAfterLock = (dirtySocketsByDocRoom.get(room)?.size ?? 0) > 0
          if (isDirtyAfterLock) {
            io.to(projectRoom(file.projectId)).emit('collab:doc:external-change', {
              projectId: file.projectId,
              fileId: file.id,
              state: 'stale',
              updatedAt,
            } satisfies DocExternalChangePayload)
            return
          }

          const text = session.doc.getText('content')
          const previousContent = text.toString()
          if (previousContent === nextContent) {
            return
          }

          if (previousContent.length > 0) {
            text.delete(0, previousContent.length)
          }
          if (nextContent.length > 0) {
            text.insert(0, nextContent)
          }

          const update = Y.encodeStateAsUpdate(session.doc)
          if (persistExternalDocReset) {
            const persisted = await persistExternalDocReset(file.projectId, file.id, update).catch(() => null)
            if (persisted?.sequence !== undefined) {
              session.lastSequence = persisted.sequence
            }
          }

          session.updatesSinceSnapshot = 0

          io.to(room).emit('collab:doc:sync', {
            projectId: file.projectId,
            fileId: file.id,
            update: Buffer.from(update).toString('base64'),
          } satisfies DocSyncPayload)

          io.to(projectRoom(file.projectId)).emit('collab:doc:external-change', {
            projectId: file.projectId,
            fileId: file.id,
            state: 'reloaded',
            updatedAt,
          } satisfies DocExternalChangePayload)
        })
      })
    }

    io.to(projectRoom(file.projectId)).emit('collab:file:updated', toPublicFileUpdatedPayload(file))
  })
  const unregisterFileDeletedListener = registerCollabFileDeletedListener((file) => {
    io.to(projectRoom(file.projectId)).emit('collab:file:deleted', file)
  })

  const originalClose = io.close.bind(io)
  io.close = ((callback?: (error?: Error) => void) => {
    unregisterFileCreatedListener()
    unregisterFileUpdatedListener()
    unregisterFileDeletedListener()
    return originalClose(callback)
  }) as typeof io.close

  io.on('connection', (socket) => {
    const joinedRooms = new Set<string>()
    const joinedDocRooms = new Set<string>()
    const joinedTerminalRooms = new Set<string>()
    const syncJoinedProjects = new Set<string>()
    const rateCounters = new Map<string, RateCounter>()

    void (async () => {
      let actor: ActorContext = { type: 'anonymous' }

      try {
        actor = await resolveActor(socket)
      } catch {
        actor = { type: 'anonymous' }
      }

      socket.on('collab:join-project', (projectId: unknown) => {
        const projectJoinAllowed = consumeRateLimit(rateCounters, 'project-join', maxJoinsPerTenSeconds, 10_000)
        if (!projectJoinAllowed) {
          socket.emit('collab:error', {
            message: 'Too many join attempts',
          } satisfies ErrorEvent)
          return
        }

        const parsedProjectId = projectJoinSchema.safeParse(projectId)
        if (!parsedProjectId.success) {
          socket.emit('collab:error', {
            message: 'projectId is required',
          } satisfies ErrorEvent)
          return
        }

        void (async () => {
          if (actor.type === 'anonymous' || !actor.subject) {
            socket.emit('collab:error', {
              message: 'Authentication is required',
            } satisfies ErrorEvent)
            return
          }

          const allowed = await canJoinProject(actor, parsedProjectId.data)
          if (!allowed) {
            socket.emit('collab:error', {
              message: 'Not authorized for this project',
            } satisfies ErrorEvent)
            return
          }

          const terminalAllowed = await canUseTerminal(actor, parsedProjectId.data)

          const room = projectRoom(parsedProjectId.data)
          if (joinedRooms.has(room)) {
            emitCurrentDirtyStatesForProject(socket, dirtySocketsByDocRoom, parsedProjectId.data)
            if (terminalAllowed && actor.subject) {
              const ownTerminalRoom = terminalRoom(parsedProjectId.data, actor.subject)
              if (!joinedTerminalRooms.has(ownTerminalRoom)) {
                joinedTerminalRooms.add(ownTerminalRoom)
                void socket.join(ownTerminalRoom)
              }

              emitTerminalList(io, parsedProjectId.data, terminalSessionManager)
              emitTerminalStateToSocket(
                socket,
                parsedProjectId.data,
                actor.subject,
                terminalSessionManager,
              )
            }
            return
          }

          if (terminalAllowed) {
            await runQueuedLock(projectMemberLocks, parsedProjectId.data, async () => {
              const existingProjectMemberCount = projectMemberCounts.get(parsedProjectId.data) ?? 0
              if (existingProjectMemberCount === 0) {
                await projectSyncHooks.onProjectJoin?.(parsedProjectId.data)
              }

              projectMemberCounts.set(parsedProjectId.data, existingProjectMemberCount + 1)
              syncJoinedProjects.add(parsedProjectId.data)
            })
          }

          try {
            await socket.join(room)
            joinedRooms.add(room)
          } catch (error) {
            if (syncJoinedProjects.has(parsedProjectId.data)) {
              syncJoinedProjects.delete(parsedProjectId.data)
              void runQueuedLock(projectMemberLocks, parsedProjectId.data, async () => {
                const nextProjectMemberCount = (projectMemberCounts.get(parsedProjectId.data) ?? 1) - 1
                if (nextProjectMemberCount <= 0) {
                  projectMemberCounts.delete(parsedProjectId.data)
                  await projectSyncHooks.onProjectLeave?.(parsedProjectId.data)
                  return
                }

                projectMemberCounts.set(parsedProjectId.data, nextProjectMemberCount)
              }).catch(() => undefined)
            }

            throw error
          }

          terminalSessionManager.markProjectJoined(parsedProjectId.data, actor.subject)

          if (terminalAllowed) {
            void terminalSessionManager.prewarmTerminal(parsedProjectId.data, actor.subject)
              .catch(() => {
                // Keep join flow responsive even if prewarm fails.
              })

            const ownTerminalRoom = terminalRoom(parsedProjectId.data, actor.subject)
            joinedTerminalRooms.add(ownTerminalRoom)
            void socket.join(ownTerminalRoom)

            emitTerminalList(io, parsedProjectId.data, terminalSessionManager)
            emitTerminalStateToSocket(
              socket,
              parsedProjectId.data,
              actor.subject,
              terminalSessionManager,
            )
          }

          emitCurrentDirtyStatesForProject(socket, dirtySocketsByDocRoom, parsedProjectId.data)

          io.to(room).emit('collab:presence', {
            type: 'joined',
            projectId: parsedProjectId.data,
            socketId: socket.id,
            actorType: actor.type,
          })
        })().catch(() => {
          socket.emit('collab:error', {
            message: 'Could not join project',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:leave-project', (projectId: unknown) => {
        const parsedProjectId = projectLeaveSchema.safeParse(projectId)
        if (!parsedProjectId.success) {
          socket.emit('collab:error', {
            message: 'projectId is required',
          } satisfies ErrorEvent)
          return
        }

        const room = projectRoom(parsedProjectId.data)
        if (!joinedRooms.has(room)) {
          return
        }

        joinedRooms.delete(room)
        void socket.leave(room)

        if (syncJoinedProjects.has(parsedProjectId.data)) {
          syncJoinedProjects.delete(parsedProjectId.data)

          void runQueuedLock(projectMemberLocks, parsedProjectId.data, async () => {
            const nextProjectMemberCount = (projectMemberCounts.get(parsedProjectId.data) ?? 1) - 1
            if (nextProjectMemberCount <= 0) {
              projectMemberCounts.delete(parsedProjectId.data)
              await projectSyncHooks.onProjectLeave?.(parsedProjectId.data)
              return
            }

            projectMemberCounts.set(parsedProjectId.data, nextProjectMemberCount)
          }).catch(() => undefined)
        }

        if (actor.subject) {
          terminalSessionManager.markProjectLeft(parsedProjectId.data, actor.subject)
          const roomPrefix = `${terminalRoomPrefix(parsedProjectId.data)}`
          joinedTerminalRooms.forEach((joinedTerminalRoom) => {
            if (!joinedTerminalRoom.startsWith(roomPrefix)) {
              return
            }

            joinedTerminalRooms.delete(joinedTerminalRoom)
            void socket.leave(joinedTerminalRoom)
          })
          emitTerminalList(io, parsedProjectId.data, terminalSessionManager)
          io.to(room).emit('collab:project:activity', {
            projectId: parsedProjectId.data,
            fileId: null,
            socketId: socket.id,
            subject: actor.subject,
            updatedAt: new Date().toISOString(),
            cleared: true,
          } satisfies ProjectActivityPayload)
        }

        io.to(room).emit('collab:presence', {
          type: 'left',
          projectId: parsedProjectId.data,
          socketId: socket.id,
        })
      })

      socket.on('collab:doc:join', (payload: unknown) => {
        const docJoinAllowed = consumeRateLimit(rateCounters, 'doc-join', maxJoinsPerTenSeconds, 10_000)
        if (!docJoinAllowed) {
          socket.emit('collab:error', {
            message: 'Too many join attempts',
          } satisfies ErrorEvent)
          return
        }

        const parsedJoin = docJoinSchema.safeParse(payload)
        if (!parsedJoin.success) {
          socket.emit('collab:error', {
            message: 'projectId and fileId are required',
          } satisfies ErrorEvent)
          return
        }

        void handleDocJoin(
          socket,
          io,
          docSessions,
          pendingSessionInitializations,
          joinedRooms,
          joinedDocRooms,
          actor,
          parsedJoin.data,
          canJoinProject,
          canJoinFile,
          loadFileContent,
          loadYjsHistory,
          maxDocSessions,
          maxDocsPerSocket,
        ).catch(() => {
          socket.emit('collab:error', {
            message: 'Could not join document',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:doc:leave', (payload: unknown) => {
        const parsedLeave = docJoinSchema.safeParse(payload)
        if (!parsedLeave.success) {
          socket.emit('collab:error', {
            message: 'projectId and fileId are required',
          } satisfies ErrorEvent)
          return
        }

        const room = docRoom(parsedLeave.data.projectId, parsedLeave.data.fileId)
        if (!joinedRooms.has(room)) {
          return
        }

        joinedRooms.delete(room)
        joinedDocRooms.delete(room)
        clearDirtyStateForSocket(io, dirtySocketsByDocRoom, room, socket.id)
        void socket.leave(room)
        removeSocketFromDocSession(docSessions, room, socket.id)

        if (actor.subject) {
          socket.to(room).emit('collab:doc:cursor', {
            projectId: parsedLeave.data.projectId,
            fileId: parsedLeave.data.fileId,
            socketId: socket.id,
            subject: actor.subject,
            lineNumber: 1,
            column: 1,
            updatedAt: new Date().toISOString(),
            cleared: true,
          } satisfies DocCursorPayload)
        }

        io.to(room).emit('collab:doc:presence', {
          type: 'left',
          projectId: parsedLeave.data.projectId,
          fileId: parsedLeave.data.fileId,
          socketId: socket.id,
        })
      })

      socket.on('collab:doc:update', (payload: unknown) => {
        const updateAllowed = consumeRateLimit(
          rateCounters,
          'doc-update',
          maxDocUpdatesPerSecond,
          1_000,
        )
        if (!updateAllowed) {
          socket.emit('collab:error', {
            message: 'Too many document updates',
          } satisfies ErrorEvent)
          return
        }

        const parsedUpdate = docUpdateSchema.safeParse(payload)
        if (!parsedUpdate.success) {
          socket.emit('collab:error', {
            message: 'Invalid document update payload',
          } satisfies ErrorEvent)
          return
        }

        const room = docRoom(parsedUpdate.data.projectId, parsedUpdate.data.fileId)
        if (!joinedRooms.has(room)) {
          socket.emit('collab:error', {
            message: 'Join document first',
          } satisfies ErrorEvent)
          return
        }

        const session = docSessions.get(room)
        if (!session) {
          socket.emit('collab:error', {
            message: 'Document session not found',
          } satisfies ErrorEvent)
          return
        }

        const updateBytes = decodeUpdate(parsedUpdate.data.update)
        if (!updateBytes) {
          socket.emit('collab:error', {
            message: 'Invalid document update payload',
          } satisfies ErrorEvent)
          return
        }

        if (updateBytes.length > 300_000) {
          socket.emit('collab:error', {
            message: 'Document update payload is too large',
          } satisfies ErrorEvent)
          return
        }

        void (async () => {
          if (actor.type === 'anonymous' || !actor.subject) {
            socket.emit('collab:error', {
              message: 'Authentication is required',
            } satisfies ErrorEvent)
            return
          }

          const isAuthorizedInSession = session.authorizedSubjects.has(actor.subject)
          if (!isAuthorizedInSession) {
            joinedRooms.delete(room)
            joinedDocRooms.delete(room)
            clearDirtyStateForSocket(io, dirtySocketsByDocRoom, room, socket.id)
            await socket.leave(room)
            removeSocketFromDocSession(docSessions, room, socket.id)

            socket.emit('collab:error', {
              message: 'Not authorized for this file',
            } satisfies ErrorEvent)
            return
          }

          const canStillEdit = await canJoinFile(
            actor,
            parsedUpdate.data.projectId,
            parsedUpdate.data.fileId,
          )
          if (!canStillEdit) {
            joinedRooms.delete(room)
            joinedDocRooms.delete(room)
            clearDirtyStateForSocket(io, dirtySocketsByDocRoom, room, socket.id)
            await socket.leave(room)
            removeSocketFromDocSession(docSessions, room, socket.id)

            socket.emit('collab:error', {
              message: 'Not authorized for this file',
            } satisfies ErrorEvent)
            return
          }

          await runQueuedLock(docUpdateLocks, room, async () => {
            try {
              Y.applyUpdate(session.doc, updateBytes, socket.id)
            } catch {
              socket.emit('collab:error', {
                message: 'Invalid document update payload',
              } satisfies ErrorEvent)
              return
            }

            const persisted = await appendYjsUpdate(
              actor,
              parsedUpdate.data.projectId,
              parsedUpdate.data.fileId,
              updateBytes,
            )
            session.lastSequence = persisted.sequence
            session.updatesSinceSnapshot += 1

            updateDirtyStateForSocket(
              io,
              dirtySocketsByDocRoom,
              parsedUpdate.data.projectId,
              parsedUpdate.data.fileId,
              socket.id,
              true,
            )

            socket.to(room).emit('collab:doc:update', parsedUpdate.data satisfies DocUpdatePayload)

            if (!session.snapshotInFlight && session.updatesSinceSnapshot >= snapshotIntervalUpdates) {
              session.snapshotInFlight = true
              const snapshotUpdate = Y.encodeStateAsUpdate(session.doc)
              const updatesCapturedBySnapshot = session.updatesSinceSnapshot

              void saveYjsSnapshot(
                actor,
                parsedUpdate.data.projectId,
                parsedUpdate.data.fileId,
                session.lastSequence,
                snapshotUpdate,
              ).then(() => {
                session.updatesSinceSnapshot = Math.max(
                  0,
                  session.updatesSinceSnapshot - updatesCapturedBySnapshot,
                )
              }).catch(() => undefined).finally(() => {
                session.snapshotInFlight = false
              })
            }
          })
        })().catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process document update',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:doc:saved', (payload: unknown) => {
        const saveAllowed = consumeRateLimit(
          rateCounters,
          'doc-saved',
          maxDocUpdatesPerSecond,
          1_000,
        )
        if (!saveAllowed) {
          socket.emit('collab:error', {
            message: 'Too many document updates',
          } satisfies ErrorEvent)
          return
        }

        const parsedSaved = docSavedSchema.safeParse(payload)
        if (!parsedSaved.success) {
          socket.emit('collab:error', {
            message: 'projectId and fileId are required',
          } satisfies ErrorEvent)
          return
        }

        const room = docRoom(parsedSaved.data.projectId, parsedSaved.data.fileId)
        if (!joinedRooms.has(room)) {
          return
        }

        const session = docSessions.get(room)
        if (!session) {
          return
        }

        void (async () => {
          if (actor.type === 'anonymous' || !actor.subject) {
            socket.emit('collab:error', {
              message: 'Authentication is required',
            } satisfies ErrorEvent)
            return
          }

          if (!session.authorizedSubjects.has(actor.subject)) {
            return
          }

          markDocumentSavedGlobally(
            io,
            dirtySocketsByDocRoom,
            parsedSaved.data.projectId,
            parsedSaved.data.fileId,
          )
        })().catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process document save state',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:doc:cursor', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'doc-cursor',
          maxCursorUpdatesPerSecond,
          1_000,
        )

        if (!allowed) {
          return
        }

        const parsed = docCursorSchema.safeParse(payload)
        if (!parsed.success) {
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          return
        }

        const room = docRoom(parsed.data.projectId, parsed.data.fileId)
        if (!joinedDocRooms.has(room) || !joinedRooms.has(room)) {
          return
        }

        const session = docSessions.get(room)
        if (!session || !session.authorizedSubjects.has(actor.subject)) {
          return
        }

        socket.to(room).emit('collab:doc:cursor', {
          ...parsed.data,
          socketId: socket.id,
          subject: actor.subject,
          updatedAt: new Date().toISOString(),
        } satisfies DocCursorPayload)
      })

      socket.on('collab:project:activity', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'project-activity',
          maxActivityUpdatesPerSecond,
          1_000,
        )

        if (!allowed) {
          return
        }

        const parsed = projectActivitySchema.safeParse(payload)
        if (!parsed.success) {
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          return
        }

        const room = projectRoom(parsed.data.projectId)
        if (!joinedRooms.has(room)) {
          return
        }

        socket.to(room).emit('collab:project:activity', {
          projectId: parsed.data.projectId,
          fileId: parsed.data.fileId,
          socketId: socket.id,
          subject: actor.subject,
          updatedAt: new Date().toISOString(),
        } satisfies ProjectActivityPayload)
      })

      socket.on('collab:terminal:list', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-list',
          maxTerminalRequestsPerTenSeconds,
          10_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal requests',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalListSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'projectId is required',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        const actorSubject = actor.subject

        void canUseTerminal(actor, parsed.data.projectId).then((allowedForTerminal) => {
          if (!allowedForTerminal) {
            socket.emit('collab:error', {
              message: 'Not authorized for terminal access',
            } satisfies ErrorEvent)
            return
          }

          if (!terminalSessionManager.isProjectMember(parsed.data.projectId, actorSubject)) {
            socket.emit('collab:error', {
              message: 'Join project first',
            } satisfies ErrorEvent)
            return
          }

          socket.emit('collab:terminal:list', {
            projectId: parsed.data.projectId,
            terminals: terminalSessionManager.listProjectTerminals(parsed.data.projectId),
          } satisfies TerminalListPayload)
        }).catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process terminal request',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:terminal:join', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-join',
          maxTerminalRequestsPerTenSeconds,
          10_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal requests',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalJoinSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'projectId and ownerSubject are required',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        const actorSubject = actor.subject

        void canUseTerminal(actor, parsed.data.projectId).then((allowedForTerminal) => {
          if (!allowedForTerminal) {
            socket.emit('collab:error', {
              message: 'Not authorized for terminal access',
            } satisfies ErrorEvent)
            return
          }

          if (!terminalSessionManager.isProjectMember(parsed.data.projectId, actorSubject)) {
            socket.emit('collab:error', {
              message: 'Join project first',
            } satisfies ErrorEvent)
            return
          }

          const result = terminalSessionManager.joinTerminal(
            parsed.data.projectId,
            parsed.data.ownerSubject,
          )
          if (!result) {
            socket.emit('collab:error', {
              message: 'Terminal owner is offline',
            } satisfies ErrorEvent)
            return
          }

          const room = terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)
          joinedTerminalRooms.add(room)
          void socket.join(room)

          socket.emit('collab:terminal:state', result.state satisfies TerminalStatePayload)
        }).catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process terminal request',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:terminal:leave', (payload: unknown) => {
        const parsed = terminalJoinSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'projectId and ownerSubject are required',
          } satisfies ErrorEvent)
          return
        }

        const room = terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)
        if (!joinedTerminalRooms.has(room)) {
          return
        }

        joinedTerminalRooms.delete(room)
        void socket.leave(room)
      })

      socket.on('collab:terminal:open', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-open',
          maxTerminalRequestsPerTenSeconds,
          10_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal requests',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalOpenSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'Invalid terminal open payload',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        const room = terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)
        if (!joinedTerminalRooms.has(room)) {
          socket.emit('collab:error', {
            message: 'Join terminal first',
          } satisfies ErrorEvent)
          return
        }

        const actorSubject = actor.subject

        void canUseTerminal(actor, parsed.data.projectId).then(async (allowedForTerminal) => {
          if (!allowedForTerminal) {
            joinedTerminalRooms.delete(room)
            await socket.leave(room)
            socket.emit('collab:error', {
              message: 'Not authorized for this project',
            } satisfies ErrorEvent)
            return
          }

          void terminalSessionManager.openSession(
            parsed.data.projectId,
            parsed.data.ownerSubject,
            actorSubject,
            (ownerSubject, chunk) => {
              io.to(terminalRoom(parsed.data.projectId, ownerSubject)).emit('collab:terminal:output', {
                projectId: parsed.data.projectId,
                ownerSubject,
                ...chunk,
              } satisfies TerminalOutputPayload)
            },
            (parsed.data.cols && parsed.data.rows)
              ? {
                  cols: parsed.data.cols,
                  rows: parsed.data.rows,
                }
              : undefined,
          ).then((result) => {
            if (!result.accepted) {
              socket.emit('collab:error', {
                message: result.reason ?? 'Could not open terminal session',
              } satisfies ErrorEvent)
              return
            }

            const state = terminalSessionManager.getTerminalState(
              parsed.data.projectId,
              parsed.data.ownerSubject,
            )

            io.to(room).emit('collab:terminal:state', {
              projectId: parsed.data.projectId,
              ownerSubject: parsed.data.ownerSubject,
              activeControllerSubject: state.activeControllerSubject,
              isSessionOpen: state.isSessionOpen,
              pendingRequests: state.pendingRequests,
            } satisfies TerminalStatePayload)
          }).catch(() => {
            socket.emit('collab:error', {
              message: 'Could not open terminal session',
            } satisfies ErrorEvent)
          })
        }).catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process terminal request',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:terminal:input', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-input',
          maxTerminalInputsPerSecond,
          1_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal inputs',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalInputSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'Invalid terminal input payload',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        const room = terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)
        if (!joinedTerminalRooms.has(room)) {
          socket.emit('collab:error', {
            message: 'Join terminal first',
          } satisfies ErrorEvent)
          return
        }

        const actorSubject = actor.subject

        void canUseTerminal(actor, parsed.data.projectId).then(async (allowed) => {
          if (!allowed) {
            joinedTerminalRooms.delete(room)
            await socket.leave(room)
            socket.emit('collab:error', {
              message: 'Not authorized for this project',
            } satisfies ErrorEvent)
            return
          }

          void terminalSessionManager.processInput(
            parsed.data.projectId,
            parsed.data.ownerSubject,
            actorSubject,
            parsed.data.input,
          ).then((result) => {
            if (result.accepted) {
              return
            }

            socket.emit('collab:error', {
              message: result.reason ?? 'Could not process terminal input',
            } satisfies ErrorEvent)
          }).catch(() => {
            socket.emit('collab:error', {
              message: 'Could not process terminal input',
            } satisfies ErrorEvent)
          })
        }).catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process terminal input',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:terminal:resize', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-resize',
          maxTerminalInputsPerSecond,
          1_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal inputs',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalResizeSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'Invalid terminal resize payload',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        const room = terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)
        if (!joinedTerminalRooms.has(room)) {
          socket.emit('collab:error', {
            message: 'Join terminal first',
          } satisfies ErrorEvent)
          return
        }

        const actorSubject = actor.subject

        void canUseTerminal(actor, parsed.data.projectId).then(async (allowedForTerminal) => {
          if (!allowedForTerminal) {
            joinedTerminalRooms.delete(room)
            await socket.leave(room)
            socket.emit('collab:error', {
              message: 'Not authorized for this project',
            } satisfies ErrorEvent)
            return
          }

          void terminalSessionManager.resizeSession(
            parsed.data.projectId,
            parsed.data.ownerSubject,
            actorSubject,
            {
              cols: parsed.data.cols,
              rows: parsed.data.rows,
            },
          ).then((result) => {
            if (result.accepted) {
              return
            }

            socket.emit('collab:error', {
              message: result.reason ?? 'Could not resize terminal session',
            } satisfies ErrorEvent)
          }).catch(() => {
            socket.emit('collab:error', {
              message: 'Could not resize terminal session',
            } satisfies ErrorEvent)
          })
        }).catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process terminal request',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:terminal:close', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-close',
          maxTerminalRequestsPerTenSeconds,
          10_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal requests',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalCloseSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'Invalid terminal close payload',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        const room = terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)
        if (!joinedTerminalRooms.has(room)) {
          socket.emit('collab:error', {
            message: 'Join terminal first',
          } satisfies ErrorEvent)
          return
        }

        const actorSubject = actor.subject

        void canUseTerminal(actor, parsed.data.projectId).then(async (allowedForTerminal) => {
          if (!allowedForTerminal) {
            joinedTerminalRooms.delete(room)
            await socket.leave(room)
            socket.emit('collab:error', {
              message: 'Not authorized for this project',
            } satisfies ErrorEvent)
            return
          }

          void terminalSessionManager.closeSession(
            parsed.data.projectId,
            parsed.data.ownerSubject,
            actorSubject,
          ).then((result) => {
            if (!result.accepted) {
              socket.emit('collab:error', {
                message: result.reason ?? 'Could not close terminal session',
              } satisfies ErrorEvent)
              return
            }

            const state = terminalSessionManager.getTerminalState(
              parsed.data.projectId,
              parsed.data.ownerSubject,
            )

            io.to(room).emit('collab:terminal:state', {
              projectId: parsed.data.projectId,
              ownerSubject: parsed.data.ownerSubject,
              activeControllerSubject: state.activeControllerSubject,
              isSessionOpen: state.isSessionOpen,
              pendingRequests: state.pendingRequests,
            } satisfies TerminalStatePayload)
          }).catch(() => {
            socket.emit('collab:error', {
              message: 'Could not close terminal session',
            } satisfies ErrorEvent)
          })
        }).catch(() => {
          socket.emit('collab:error', {
            message: 'Could not process terminal request',
          } satisfies ErrorEvent)
        })
      })

      socket.on('collab:terminal:access:request', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-access-request',
          maxTerminalRequestsPerTenSeconds,
          10_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal requests',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalAccessRequestSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'projectId and ownerSubject are required',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        const requested = terminalSessionManager.requestAccess(
          parsed.data.projectId,
          parsed.data.ownerSubject,
          actor.subject,
        )

        if (!requested) {
          socket.emit('collab:error', {
            message: 'Access request cannot be created',
          } satisfies ErrorEvent)
          return
        }

        io.to(terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)).emit('collab:terminal:access:requested', {
          projectId: parsed.data.projectId,
          ownerSubject: parsed.data.ownerSubject,
          requesterSubject: actor.subject,
          requestedAt: requested.requestedAt,
        } satisfies TerminalAccessRequestedPayload)

        io.to(projectRoom(parsed.data.projectId)).emit('collab:terminal:list', {
          projectId: parsed.data.projectId,
          terminals: terminalSessionManager.listProjectTerminals(parsed.data.projectId),
        } satisfies TerminalListPayload)
      })

      socket.on('collab:terminal:access:decision', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-access-decision',
          maxTerminalRequestsPerTenSeconds,
          10_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal requests',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalAccessDecisionSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'Invalid access decision payload',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        if (actor.subject !== parsed.data.ownerSubject) {
          socket.emit('collab:error', {
            message: 'Only owner can decide access requests',
          } satisfies ErrorEvent)
          return
        }

        if (!terminalSessionManager.isProjectMember(parsed.data.projectId, actor.subject)) {
          socket.emit('collab:error', {
            message: 'Join project first',
          } satisfies ErrorEvent)
          return
        }

        const decision = terminalSessionManager.decideAccess(
          parsed.data.projectId,
          parsed.data.ownerSubject,
          parsed.data.requesterSubject,
          parsed.data.approve,
        )

        if (!decision.ok) {
          socket.emit('collab:error', {
            message: decision.reason ?? 'Could not process terminal access decision',
          } satisfies ErrorEvent)
          return
        }

        io.to(terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)).emit('collab:terminal:state', {
          projectId: parsed.data.projectId,
          ownerSubject: parsed.data.ownerSubject,
          activeControllerSubject: decision.state.activeControllerSubject,
          isSessionOpen: decision.state.isSessionOpen,
          pendingRequests: decision.state.pendingRequests,
        } satisfies TerminalStatePayload)

        io.to(terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)).emit('collab:terminal:access:decision', {
          projectId: parsed.data.projectId,
          ownerSubject: parsed.data.ownerSubject,
          requesterSubject: parsed.data.requesterSubject,
          status: decision.status,
        } satisfies TerminalAccessDecisionPayload)

        io.to(projectRoom(parsed.data.projectId)).emit('collab:terminal:list', {
          projectId: parsed.data.projectId,
          terminals: terminalSessionManager.listProjectTerminals(parsed.data.projectId),
        } satisfies TerminalListPayload)
      })

      socket.on('collab:terminal:control:revoke', (payload: unknown) => {
        const allowed = consumeRateLimit(
          rateCounters,
          'terminal-control-revoke',
          maxTerminalRequestsPerTenSeconds,
          10_000,
        )
        if (!allowed) {
          socket.emit('collab:error', {
            message: 'Too many terminal requests',
          } satisfies ErrorEvent)
          return
        }

        const parsed = terminalRevokeControlSchema.safeParse(payload)
        if (!parsed.success) {
          socket.emit('collab:error', {
            message: 'projectId and ownerSubject are required',
          } satisfies ErrorEvent)
          return
        }

        if (actor.type === 'anonymous' || !actor.subject) {
          socket.emit('collab:error', {
            message: 'Authentication is required',
          } satisfies ErrorEvent)
          return
        }

        if (actor.subject !== parsed.data.ownerSubject) {
          socket.emit('collab:error', {
            message: 'Only owner can revoke control',
          } satisfies ErrorEvent)
          return
        }

        if (!terminalSessionManager.isProjectMember(parsed.data.projectId, actor.subject)) {
          socket.emit('collab:error', {
            message: 'Join project first',
          } satisfies ErrorEvent)
          return
        }

        const revokeResult = terminalSessionManager.revokeControl(
          parsed.data.projectId,
          parsed.data.ownerSubject,
        )

        if (!revokeResult.ok || !revokeResult.state) {
          socket.emit('collab:error', {
            message: revokeResult.reason ?? 'Could not revoke terminal control',
          } satisfies ErrorEvent)
          return
        }

        io.to(terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)).emit('collab:terminal:state', {
          projectId: parsed.data.projectId,
          ownerSubject: parsed.data.ownerSubject,
          activeControllerSubject: revokeResult.state.activeControllerSubject,
          isSessionOpen: revokeResult.state.isSessionOpen,
          pendingRequests: revokeResult.state.pendingRequests,
        } satisfies TerminalStatePayload)

        if (revokeResult.revokedSubject) {
          io.to(terminalRoom(parsed.data.projectId, parsed.data.ownerSubject)).emit('collab:terminal:access:decision', {
            projectId: parsed.data.projectId,
            ownerSubject: parsed.data.ownerSubject,
            requesterSubject: revokeResult.revokedSubject,
            status: 'revoked',
          } satisfies TerminalAccessDecisionPayload)
        }

        io.to(projectRoom(parsed.data.projectId)).emit('collab:terminal:list', {
          projectId: parsed.data.projectId,
          terminals: terminalSessionManager.listProjectTerminals(parsed.data.projectId),
        } satisfies TerminalListPayload)
      })

      socket.on('disconnect', () => {
        const actorSubject = actor.subject
        if (actorSubject) {
          const affectedProjectIds = new Set<string>()
          joinedRooms.forEach((room) => {
            const projectId = parseProjectRoom(room)
            if (projectId) {
              affectedProjectIds.add(projectId)
            }
          })

          affectedProjectIds.forEach((projectId) => {
            terminalSessionManager.markProjectLeft(projectId, actorSubject)
            emitTerminalList(io, projectId, terminalSessionManager)

            if (!syncJoinedProjects.has(projectId)) {
              return
            }

            syncJoinedProjects.delete(projectId)

            void runQueuedLock(projectMemberLocks, projectId, async () => {
              const nextProjectMemberCount = (projectMemberCounts.get(projectId) ?? 1) - 1
              if (nextProjectMemberCount <= 0) {
                projectMemberCounts.delete(projectId)
                await projectSyncHooks.onProjectLeave?.(projectId)
                return
              }

              projectMemberCounts.set(projectId, nextProjectMemberCount)
            }).catch(() => undefined)
          })
        }

        joinedRooms.forEach((room) => {
          if (actorSubject && room.startsWith('doc:')) {
            const key = parseDocRoom(room)
            if (key) {
              io.to(room).emit('collab:doc:cursor', {
                projectId: key.projectId,
                fileId: key.fileId,
                socketId: socket.id,
                subject: actorSubject,
                lineNumber: 1,
                column: 1,
                updatedAt: new Date().toISOString(),
                cleared: true,
              } satisfies DocCursorPayload)
            }
          }

          if (actorSubject && room.startsWith('project:')) {
            const projectId = parseProjectRoom(room)
            if (projectId) {
              io.to(room).emit('collab:project:activity', {
                projectId,
                fileId: null,
                socketId: socket.id,
                subject: actorSubject,
                updatedAt: new Date().toISOString(),
                cleared: true,
              } satisfies ProjectActivityPayload)
            }
          }

          clearDirtyStateForSocket(io, dirtySocketsByDocRoom, room, socket.id)
          removeSocketFromDocSession(docSessions, room, socket.id)
          joinedDocRooms.delete(room)

          if (room.startsWith('doc:')) {
            const key = parseDocRoom(room)
            if (key) {
              io.to(room).emit('collab:doc:presence', {
                type: 'left',
                projectId: key.projectId,
                fileId: key.fileId,
                socketId: socket.id,
              })
            }

            return
          }

          io.to(room).emit('collab:presence', {
            type: 'left',
            socketId: socket.id,
          })
        })
      })

      socket.emit('collab:connected', {
        actorType: actor.type,
        socketId: socket.id,
        subject: actor.subject,
      } satisfies ConnectedEvent)
    })()
  })

  return io
}

function projectRoom(projectId: string) {
  return `project:${projectId}`
}

function terminalRoomPrefix(projectId: string) {
  return `terminal:${projectId}:`
}

function terminalRoom(projectId: string, ownerSubject: string) {
  return `${terminalRoomPrefix(projectId)}${ownerSubject}`
}

function parseProjectRoom(room: string): string | null {
  if (!room.startsWith('project:')) {
    return null
  }

  return room.slice('project:'.length) || null
}

function docRoom(projectId: string, fileId: string) {
  return `doc:${projectId}:${fileId}`
}

function updateDirtyStateForSocket(
  io: Server,
  dirtySocketsByDocRoom: Map<string, Set<string>>,
  projectId: string,
  fileId: string,
  socketId: string,
  isDirty: boolean,
) {
  const room = docRoom(projectId, fileId)
  const dirtySockets = dirtySocketsByDocRoom.get(room) ?? new Set<string>()
  const wasDirty = dirtySockets.size > 0

  if (isDirty) {
    dirtySockets.add(socketId)
  } else {
    dirtySockets.delete(socketId)
  }

  if (dirtySockets.size === 0) {
    dirtySocketsByDocRoom.delete(room)
  } else {
    dirtySocketsByDocRoom.set(room, dirtySockets)
  }

  const isDirtyNow = dirtySockets.size > 0
  if (wasDirty === isDirtyNow) {
    return
  }

  io.to(projectRoom(projectId)).emit('collab:doc:dirty-state', {
    projectId,
    fileId,
    isDirty: isDirtyNow,
    updatedAt: new Date().toISOString(),
  } satisfies DocDirtyStatePayload)
}

function markDocumentSavedGlobally(
  io: Server,
  dirtySocketsByDocRoom: Map<string, Set<string>>,
  projectId: string,
  fileId: string,
) {
  const room = docRoom(projectId, fileId)
  const dirtySockets = dirtySocketsByDocRoom.get(room)

  if (!dirtySockets || dirtySockets.size === 0) {
    return
  }

  dirtySocketsByDocRoom.delete(room)

  io.to(projectRoom(projectId)).emit('collab:doc:dirty-state', {
    projectId,
    fileId,
    isDirty: false,
    updatedAt: new Date().toISOString(),
  } satisfies DocDirtyStatePayload)
}

function clearDirtyStateForSocket(
  io: Server,
  dirtySocketsByDocRoom: Map<string, Set<string>>,
  room: string,
  socketId: string,
) {
  const parsedDocRoom = parseDocRoom(room)
  if (!parsedDocRoom) {
    return
  }

  updateDirtyStateForSocket(
    io,
    dirtySocketsByDocRoom,
    parsedDocRoom.projectId,
    parsedDocRoom.fileId,
    socketId,
    false,
  )
}

function emitCurrentDirtyStatesForProject(
  socket: Socket,
  dirtySocketsByDocRoom: Map<string, Set<string>>,
  projectId: string,
) {
  dirtySocketsByDocRoom.forEach((dirtySockets, room) => {
    if (dirtySockets.size === 0) {
      return
    }

    const parsedDocRoom = parseDocRoom(room)
    if (!parsedDocRoom || parsedDocRoom.projectId !== projectId) {
      return
    }

    socket.emit('collab:doc:dirty-state', {
      projectId,
      fileId: parsedDocRoom.fileId,
      isDirty: true,
      updatedAt: new Date().toISOString(),
    } satisfies DocDirtyStatePayload)
  })
}

function emitTerminalList(
  io: Server,
  projectId: string,
  terminalSessionManager: TerminalSessionManager,
) {
  io.to(projectRoom(projectId)).emit('collab:terminal:list', {
    projectId,
    terminals: terminalSessionManager.listProjectTerminals(projectId),
  } satisfies TerminalListPayload)
}

function emitTerminalStateToSocket(
  socket: Socket,
  projectId: string,
  ownerSubject: string,
  terminalSessionManager: TerminalSessionManager,
) {
  const state = terminalSessionManager.getTerminalState(projectId, ownerSubject)
  socket.emit('collab:terminal:state', {
    projectId,
    ownerSubject,
    activeControllerSubject: state.activeControllerSubject,
    isSessionOpen: state.isSessionOpen,
    pendingRequests: state.pendingRequests,
  } satisfies TerminalStatePayload)
}

function parseDocRoom(room: string): DocJoinPayload | null {
  if (!room.startsWith('doc:')) {
    return null
  }

  const parts = room.split(':')
  if (parts.length < 3) {
    return null
  }

  const [, projectId, ...fileIdParts] = parts
  const fileId = fileIdParts.join(':')
  if (!projectId || !fileId) {
    return null
  }

  return {
    projectId,
    fileId,
  }
}

function decodeUpdate(encodedUpdate: string): Uint8Array | null {
  try {
    const buffer = Buffer.from(encodedUpdate, 'base64')
    if (buffer.length === 0) {
      return null
    }

    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

function removeSocketFromDocSession(docSessions: Map<string, DocSession>, room: string, socketId: string) {
  if (!room.startsWith('doc:')) {
    return
  }

  const session = docSessions.get(room)
  if (!session) {
    return
  }

  session.clients.delete(socketId)
  if (session.clients.size > 0) {
    return
  }

  session.doc.destroy()
  docSessions.delete(room)
}

async function handleDocJoin(
  socket: Socket,
  io: Server,
  docSessions: Map<string, DocSession>,
  pendingSessionInitializations: Map<string, Promise<DocSession | null>>,
  joinedRooms: Set<string>,
  joinedDocRooms: Set<string>,
  actor: ActorContext,
  payload: DocJoinPayload,
  canJoinProject: ProjectJoinAuthorizer,
  canJoinFile: FileJoinAuthorizer,
  loadFileContent: FileContentLoader,
  loadYjsHistory: YjsHistoryLoader,
  maxDocSessions: number,
  maxDocsPerSocket: number,
) {
  if (actor.type === 'anonymous' || !actor.subject) {
    socket.emit('collab:error', {
      message: 'Authentication is required',
    } satisfies ErrorEvent)
    return
  }

  const projectAllowed = await canJoinProject(actor, payload.projectId)
  if (!projectAllowed) {
    socket.emit('collab:error', {
      message: 'Not authorized for this project',
    } satisfies ErrorEvent)
    return
  }

  const fileAllowed = await canJoinFile(actor, payload.projectId, payload.fileId)
  if (!fileAllowed) {
    socket.emit('collab:error', {
      message: 'Not authorized for this file',
    } satisfies ErrorEvent)
    return
  }

  const room = docRoom(payload.projectId, payload.fileId)

  if (!joinedDocRooms.has(room) && joinedDocRooms.size >= maxDocsPerSocket) {
    socket.emit('collab:error', {
      message: 'Too many open documents in this session',
    } satisfies ErrorEvent)
    return
  }

  const totalSessions = docSessions.size + pendingSessionInitializations.size
  if (!docSessions.has(room) && !pendingSessionInitializations.has(room) && totalSessions >= maxDocSessions) {
    socket.emit('collab:error', {
      message: 'Collaboration server is busy, try again later',
    } satisfies ErrorEvent)
    return
  }

  const createdSession = await getOrCreateDocSession(
    room,
    docSessions,
    pendingSessionInitializations,
    maxDocSessions,
    async () => {
      const history = await loadYjsHistory(actor, payload.projectId, payload.fileId)
      if (history) {
        const doc = new Y.Doc()
        if (history.snapshot) {
          Y.applyUpdate(doc, history.snapshot)
        }

        history.updates.forEach((update) => {
          Y.applyUpdate(doc, update)
        })

        return {
          doc,
          clients: new Set<string>(),
          authorizedSubjects: new Set<string>(),
          lastSequence: history.lastSequence,
          updatesSinceSnapshot: 0,
          snapshotInFlight: false,
        }
      }

      const initialContent = await loadFileContent(actor, payload.projectId, payload.fileId)
      if (initialContent === null) {
        return null
      }

      const doc = new Y.Doc()
      const text = doc.getText('content')

      if (initialContent.length > 0) {
        text.insert(0, initialContent)
      }

      return {
        doc,
        clients: new Set<string>(),
        authorizedSubjects: new Set<string>(),
        lastSequence: 0,
        updatesSinceSnapshot: 0,
        snapshotInFlight: false,
      }
    },
  )

  if (!createdSession) {
    socket.emit('collab:error', {
      message: 'File not found',
    } satisfies ErrorEvent)
    return
  }

  const session = createdSession
  session.authorizedSubjects.add(actor.subject)

  joinedRooms.add(room)
  joinedDocRooms.add(room)
  session.clients.add(socket.id)
  await socket.join(room)

  socket.emit('collab:doc:sync', {
    projectId: payload.projectId,
    fileId: payload.fileId,
    update: Buffer.from(Y.encodeStateAsUpdate(session.doc)).toString('base64'),
  } satisfies DocSyncPayload)

  io.to(room).emit('collab:doc:presence', {
    type: 'joined',
    projectId: payload.projectId,
    fileId: payload.fileId,
    socketId: socket.id,
    actorType: actor.type,
  })
}

async function getOrCreateDocSession(
  room: string,
  docSessions: Map<string, DocSession>,
  pendingSessionInitializations: Map<string, Promise<DocSession | null>>,
  maxDocSessions: number,
  createSession: () => Promise<DocSession | null>,
): Promise<DocSession | null> {
  const existingSession = docSessions.get(room)
  if (existingSession) {
    return existingSession
  }

  const pendingSession = pendingSessionInitializations.get(room)
  if (pendingSession) {
    return pendingSession
  }

  const initializationPromise = (async () => {
    const totalSessions = docSessions.size + pendingSessionInitializations.size
    if (!docSessions.has(room) && totalSessions >= maxDocSessions) {
      return null
    }

    const created = await createSession()
    if (!created) {
      return null
    }

    docSessions.set(room, created)
    return created
  })().finally(() => {
    pendingSessionInitializations.delete(room)
  })

  pendingSessionInitializations.set(room, initializationPromise)
  return initializationPromise
}
