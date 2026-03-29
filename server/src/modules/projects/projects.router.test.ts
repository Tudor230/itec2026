import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createHmac } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import express from 'express'
import { errorHandler } from '../../http/error-handler.js'
import { authBoundaryMiddleware } from '../auth/auth-boundary.middleware.js'
import { createProjectsRouter } from './projects.router.js'

type InviteRow = {
  id: string
  projectId: string
  tokenHash: string
  role: string
  createdBySubject: string
  expiresAt: Date
  consumedAt: Date | null
  consumedBySubject: string | null
  revokedAt: Date | null
  createdAt: Date
}

type MemberRow = {
  id: string
  projectId: string
  subject: string
  displayName: string | null
  email: string | null
  role: string
  addedBySubject: string | null
  createdAt: Date
}

const TEST_JWT_SECRET = 'test-jwt-secret'
process.env.AUTH_JWT_HS256_SECRET = TEST_JWT_SECRET
process.env.AUTH_JWT_ISSUER = 'https://issuer.test/'
process.env.AUTH_JWT_AUDIENCE = 'https://audience.test'

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
    ownerSubject?: string
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
    ownerSubject?: string | null
  }
  data: {
    name: string
  }
}

type ProjectDeleteManyArgs = {
  where: {
    id: string
    ownerSubject?: string
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
      if (args.where.ownerSubject !== undefined) {
        return row.id === args.where.id && row.ownerSubject === args.where.ownerSubject
      }

      return row.id === args.where.id
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
      const ownerSubjectMatches = args.where.ownerSubject === undefined
        ? true
        : row.ownerSubject === args.where.ownerSubject

      if (row.id !== args.where.id || !ownerSubjectMatches) {
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
      const ownerSubjectMatches = args.where.ownerSubject === undefined
        ? true
        : row.ownerSubject === args.where.ownerSubject

      return !(row.id === args.where.id && ownerSubjectMatches)
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

class InMemoryProjectMembersTable {
  private rows: MemberRow[] = []

  async findFirst(args: {
    where: {
      projectId: string
      subject: string
      role?: string
    }
    select?: {
      id: true
    }
  }): Promise<{ id: string } | null> {
    const found = this.rows.find((row) => {
      if (args.where.role !== undefined) {
        return row.projectId === args.where.projectId
          && row.subject === args.where.subject
          && row.role === args.where.role
      }

      return row.projectId === args.where.projectId && row.subject === args.where.subject
    })

    return found ? { id: found.id } : null
  }

  async findMany(args: {
    where: {
      projectId: string
    }
    orderBy: {
      createdAt: 'asc' | 'desc'
    }
  }): Promise<Array<{ subject: string; displayName: string | null; email: string | null; role: string }>> {
    const sorted = this.rows
      .filter((row) => row.projectId === args.where.projectId)
      .sort((left, right) => {
        if (args.orderBy.createdAt === 'asc') {
          return left.createdAt.getTime() - right.createdAt.getTime()
        }

        return right.createdAt.getTime() - left.createdAt.getTime()
      })

    return sorted.map((row) => ({
      subject: row.subject,
      displayName: row.displayName,
      email: row.email,
      role: row.role,
    }))
  }

  async upsert(args: {
    where: {
      projectId_subject: {
        projectId: string
        subject: string
      }
    }
    create: {
      id: string
      projectId: string
      subject: string
      displayName: string | null
      email: string | null
      role: string
      addedBySubject: string | null
    }
    update: {
      displayName: string | null
      email: string | null
      role: string
      addedBySubject: string | null
    }
  }): Promise<MemberRow> {
    const key = args.where.projectId_subject
    const existing = this.rows.find((row) => {
      return row.projectId === key.projectId && row.subject === key.subject
    })

    if (existing) {
      const updated: MemberRow = {
        ...existing,
        displayName: args.update.displayName,
        email: args.update.email,
        role: args.update.role,
        addedBySubject: args.update.addedBySubject,
      }

      this.rows = this.rows.map((row) => (row.id === existing.id ? updated : row))
      return updated
    }

    const row: MemberRow = {
      id: args.create.id,
      projectId: args.create.projectId,
      subject: args.create.subject,
      displayName: args.create.displayName,
      email: args.create.email,
      role: args.create.role,
      addedBySubject: args.create.addedBySubject,
      createdAt: new Date(),
    }

    this.rows = [...this.rows, row]
    return row
  }

  async updateMany(args: {
    where: {
      projectId: string
      subject: string
    }
    data: {
      displayName: string
      email: string | null
    }
  }): Promise<{ count: number }> {
    let count = 0

    this.rows = this.rows.map((row) => {
      if (row.projectId !== args.where.projectId || row.subject !== args.where.subject) {
        return row
      }

      count += 1

      return {
        ...row,
        displayName: args.data.displayName,
        email: args.data.email,
      }
    })

    return { count }
  }
}

class InMemoryProjectInvitesTable {
  private rows: InviteRow[] = []

  async create(args: {
    data: {
      id: string
      projectId: string
      tokenHash: string
      role: string
      createdBySubject: string
      expiresAt: Date
    }
  }): Promise<InviteRow> {
    const row: InviteRow = {
      id: args.data.id,
      projectId: args.data.projectId,
      tokenHash: args.data.tokenHash,
      role: args.data.role,
      createdBySubject: args.data.createdBySubject,
      expiresAt: new Date(args.data.expiresAt),
      consumedAt: null,
      consumedBySubject: null,
      revokedAt: null,
      createdAt: new Date(),
    }

    this.rows = [...this.rows, row]
    return { ...row }
  }

  async findFirst(_args: {
    where: {
      tokenHash: string
    }
    include?: {
      project: {
        select: {
          id: true
          name: true
        }
      }
    }
  }) {
    return null
  }

  async update(_args: {
    where: {
      id: string
    }
    data: {
      consumedAt?: Date
      consumedBySubject?: string
      revokedAt?: Date
    }
  }): Promise<InviteRow> {
    throw new Error('Not implemented for this test double')
  }

  async updateMany(args: {
    where: {
      id: string
      projectId?: string
      consumedAt: null
      revokedAt: null
      expiresAt: {
        gt: Date
      }
    }
    data: {
      consumedAt?: Date
      consumedBySubject?: string
      revokedAt?: Date
    }
  }): Promise<{ count: number }> {
    let count = 0

    this.rows = this.rows.map((row) => {
      if (row.id !== args.where.id) {
        return row
      }

      if (args.where.projectId !== undefined && row.projectId !== args.where.projectId) {
        return row
      }

      if (row.consumedAt !== null || row.revokedAt !== null || row.expiresAt.getTime() <= args.where.expiresAt.gt.getTime()) {
        return row
      }

      count += 1
      return {
        ...row,
        consumedAt: args.data.consumedAt ?? row.consumedAt,
        consumedBySubject: args.data.consumedBySubject ?? row.consumedBySubject,
        revokedAt: args.data.revokedAt ?? row.revokedAt,
      }
    })

    return { count }
  }

  async findMany(args: {
    where: {
      projectId: string
      consumedAt: null
      revokedAt: null
      expiresAt: {
        gt: Date
      }
    }
    orderBy: {
      createdAt: 'desc'
    }
  }): Promise<InviteRow[]> {
    return this.rows
      .filter((row) => {
        return row.projectId === args.where.projectId
          && row.consumedAt === null
          && row.revokedAt === null
          && row.expiresAt.getTime() > args.where.expiresAt.gt.getTime()
      })
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((row) => ({ ...row }))
  }
}

function createPrismaDouble() {
  const project = new InMemoryProjectTable()
  const projectMember = new InMemoryProjectMembersTable()
  const projectInvite = new InMemoryProjectInvitesTable()

  return {
    project,
    projectMember,
    projectInvite,
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

function createJwt(sub: string, jwtId: string, profile?: { name?: string; email?: string }) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      jti: jwtId,
      iss: process.env.AUTH_JWT_ISSUER,
      aud: process.env.AUTH_JWT_AUDIENCE,
      name: profile?.name,
      email: profile?.email,
    }),
  ).toString('base64url')
  const signingInput = `${header}.${payload}`
  const signature = createHmac('sha256', TEST_JWT_SECRET)
    .update(signingInput)
    .digest('base64url')

  return `${signingInput}.${signature}`
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

  it('creates and lists projects scoped by actor subject', async () => {
    const subjectA = 'auth0|user-alpha'
    const subjectB = 'auth0|user-beta'
    const tokenA = createJwt(subjectA, 'jwt-a')
    const tokenB = createJwt(subjectB, 'jwt-b')

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
    assert.equal(listedPayloadA.data[0].ownerSubject, subjectA)
    assert.notEqual(payloadA.data.id, payloadB.data.id)
  })

  it('keeps access for same user across different tokens', async () => {
    const subject = 'auth0|stable-user'
    const createToken = createJwt(subject, 'jwt-original')
    const reloginToken = createJwt(subject, 'jwt-after-relogin')

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(createToken),
      body: JSON.stringify({ name: 'Stable access project' }),
    })

    const createdPayload = await created.json()

    const listed = await fetch(`${baseUrl}/api/projects`, {
      headers: authHeaders(reloginToken),
    })
    const listedPayload = await listed.json()

    const fetched = await fetch(`${baseUrl}/api/projects/${createdPayload.data.id}`, {
      headers: authHeaders(reloginToken),
    })
    const fetchedPayload = await fetched.json()

    assert.equal(created.status, 201)
    assert.equal(listed.status, 200)
    assert.equal(fetched.status, 200)
    assert.equal(listedPayload.data.length, 1)
    assert.equal(listedPayload.data[0].id, createdPayload.data.id)
    assert.equal(fetchedPayload.data.id, createdPayload.data.id)
    assert.equal(fetchedPayload.data.ownerSubject, subject)
  })

  it('does not allow reading a project owned by another actor', async () => {
    const ownerToken = createJwt('auth0|owner', 'jwt-owner')
    const otherToken = createJwt('auth0|other', 'jwt-other')

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
    const token = createJwt('auth0|project-user', 'jwt-project')

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

  it('returns project members including owner snapshot', async () => {
    const token = createJwt('auth0|member-owner', 'jwt-member-owner', {
      name: 'Member Owner',
      email: 'member.owner@example.com',
    })

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Members project' }),
    })
    const createdPayload = await created.json()

    const membersResponse = await fetch(`${baseUrl}/api/projects/${createdPayload.data.id}/members`, {
      headers: authHeaders(token),
    })
    const membersPayload = await membersResponse.json()

    assert.equal(created.status, 201)
    assert.equal(membersResponse.status, 200)
    assert.equal(Array.isArray(membersPayload.data), true)
    assert.equal(membersPayload.data.length >= 1, true)
    assert.equal(membersPayload.data[0].subject, 'auth0|member-owner')
    assert.equal(membersPayload.data[0].displayName, 'Member Owner')
    assert.equal(membersPayload.data[0].email, 'member.owner@example.com')
  })

  it('updates member profile snapshot for current actor', async () => {
    const token = createJwt('auth0|snapshot-user', 'jwt-snapshot-user', {
      name: 'Snapshot User',
      email: 'snapshot.user@example.com',
    })

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Snapshot project' }),
    })
    const createdPayload = await created.json()
    const projectId = createdPayload.data.id

    const patch = await fetch(`${baseUrl}/api/projects/${projectId}/members/me`, {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({
        displayName: 'Snapshot User Updated',
        email: 'snapshot.updated@example.com',
      }),
    })
    const patchPayload = await patch.json()

    const listed = await fetch(`${baseUrl}/api/projects/${projectId}/members`, {
      headers: authHeaders(token),
    })
    const listedPayload = await listed.json()

    assert.equal(patch.status, 200)
    assert.equal(patchPayload.data.updated, true)
    assert.equal(listed.status, 200)
    assert.equal(listedPayload.data[0].displayName, 'Snapshot User Updated')
    assert.equal(listedPayload.data[0].email, 'snapshot.updated@example.com')
  })

  it('lists and revokes active invite links', async () => {
    const token = createJwt('auth0|invite-owner', 'jwt-invite-owner')

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ name: 'Invites project' }),
    })
    const createdPayload = await created.json()
    const projectId = createdPayload.data.id

    const inviteCreated = await fetch(`${baseUrl}/api/projects/${projectId}/invites`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ role: 'editor' }),
    })
    const inviteCreatedPayload = await inviteCreated.json()

    const activeInvites = await fetch(`${baseUrl}/api/projects/${projectId}/invites`, {
      headers: authHeaders(token),
    })
    const activeInvitesPayload = await activeInvites.json()

    const revokeResponse = await fetch(`${baseUrl}/api/projects/${projectId}/invites`, {
      method: 'DELETE',
      headers: authHeaders(token),
      body: JSON.stringify({ inviteId: inviteCreatedPayload.data.id }),
    })
    const revokePayload = await revokeResponse.json()

    const activeAfterRevoke = await fetch(`${baseUrl}/api/projects/${projectId}/invites`, {
      headers: authHeaders(token),
    })
    const activeAfterRevokePayload = await activeAfterRevoke.json()

    assert.equal(inviteCreated.status, 201)
    assert.equal(activeInvites.status, 200)
    assert.equal(activeInvitesPayload.data.length, 1)
    assert.equal(revokeResponse.status, 200)
    assert.equal(revokePayload.data.revoked, true)
    assert.equal(activeAfterRevoke.status, 200)
    assert.equal(activeAfterRevokePayload.data.length, 0)
  })
})
