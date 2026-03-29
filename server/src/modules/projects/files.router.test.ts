import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import express from 'express'
import * as Y from 'yjs'
import { errorHandler } from '../../http/error-handler.js'
import { authBoundaryMiddleware } from '../auth/auth-boundary.middleware.js'
import {
  registerCollabFileCreatedListener,
  registerCollabFileDeletedListener,
  registerCollabFileUpdatedListener,
} from '../collab/collab-events.js'
import { createFilesRouter } from './files.router.js'

const TEST_JWT_SECRET = 'test-jwt-secret'
process.env.AUTH_JWT_HS256_SECRET = TEST_JWT_SECRET
process.env.AUTH_JWT_ISSUER = 'https://issuer.test/'
process.env.AUTH_JWT_AUDIENCE = 'https://audience.test'

type ProjectRow = {
  id: string
  ownerSubject: string | null
}

type FileRow = {
  id: string
  projectId: string
  path: string
  storageKey: string
  contentHash: string
  byteSize: number
  ownerSubject: string | null
  createdAt: Date
  updatedAt: Date
}

type YjsSnapshotRow = {
  id: string
  fileId: string
  sequence: number
  updateBase64: string
  createdAt: Date
}

type YjsUpdateRow = {
  id: string
  fileId: string
  sequence: number
  updateBase64: string
  createdAt: Date
}

function encodeYjsSnapshot(content: string) {
  const doc = new Y.Doc()
  const text = doc.getText('content')
  if (content.length > 0) {
    text.insert(0, content)
  }

  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
}

class InMemoryBlobStore {
  private readonly files = new Map<string, string>()
  private failWrites = false

  async readText(storageKey: string): Promise<string> {
    const content = this.files.get(storageKey)
    if (content === undefined) {
      throw Object.assign(new Error('Stored file blob not found'), {
        code: 'FILE_BLOB_NOT_FOUND',
      })
    }

    return content
  }

  async writeText(storageKey: string, content: string) {
    if (this.failWrites) {
      throw Object.assign(new Error('blob write failed'), {
        code: 'FILE_BLOB_WRITE_FAILED',
      })
    }

    this.files.set(storageKey, content)

    return {
      contentHash: createHash('sha256').update(content, 'utf8').digest('hex'),
      byteSize: Buffer.from(content, 'utf8').byteLength,
    }
  }

  async remove(storageKey: string) {
    this.files.delete(storageKey)
  }

  setWriteFailure(enabled: boolean) {
    this.failWrites = enabled
  }

  hasStorageKey(storageKey: string) {
    return this.files.has(storageKey)
  }

  size() {
    return this.files.size
  }
}

class WorkspaceSyncDouble {
  private failDelete = false

  private failCreate = false

  setDeleteFailure(enabled: boolean) {
    this.failDelete = enabled
  }

  setCreateFailure(enabled: boolean) {
    this.failCreate = enabled
  }

  runLocked<T>(_projectId: string, action: () => Promise<T>): Promise<T> {
    return action()
  }

  applyApiCreateAlreadyLocked(_file: { path: string; content: string }) {
    if (this.failCreate) {
      return Promise.reject(new Error('workspace create failed'))
    }

    return Promise.resolve()
  }

  applyApiUpdateAlreadyLocked(_previous: { path: string }, _next: { path: string; content: string }) {
    return Promise.resolve()
  }

  async applyApiDeleteAlreadyLocked(file: { path: string }) {
    void file
    if (this.failDelete) {
      throw new Error('workspace delete failed')
    }
  }
}

class InMemoryProjectsTable {
  private rows: ProjectRow[] = []

  seed(row: ProjectRow) {
    this.rows = [...this.rows, row]
  }

  async findFirst(args: {
    where: {
      id: string
      ownerSubject?: string
    }
    select?: {
      id: true
    }
  }): Promise<{ id: string } | null> {
    const found = this.rows.find((row) => {
      if (args.where.ownerSubject !== undefined) {
        return row.id === args.where.id && row.ownerSubject === args.where.ownerSubject
      }

      return row.id === args.where.id
    })

    return found ? { id: found.id } : null
  }
}

class InMemoryFilesTable {
  private rows: FileRow[] = []

  findByIdSync(id: string): FileRow | null {
    const row = this.rows.find((candidate) => candidate.id === id)
    return row ? this.cloneRow(row) : null
  }

  async findMany(args: {
    where: {
      projectId: string
      ownerSubject?: string
    }
    orderBy: {
      updatedAt: 'desc'
    }
  }): Promise<FileRow[]> {
    return this.rows
      .filter((row) => {
        const ownerSubjectMatches = args.where.ownerSubject === undefined
          ? true
          : row.ownerSubject === args.where.ownerSubject

        return row.projectId === args.where.projectId && ownerSubjectMatches
      })
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((row) => this.cloneRow(row))
  }

  async findFirst(args: {
    where: {
      id: string
      ownerSubject?: string
    }
  }): Promise<FileRow | null> {
    const found = this.rows.find((row) => {
      if (args.where.ownerSubject !== undefined) {
        return row.id === args.where.id && row.ownerSubject === args.where.ownerSubject
      }

      return row.id === args.where.id
    })

    return found ? this.cloneRow(found) : null
  }

  async create(args: {
    data: {
      id: string
      projectId: string
      path: string
      storageKey: string
      contentHash: string
      byteSize: number
      ownerSubject: string
    }
  }): Promise<FileRow> {
    const hasPathConflict = this.rows.some((row) => {
      return row.projectId === args.data.projectId && row.path === args.data.path
    })
    if (hasPathConflict) {
      throw Object.assign(new Error('File path already exists'), {
        code: 'P2002',
      })
    }

    const now = new Date()
    const row: FileRow = {
      id: args.data.id,
      projectId: args.data.projectId,
      path: args.data.path,
      storageKey: args.data.storageKey,
      contentHash: args.data.contentHash,
      byteSize: args.data.byteSize,
      ownerSubject: args.data.ownerSubject,
      createdAt: now,
      updatedAt: now,
    }

    this.rows = [...this.rows, row]
    return this.cloneRow(row)
  }

  async updateMany(args: {
    where: {
      id: string
      ownerSubject?: string | null
    }
    data: {
      path: string
      contentHash: string
      byteSize: number
    }
  }): Promise<{ count: number }> {
    let count = 0
    const now = new Date()

    this.rows = this.rows.map((row) => {
      const ownerSubjectMatches = args.where.ownerSubject === undefined
        ? true
        : row.ownerSubject === args.where.ownerSubject

      if (row.id !== args.where.id || !ownerSubjectMatches) {
        return row
      }

      count += 1

      return {
        ...row,
        path: args.data.path,
        contentHash: args.data.contentHash,
        byteSize: args.data.byteSize,
        updatedAt: now,
      }
    })

    return { count }
  }

  async deleteMany(args: {
    where: {
      id: string
      ownerSubject?: string
    }
  }): Promise<{ count: number }> {
    const beforeLength = this.rows.length

    this.rows = this.rows.filter((row) => {
      const ownerSubjectMatches = args.where.ownerSubject === undefined
        ? true
        : row.ownerSubject === args.where.ownerSubject

      return !(row.id === args.where.id && ownerSubjectMatches)
    })

    return { count: beforeLength - this.rows.length }
  }

  private cloneRow(row: FileRow): FileRow {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }
}

class InMemoryYjsSnapshotsTable {
  private rows: YjsSnapshotRow[] = []

  constructor(private readonly filesTable: InMemoryFilesTable) {}

  seed(row: YjsSnapshotRow) {
    this.rows = [...this.rows, {
      ...row,
      createdAt: new Date(row.createdAt),
    }]
  }

  async findMany(args: {
    where: {
      fileId?: string
      file?: {
        projectId: string
      }
      sequence?: {
        lte?: number
        gt?: number
      }
    }
    orderBy: Array<{
      createdAt?: 'desc' | 'asc'
      sequence?: 'desc' | 'asc'
    }> | {
      createdAt?: 'desc' | 'asc'
      sequence?: 'desc' | 'asc'
    }
    take?: number
    select: {
      fileId?: true
      sequence?: true
      updateBase64?: true
      createdAt?: true
      file?: {
        select: {
          path: true
        }
      }
    }
  }) {
    const orderByArray = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]

    const filtered = this.rows
      .filter((row) => {
        if (args.where.fileId && row.fileId !== args.where.fileId) {
          return false
        }

        if (args.where.sequence?.lte !== undefined && row.sequence > args.where.sequence.lte) {
          return false
        }

        if (args.where.sequence?.gt !== undefined && row.sequence <= args.where.sequence.gt) {
          return false
        }

        if (args.where.file?.projectId) {
          const file = this.filesTable.findByIdSync(row.fileId)
          return Boolean(file && file.projectId === args.where.file.projectId)
        }

        return true
      })
      .sort((left, right) => {
        for (const order of orderByArray) {
          if (order.createdAt) {
            const diff = left.createdAt.getTime() - right.createdAt.getTime()
            if (diff !== 0) {
              return order.createdAt === 'desc' ? -diff : diff
            }
          }

          if (order.sequence) {
            const diff = left.sequence - right.sequence
            if (diff !== 0) {
              return order.sequence === 'desc' ? -diff : diff
            }
          }
        }

        return 0
      })

    const selected = filtered.map((row) => {
      const file = this.filesTable.findByIdSync(row.fileId)
      return {
        fileId: args.select.fileId ? row.fileId : undefined,
        sequence: args.select.sequence ? row.sequence : undefined,
        updateBase64: args.select.updateBase64 ? row.updateBase64 : undefined,
        createdAt: args.select.createdAt ? new Date(row.createdAt) : undefined,
        file: args.select.file
          ? {
              path: file?.path ?? '',
            }
          : undefined,
      }
    })

    if (args.take === undefined) {
      return selected
    }

    return selected.slice(0, args.take)
  }

  async findFirst(args: {
    where: {
      fileId: string
      sequence?: number | {
        lte?: number
      }
    }
    orderBy?: Array<{
      sequence?: 'desc' | 'asc'
      createdAt?: 'desc' | 'asc'
    }>
    select: {
      id?: true
      sequence?: true
      updateBase64?: true
    }
  }) {
    const orderByArray = args.orderBy ?? []

    const filtered = this.rows
      .filter((row) => {
        if (row.fileId !== args.where.fileId) {
          return false
        }

        if (typeof args.where.sequence === 'number') {
          return row.sequence === args.where.sequence
        }

        if (args.where.sequence?.lte !== undefined) {
          return row.sequence <= args.where.sequence.lte
        }

        return true
      })
      .sort((left, right) => {
        for (const order of orderByArray) {
          if (order.sequence) {
            const diff = left.sequence - right.sequence
            if (diff !== 0) {
              return order.sequence === 'desc' ? -diff : diff
            }
          }

          if (order.createdAt) {
            const diff = left.createdAt.getTime() - right.createdAt.getTime()
            if (diff !== 0) {
              return order.createdAt === 'desc' ? -diff : diff
            }
          }
        }

        return 0
      })

    const first = filtered[0]
    if (!first) {
      return null
    }

    return {
      id: args.select.id ? first.id : undefined,
      sequence: args.select.sequence ? first.sequence : undefined,
      updateBase64: args.select.updateBase64 ? first.updateBase64 : undefined,
    }
  }
}

class InMemoryYjsUpdatesTable {
  private rows: YjsUpdateRow[] = []

  constructor(private readonly filesTable: InMemoryFilesTable) {}

  seed(row: YjsUpdateRow) {
    this.rows = [...this.rows, {
      ...row,
      createdAt: new Date(row.createdAt),
    }]
  }

  async findMany(args: {
    where: {
      fileId?: string
      file?: {
        projectId: string
      }
      sequence?: {
        lte?: number
        gt?: number
      }
    }
    orderBy: Array<{
      createdAt?: 'desc' | 'asc'
      sequence?: 'desc' | 'asc'
    }> | {
      createdAt?: 'desc' | 'asc'
      sequence?: 'desc' | 'asc'
    }
    take?: number
    select: {
      fileId?: true
      sequence?: true
      updateBase64?: true
      createdAt?: true
      file?: {
        select: {
          path: true
        }
      }
    }
  }) {
    const orderByArray = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]

    const filtered = this.rows
      .filter((row) => {
        if (args.where.fileId && row.fileId !== args.where.fileId) {
          return false
        }

        if (args.where.sequence?.lte !== undefined && row.sequence > args.where.sequence.lte) {
          return false
        }

        if (args.where.sequence?.gt !== undefined && row.sequence <= args.where.sequence.gt) {
          return false
        }

        if (args.where.file?.projectId) {
          const file = this.filesTable.findByIdSync(row.fileId)
          return Boolean(file && file.projectId === args.where.file.projectId)
        }

        return true
      })
      .sort((left, right) => {
        for (const order of orderByArray) {
          if (order.createdAt) {
            const diff = left.createdAt.getTime() - right.createdAt.getTime()
            if (diff !== 0) {
              return order.createdAt === 'desc' ? -diff : diff
            }
          }

          if (order.sequence) {
            const diff = left.sequence - right.sequence
            if (diff !== 0) {
              return order.sequence === 'desc' ? -diff : diff
            }
          }
        }

        return 0
      })

    const selected = filtered.map((row) => {
      const file = this.filesTable.findByIdSync(row.fileId)
      return {
        fileId: args.select.fileId ? row.fileId : undefined,
        sequence: args.select.sequence ? row.sequence : undefined,
        updateBase64: args.select.updateBase64 ? row.updateBase64 : undefined,
        createdAt: args.select.createdAt ? new Date(row.createdAt) : undefined,
        file: args.select.file
          ? {
              path: file?.path ?? '',
            }
          : undefined,
      }
    })

    if (args.take === undefined) {
      return selected
    }

    return selected.slice(0, args.take)
  }

  async findFirst(args: {
    where: {
      fileId: string
      sequence?: number
    }
    select: {
      id?: true
    }
  }) {
    const first = this.rows.find((row) => {
      if (row.fileId !== args.where.fileId) {
        return false
      }

      if (args.where.sequence !== undefined) {
        return row.sequence === args.where.sequence
      }

      return true
    })

    if (!first) {
      return null
    }

    return {
      id: args.select.id ? first.id : undefined,
    }
  }
}

function createPrismaDouble() {
  const projects = new InMemoryProjectsTable()
  const files = new InMemoryFilesTable()
  const yjsSnapshots = new InMemoryYjsSnapshotsTable(files)
  const yjsUpdates = new InMemoryYjsUpdatesTable(files)
  const blobStore = new InMemoryBlobStore()

  return {
    prisma: {
      $transaction: async <T>(operations: Promise<T>[]) => Promise.all(operations),
      project: {
        findFirst: projects.findFirst.bind(projects),
      },
      file: {
        findMany: files.findMany.bind(files),
        findFirst: files.findFirst.bind(files),
        create: files.create.bind(files),
        updateMany: files.updateMany.bind(files),
        deleteMany: files.deleteMany.bind(files),
      },
      yjsSnapshot: {
        findMany: yjsSnapshots.findMany.bind(yjsSnapshots),
        findFirst: yjsSnapshots.findFirst.bind(yjsSnapshots),
      },
      yjsUpdate: {
        findMany: yjsUpdates.findMany.bind(yjsUpdates),
        findFirst: yjsUpdates.findFirst.bind(yjsUpdates),
      },
    } as unknown as PrismaClient,
    blobStore,
    seedProject: (projectId: string, ownerSubject: string) => {
      projects.seed({ id: projectId, ownerSubject })
    },
    seedYjsSnapshot: (row: YjsSnapshotRow) => {
      yjsSnapshots.seed(row)
    },
    seedYjsUpdate: (row: YjsUpdateRow) => {
      yjsUpdates.seed(row)
    },
  }
}

async function startServer(
  prisma: PrismaClient,
  blobStore: InMemoryBlobStore,
  workspaceSync?: WorkspaceSyncDouble,
  fetchImpl?: typeof fetch,
): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  const app = express()
  app.use(express.json())
  app.use(authBoundaryMiddleware)
  app.use('/api/files', createFilesRouter({
    prisma,
    blobStore,
    workspaceSync: workspaceSync as never,
    fetchImpl,
  }))
  app.use(errorHandler)

  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started))
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Cannot determine test server address')
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: () => {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
  }
}

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}

describe('files router', () => {
  let baseUrl = ''
  let closeServer: (() => Promise<void>) | undefined
  let seedProject: ((projectId: string, ownerSubject: string) => void) | undefined
  let seedYjsSnapshot: ((row: YjsSnapshotRow) => void) | undefined
  let seedYjsUpdate: ((row: YjsUpdateRow) => void) | undefined
  const createdEvents: Array<{ projectId: string; path: string }> = []
  const updatedEvents: Array<{ projectId: string; path: string; id: string }> = []
  const deletedEvents: Array<{ projectId: string; path: string; id: string }> = []
  let unregisterFileCreatedListener: (() => void) | null = null
  let unregisterFileUpdatedListener: (() => void) | null = null
  let unregisterFileDeletedListener: (() => void) | null = null
  let blobStore: InMemoryBlobStore | undefined
  let workspaceSync: WorkspaceSyncDouble | undefined

  beforeEach(async () => {
    createdEvents.length = 0
    updatedEvents.length = 0
    deletedEvents.length = 0
    unregisterFileCreatedListener = registerCollabFileCreatedListener((file) => {
      createdEvents.push({ projectId: file.projectId, path: file.path })
    })
    unregisterFileUpdatedListener = registerCollabFileUpdatedListener((file) => {
      updatedEvents.push({ projectId: file.projectId, path: file.path, id: file.id })
    })
    unregisterFileDeletedListener = registerCollabFileDeletedListener((file) => {
      deletedEvents.push({ projectId: file.projectId, path: file.path, id: file.id })
    })

    const testDb = createPrismaDouble()
    workspaceSync = new WorkspaceSyncDouble()
    const started = await startServer(testDb.prisma, testDb.blobStore, workspaceSync)
    baseUrl = started.baseUrl
    closeServer = started.close
    seedProject = testDb.seedProject
    seedYjsSnapshot = testDb.seedYjsSnapshot
    seedYjsUpdate = testDb.seedYjsUpdate
    blobStore = testDb.blobStore
  })

  afterEach(async () => {
    if (unregisterFileCreatedListener) {
      unregisterFileCreatedListener()
      unregisterFileCreatedListener = null
    }

    if (unregisterFileUpdatedListener) {
      unregisterFileUpdatedListener()
      unregisterFileUpdatedListener = null
    }

    if (unregisterFileDeletedListener) {
      unregisterFileDeletedListener()
      unregisterFileDeletedListener = null
    }

    if (closeServer) {
      await closeServer()
      closeServer = undefined
    }
  })

  it('returns 401 for anonymous list requests', async () => {
    const response = await fetch(`${baseUrl}/api/files?projectId=project-1`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'AUTH_REQUIRED')
  })

  it('returns 400 when projectId query is missing', async () => {
    const token = createJwt('auth0|files-user', 'jwt-files')

    const response = await fetch(`${baseUrl}/api/files`, {
      headers: authHeaders(token),
    })

    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'INVALID_QUERY')
  })

  it('creates, lists, updates and deletes a file for the owner subject', async () => {
    const ownerSubject = 'auth0|owner-user'
    const token = createJwt(ownerSubject, 'jwt-owner-1')
    const projectId = 'project-owner-1'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/main.ts',
        content: 'console.log("hello")',
      }),
    })

    const createdPayload = await created.json()

    const listed = await fetch(`${baseUrl}/api/files?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listedPayload = await listed.json()

    const patched = await fetch(`${baseUrl}/api/files/${createdPayload.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ content: 'console.log("updated")' }),
    })
    const patchedPayload = await patched.json()

    const deleted = await fetch(`${baseUrl}/api/files/${createdPayload.data.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })
    const deletedPayload = await deleted.json()

    const afterDelete = await fetch(`${baseUrl}/api/files/${createdPayload.data.id}`, {
      headers: authHeaders(token),
    })
    const afterDeletePayload = await afterDelete.json()

    assert.equal(created.status, 201)
    assert.equal(createdPayload.data.projectId, projectId)
    assert.equal(createdPayload.data.path, 'src/main.ts')
    assert.equal(createdPayload.data.ownerSubject, ownerSubject)
    assert.equal(listed.status, 200)
    assert.equal(listedPayload.data.length, 1)
    assert.equal(listedPayload.data[0].id, createdPayload.data.id)
    assert.equal(patched.status, 200)
    assert.equal(patchedPayload.data.content, 'console.log("updated")')
    assert.equal(deleted.status, 200)
    assert.equal(deletedPayload.data.deleted, true)
    assert.equal(afterDelete.status, 404)
    assert.equal(afterDeletePayload.error.code, 'FILE_NOT_FOUND')
    assert.equal(createdEvents.length, 1)
    assert.deepEqual(createdEvents[0], {
      projectId,
      path: 'src/main.ts',
    })
    assert.equal(updatedEvents.length, 1)
    assert.equal(updatedEvents[0]?.id, createdPayload.data.id)
    assert.equal(deletedEvents.length, 1)
    assert.equal(deletedEvents[0]?.id, createdPayload.data.id)
  })

  it('isolates file access by subject owner', async () => {
    const ownerSubject = 'auth0|owner-isolated'
    const ownerToken = createJwt(ownerSubject, 'jwt-owner-2')
    const projectId = 'project-isolated'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        projectId,
        path: 'README.md',
        content: 'hello',
      }),
    })

    const createdPayload = await created.json()
    const fileId = createdPayload.data.id

    const otherToken = createJwt('auth0|other-user', 'jwt-other-1')

    const listedByOther = await fetch(`${baseUrl}/api/files?projectId=${projectId}`, {
      headers: authHeaders(otherToken),
    })
    const listedByOtherPayload = await listedByOther.json()

    const getByOther = await fetch(`${baseUrl}/api/files/${fileId}`, {
      headers: authHeaders(otherToken),
    })
    const getByOtherPayload = await getByOther.json()

    const updateByOther = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'PATCH',
      headers: authHeaders(otherToken),
      body: JSON.stringify({ content: 'changed by other' }),
    })
    const updateByOtherPayload = await updateByOther.json()

    const deleteByOther = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: authHeaders(otherToken),
    })
    const deleteByOtherPayload = await deleteByOther.json()

    assert.equal(listedByOther.status, 200)
    assert.equal(listedByOtherPayload.data.length, 0)
    assert.equal(getByOther.status, 404)
    assert.equal(getByOtherPayload.error.code, 'FILE_NOT_FOUND')
    assert.equal(updateByOther.status, 404)
    assert.equal(updateByOtherPayload.error.code, 'FILE_NOT_FOUND')
    assert.equal(deleteByOther.status, 404)
    assert.equal(deleteByOtherPayload.error.code, 'FILE_NOT_FOUND')
  })

  it('returns 404 when creating a file in a missing project', async () => {
    const token = createJwt('auth0|unknown-project-user', 'jwt-missing-project')

    const response = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId: 'missing-project',
        path: 'src/index.ts',
        content: '',
      }),
    })

    const payload = await response.json()

    assert.equal(response.status, 404)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'RESOURCE_NOT_FOUND')
  })

  it('returns 400 for invalid file update payload', async () => {
    const ownerSubject = 'auth0|file-validation-user'
    const token = createJwt(ownerSubject, 'jwt-validation')
    const projectId = 'project-validation'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/app.ts',
        content: 'app',
      }),
    })

    const createdPayload = await created.json()

    const invalidPatch = await fetch(`${baseUrl}/api/files/${createdPayload.data.id}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    })

    const invalidPayload = await invalidPatch.json()

    assert.equal(invalidPatch.status, 400)
    assert.equal(invalidPayload.ok, false)
    assert.equal(invalidPayload.error.code, 'INVALID_FILE_INPUT')
  })

  it('keeps file access for same user across different tokens', async () => {
    const ownerSubject = 'auth0|stable-file-user'
    const firstToken = createJwt(ownerSubject, 'jwt-first-login')
    const secondToken = createJwt(ownerSubject, 'jwt-second-login')
    const projectId = 'project-stable-file-user'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(firstToken),
      body: JSON.stringify({
        projectId,
        path: 'src/stable.ts',
        content: 'stable',
      }),
    })

    const createdPayload = await created.json()

    const listed = await fetch(`${baseUrl}/api/files?projectId=${projectId}`, {
      headers: authHeaders(secondToken),
    })
    const listedPayload = await listed.json()

    const fetched = await fetch(`${baseUrl}/api/files/${createdPayload.data.id}`, {
      headers: authHeaders(secondToken),
    })
    const fetchedPayload = await fetched.json()

    assert.equal(created.status, 201)
    assert.equal(listed.status, 200)
    assert.equal(fetched.status, 200)
    assert.equal(listedPayload.data.length, 1)
    assert.equal(listedPayload.data[0].id, createdPayload.data.id)
    assert.equal(fetchedPayload.data.ownerSubject, ownerSubject)
  })

  it('removes blob content when db create fails after blob write', async () => {
    const ownerSubject = 'auth0|orphan-cleanup-user'
    const token = createJwt(ownerSubject, 'jwt-orphan-cleanup')
    const projectId = 'project-orphan-cleanup'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/main.ts',
        content: 'first',
      }),
    })
    const createdPayload = await created.json()

    const firstStorageKey = createdPayload.data.storageKey as string
    assert.equal(blobStore?.hasStorageKey(firstStorageKey), true)

    const conflicting = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/main.ts',
        content: 'second',
      }),
    })

    assert.equal(conflicting.status, 409)
    assert.equal(blobStore?.size(), 1)
  })

  it('rolls back db record when workspace sync fails after create', async () => {
    const ownerSubject = 'auth0|workspace-create-fail-user'
    const token = createJwt(ownerSubject, 'jwt-workspace-create-fail')
    const projectId = 'project-workspace-create-fail'
    seedProject?.(projectId, ownerSubject)

    workspaceSync?.setCreateFailure(true)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/main.ts',
        content: 'first',
      }),
    })

    assert.equal(created.status, 500)

    const listed = await fetch(`${baseUrl}/api/files?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listedPayload = await listed.json()
    assert.equal(listed.status, 200)
    assert.equal(listedPayload.data.length, 0)
  })

  it('keeps delete atomic when workspace deletion fails', async () => {
    const ownerSubject = 'auth0|delete-atomic-user'
    const token = createJwt(ownerSubject, 'jwt-delete-atomic')
    const projectId = 'project-delete-atomic'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/atomic.ts',
        content: 'atomic',
      }),
    })
    const createdPayload = await created.json()

    workspaceSync?.setDeleteFailure(true)

    const deleted = await fetch(`${baseUrl}/api/files/${createdPayload.data.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })

    assert.equal(deleted.status, 500)

    const stillExists = await fetch(`${baseUrl}/api/files/${createdPayload.data.id}`, {
      headers: authHeaders(token),
    })
    assert.equal(stillExists.status, 200)
  })

  it('supports folder create/list/rename/delete lifecycle', async () => {
    const ownerSubject = 'auth0|folder-user'
    const token = createJwt(ownerSubject, 'jwt-folder-user')
    const projectId = 'project-folder-user'
    seedProject?.(projectId, ownerSubject)

    const createFolderResponse = await fetch(`${baseUrl}/api/files/folders`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/utils',
      }),
    })
    const createFolderPayload = await createFolderResponse.json()

    const listAfterCreate = await fetch(`${baseUrl}/api/files/folders?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listAfterCreatePayload = await listAfterCreate.json()

    const renamedFolderResponse = await fetch(`${baseUrl}/api/files/folders`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        fromPath: 'src/utils',
        toPath: 'src/helpers',
      }),
    })
    const renamedFolderPayload = await renamedFolderResponse.json()

    const listAfterRename = await fetch(`${baseUrl}/api/files/folders?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listAfterRenamePayload = await listAfterRename.json()

    const deleteFolderResponse = await fetch(`${baseUrl}/api/files/folders`, {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/helpers',
      }),
    })
    const deleteFolderPayload = await deleteFolderResponse.json()

    const listAfterDelete = await fetch(`${baseUrl}/api/files/folders?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listAfterDeletePayload = await listAfterDelete.json()

    assert.equal(createFolderResponse.status, 201)
    assert.equal(createFolderPayload.data.path, 'src/utils')
    assert.equal(listAfterCreate.status, 200)
    assert.equal(listAfterCreatePayload.data.some((folder: { path: string }) => folder.path === 'src/utils'), true)
    assert.equal(renamedFolderResponse.status, 200)
    assert.equal(renamedFolderPayload.data.renamed, true)
    assert.equal(listAfterRename.status, 200)
    assert.equal(listAfterRenamePayload.data.some((folder: { path: string }) => folder.path === 'src/helpers'), true)
    assert.equal(deleteFolderResponse.status, 200)
    assert.equal(deleteFolderPayload.data.deleted, true)
    assert.equal(listAfterDelete.status, 200)
    assert.equal(listAfterDeletePayload.data.some((folder: { path: string }) => folder.path === 'src/helpers'), false)
  })

  it('renames and deletes nested files through folder routes', async () => {
    const ownerSubject = 'auth0|folder-nested-user'
    const token = createJwt(ownerSubject, 'jwt-folder-nested-user')
    const projectId = 'project-folder-nested-user'
    seedProject?.(projectId, ownerSubject)

    const createdFile = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/utils/math.ts',
        content: 'export const add = (a, b) => a + b',
      }),
    })
    const createdFilePayload = await createdFile.json()

    const renameFolderResponse = await fetch(`${baseUrl}/api/files/folders`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        fromPath: 'src/utils',
        toPath: 'src/helpers',
      }),
    })
    const renameFolderPayload = await renameFolderResponse.json()

    const listedAfterRename = await fetch(`${baseUrl}/api/files?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listedAfterRenamePayload = await listedAfterRename.json()

    const deleteFolderResponse = await fetch(`${baseUrl}/api/files/folders`, {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/helpers',
      }),
    })
    const deleteFolderPayload = await deleteFolderResponse.json()

    const getDeletedFile = await fetch(`${baseUrl}/api/files/${createdFilePayload.data.id}`, {
      headers: authHeaders(token),
    })
    const getDeletedFilePayload = await getDeletedFile.json()

    assert.equal(renameFolderResponse.status, 200)
    assert.equal(renameFolderPayload.data.renamed, true)
    assert.equal(
      listedAfterRenamePayload.data.some((file: { path: string }) => file.path === 'src/helpers/math.ts'),
      true,
    )
    assert.equal(deleteFolderResponse.status, 200)
    assert.equal(deleteFolderPayload.data.deleted, true)
    assert.equal(getDeletedFile.status, 404)
    assert.equal(getDeletedFilePayload.error.code, 'FILE_NOT_FOUND')
  })

  it('lists file history and restores selected version', async () => {
    const ownerSubject = 'auth0|history-file-user'
    const token = createJwt(ownerSubject, 'jwt-history-file-user')
    const projectId = 'project-history-file-user'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/history.ts',
        content: 'console.log("head")',
      }),
    })

    const createdPayload = await created.json()
    const fileId = createdPayload.data.id as string

    seedYjsSnapshot?.({
      id: 'snapshot-1',
      fileId,
      sequence: 1,
      updateBase64: encodeYjsSnapshot('console.log("v1")'),
      createdAt: new Date('2026-03-29T09:00:00.000Z'),
    })
    seedYjsUpdate?.({
      id: 'update-2',
      fileId,
      sequence: 2,
      updateBase64: encodeYjsSnapshot('console.log("v2")'),
      createdAt: new Date('2026-03-29T10:00:00.000Z'),
    })

    const listedHistory = await fetch(`${baseUrl}/api/files/history/file/${fileId}?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listedHistoryPayload = await listedHistory.json()

    const loadedVersion = await fetch(`${baseUrl}/api/files/history/file/${fileId}/snapshot:1?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const loadedVersionPayload = await loadedVersion.json()

    const restored = await fetch(`${baseUrl}/api/files/history/file/${fileId}/snapshot:1/restore`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ projectId }),
    })
    const restoredPayload = await restored.json()

    assert.equal(listedHistory.status, 200)
    assert.equal(Array.isArray(listedHistoryPayload.data), true)
    assert.equal(listedHistoryPayload.data.length >= 2, true)
    assert.equal(loadedVersion.status, 200)
    assert.equal(loadedVersionPayload.data.content, 'console.log("v1")')
    assert.equal(restored.status, 200)
    assert.equal(restoredPayload.data.file.id, fileId)
    assert.equal(restoredPayload.data.file.content, 'console.log("v1")')
  })

  it('lists project history and restores using project event id', async () => {
    const ownerSubject = 'auth0|history-project-user'
    const token = createJwt(ownerSubject, 'jwt-history-project-user')
    const projectId = 'project-history-project-user'
    seedProject?.(projectId, ownerSubject)

    const created = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'src/project-history.ts',
        content: 'console.log("project-head")',
      }),
    })

    const createdPayload = await created.json()
    const fileId = createdPayload.data.id as string

    seedYjsSnapshot?.({
      id: 'project-snapshot-1',
      fileId,
      sequence: 1,
      updateBase64: encodeYjsSnapshot('console.log("project-v1")'),
      createdAt: new Date('2026-03-29T11:00:00.000Z'),
    })

    const listedProjectHistory = await fetch(`${baseUrl}/api/files/history/project?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listedProjectHistoryPayload = await listedProjectHistory.json()
    const firstEvent = listedProjectHistoryPayload.data[0]

    const restored = await fetch(`${baseUrl}/api/files/history/project/${encodeURIComponent(firstEvent.id)}/restore`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ projectId }),
    })
    const restoredPayload = await restored.json()

    assert.equal(listedProjectHistory.status, 200)
    assert.equal(Array.isArray(listedProjectHistoryPayload.data), true)
    assert.equal(listedProjectHistoryPayload.data.length >= 1, true)
    assert.equal(restored.status, 200)
    assert.equal(restoredPayload.data.file.id, fileId)
    assert.equal(restoredPayload.data.file.content, 'console.log("project-v1")')
  })

  it('imports local files and skips duplicates by path', async () => {
    const ownerSubject = 'auth0|local-import-user'
    const token = createJwt(ownerSubject, 'jwt-local-import-user')
    const projectId = 'project-local-import-user'
    seedProject?.(projectId, ownerSubject)

    const existing = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        path: 'README.md',
        content: 'existing',
      }),
    })
    assert.equal(existing.status, 201)
    createdEvents.length = 0

    const imported = await fetch(`${baseUrl}/api/files/import/local`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        files: [
          {
            path: 'src/main.ts',
            content: 'console.log("ok")',
          },
          {
            path: 'src/main.ts',
            content: 'console.log("duplicate payload")',
          },
          {
            path: 'README.md',
            content: 'duplicate existing',
          },
        ],
      }),
    })
    const importedPayload = await imported.json()

    const listed = await fetch(`${baseUrl}/api/files?projectId=${projectId}`, {
      headers: authHeaders(token),
    })
    const listedPayload = await listed.json()

    assert.equal(imported.status, 201)
    assert.equal(importedPayload.data.imported.length, 1)
    assert.equal(importedPayload.data.imported[0].path, 'src/main.ts')
    assert.equal(importedPayload.data.skipped.length, 2)
    assert.equal(importedPayload.data.failed.length, 0)
    assert.equal(listed.status, 200)
    assert.equal(listedPayload.data.length, 2)
    assert.equal(createdEvents.length, 1)
    assert.equal(createdEvents[0]?.path, 'src/main.ts')
  })

  it('imports project files from GitHub and skips unsupported files', async () => {
    const githubFetch: typeof fetch = async (input) => {
      const requestUrl = typeof input === 'string' ? input : input.toString()

      if (requestUrl.includes('/git/trees/main')) {
        return jsonResponse({
          truncated: false,
          tree: [
            { path: 'README.md', type: 'blob', sha: 'sha-readme' },
            { path: 'src/app.ts', type: 'blob', sha: 'sha-app' },
            { path: 'node_modules/skip.js', type: 'blob', sha: 'sha-skip' },
          ],
        })
      }

      if (requestUrl.endsWith('/git/blobs/sha-readme')) {
        return jsonResponse({
          encoding: 'base64',
          content: Buffer.from('# Imported', 'utf8').toString('base64'),
        })
      }

      if (requestUrl.endsWith('/git/blobs/sha-app')) {
        return jsonResponse({
          encoding: 'base64',
          content: Buffer.from('console.log("github")', 'utf8').toString('base64'),
        })
      }

      if (requestUrl.endsWith('/git/blobs/sha-skip')) {
        return jsonResponse({
          encoding: 'base64',
          content: Buffer.from('ignored', 'utf8').toString('base64'),
        })
      }

      return jsonResponse({ message: 'not found' }, 404)
    }

    const localDb = createPrismaDouble()
    const localWorkspaceSync = new WorkspaceSyncDouble()
    const localServer = await startServer(localDb.prisma, localDb.blobStore, localWorkspaceSync, githubFetch)

    try {
      const ownerSubject = 'auth0|github-import-user'
      const token = createJwt(ownerSubject, 'jwt-github-import-user')
      const projectId = 'project-github-import-user'
      localDb.seedProject(projectId, ownerSubject)
      createdEvents.length = 0

      const imported = await fetch(`${localServer.baseUrl}/api/files/import/github`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          projectId,
          repositoryUrl: 'https://github.com/octocat/hello-world',
          branch: 'main',
        }),
      })
      const importedPayload = await imported.json()

      const listed = await fetch(`${localServer.baseUrl}/api/files?projectId=${projectId}`, {
        headers: authHeaders(token),
      })
      const listedPayload = await listed.json()

      assert.equal(imported.status, 201)
      assert.equal(importedPayload.data.imported.length, 2)
      assert.equal(importedPayload.data.skipped.length, 1)
      assert.equal(importedPayload.data.skipped[0].path, 'node_modules/skip.js')
      assert.equal(importedPayload.data.failed.length, 0)
      assert.equal(listed.status, 200)
      assert.equal(listedPayload.data.length, 2)
      assert.equal(createdEvents.length, 2)
    } finally {
      await localServer.close()
    }
  })

  it('rejects non-GitHub URLs for github import endpoint', async () => {
    const ownerSubject = 'auth0|github-url-validation-user'
    const token = createJwt(ownerSubject, 'jwt-github-url-validation-user')
    const projectId = 'project-github-url-validation-user'
    seedProject?.(projectId, ownerSubject)

    const response = await fetch(`${baseUrl}/api/files/import/github`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        projectId,
        repositoryUrl: 'https://example.com/not-github/repo',
      }),
    })
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'INVALID_FILE_INPUT')
  })

  it('rolls back all local import files when workspace sync fails mid-import', async () => {
    const ownerSubject = 'auth0|local-import-rollback-user'
    const token = createJwt(ownerSubject, 'jwt-local-import-rollback-user')
    const projectId = 'project-local-import-rollback-user'
    seedProject?.(projectId, ownerSubject)

    let createCalls = 0
    const failingWorkspaceSync = {
      runLocked<T>(_projectId: string, action: () => Promise<T>): Promise<T> {
        return action()
      },
      async applyApiCreateAlreadyLocked() {
        createCalls += 1
        if (createCalls >= 2) {
          throw new Error('workspace create failed at second file')
        }
      },
      applyApiUpdateAlreadyLocked() {
        return Promise.resolve()
      },
      applyApiDeleteAlreadyLocked() {
        return Promise.resolve()
      },
    }

    const localDb = createPrismaDouble()
    localDb.seedProject(projectId, ownerSubject)
    const localServer = await startServer(localDb.prisma, localDb.blobStore, failingWorkspaceSync as WorkspaceSyncDouble)

    try {
      const imported = await fetch(`${localServer.baseUrl}/api/files/import/local`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          projectId,
          files: [
            { path: 'src/one.ts', content: 'one' },
            { path: 'src/two.ts', content: 'two' },
          ],
        }),
      })

      assert.equal(imported.status, 500)

      const listed = await fetch(`${localServer.baseUrl}/api/files?projectId=${projectId}`, {
        headers: authHeaders(token),
      })
      const listedPayload = await listed.json()

      assert.equal(listed.status, 200)
      assert.equal(listedPayload.data.length, 0)
    } finally {
      await localServer.close()
    }
  })
})
