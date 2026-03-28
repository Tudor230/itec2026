import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as Y from 'yjs'
import type { Socket } from 'socket.io'
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client'
import type { ActorContext } from '../auth/actor-context.js'
import { actorContextFromSocket } from '../auth/auth-socket-context.js'
import { createCollabGateway } from './collab.gateway.js'
import { LocalShellRuntime } from './terminal/local-shell-runtime.js'
import { TerminalSessionManager } from './terminal/terminal-session-manager.js'

const TEST_JWT_SECRET = 'test-jwt-secret'
process.env.AUTH_JWT_HS256_SECRET = TEST_JWT_SECRET
process.env.AUTH_JWT_ISSUER = 'https://issuer.test/'
process.env.AUTH_JWT_AUDIENCE = 'https://audience.test'
process.env.COLLAB_MAX_DOC_SESSIONS = '3'
process.env.COLLAB_MAX_DOCS_PER_SOCKET = '3'
process.env.COLLAB_MAX_DOC_UPDATES_PER_SECOND = '4'
process.env.COLLAB_MAX_DOC_JOINS_PER_10S = '20'
process.env.COLLAB_SNAPSHOT_INTERVAL_UPDATES = '2'
process.env.COLLAB_MAX_TERMINAL_INPUTS_PER_SECOND = '20'
process.env.COLLAB_MAX_TERMINAL_REQUESTS_PER_10S = '50'

type ConnectedPayload = {
  actorType: 'anonymous' | 'token_present' | 'authenticated'
  socketId: string
  subject?: string
}

type PresencePayload = {
  type: 'joined' | 'left'
  projectId?: string
  socketId: string
  actorType?: 'anonymous' | 'token_present' | 'authenticated'
}

type DocSyncPayload = {
  projectId: string
  fileId: string
  update: string
}

type DocUpdatePayload = {
  projectId: string
  fileId: string
  update: string
}

type DocPresencePayload = {
  type: 'joined' | 'left'
  projectId: string
  fileId: string
  socketId: string
  actorType?: 'anonymous' | 'token_present' | 'authenticated'
}

type DocDirtyStatePayload = {
  projectId: string
  fileId: string
  isDirty: boolean
  updatedAt: string
}

type FileCreatedPayload = {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

type FileUpdatedPayload = {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

type FileDeletedPayload = {
  id: string
  projectId: string
  path: string
  deletedAt: string
}

type TerminalListPayload = {
  projectId: string
  terminals: Array<{
    ownerSubject: string
    activeControllerSubject: string
    pendingRequestCount: number
  }>
}

type TerminalStatePayload = {
  projectId: string
  ownerSubject: string
  activeControllerSubject: string
  isSessionOpen: boolean
  pendingRequests: Array<{
    requesterSubject: string
    requestedAt: string
  }>
}

type TerminalOutputPayload = {
  projectId: string
  ownerSubject: string
  stream: 'stdout' | 'stderr' | 'system'
  chunk: string
  timestamp: string
}

type TerminalAccessRequestedPayload = {
  projectId: string
  ownerSubject: string
  requesterSubject: string
  requestedAt: string
}

type TerminalAccessDecisionPayload = {
  projectId: string
  ownerSubject: string
  requesterSubject: string
  status: 'approved' | 'rejected' | 'revoked'
}

function makeTimeoutError(message: string) {
  return new Error(message)
}

function createJwt(sub: string, jwtId: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      jti: jwtId,
      iss: process.env.AUTH_JWT_ISSUER,
      aud: process.env.AUTH_JWT_AUDIENCE,
    }),
  ).toString('base64url')
  const signingInput = `${header}.${payload}`
  const signature = createHmac('sha256', TEST_JWT_SECRET)
    .update(signingInput)
    .digest('base64url')

  return `${signingInput}.${signature}`
}

function decodeYUpdate(encodedUpdate: string) {
  return new Uint8Array(Buffer.from(encodedUpdate, 'base64'))
}

function encodeYUpdate(text: string) {
  const doc = new Y.Doc()
  doc.getText('content').insert(0, text)
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
}

async function waitForEvent<T>(
  socket: ClientSocket,
  eventName: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(makeTimeoutError(`Timed out waiting for ${eventName}`))
    }, timeoutMs)

    const onEvent = (payload: T) => {
      if (!predicate(payload)) {
        return
      }

      cleanup()
      resolve(payload)
    }

    const onError = (error: unknown) => {
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    const cleanup = () => {
      clearTimeout(timeout)
      socket.off(eventName, onEvent)
      socket.off('connect_error', onError)
    }

    socket.on(eventName, onEvent)
    socket.on('connect_error', onError)
  })
}

describe('collab gateway', () => {
  let baseUrl = ''
  let closeServer: (() => Promise<void>) | undefined
  const clients: ClientSocket[] = []
  let persistedUpdateSequence = 0
  let snapshotSaveCount = 0
  let prewarmCalls: Array<{ projectId: string; ownerSubject: string }> = []

  beforeEach(async () => {
    const httpServer = createServer()

    const canJoinProject = async (actor: ActorContext, projectId: string) => {
      if (!actor.subject) {
        return false
      }

      return projectId !== 'forbidden-project'
    }

    const canJoinFile = async (actor: ActorContext, projectId: string, fileId: string) => {
      if (!actor.subject) {
        return false
      }

      if (projectId === 'forbidden-project') {
        return false
      }

      return fileId !== 'forbidden-file'
    }

    const loadFileContent = async (_actor: ActorContext, _projectId: string, fileId: string) => {
      if (fileId === 'missing-file') {
        return null
      }

      return 'initial content'
    }

    const loadYjsHistory = async (
      _actor: ActorContext,
      _projectId: string,
      _fileId: string,
    ) => {
      return null
    }

    const appendYjsUpdate = async (
      _actor: ActorContext,
      _projectId: string,
      _fileId: string,
      _update: Uint8Array,
    ) => {
      persistedUpdateSequence += 1
      return { sequence: persistedUpdateSequence }
    }

    const saveYjsSnapshot = async (
      _actor: ActorContext,
      _projectId: string,
      _fileId: string,
      _sequence: number,
      _update: Uint8Array,
    ) => {
      snapshotSaveCount += 1
      return
    }

    const canUseTerminal = async (_actor: ActorContext, projectId: string) => {
      return projectId !== 'forbidden-project'
    }

    class SpyTerminalSessionManager extends TerminalSessionManager {
      override prewarmTerminal(projectId: string, ownerSubject: string): Promise<void> {
        prewarmCalls.push({ projectId, ownerSubject })
        return super.prewarmTerminal(projectId, ownerSubject)
      }
    }

    const terminalSessionManager = new SpyTerminalSessionManager(() => new LocalShellRuntime())

    const io = createCollabGateway(
      httpServer,
      (socket: Socket) => actorContextFromSocket(socket),
      canJoinProject,
      canJoinFile,
      loadFileContent,
      loadYjsHistory,
      appendYjsUpdate,
      saveYjsSnapshot,
      canUseTerminal,
      terminalSessionManager,
    )

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve())
    })

    const address = httpServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('Cannot determine collab test server address')
    }

    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`

    closeServer = async () => {
      clients.forEach((client) => {
        if (client.connected) {
          client.disconnect()
        } else {
          client.close()
        }
      })
      clients.length = 0

      await new Promise<void>((resolve, reject) => {
        io.close((error) => {
          if (error) {
            reject(error)
            return
          }

          if (!httpServer.listening) {
            resolve()
            return
          }

          httpServer.close((closeError) => {
            if (closeError) {
              reject(closeError)
              return
            }

            resolve()
          })
        })
      })
    }
  })

  afterEach(async () => {
    if (closeServer) {
      await closeServer()
      closeServer = undefined
    }
  })

  beforeEach(() => {
    persistedUpdateSequence = 0
    snapshotSaveCount = 0
    prewarmCalls = []
  })

  it('prewarms terminal when project is joined', async () => {
    const projectId = 'project-prewarm'
    const ownerSubject = 'auth0|prewarm-user'

    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-prewarm') },
    })

    clients.push(client)
    client.connect()

    await waitForEvent<ConnectedPayload>(client, 'collab:connected')

    const joined = waitForEvent<PresencePayload>(
      client,
      'collab:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId,
    )

    client.emit('collab:join-project', projectId)
    await joined

    assert.equal(prewarmCalls.length, 1)
    assert.deepEqual(prewarmCalls[0], {
      projectId,
      ownerSubject,
    })
  })

  it('emits actor type on connect based on resolver', async () => {
    const authenticatedClient = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-socket') },
    })
    const anonymousClient = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
    })

    clients.push(authenticatedClient, anonymousClient)

    const authConnected = waitForEvent<ConnectedPayload>(authenticatedClient, 'collab:connected')
    const anonymousConnected = waitForEvent<ConnectedPayload>(anonymousClient, 'collab:connected')

    authenticatedClient.connect()
    anonymousClient.connect()

    const authPayload = await authConnected
    const anonymousPayload = await anonymousConnected

    assert.equal(authPayload.actorType, 'token_present')
    assert.equal(anonymousPayload.actorType, 'anonymous')
    assert.equal(authPayload.socketId, authenticatedClient.id)
    assert.equal(anonymousPayload.socketId, anonymousClient.id)
  })

  it('rejects invalid doc join payloads', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-socket-2') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const errorEvent = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'projectId and fileId are required',
    )

    client.emit('collab:doc:join', { projectId: 'project-123', fileId: '' })

    const payload = await errorEvent
    assert.equal(payload.message, 'projectId and fileId are required')
  })

  it('rejects doc join when actor is anonymous', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const errorEvent = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'Authentication is required',
    )

    client.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-1' })

    const payload = await errorEvent
    assert.equal(payload.message, 'Authentication is required')
  })

  it('returns initial document sync for authorized file joins', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-sync') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const syncEvent = waitForEvent<DocSyncPayload>(
      client,
      'collab:doc:sync',
      (payload) => payload.projectId === 'project-123' && payload.fileId === 'file-1',
    )

    client.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-1' })

    const payload = await syncEvent
    const doc = new Y.Doc()
    Y.applyUpdate(doc, decodeYUpdate(payload.update))

    assert.equal(doc.getText('content').toString(), 'initial content')
  })

  it('broadcasts doc updates to other clients in the same room', async () => {
    const projectId = 'project-123'
    const fileId = 'file-1'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-socket-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-socket-b') },
    })

    clients.push(clientA, clientB)

    const connectedA = waitForEvent<ConnectedPayload>(clientA, 'collab:connected')
    const connectedB = waitForEvent<ConnectedPayload>(clientB, 'collab:connected')
    clientA.connect()
    clientB.connect()
    await Promise.all([connectedA, connectedB])

    const syncA = waitForEvent<DocSyncPayload>(clientA, 'collab:doc:sync')
    clientA.emit('collab:doc:join', { projectId, fileId })
    await syncA

    const syncB = waitForEvent<DocSyncPayload>(clientB, 'collab:doc:sync')
    clientB.emit('collab:doc:join', { projectId, fileId })
    await syncB

    const updateSeenByB = waitForEvent<DocUpdatePayload>(
      clientB,
      'collab:doc:update',
      (payload) => payload.projectId === projectId && payload.fileId === fileId,
    )

    clientA.emit('collab:doc:update', {
      projectId,
      fileId,
      update: encodeYUpdate('hello from A'),
    })

    const updatePayload = await updateSeenByB
    const doc = new Y.Doc()
    Y.applyUpdate(doc, decodeYUpdate(updatePayload.update))
    assert.equal(doc.getText('content').toString(), 'hello from A')
  })

  it('rejects updates before joining a document', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-update-without-join') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const errorEvent = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'Join document first',
    )

    client.emit('collab:doc:update', {
      projectId: 'project-123',
      fileId: 'file-1',
      update: encodeYUpdate('should fail'),
    })

    const payload = await errorEvent
    assert.equal(payload.message, 'Join document first')
  })

  it('emits doc presence events for room participants', async () => {
    const projectId = 'project-123'
    const fileId = 'file-1'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-doc-presence-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-doc-presence-b') },
    })

    clients.push(clientA, clientB)

    const connectedA = waitForEvent<ConnectedPayload>(clientA, 'collab:connected')
    const connectedB = waitForEvent<ConnectedPayload>(clientB, 'collab:connected')
    clientA.connect()
    clientB.connect()
    await Promise.all([connectedA, connectedB])

    const syncA = waitForEvent<DocSyncPayload>(clientA, 'collab:doc:sync')
    clientA.emit('collab:doc:join', { projectId, fileId })
    await syncA

    const presenceSeenByA = waitForEvent<DocPresencePayload>(
      clientA,
      'collab:doc:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId && payload.fileId === fileId,
    )

    const syncB = waitForEvent<DocSyncPayload>(clientB, 'collab:doc:sync')
    clientB.emit('collab:doc:join', { projectId, fileId })
    await syncB

    const presencePayload = await presenceSeenByA
    assert.equal(presencePayload.type, 'joined')
    assert.equal(presencePayload.actorType, 'token_present')
    assert.equal(presencePayload.socketId, clientB.id)
  })

  it('rejects unauthorized file joins', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-forbidden-file') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const errorEvent = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'Not authorized for this file',
    )

    client.emit('collab:doc:join', { projectId: 'project-123', fileId: 'forbidden-file' })

    const payload = await errorEvent
    assert.equal(payload.message, 'Not authorized for this file')
  })

  it('returns file not found when loader has no document', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-missing-file') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const errorEvent = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'File not found',
    )

    client.emit('collab:doc:join', { projectId: 'project-123', fileId: 'missing-file' })

    const payload = await errorEvent
    assert.equal(payload.message, 'File not found')
  })

  it('rejects too many open documents per socket session', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-too-many-docs') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    for (const fileId of ['file-1', 'file-2', 'file-3']) {
      const sync = waitForEvent<DocSyncPayload>(
        client,
        'collab:doc:sync',
        (payload) => payload.fileId === fileId,
      )
      client.emit('collab:doc:join', { projectId: 'project-123', fileId })
      await sync
    }

    const errorEvent = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'Too many open documents in this session',
    )

    client.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-4' })

    const payload = await errorEvent
    assert.equal(payload.message, 'Too many open documents in this session')
  })

  it('rejects new sessions when collaboration capacity is reached', async () => {
    const createAuthorizedClient = (suffix: string) => {
      const client = createClient(baseUrl, {
        transports: ['websocket'],
        autoConnect: false,
        auth: { token: createJwt(`auth0|socket-user-${suffix}`, `jwt-capacity-${suffix}`) },
      })

      clients.push(client)
      return client
    }

    const clientA = createAuthorizedClient('a')
    const clientB = createAuthorizedClient('b')
    const clientC = createAuthorizedClient('c')
    const clientD = createAuthorizedClient('d')

    clientA.connect()
    clientB.connect()
    clientC.connect()
    clientD.connect()

    await Promise.all([
      waitForEvent<ConnectedPayload>(clientA, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientB, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientC, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientD, 'collab:connected'),
    ])

    const syncA = waitForEvent<DocSyncPayload>(clientA, 'collab:doc:sync', (payload) => payload.fileId === 'file-1')
    clientA.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-1' })
    await syncA

    const syncB = waitForEvent<DocSyncPayload>(clientB, 'collab:doc:sync', (payload) => payload.fileId === 'file-2')
    clientB.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-2' })
    await syncB

    const syncC = waitForEvent<DocSyncPayload>(clientC, 'collab:doc:sync', (payload) => payload.fileId === 'file-3')
    clientC.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-3' })
    await syncC

    const errorEvent = waitForEvent<{ message: string }>(
      clientD,
      'collab:error',
      (payload) => payload.message === 'Collaboration server is busy, try again later',
    )

    clientD.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-4' })

    const payload = await errorEvent
    assert.equal(payload.message, 'Collaboration server is busy, try again later')
  })

  it('rate limits excessive document updates', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user', 'jwt-update-rate-limit') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const sync = waitForEvent<DocSyncPayload>(client, 'collab:doc:sync', (payload) => payload.fileId === 'file-1')
    client.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-1' })
    await sync

    const errorEvent = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'Too many document updates',
    )

    for (let index = 0; index < 5; index += 1) {
      client.emit('collab:doc:update', {
        projectId: 'project-123',
        fileId: 'file-1',
        update: encodeYUpdate(`update-${index}`),
      })
    }

    const payload = await errorEvent
    assert.equal(payload.message, 'Too many document updates')
  })

  it('creates snapshots periodically after persisted update threshold', async () => {
    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|snapshot-user', 'jwt-snapshot-user') },
    })

    clients.push(client)

    const connected = waitForEvent<ConnectedPayload>(client, 'collab:connected')
    client.connect()
    await connected

    const sync = waitForEvent<DocSyncPayload>(client, 'collab:doc:sync')
    client.emit('collab:doc:join', { projectId: 'project-123', fileId: 'file-1' })
    await sync

    client.emit('collab:doc:update', {
      projectId: 'project-123',
      fileId: 'file-1',
      update: encodeYUpdate('first update'),
    })

    client.emit('collab:doc:update', {
      projectId: 'project-123',
      fileId: 'file-1',
      update: encodeYUpdate('second update'),
    })

    await new Promise((resolve) => setTimeout(resolve, 200))

    assert.equal(snapshotSaveCount, 1)
  })

  it('broadcasts project presence events within a project room', async () => {
    const projectId = 'project-123'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-project-presence-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-project-presence-b') },
    })

    clients.push(clientA, clientB)

    const connectedA = waitForEvent<ConnectedPayload>(clientA, 'collab:connected')
    const connectedB = waitForEvent<ConnectedPayload>(clientB, 'collab:connected')
    clientA.connect()
    clientB.connect()
    await Promise.all([connectedA, connectedB])

    const joinASeenByA = waitForEvent<PresencePayload>(
      clientA,
      'collab:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId && payload.socketId === clientA.id,
    )

    clientA.emit('collab:join-project', projectId)
    const joinedA = await joinASeenByA
    assert.equal(joinedA.actorType, 'token_present')

    const joinBSeenByA = waitForEvent<PresencePayload>(
      clientA,
      'collab:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId && payload.socketId === clientB.id,
    )

    clientB.emit('collab:join-project', projectId)

    const joinedB = await joinBSeenByA
    assert.equal(joinedB.actorType, 'token_present')

    const leftBSeenByA = waitForEvent<PresencePayload>(
      clientA,
      'collab:presence',
      (payload) => payload.type === 'left' && payload.projectId === projectId && payload.socketId === clientB.id,
    )

    clientB.emit('collab:leave-project', projectId)
    await leftBSeenByA

    const joinBAgainSeenByA = waitForEvent<PresencePayload>(
      clientA,
      'collab:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId && payload.socketId === clientB.id,
    )

    clientB.emit('collab:join-project', projectId)
    await joinBAgainSeenByA
  })

  it('broadcasts dirty state transitions to project room peers', async () => {
    const projectId = 'project-123'
    const fileId = 'file-1'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-dirty-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-dirty-b') },
    })

    clients.push(clientA, clientB)

    clientA.connect()
    clientB.connect()

    await Promise.all([
      waitForEvent<ConnectedPayload>(clientA, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientB, 'collab:connected'),
    ])

    clientA.emit('collab:join-project', projectId)
    clientB.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(
        clientA,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
      waitForEvent<PresencePayload>(
        clientB,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
    ])

    clientA.emit('collab:doc:join', { projectId, fileId })
    clientB.emit('collab:doc:join', { projectId, fileId })

    await Promise.all([
      waitForEvent<DocSyncPayload>(
        clientA,
        'collab:doc:sync',
        (payload) => payload.projectId === projectId && payload.fileId === fileId,
      ),
      waitForEvent<DocSyncPayload>(
        clientB,
        'collab:doc:sync',
        (payload) => payload.projectId === projectId && payload.fileId === fileId,
      ),
    ])

    const dirtyOnUpdate = waitForEvent<DocDirtyStatePayload>(
      clientB,
      'collab:doc:dirty-state',
      (payload) => payload.projectId === projectId && payload.fileId === fileId && payload.isDirty,
    )

    clientA.emit('collab:doc:update', {
      projectId,
      fileId,
      update: encodeYUpdate('dirty content'),
    })

    const dirtyPayload = await dirtyOnUpdate
    assert.equal(dirtyPayload.isDirty, true)

    const dirtyOnSave = waitForEvent<DocDirtyStatePayload>(
      clientB,
      'collab:doc:dirty-state',
      (payload) => payload.projectId === projectId && payload.fileId === fileId && !payload.isDirty,
    )

    clientA.emit('collab:doc:saved', { projectId, fileId })

    const savedPayload = await dirtyOnSave
    assert.equal(savedPayload.isDirty, false)
  })

  it('clears global dirty state for all participants when one client saves', async () => {
    const projectId = 'project-123'
    const fileId = 'file-1'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-global-save-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-global-save-b') },
    })

    clients.push(clientA, clientB)

    clientA.connect()
    clientB.connect()

    await Promise.all([
      waitForEvent<ConnectedPayload>(clientA, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientB, 'collab:connected'),
    ])

    clientA.emit('collab:join-project', projectId)
    clientB.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(
        clientA,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
      waitForEvent<PresencePayload>(
        clientB,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
    ])

    clientA.emit('collab:doc:join', { projectId, fileId })
    clientB.emit('collab:doc:join', { projectId, fileId })

    await Promise.all([
      waitForEvent<DocSyncPayload>(
        clientA,
        'collab:doc:sync',
        (payload) => payload.projectId === projectId && payload.fileId === fileId,
      ),
      waitForEvent<DocSyncPayload>(
        clientB,
        'collab:doc:sync',
        (payload) => payload.projectId === projectId && payload.fileId === fileId,
      ),
    ])

    const dirtyOnUpdateA = waitForEvent<DocDirtyStatePayload>(
      clientA,
      'collab:doc:dirty-state',
      (payload) => payload.projectId === projectId && payload.fileId === fileId && payload.isDirty,
    )
    const dirtyOnUpdateB = waitForEvent<DocDirtyStatePayload>(
      clientB,
      'collab:doc:dirty-state',
      (payload) => payload.projectId === projectId && payload.fileId === fileId && payload.isDirty,
    )

    clientA.emit('collab:doc:update', {
      projectId,
      fileId,
      update: encodeYUpdate('shared dirty content'),
    })

    await Promise.all([dirtyOnUpdateA, dirtyOnUpdateB])

    const dirtyOnSaveA = waitForEvent<DocDirtyStatePayload>(
      clientA,
      'collab:doc:dirty-state',
      (payload) => payload.projectId === projectId && payload.fileId === fileId && !payload.isDirty,
    )
    const dirtyOnSaveB = waitForEvent<DocDirtyStatePayload>(
      clientB,
      'collab:doc:dirty-state',
      (payload) => payload.projectId === projectId && payload.fileId === fileId && !payload.isDirty,
    )

    clientA.emit('collab:doc:saved', { projectId, fileId })

    await Promise.all([dirtyOnSaveA, dirtyOnSaveB])
  })

  it('broadcasts file created events to project room peers', async () => {
    const projectId = 'project-123'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-file-created-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-file-created-b') },
    })

    clients.push(clientA, clientB)

    clientA.connect()
    clientB.connect()

    await Promise.all([
      waitForEvent<ConnectedPayload>(clientA, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientB, 'collab:connected'),
    ])

    clientA.emit('collab:join-project', projectId)
    clientB.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(
        clientA,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
      waitForEvent<PresencePayload>(
        clientB,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
    ])

    const eventSeenByB = waitForEvent<FileCreatedPayload>(
      clientB,
      'collab:file:created',
      (payload) => payload.projectId === projectId && payload.path === 'src/live.ts',
    )

    const fakeFile: FileCreatedPayload = {
      id: 'file-live-1',
      projectId,
      path: 'src/live.ts',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const { emitCollabFileCreated } = await import('./collab-events.js')
    emitCollabFileCreated(fakeFile)

    const seenPayload = await eventSeenByB
    assert.equal(seenPayload.path, 'src/live.ts')
  })

  it('sends current dirty snapshot on project join', async () => {
    const projectId = 'project-123'
    const fileId = 'file-1'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-dirty-snapshot-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-dirty-snapshot-b') },
    })

    clients.push(clientA, clientB)

    clientA.connect()
    clientB.connect()

    await Promise.all([
      waitForEvent<ConnectedPayload>(clientA, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientB, 'collab:connected'),
    ])

    clientA.emit('collab:join-project', projectId)
    await waitForEvent<PresencePayload>(
      clientA,
      'collab:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId,
    )

    clientA.emit('collab:doc:join', { projectId, fileId })
    await waitForEvent<DocSyncPayload>(
      clientA,
      'collab:doc:sync',
      (payload) => payload.projectId === projectId && payload.fileId === fileId,
    )

    clientA.emit('collab:doc:update', {
      projectId,
      fileId,
      update: encodeYUpdate('dirty snapshot content'),
    })

    const snapshotSeenByB = waitForEvent<DocDirtyStatePayload>(
      clientB,
      'collab:doc:dirty-state',
      (payload) => payload.projectId === projectId && payload.fileId === fileId && payload.isDirty,
    )

    clientB.emit('collab:join-project', projectId)
    await snapshotSeenByB
  })

  it('broadcasts file updated and deleted events to project room peers', async () => {
    const projectId = 'project-123'

    const clientA = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-a', 'jwt-file-events-a') },
    })
    const clientB = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|socket-user-b', 'jwt-file-events-b') },
    })

    clients.push(clientA, clientB)

    clientA.connect()
    clientB.connect()

    await Promise.all([
      waitForEvent<ConnectedPayload>(clientA, 'collab:connected'),
      waitForEvent<ConnectedPayload>(clientB, 'collab:connected'),
    ])

    clientA.emit('collab:join-project', projectId)
    clientB.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(
        clientA,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
      waitForEvent<PresencePayload>(
        clientB,
        'collab:presence',
        (payload) => payload.type === 'joined' && payload.projectId === projectId,
      ),
    ])

    const { emitCollabFileUpdated, emitCollabFileDeleted } = await import('./collab-events.js')

    const updatedSeen = waitForEvent<FileUpdatedPayload>(
      clientB,
      'collab:file:updated',
      (payload) => payload.projectId === projectId && payload.id === 'file-updated-1',
    )

    emitCollabFileUpdated({
      id: 'file-updated-1',
      projectId,
      path: 'src/updated.ts',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const updatedPayload = await updatedSeen
    assert.equal(updatedPayload.path, 'src/updated.ts')

    const deletedSeen = waitForEvent<FileDeletedPayload>(
      clientB,
      'collab:file:deleted',
      (payload) => payload.projectId === projectId && payload.id === 'file-deleted-1',
    )

    emitCollabFileDeleted({
      id: 'file-deleted-1',
      projectId,
      path: 'src/deleted.ts',
      deletedAt: new Date().toISOString(),
    })

    const deletedPayload = await deletedSeen
    assert.equal(deletedPayload.path, 'src/deleted.ts')
  })

  it('publishes terminal list for joined project members', async () => {
    const projectId = 'project-123'
    const ownerSubject = 'auth0|terminal-owner'

    const owner = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-terminal-owner') },
    })

    clients.push(owner)

    owner.connect()
    await waitForEvent<ConnectedPayload>(owner, 'collab:connected')

    owner.emit('collab:join-project', projectId)
    await waitForEvent<PresencePayload>(
      owner,
      'collab:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId,
    )

    const terminalList = waitForEvent<TerminalListPayload>(
      owner,
      'collab:terminal:list',
      (payload) => {
        return payload.projectId === projectId
          && payload.terminals.some((terminal) => terminal.ownerSubject === ownerSubject)
      },
    )

    owner.emit('collab:terminal:list', { projectId })

    const listPayload = await terminalList
    assert.ok(listPayload.terminals.some((terminal) => terminal.ownerSubject === ownerSubject))
    assert.equal(listPayload.terminals.find((terminal) => terminal.ownerSubject === ownerSubject)?.activeControllerSubject, ownerSubject)
  })

  it('blocks terminal list and join when terminal authorization is denied', async () => {
    const projectId = 'project-123'
    const ownerSubject = 'auth0|terminal-denied-user'

    const client = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-terminal-denied-user') },
    })

    clients.push(client)

    client.connect()
    await waitForEvent<ConnectedPayload>(client, 'collab:connected')

    client.emit('collab:join-project', projectId)
    await waitForEvent<PresencePayload>(
      client,
      'collab:presence',
      (payload) => payload.type === 'joined' && payload.projectId === projectId,
    )

    const denyListError = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'Not authorized for terminal access',
    )

    client.emit('collab:terminal:list', { projectId: 'forbidden-project' })
    await denyListError

    const denyJoinError = waitForEvent<{ message: string }>(
      client,
      'collab:error',
      (payload) => payload.message === 'Not authorized for terminal access',
    )

    client.emit('collab:terminal:join', {
      projectId: 'forbidden-project',
      ownerSubject,
    })
    await denyJoinError
  })

  it('blocks terminal input from read-only viewers', async () => {
    const projectId = 'project-123'
    const ownerSubject = 'auth0|terminal-owner-a'

    const owner = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-terminal-owner-a') },
    })
    const viewer = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt('auth0|terminal-viewer-a', 'jwt-terminal-viewer-a') },
    })

    clients.push(owner, viewer)

    owner.connect()
    viewer.connect()
    await Promise.all([
      waitForEvent<ConnectedPayload>(owner, 'collab:connected'),
      waitForEvent<ConnectedPayload>(viewer, 'collab:connected'),
    ])

    owner.emit('collab:join-project', projectId)
    viewer.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(owner, 'collab:presence', (payload) => payload.projectId === projectId),
      waitForEvent<PresencePayload>(viewer, 'collab:presence', (payload) => payload.projectId === projectId),
    ])

    viewer.emit('collab:terminal:join', {
      projectId,
      ownerSubject,
    })

    await waitForEvent<TerminalStatePayload>(
      viewer,
      'collab:terminal:state',
      (payload) => payload.projectId === projectId && payload.ownerSubject === ownerSubject,
    )

    const errorPayload = waitForEvent<{ message: string }>(
      viewer,
      'collab:error',
      (payload) => payload.message === 'Terminal is read-only for this user',
    )

    viewer.emit('collab:terminal:input', {
      projectId,
      ownerSubject,
      input: 'echo denied\n',
    })

    const error = await errorPayload
    assert.equal(error.message, 'Terminal is read-only for this user')
  })

  it('allows owner to approve access requests and enables input', async () => {
    const projectId = 'project-123'
    const ownerSubject = 'auth0|terminal-owner-b'
    const viewerSubject = 'auth0|terminal-viewer-b'

    const owner = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-terminal-owner-b') },
    })
    const viewer = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(viewerSubject, 'jwt-terminal-viewer-b') },
    })

    clients.push(owner, viewer)

    owner.connect()
    viewer.connect()
    await Promise.all([
      waitForEvent<ConnectedPayload>(owner, 'collab:connected'),
      waitForEvent<ConnectedPayload>(viewer, 'collab:connected'),
    ])

    owner.emit('collab:join-project', projectId)
    viewer.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(owner, 'collab:presence', (payload) => payload.projectId === projectId),
      waitForEvent<PresencePayload>(viewer, 'collab:presence', (payload) => payload.projectId === projectId),
    ])

    owner.emit('collab:terminal:join', {
      projectId,
      ownerSubject,
    })
    viewer.emit('collab:terminal:join', {
      projectId,
      ownerSubject,
    })

    await Promise.all([
      waitForEvent<TerminalStatePayload>(owner, 'collab:terminal:state', (payload) => payload.ownerSubject === ownerSubject),
      waitForEvent<TerminalStatePayload>(viewer, 'collab:terminal:state', (payload) => payload.ownerSubject === ownerSubject),
    ])

    const requestSeenByOwner = waitForEvent<TerminalAccessRequestedPayload>(
      owner,
      'collab:terminal:access:requested',
      (payload) => payload.ownerSubject === ownerSubject && payload.requesterSubject === viewerSubject,
    )

    viewer.emit('collab:terminal:access:request', {
      projectId,
      ownerSubject,
    })

    await requestSeenByOwner

    const decisionSeenByViewer = waitForEvent<TerminalAccessDecisionPayload>(
      viewer,
      'collab:terminal:access:decision',
      (payload) => payload.ownerSubject === ownerSubject && payload.requesterSubject === viewerSubject,
    )

    owner.emit('collab:terminal:access:decision', {
      projectId,
      ownerSubject,
      requesterSubject: viewerSubject,
      approve: true,
    })

    const decisionPayload = await decisionSeenByViewer
    assert.equal(decisionPayload.status, 'approved')

    const openedStateSeenByViewer = waitForEvent<TerminalStatePayload>(
      viewer,
      'collab:terminal:state',
      (payload) => payload.ownerSubject === ownerSubject && payload.isSessionOpen,
    )

    viewer.emit('collab:terminal:open', {
      projectId,
      ownerSubject,
      cols: 120,
      rows: 40,
    })

    await openedStateSeenByViewer

    const outputSeenByOwner = waitForEvent<TerminalOutputPayload>(
      owner,
      'collab:terminal:output',
      (payload) => payload.ownerSubject === ownerSubject,
      3000,
    )

    viewer.emit('collab:terminal:input', {
      projectId,
      ownerSubject,
      input: 'echo test-from-viewer\n',
    })

    const outputPayload = await outputSeenByOwner
    assert.equal(outputPayload.ownerSubject, ownerSubject)
  })

  it('allows owner to reject terminal access requests', async () => {
    const projectId = 'project-123'
    const ownerSubject = 'auth0|terminal-owner-c'
    const viewerSubject = 'auth0|terminal-viewer-c'

    const owner = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-terminal-owner-c') },
    })
    const viewer = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(viewerSubject, 'jwt-terminal-viewer-c') },
    })

    clients.push(owner, viewer)

    owner.connect()
    viewer.connect()
    await Promise.all([
      waitForEvent<ConnectedPayload>(owner, 'collab:connected'),
      waitForEvent<ConnectedPayload>(viewer, 'collab:connected'),
    ])

    owner.emit('collab:join-project', projectId)
    viewer.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(owner, 'collab:presence', (payload) => payload.projectId === projectId),
      waitForEvent<PresencePayload>(viewer, 'collab:presence', (payload) => payload.projectId === projectId),
    ])

    viewer.emit('collab:terminal:join', {
      projectId,
      ownerSubject,
    })

    await waitForEvent<TerminalStatePayload>(
      viewer,
      'collab:terminal:state',
      (payload) => payload.ownerSubject === ownerSubject,
    )

    viewer.emit('collab:terminal:access:request', {
      projectId,
      ownerSubject,
    })

    await waitForEvent<TerminalAccessRequestedPayload>(
      owner,
      'collab:terminal:access:requested',
      (payload) => payload.ownerSubject === ownerSubject && payload.requesterSubject === viewerSubject,
    )

    const decisionSeenByViewer = waitForEvent<TerminalAccessDecisionPayload>(
      viewer,
      'collab:terminal:access:decision',
      (payload) => payload.ownerSubject === ownerSubject && payload.requesterSubject === viewerSubject,
    )

    owner.emit('collab:terminal:access:decision', {
      projectId,
      ownerSubject,
      requesterSubject: viewerSubject,
      approve: false,
    })

    const decisionPayload = await decisionSeenByViewer
    assert.equal(decisionPayload.status, 'rejected')
  })

  it('rejects terminal access decision when request is not pending', async () => {
    const projectId = 'project-123'
    const ownerSubject = 'auth0|terminal-owner-d'
    const viewerSubject = 'auth0|terminal-viewer-d'

    const owner = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-terminal-owner-d') },
    })
    const viewer = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(viewerSubject, 'jwt-terminal-viewer-d') },
    })

    clients.push(owner, viewer)

    owner.connect()
    viewer.connect()
    await Promise.all([
      waitForEvent<ConnectedPayload>(owner, 'collab:connected'),
      waitForEvent<ConnectedPayload>(viewer, 'collab:connected'),
    ])

    owner.emit('collab:join-project', projectId)
    viewer.emit('collab:join-project', projectId)

    await Promise.all([
      waitForEvent<PresencePayload>(owner, 'collab:presence', (payload) => payload.projectId === projectId),
      waitForEvent<PresencePayload>(viewer, 'collab:presence', (payload) => payload.projectId === projectId),
    ])

    owner.emit('collab:terminal:join', {
      projectId,
      ownerSubject,
    })

    await waitForEvent<TerminalStatePayload>(
      owner,
      'collab:terminal:state',
      (payload) => payload.ownerSubject === ownerSubject,
    )

    const errorPayload = waitForEvent<{ message: string }>(
      owner,
      'collab:error',
      (payload) => payload.message === 'No pending access request',
    )

    owner.emit('collab:terminal:access:decision', {
      projectId,
      ownerSubject,
      requesterSubject: viewerSubject,
      approve: true,
    })

    const error = await errorPayload
    assert.equal(error.message, 'No pending access request')
  })

  it('rejects revoke control when owner is not in project room', async () => {
    const projectId = 'project-123'
    const ownerSubject = 'auth0|terminal-owner-e'

    const owner = createClient(baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: { token: createJwt(ownerSubject, 'jwt-terminal-owner-e') },
    })

    clients.push(owner)

    owner.connect()
    await waitForEvent<ConnectedPayload>(owner, 'collab:connected')

    const errorPayload = waitForEvent<{ message: string }>(
      owner,
      'collab:error',
      (payload) => payload.message === 'Join project first',
    )

    owner.emit('collab:terminal:control:revoke', {
      projectId,
      ownerSubject,
    })

    const error = await errorPayload
    assert.equal(error.message, 'Join project first')
  })
})
