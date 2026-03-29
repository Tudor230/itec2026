import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
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

class InMemoryProjectsTable {
  private rows: ProjectRow[] = []

  constructor(private readonly getMembers: () => MemberRow[]) {}

  seed(row: ProjectRow) {
    this.rows = [...this.rows, row]
  }

  async findMany(args: {
    where?: {
      ownerSubject?: string
      members?: {
        some: {
          subject: string
        }
      }
    }
    orderBy?: {
      updatedAt: 'desc'
    }
  }): Promise<ProjectRow[]> {
    const ownerSubject = args.where?.ownerSubject
    const memberSubject = args.where?.members?.some.subject

    const filtered = this.rows.filter((row) => {
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

    return filtered
      .slice()
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      }))
  }

  async findFirst(args: {
    where: {
      id: string
      ownerSubject?: string
    }
  }): Promise<ProjectRow | null> {
    const found = this.rows.find((row) => {
      if (args.where.ownerSubject !== undefined) {
        return row.id === args.where.id && row.ownerSubject === args.where.ownerSubject
      }

      return row.id === args.where.id
    })

    if (!found) {
      return null
    }

    return {
      ...found,
      createdAt: new Date(found.createdAt),
      updatedAt: new Date(found.updatedAt),
    }
  }

  async create(args: {
    data: {
      id: string
      name: string
      ownerSubject: string
    }
  }): Promise<ProjectRow> {
    const now = new Date()
    const row: ProjectRow = {
      id: args.data.id,
      name: args.data.name,
      ownerSubject: args.data.ownerSubject,
      createdAt: now,
      updatedAt: now,
    }

    this.rows = [...this.rows, row]
    return row
  }

  async updateMany(args: {
    where: {
      id: string
      ownerSubject?: string | null
    }
    data: {
      name: string
    }
  }): Promise<{ count: number }> {
    let count = 0
    const now = new Date()

    this.rows = this.rows.map((row) => {
      const ownerMatches = args.where.ownerSubject === undefined
        ? true
        : row.ownerSubject === args.where.ownerSubject

      if (row.id !== args.where.id || !ownerMatches) {
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

  async deleteMany(args: {
    where: {
      id: string
      ownerSubject?: string
    }
  }): Promise<{ count: number }> {
    const beforeLength = this.rows.length

    this.rows = this.rows.filter((row) => {
      const ownerMatches = args.where.ownerSubject === undefined
        ? true
        : row.ownerSubject === args.where.ownerSubject

      return !(row.id === args.where.id && ownerMatches)
    })

    return { count: beforeLength - this.rows.length }
  }

  getById(id: string): ProjectRow | null {
    const found = this.rows.find((row) => row.id === id)
    if (!found) {
      return null
    }

    return {
      ...found,
      createdAt: new Date(found.createdAt),
      updatedAt: new Date(found.updatedAt),
    }
  }
}

class InMemoryProjectMembersTable {
  private rows: MemberRow[] = []

  seed(row: MemberRow) {
    this.rows = [...this.rows, row]
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

      this.rows = this.rows.map((row) => {
        if (row.id !== existing.id) {
          return row
        }

        return updated
      })

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

  all() {
    return this.rows.map((row) => ({ ...row }))
  }
}

class InMemoryProjectInvitesTable {
  private rows: InviteRow[] = []

  constructor(private readonly getProjectById: (projectId: string) => ProjectRow | null) {}

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
    return this.cloneRow(row)
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
    if (!found) {
      return null
    }

    const base = this.cloneRow(found)
    if (!args.include?.project) {
      return base
    }

    const project = this.getProjectById(found.projectId)
    if (!project) {
      return base
    }

    return {
      ...base,
      project: {
        id: project.id,
        name: project.name,
      },
    }
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
      .map((row) => this.cloneRow(row))
  }

  private cloneRow(row: InviteRow): InviteRow {
    return {
      ...row,
      expiresAt: new Date(row.expiresAt),
      consumedAt: row.consumedAt ? new Date(row.consumedAt) : null,
      revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
      createdAt: new Date(row.createdAt),
    }
  }
}

function createPrismaDouble() {
  const members = new InMemoryProjectMembersTable()
  const projects = new InMemoryProjectsTable(() => members.all())
  const invites = new InMemoryProjectInvitesTable((projectId) => projects.getById(projectId))

  const prisma = {
    project: {
      findMany: projects.findMany.bind(projects),
      findFirst: projects.findFirst.bind(projects),
      create: projects.create.bind(projects),
      updateMany: projects.updateMany.bind(projects),
      deleteMany: projects.deleteMany.bind(projects),
    },
    projectMember: {
      findFirst: members.findFirst.bind(members),
      findMany: members.findMany.bind(members),
      upsert: members.upsert.bind(members),
      deleteMany: members.deleteMany.bind(members),
    },
    projectInvite: {
      create: invites.create.bind(invites),
      findFirst: invites.findFirst.bind(invites),
      updateMany: invites.updateMany.bind(invites),
      findMany: invites.findMany.bind(invites),
    },
    $transaction: async <T>(callback: (transaction: unknown) => Promise<T>) => {
      return callback(prisma)
    },
  }

  return {
    prisma: prisma as unknown as PrismaClient,
    seedProject: (id: string, name: string, ownerSubject: string) => {
      projects.seed({
        id,
        name,
        ownerSubject,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    },
    seedMember: (projectId: string, subject: string, role = 'editor') => {
      members.seed({
        id: `member-${projectId}-${subject}`,
        projectId,
        subject,
        displayName: null,
        email: null,
        role,
        addedBySubject: null,
        createdAt: new Date(),
      })
    },
  }
}

async function startServer(prisma: PrismaClient): Promise<{ baseUrl: string, close: () => Promise<void> }> {
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

describe('invites router', () => {
  let baseUrl = ''
  let closeServer: (() => Promise<void>) | undefined
  let seedProject: ((id: string, name: string, ownerSubject: string) => void) | undefined
  let seedMember: ((projectId: string, subject: string, role?: string) => void) | undefined

  beforeEach(async () => {
    const testDb = createPrismaDouble()
    const started = await startServer(testDb.prisma)
    baseUrl = started.baseUrl
    closeServer = started.close
    seedProject = testDb.seedProject
    seedMember = testDb.seedMember
  })

  afterEach(async () => {
    if (closeServer) {
      await closeServer()
      closeServer = undefined
    }
  })

  it('allows owner to create invite and another user to accept it once', async () => {
    const projectId = 'project-invite-1'
    const ownerSubject = 'auth0|owner'
    const guestSubject = 'auth0|guest'
    seedProject?.(projectId, 'Invite project', ownerSubject)

    const ownerToken = createJwt(ownerSubject, 'jwt-owner-create')
    const guestToken = createJwt(guestSubject, 'jwt-guest-accept')

    const createdInvite = await fetch(`${baseUrl}/api/projects/${projectId}/invites`, {
      method: 'POST',
      headers: authHeaders(ownerToken),
      body: JSON.stringify({ role: 'editor' }),
    })
    const createdInvitePayload = await createdInvite.json()

    const preview = await fetch(`${baseUrl}/api/invites/${createdInvitePayload.data.inviteToken}`, {
      headers: authHeaders(guestToken),
    })
    const previewPayload = await preview.json()

    const accepted = await fetch(`${baseUrl}/api/invites/${createdInvitePayload.data.inviteToken}/accept`, {
      method: 'POST',
      headers: authHeaders(guestToken),
    })
    const acceptedPayload = await accepted.json()

    const acceptedAgain = await fetch(`${baseUrl}/api/invites/${createdInvitePayload.data.inviteToken}/accept`, {
      method: 'POST',
      headers: authHeaders(createJwt('auth0|other-guest', 'jwt-other-guest')),
    })
    const acceptedAgainPayload = await acceptedAgain.json()

    const listedForGuest = await fetch(`${baseUrl}/api/projects`, {
      headers: authHeaders(guestToken),
    })
    const listedForGuestPayload = await listedForGuest.json()

    assert.equal(createdInvite.status, 201)
    assert.equal(typeof createdInvitePayload.data.inviteToken, 'string')
    assert.equal(createdInvitePayload.data.role, 'editor')
    assert.equal(preview.status, 200)
    assert.equal(previewPayload.data.projectId, projectId)
    assert.equal(previewPayload.data.isConsumed, false)
    assert.equal(accepted.status, 200)
    assert.equal(acceptedPayload.data.id, projectId)
    assert.equal(acceptedAgain.status, 409)
    assert.equal(acceptedAgainPayload.error.code, 'INVITE_CONSUMED')
    assert.equal(listedForGuest.status, 200)
    assert.equal(listedForGuestPayload.data.length, 1)
    assert.equal(listedForGuestPayload.data[0].id, projectId)
  })

  it('prevents non-owners from creating invites', async () => {
    const projectId = 'project-invite-2'
    const ownerSubject = 'auth0|owner'
    const memberSubject = 'auth0|member'
    seedProject?.(projectId, 'Owner project', ownerSubject)
    seedMember?.(projectId, memberSubject, 'editor')

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/invites`, {
      method: 'POST',
      headers: authHeaders(createJwt(memberSubject, 'jwt-member-create')),
      body: JSON.stringify({ role: 'editor' }),
    })

    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error.code, 'PROJECT_FORBIDDEN')
  })
})
