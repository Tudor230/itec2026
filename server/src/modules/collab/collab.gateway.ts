import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { Socket } from 'socket.io'
import * as Y from 'yjs'
import { z } from 'zod'
import type { ActorContext } from '../auth/actor-context.js'
import { registerCollabFileCreatedListener } from './collab-events.js'

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

type ConnectedEvent = {
  actorType: ActorContext['type']
  socketId: string
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

export function createCollabGateway(
  httpServer: HttpServer,
  resolveActor: SocketActorResolver,
  canJoinProject: ProjectJoinAuthorizer,
  canJoinFile: FileJoinAuthorizer,
  loadFileContent: FileContentLoader,
  loadYjsHistory: YjsHistoryLoader,
  appendYjsUpdate: YjsUpdateAppender,
  saveYjsSnapshot: YjsSnapshotSaver,
) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000',
    },
  })
  const docSessions = new Map<string, DocSession>()
  const dirtySocketsByDocRoom = new Map<string, Set<string>>()
  const pendingSessionInitializations = new Map<string, Promise<DocSession | null>>()
  const maxDocSessions = readPositiveInt(process.env.COLLAB_MAX_DOC_SESSIONS, 200)
  const maxDocsPerSocket = readPositiveInt(process.env.COLLAB_MAX_DOCS_PER_SOCKET, 12)
  const maxDocUpdatesPerSecond = readPositiveInt(process.env.COLLAB_MAX_DOC_UPDATES_PER_SECOND, 120)
  const maxJoinsPerTenSeconds = readPositiveInt(process.env.COLLAB_MAX_DOC_JOINS_PER_10S, 40)
  const snapshotIntervalUpdates = readPositiveInt(process.env.COLLAB_SNAPSHOT_INTERVAL_UPDATES, 200)

  const unregisterFileCreatedListener = registerCollabFileCreatedListener((file) => {
    io.to(projectRoom(file.projectId)).emit('collab:file:created', file)
  })

  const originalClose = io.close.bind(io)
  io.close = ((callback?: (error?: Error) => void) => {
    unregisterFileCreatedListener()
    return originalClose(callback)
  }) as typeof io.close

  io.on('connection', (socket) => {
    const joinedRooms = new Set<string>()
    const joinedDocRooms = new Set<string>()
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

          const room = projectRoom(parsedProjectId.data)
          joinedRooms.add(room)
          void socket.join(room)

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

      socket.on('disconnect', () => {
        joinedRooms.forEach((room) => {
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
      } satisfies ConnectedEvent)
    })()
  })

  return io
}

function projectRoom(projectId: string) {
  return `project:${projectId}`
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
