import { io, type Socket } from 'socket.io-client'
import * as Y from 'yjs'
import { apiConfig } from './api-config'

type TokenProvider = () => Promise<string | null>

interface DocKey {
  projectId: string
  fileId: string
}

interface DocSyncPayload extends DocKey {
  update: string
}

interface DocUpdatePayload extends DocKey {
  update: string
}

interface ConnectedPayload {
  actorType: 'anonymous' | 'token_present' | 'authenticated'
  socketId: string
  subject?: string
}

export interface CollabFileCreatedPayload {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface CollabFileUpdatedPayload {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface CollabFileDeletedPayload {
  id: string
  projectId: string
  path: string
  deletedAt: string
}

export interface CollabDocDirtyStatePayload extends DocKey {
  isDirty: boolean
  updatedAt: string
}

export type WatchProjectCallbacks = {
  onFileCreated?: (payload: CollabFileCreatedPayload) => void
  onFileUpdated?: (payload: CollabFileUpdatedPayload) => void
  onFileDeleted?: (payload: CollabFileDeletedPayload) => void
  onDirtyStateChanged?: (payload: CollabDocDirtyStatePayload) => void
}

export interface CollabTerminalDescriptor {
  ownerSubject: string
  activeControllerSubject: string
  pendingRequestCount: number
}

export interface CollabTerminalListPayload {
  projectId: string
  terminals: CollabTerminalDescriptor[]
}

export interface CollabTerminalStatePayload {
  projectId: string
  ownerSubject: string
  activeControllerSubject: string
  isSessionOpen: boolean
  pendingRequests: Array<{
    requesterSubject: string
    requestedAt: string
  }>
}

export interface CollabTerminalOutputPayload {
  projectId: string
  ownerSubject: string
  stream: 'stdout' | 'stderr' | 'system'
  chunk: string
  timestamp: string
}

export interface CollabTerminalAccessRequestedPayload {
  projectId: string
  ownerSubject: string
  requesterSubject: string
  requestedAt: string
}

export interface CollabTerminalAccessDecisionPayload {
  projectId: string
  ownerSubject: string
  requesterSubject: string
  status: 'approved' | 'rejected' | 'revoked'
}

export type WatchTerminalCallbacks = {
  onTerminalList?: (payload: CollabTerminalListPayload) => void
  onTerminalState?: (payload: CollabTerminalStatePayload) => void
  onTerminalOutput?: (payload: CollabTerminalOutputPayload) => void
  onTerminalAccessRequested?: (payload: CollabTerminalAccessRequestedPayload) => void
  onTerminalAccessDecision?: (payload: CollabTerminalAccessDecisionPayload) => void
  onError?: (message: string) => void
}

interface CollabDocSession {
  doc: Y.Doc
  destroy: () => void
}

interface CollabStatus {
  state: 'idle' | 'connecting' | 'synced' | 'disconnected' | 'error'
  message?: string
}

interface CollabClientOptions {
  getToken: TokenProvider
  onStatus?: (status: CollabStatus) => void
}

function toBase64(update: Uint8Array): string {
  let binary = ''
  update.forEach((value) => {
    binary += String.fromCharCode(value)
  })

  return btoa(binary)
}

function fromBase64(encoded: string): Uint8Array | null {
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return bytes
  } catch {
    return null
  }
}

function sameDoc(left: DocKey, right: DocKey) {
  return left.projectId === right.projectId && left.fileId === right.fileId
}

export class CollabClient {
  private readonly getToken: TokenProvider
  private readonly onStatus: ((status: CollabStatus) => void) | undefined
  private socket: Socket | null = null
  private connectPromise: Promise<Socket> | null = null
  private currentSubject: string | null = null
  private readonly joinedProjects = new Map<string, number>()

  constructor(options: CollabClientOptions) {
    this.getToken = options.getToken
    this.onStatus = options.onStatus
  }

  async connect() {
    if (this.socket && this.socket.connected) {
      return this.socket
    }

    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.connectInternal()

    try {
      return await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async connectInternal() {
    if (this.socket && this.socket.connected) {
      return this.socket
    }

    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
      this.currentSubject = null
      this.joinedProjects.clear()
    }

    this.onStatus?.({ state: 'connecting' })
    const token = await this.getToken()

    const socket = io(apiConfig.baseUrl, {
      transports: ['websocket'],
      autoConnect: false,
      auth: token
        ? {
            token,
          }
        : undefined,
    })

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out connecting to collaboration server'))
      }, 6000)

      const onConnected = (payload?: ConnectedPayload) => {
        cleanup()
        this.currentSubject = payload?.subject ?? null
        this.onStatus?.({ state: 'synced' })
        resolve()
      }

      const onError = (error: unknown) => {
        cleanup()
        this.onStatus?.({ state: 'error', message: 'Could not connect to collaboration server' })
        reject(error instanceof Error ? error : new Error(String(error)))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        socket.off('collab:connected', onConnected)
        socket.off('connect_error', onError)
      }

      socket.on('collab:connected', onConnected)
      socket.on('connect_error', onError)
      socket.connect()
    })

    socket.on('disconnect', () => {
      this.currentSubject = null
      this.onStatus?.({ state: 'disconnected', message: 'Collaboration disconnected' })
    })

    socket.on('connect', () => {
      this.onStatus?.({ state: 'synced' })
    })

    this.socket = socket
    return socket
  }

  async joinDocument(projectId: string, fileId: string): Promise<CollabDocSession> {
    const socket = await this.connect()

    const doc = new Y.Doc()
    const key = { projectId, fileId }
    let isApplyingRemote = false

    const onDocSync = (payload: DocSyncPayload) => {
      if (!sameDoc(payload, key)) {
        return
      }

      const update = fromBase64(payload.update)
      if (!update) {
        this.onStatus?.({ state: 'error', message: 'Invalid initial document state from server' })
        return
      }

      isApplyingRemote = true
      Y.applyUpdate(doc, update, 'remote')
      isApplyingRemote = false
      this.onStatus?.({ state: 'synced' })
    }

    const onDocUpdate = (payload: DocUpdatePayload) => {
      if (!sameDoc(payload, key)) {
        return
      }

      const update = fromBase64(payload.update)
      if (!update) {
        return
      }

      isApplyingRemote = true
      Y.applyUpdate(doc, update, 'remote')
      isApplyingRemote = false
    }

    const onDocChange = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || isApplyingRemote) {
        return
      }

      socket.emit('collab:doc:update', {
        projectId,
        fileId,
        update: toBase64(update),
      })
    }

    const onError = (payload: { message?: string }) => {
      const message = payload.message ?? 'Collaboration error'
      this.onStatus?.({ state: 'error', message })
    }

    socket.on('collab:doc:sync', onDocSync)
    socket.on('collab:doc:update', onDocUpdate)
    socket.on('collab:error', onError)
    doc.on('update', onDocChange)

    this.onStatus?.({ state: 'connecting' })
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Timed out waiting for initial document sync'))
      }, 6000)

      const onSynced = (payload: DocSyncPayload) => {
        if (!sameDoc(payload, key)) {
          return
        }

        cleanup()
        resolve()
      }

      const onCollabError = (payload: { message?: string }) => {
        const message = payload.message ?? 'Collaboration error'
        cleanup()
        reject(new Error(message))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        socket.off('collab:doc:sync', onSynced)
        socket.off('collab:error', onCollabError)
      }

      socket.on('collab:doc:sync', onSynced)
      socket.on('collab:error', onCollabError)

      socket.emit('collab:doc:join', {
        projectId,
        fileId,
      })
    })

    this.onStatus?.({ state: 'synced' })

    return {
      doc,
      destroy: () => {
        socket.emit('collab:doc:leave', {
          projectId,
          fileId,
        })
        doc.off('update', onDocChange)
        socket.off('collab:doc:sync', onDocSync)
        socket.off('collab:doc:update', onDocUpdate)
        socket.off('collab:error', onError)
        doc.destroy()
      },
    }
  }

  async watchProject(projectId: string, callbacks: WatchProjectCallbacks): Promise<() => void> {
    const socket = await this.connect()

    const onFileCreated = (payload: CollabFileCreatedPayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onFileCreated?.(payload)
    }

    const onFileUpdated = (payload: CollabFileUpdatedPayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onFileUpdated?.(payload)
    }

    const onFileDeleted = (payload: CollabFileDeletedPayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onFileDeleted?.(payload)
    }

    const onDirtyStateChanged = (payload: CollabDocDirtyStatePayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onDirtyStateChanged?.(payload)
    }

    socket.on('collab:file:created', onFileCreated)
    socket.on('collab:file:updated', onFileUpdated)
    socket.on('collab:file:deleted', onFileDeleted)
    socket.on('collab:doc:dirty-state', onDirtyStateChanged)
    this.retainProject(socket, projectId)

    return () => {
      this.releaseProject(socket, projectId)
      socket.off('collab:file:created', onFileCreated)
      socket.off('collab:file:updated', onFileUpdated)
      socket.off('collab:file:deleted', onFileDeleted)
      socket.off('collab:doc:dirty-state', onDirtyStateChanged)
    }
  }

  async watchTerminals(projectId: string, callbacks: WatchTerminalCallbacks): Promise<() => void> {
    const socket = await this.connect()

    const onTerminalList = (payload: CollabTerminalListPayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onTerminalList?.(payload)
    }

    const onTerminalState = (payload: CollabTerminalStatePayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onTerminalState?.(payload)
    }

    const onTerminalOutput = (payload: CollabTerminalOutputPayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onTerminalOutput?.(payload)
    }

    const onTerminalAccessRequested = (payload: CollabTerminalAccessRequestedPayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onTerminalAccessRequested?.(payload)
    }

    const onTerminalAccessDecision = (payload: CollabTerminalAccessDecisionPayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onTerminalAccessDecision?.(payload)
    }

    const onError = (payload: { message?: string }) => {
      callbacks.onError?.(payload.message ?? 'Collaboration error')
    }

    socket.on('collab:terminal:list', onTerminalList)
    socket.on('collab:terminal:state', onTerminalState)
    socket.on('collab:terminal:output', onTerminalOutput)
    socket.on('collab:terminal:access:requested', onTerminalAccessRequested)
    socket.on('collab:terminal:access:decision', onTerminalAccessDecision)
    socket.on('collab:error', onError)

    this.retainProject(socket, projectId)
    socket.emit('collab:terminal:list', { projectId })

    return () => {
      this.releaseProject(socket, projectId)
      socket.off('collab:terminal:list', onTerminalList)
      socket.off('collab:terminal:state', onTerminalState)
      socket.off('collab:terminal:output', onTerminalOutput)
      socket.off('collab:terminal:access:requested', onTerminalAccessRequested)
      socket.off('collab:terminal:access:decision', onTerminalAccessDecision)
      socket.off('collab:error', onError)
    }
  }

  async joinTerminal(projectId: string, ownerSubject: string) {
    const socket = await this.connect()
    socket.emit('collab:terminal:join', {
      projectId,
      ownerSubject,
    })
  }

  async leaveTerminal(projectId: string, ownerSubject: string) {
    const socket = await this.connect()
    socket.emit('collab:terminal:leave', {
      projectId,
      ownerSubject,
    })
  }

  async sendTerminalInput(projectId: string, ownerSubject: string, input: string) {
    const socket = await this.connect()
    socket.emit('collab:terminal:input', {
      projectId,
      ownerSubject,
      input,
    })
  }

  async openTerminal(projectId: string, ownerSubject: string, size?: { cols: number; rows: number }) {
    const socket = await this.connect()
    socket.emit('collab:terminal:open', {
      projectId,
      ownerSubject,
      cols: size?.cols,
      rows: size?.rows,
    })
  }

  async resizeTerminal(projectId: string, ownerSubject: string, size: { cols: number; rows: number }) {
    const socket = await this.connect()
    socket.emit('collab:terminal:resize', {
      projectId,
      ownerSubject,
      cols: size.cols,
      rows: size.rows,
    })
  }

  async closeTerminal(projectId: string, ownerSubject: string) {
    const socket = await this.connect()
    socket.emit('collab:terminal:close', {
      projectId,
      ownerSubject,
    })
  }

  async requestTerminalAccess(projectId: string, ownerSubject: string) {
    const socket = await this.connect()
    socket.emit('collab:terminal:access:request', {
      projectId,
      ownerSubject,
    })
  }

  async decideTerminalAccess(
    projectId: string,
    ownerSubject: string,
    requesterSubject: string,
    approve: boolean,
  ) {
    const socket = await this.connect()
    socket.emit('collab:terminal:access:decision', {
      projectId,
      ownerSubject,
      requesterSubject,
      approve,
    })
  }

  async revokeTerminalControl(projectId: string, ownerSubject: string) {
    const socket = await this.connect()
    socket.emit('collab:terminal:control:revoke', {
      projectId,
      ownerSubject,
    })
  }

  getCurrentSubject() {
    return this.currentSubject
  }

  async markDocumentSaved(projectId: string, fileId: string) {
    const socket = await this.connect()
    socket.emit('collab:doc:saved', {
      projectId,
      fileId,
    })
  }

  disconnect() {
    if (!this.socket) {
      return
    }

    this.socket.disconnect()
    this.socket = null
    this.currentSubject = null
    this.joinedProjects.clear()
    this.onStatus?.({ state: 'idle' })
  }

  private retainProject(socket: Socket, projectId: string) {
    const count = this.joinedProjects.get(projectId) ?? 0
    if (count === 0) {
      socket.emit('collab:join-project', projectId)
    }

    this.joinedProjects.set(projectId, count + 1)
  }

  private releaseProject(socket: Socket, projectId: string) {
    const count = this.joinedProjects.get(projectId)
    if (!count) {
      return
    }

    if (count > 1) {
      this.joinedProjects.set(projectId, count - 1)
      return
    }

    this.joinedProjects.delete(projectId)
    socket.emit('collab:leave-project', projectId)
  }
}
