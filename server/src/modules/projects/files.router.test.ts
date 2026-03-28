import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createHmac } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import express from 'express'
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

function createPrismaDouble() {
  const projects = new InMemoryProjectsTable()
  const files = new InMemoryFilesTable()
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
    } as unknown as PrismaClient,
    blobStore,
    seedProject: (projectId: string, ownerSubject: string) => {
      projects.seed({ id: projectId, ownerSubject })
    },
  }
}

async function startServer(
  prisma: PrismaClient,
  blobStore: InMemoryBlobStore,
  workspaceSync?: WorkspaceSyncDouble,
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

describe('files router', () => {
  let baseUrl = ''
  let closeServer: (() => Promise<void>) | undefined
  let seedProject: ((projectId: string, ownerSubject: string) => void) | undefined
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
})
