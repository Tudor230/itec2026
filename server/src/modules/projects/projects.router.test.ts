import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { PrismaClient } from '@prisma/client'
import express from 'express'
import { errorHandler } from '../../http/error-handler.js'
import { authBoundaryMiddleware } from '../auth/auth-boundary.middleware.js'
import { subjectFromToken } from '../auth/token-subject.js'
import { createProjectsRouter } from './projects.router.js'

type ProjectRow = {
  id: string
  name: string
  ownerSubject: string | null
  createdAt: Date
  updatedAt: Date
}

type ProjectFindManyArgs = {
  where: {
    ownerSubject: string
  }
  orderBy: {
    updatedAt: 'desc'
  }
}

type ProjectFindFirstArgs = {
  where: {
    id: string
    ownerSubject: string
  }
}

type ProjectCreateArgs = {
  data: {
    id: string
    name: string
    ownerSubject: string
  }
}

type ProjectUpdateManyArgs = {
  where: {
    id: string
    ownerSubject: string | null
  }
  data: {
    name: string
  }
}

type ProjectDeleteManyArgs = {
  where: {
    id: string
    ownerSubject: string
  }
}

class InMemoryProjectTable {
  private rows: ProjectRow[] = []

  async findMany(args: ProjectFindManyArgs): Promise<ProjectRow[]> {
    return this.rows
      .filter((row) => row.ownerSubject === args.where.ownerSubject)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((row) => this.cloneRow(row))
  }

  async findFirst(args: ProjectFindFirstArgs): Promise<ProjectRow | null> {
    const found = this.rows.find((row) => {
      return row.id === args.where.id && row.ownerSubject === args.where.ownerSubject
    })

    return found ? this.cloneRow(found) : null
  }

  async create(args: ProjectCreateArgs): Promise<ProjectRow> {
    const now = new Date()
    const row: ProjectRow = {
      id: args.data.id,
      name: args.data.name,
      ownerSubject: args.data.ownerSubject,
      createdAt: now,
      updatedAt: now,
    }

    this.rows = [...this.rows, row]
    return this.cloneRow(row)
  }

  async updateMany(args: ProjectUpdateManyArgs): Promise<{ count: number }> {
    let count = 0
    const now = new Date()

    this.rows = this.rows.map((row) => {
      if (row.id !== args.where.id || row.ownerSubject !== args.where.ownerSubject) {
        return row
      }

      count += 1

      return {
        ...row,
        name: args.data.name,
        updatedAt: now,
      }
    })

    return { count }
  }

  async deleteMany(args: ProjectDeleteManyArgs): Promise<{ count: number }> {
    const beforeLength = this.rows.length

    this.rows = this.rows.filter((row) => {
      return !(row.id === args.where.id && row.ownerSubject === args.where.ownerSubject)
    })

    return { count: beforeLength - this.rows.length }
  }

  private cloneRow(row: ProjectRow): ProjectRow {
    return {
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }
}

function createPrismaDouble() {
  const project = new InMemoryProjectTable()

  return {
    project,
  } as unknown as PrismaClient
}

async function startServer(prisma: PrismaClient): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  const app = express()
  app.use(express.json())
  app.use(authBoundaryMiddleware)
  app.use('/api/projects', createProjectsRouter({ prisma }))
  app.use(errorHandler)

  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started))
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Cannot determine test server address')
  }

  const port = (address as AddressInfo).port

  return {
    baseUrl: `http://127.0.0.1:${port}`,
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

describe('projects router', () => {
  let baseUrl = ''
  let closeServer: (() => Promise<void>) | undefined

  beforeEach(async () => {
    const prisma = createPrismaDouble()
    const started = await startServer(prisma)
    baseUrl = started.baseUrl
    closeServer = started.close
  })

  afterEach(async () => {
    if (closeServer) {
      await closeServer()
      closeServer = undefined
    }
  })

  it('returns 401 for anonymous list requests', async () => {
    const response = await fetch(`${baseUrl}/api/projects`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'AUTH_REQUIRED')
  })

  it('creates and lists projects scoped by actor token', async () => {
    const tokenA = 'token-alpha'
    const tokenB = 'token-beta'

    const createdA = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(tokenA),
      body: JSON.stringify({ name: 'Alpha' }),
    })

    const payloadA = await createdA.json()

    const createdB = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(tokenB),
      body: JSON.stringify({ name: 'Beta' }),
    })

    const payloadB = await createdB.json()

    const listedA = await fetch(`${baseUrl}/api/projects`, {
      headers: authHeaders(tokenA),
    })

    const listedPayloadA = await listedA.json()

    assert.equal(createdA.status, 201)
    assert.equal(createdB.status, 201)
    assert.equal(listedA.status, 200)
    assert.equal(listedPayloadA.data.length, 1)
    assert.equal(listedPayloadA.data[0].id, payloadA.data.id)
    assert.equal(listedPayloadA.data[0].name, 'Alpha')
    assert.equal(listedPayloadA.data[0].ownerSubject, subjectFromToken(tokenA))
    assert.notEqual(payloadA.data.id, payloadB.data.id)
  })

  it('does not allow reading a project owned by another actor', async () => {
    const ownerToken = 'owner-token'
    const otherToken = 'other-token'

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ name: 'Owner project' }),
    })

    const createdPayload = await created.json()

    const response = await fetch(`${baseUrl}/api/projects/${createdPayload.data.id}`, {
      headers: authHeaders(otherToken),
    })

    const payload = await response.json()

    assert.equal(response.status, 404)
    assert.equal(payload.ok, false)
    assert.equal(payload.error.code, 'PROJECT_NOT_FOUND')
  })

  it('validates update input and supports update-delete lifecycle', async () => {
    const token = 'project-token'

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Initial name' }),
    })

    const createdPayload = await created.json()
    const projectId = createdPayload.data.id

    const invalidPatch = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    })

    const invalidPayload = await invalidPatch.json()

    const patched = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Updated name' }),
    })

    const patchedPayload = await patched.json()

    const deleted = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    })

    const deletedPayload = await deleted.json()

    const afterDelete = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: authHeaders(token),
    })

    const afterDeletePayload = await afterDelete.json()

    assert.equal(invalidPatch.status, 400)
    assert.equal(invalidPayload.error.code, 'INVALID_PROJECT_INPUT')
    assert.equal(patched.status, 200)
    assert.equal(patchedPayload.data.name, 'Updated name')
    assert.equal(deleted.status, 200)
    assert.equal(deletedPayload.data.deleted, true)
    assert.equal(afterDelete.status, 404)
    assert.equal(afterDeletePayload.error.code, 'PROJECT_NOT_FOUND')
  })
})
