import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createHmac } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import express from 'express'
import { errorHandler } from '../../http/error-handler.js'
import { authBoundaryMiddleware } from '../auth/auth-boundary.middleware.js'
import { createInvitesRouter } from './invites.router.js'
import { createProjectsRouter } from './projects.router.js'

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
    ownerSubject?: string
    members?: {
      some: {
        subject: string
      }
    }
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

type MemberRow = {
  id: string
  projectId: string
  subject: string
  role: string
  addedBySubject: string | null
  createdAt: Date
}

class InMemoryProjectMembersTable {
  private rows: MemberRow[] = []

  rowsForRead() {
    return this.rows.map((row) => ({ ...row }))
  }

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
      createdAt: 'asc'
    }
  }): Promise<Array<{
    subject: string
    role: string
    addedBySubject: string | null
    createdAt: Date
  }>> {
    return this.rows
      .filter((row) => row.projectId === args.where.projectId)
      .slice()
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((row) => ({
        subject: row.subject,
        role: row.role,
        addedBySubject: row.addedBySubject,
        createdAt: new Date(row.createdAt),
      }))
  }

  async deleteMany(args: {
    where: {
      projectId: string
      subject: string
    }
  }): Promise<{ count: number }> {
    const beforeLength = this.rows.length

    this.rows = this.rows.filter((row) => {
      return !(row.projectId === args.where.projectId && row.subject === args.where.subject)
    })

    return { count: beforeLength - this.rows.length }
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
      role: string
      addedBySubject: string | null
    }
    update: {
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
        role: args.update.role,
        addedBySubject: args.update.addedBySubject,
      }

      this.rows = this.rows.map((row) => (row.id === existing.id ? updated : row))
      return { ...updated }
    }

    const created: MemberRow = {
      id: args.create.id,
      projectId: args.create.projectId,
      subject: args.create.subject,
      role: args.create.role,
      addedBySubject: args.create.addedBySubject,
      createdAt: new Date(),
    }

    this.rows = [...this.rows, created]
    return { ...created }
  }

  seed(projectId: string, subject: string, role = 'editor') {
    this.rows = [
      ...this.rows,
      {
        id: `member-${projectId}-${subject}`,
        projectId,
        subject,
        role,
        addedBySubject: null,
        createdAt: new Date(),
      },
    ]
  }
}

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
      expiresAt: args.data.expiresAt,
      consumedAt: null,
      consumedBySubject: null,
      revokedAt: null,
      createdAt: new Date(),
    }

    this.rows = [...this.rows, row]
    return { ...row }
  }

  async findFirst(args: {
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
  }): Promise<(InviteRow & { project?: { id: string, name: string } }) | null> {
    const found = this.rows.find((row) => row.tokenHash === args.where.tokenHash)
    return found ? { ...found } : null
  }

  async updateMany(args: {
    where: {
      id: string
      consumedAt: null
      revokedAt: null
      expiresAt: {
        gt: Date
      }
    }
    data: {
      consumedAt: Date
      consumedBySubject: string
    }
  }): Promise<{ count: number }> {
    let count = 0

    this.rows = this.rows.map((row) => {
      const matches = row.id === args.where.id
        && row.consumedAt === args.where.consumedAt
        && row.revokedAt === args.where.revokedAt
        && row.expiresAt.getTime() > args.where.expiresAt.gt.getTime()

      if (!matches) {
        return row
      }

      count += 1
      return {
        ...row,
        consumedAt: args.data.consumedAt,
        consumedBySubject: args.data.consumedBySubject,
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
          && row.consumedAt === args.where.consumedAt
          && row.revokedAt === args.where.revokedAt
          && row.expiresAt.getTime() > args.where.expiresAt.gt.getTime()
      })
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((row) => ({ ...row }))
  }
}

class InMemoryProjectTable {
  private rows: ProjectRow[] = []

  constructor(private readonly getMembers: () => MemberRow[]) {}

  async findMany(args: ProjectFindManyArgs): Promise<ProjectRow[]> {
    const ownerSubject = args.where.ownerSubject
    const memberSubject = args.where.members?.some.subject

    return this.rows
      .filter((row) => {
        if (ownerSubject !== undefined) {
          return row.ownerSubject === ownerSubject
        }

        if (memberSubject !== undefined) {
          return this.getMembers().some((member) => {
            return member.projectId === row.id && member.subject === memberSubject
          })
        }

        return true
      })
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

function createPrismaDouble() {
  const projectMember = new InMemoryProjectMembersTable()
  const project = new InMemoryProjectTable(() => projectMember.rowsForRead())
  const projectInvite = new InMemoryProjectInvitesTable()

  const prisma = {
    project,
    projectMember,
    projectInvite,
    $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      return callback(prisma)
    },
  }

  return prisma as unknown as PrismaClient
}

async function startServer(prisma: PrismaClient): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  const app = express()
  app.use(express.json())
  app.use(authBoundaryMiddleware)
  app.use('/api/projects', createProjectsRouter({ prisma }))
  app.use('/api/invites', createInvitesRouter({ prisma }))
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

  it('returns project dashboard and allows owner to remove collaborator', async () => {
    const ownerSubject = 'auth0|owner-dashboard'
    const memberSubject = 'auth0|member-dashboard'
    const ownerToken = createJwt(ownerSubject, 'jwt-owner-dashboard')
    const memberToken = createJwt(memberSubject, 'jwt-member-dashboard')

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ name: 'Dashboard test project' }),
    })
    const createdPayload = await created.json()
    const projectId = createdPayload.data.id

    const invite = await fetch(`${baseUrl}/api/projects/${projectId}/invites`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ role: 'editor' }),
    })
    const invitePayload = await invite.json()

    const accepted = await fetch(`${baseUrl}/api/invites/${invitePayload.data.inviteToken}/accept`, {
      method: 'POST',
      headers: authHeaders(memberToken),
    })

    assert.equal(accepted.status, 200)

    const dashboardAsOwner = await fetch(`${baseUrl}/api/projects/${projectId}/dashboard`, {
      headers: authHeaders(ownerToken),
    })
    const dashboardAsOwnerPayload = await dashboardAsOwner.json()

    const dashboardAsMember = await fetch(`${baseUrl}/api/projects/${projectId}/dashboard`, {
      headers: authHeaders(memberToken),
    })
    const dashboardAsMemberPayload = await dashboardAsMember.json()

    const removeByMember = await fetch(`${baseUrl}/api/projects/${projectId}/collaborators/${encodeURIComponent(memberSubject)}`, {
      method: 'DELETE',
      headers: authHeaders(memberToken),
    })
    const removeByMemberPayload = await removeByMember.json()

    const removeByOwner = await fetch(`${baseUrl}/api/projects/${projectId}/collaborators/${encodeURIComponent(memberSubject)}`, {
      method: 'DELETE',
      headers: authHeaders(ownerToken),
    })
    const removeByOwnerPayload = await removeByOwner.json()

    const dashboardAfterRemove = await fetch(`${baseUrl}/api/projects/${projectId}/dashboard`, {
      headers: authHeaders(ownerToken),
    })
    const dashboardAfterRemovePayload = await dashboardAfterRemove.json()

    assert.equal(dashboardAsOwner.status, 200)
    assert.equal(dashboardAsOwnerPayload.data.actorRole, 'owner')
    assert.equal(dashboardAsOwnerPayload.data.project.id, projectId)
    assert.equal(
      dashboardAsOwnerPayload.data.collaborators.some((item: { subject: string; role: string }) => item.subject === ownerSubject && item.role === 'owner'),
      true,
    )
    assert.equal(
      dashboardAsOwnerPayload.data.collaborators.some((item: { subject: string; role: string }) => item.subject === memberSubject && item.role === 'editor'),
      true,
    )

    assert.equal(dashboardAsMember.status, 200)
    assert.equal(dashboardAsMemberPayload.data.actorRole, 'editor')

    assert.equal(removeByMember.status, 404)
    assert.equal(removeByMemberPayload.error.code, 'COLLABORATOR_NOT_FOUND')

    assert.equal(removeByOwner.status, 200)
    assert.equal(removeByOwnerPayload.data.removed, true)

    assert.equal(dashboardAfterRemove.status, 200)
    assert.equal(
      dashboardAfterRemovePayload.data.collaborators.some((item: { subject: string }) => item.subject === memberSubject),
      false,
    )
  })
})
