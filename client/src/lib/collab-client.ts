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

export interface CollabFileCreatedPayload {
  id: string
  projectId: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface CollabDocDirtyStatePayload extends DocKey {
  isDirty: boolean
  updatedAt: string
}

export type WatchProjectCallbacks = {
  onFileCreated?: (payload: CollabFileCreatedPayload) => void
  onDirtyStateChanged?: (payload: CollabDocDirtyStatePayload) => void
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

      const onConnected = () => {
        cleanup()
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

    const onDirtyStateChanged = (payload: CollabDocDirtyStatePayload) => {
      if (payload.projectId !== projectId) {
        return
      }

      callbacks.onDirtyStateChanged?.(payload)
    }

    socket.on('collab:file:created', onFileCreated)
    socket.on('collab:doc:dirty-state', onDirtyStateChanged)
    socket.emit('collab:join-project', projectId)

    return () => {
      socket.emit('collab:leave-project', projectId)
      socket.off('collab:file:created', onFileCreated)
      socket.off('collab:doc:dirty-state', onDirtyStateChanged)
    }
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
    this.onStatus?.({ state: 'idle' })
  }
}
