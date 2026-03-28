import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../auth/actor-context.js'
import { createId } from './id.js'
import { canEditProject, canReadProject, isProjectOwner } from './project-access.js'
import type {
  CreateProjectInviteResult,
  InvitePreviewRecord,
  ProjectInput,
  ProjectInviteRecord,
  ProjectRecord,
  ProjectUpdateInput,
} from './project.types.js'

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
  role: string
  createdBySubject: string
  expiresAt: Date
  consumedAt: Date | null
  consumedBySubject: string | null
  revokedAt: Date | null
  createdAt: Date
}

type ProjectInviteModel = {
  create: (args: {
    data: {
      id: string
      projectId: string
      tokenHash: string
      role: string
      createdBySubject: string
      expiresAt: Date
    }
  }) => Promise<InviteRow>
  findFirst: (args: {
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
  }) => Promise<(InviteRow & { project?: { id: string, name: string } }) | null>
  update: (args: {
    where: {
      id: string
    }
    data: {
      consumedAt?: Date
      consumedBySubject?: string
      revokedAt?: Date
    }
  }) => Promise<InviteRow>
  updateMany: (args: {
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
  }) => Promise<{ count: number }>
}

type ProjectMemberModel = {
  upsert: (args: {
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
  }) => Promise<unknown>
}

function getProjectInviteModel(prisma: PrismaClient): ProjectInviteModel | null {
  const model = (prisma as unknown as { projectInvite?: ProjectInviteModel }).projectInvite
  if (!model) {
    return null
  }

  return model
}

function getProjectMemberModel(prisma: PrismaClient): ProjectMemberModel | null {
  const model = (prisma as unknown as { projectMember?: ProjectMemberModel }).projectMember
  if (!model) {
    return null
  }

  return model
}

function toProjectRecord(project: ProjectRow): ProjectRecord {
  const createdAt = project.createdAt.toISOString()
  const updatedAt = project.updatedAt.toISOString()

  return {
    id: project.id,
    name: project.name,
    ownerSubject: project.ownerSubject,
    createdAt,
    updatedAt,
  }
}

function toInviteRecord(invite: InviteRow): ProjectInviteRecord {
  return {
    id: invite.id,
    projectId: invite.projectId,
    role: 'editor',
    createdBySubject: invite.createdBySubject,
    expiresAt: invite.expiresAt.toISOString(),
    consumedAt: invite.consumedAt ? invite.consumedAt.toISOString() : null,
    consumedBySubject: invite.consumedBySubject,
    revokedAt: invite.revokedAt ? invite.revokedAt.toISOString() : null,
    createdAt: invite.createdAt.toISOString(),
  }
}

export class ProjectsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(actor: ActorContext): Promise<ProjectRecord[]> {
    const ownerSubject = actor.subject
    if (!ownerSubject) {
      return []
    }

    const projectMemberModel = getProjectMemberModel(this.prisma)

    const [ownedProjects, memberProjects] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          ownerSubject,
        },
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      projectMemberModel
        ? this.prisma.project.findMany({
          where: {
            members: {
              some: {
                subject: ownerSubject,
              },
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
        })
        : Promise.resolve([] as ProjectRow[]),
    ])

    const deduped = new Map<string, ProjectRow>()
    for (const project of [...ownedProjects, ...memberProjects]) {
      deduped.set(project.id, project)
    }

    const projects = [...deduped.values()].sort((left, right) => {
      return right.updatedAt.getTime() - left.updatedAt.getTime()
    })

    return projects.map((project: ProjectRow) => toProjectRecord(project))
  }

  async getById(actor: ActorContext, id: string): Promise<ProjectRecord | null> {
    const allowed = await canReadProject(this.prisma, actor, id)
    if (!allowed) {
      return null
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id,
      },
    })

    return project ? toProjectRecord(project) : null
  }

  async create(actor: ActorContext, input: ProjectInput): Promise<ProjectRecord> {
    const id = createId()
    const ownerSubject = actor.subject

    if (!ownerSubject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const project = await this.prisma.project.create({
      data: {
        id,
        name: input.name,
        ownerSubject,
      },
    })

    return toProjectRecord(project)
  }

  async update(
    actor: ActorContext,
    id: string,
    input: ProjectUpdateInput,
  ): Promise<ProjectRecord | null> {
    const canEdit = await canEditProject(this.prisma, actor, id)
    if (!canEdit) {
      return null
    }

    const current = await this.prisma.project.findFirst({
      where: {
        id,
      },
    })

    if (!current) {
      return null
    }

    const nextName = input.name ?? current.name

    const result = await this.prisma.project.updateMany({
      where: {
        id,
      },
      data: {
        name: nextName,
      },
    })

    if (result.count === 0) {
      return null
    }

    return this.getById(actor, id)
  }

  async remove(actor: ActorContext, id: string): Promise<boolean> {
    const owner = await isProjectOwner(this.prisma, actor, id)
    if (!owner) {
      return false
    }

    const result = await this.prisma.project.deleteMany({
      where: {
        id,
      },
    })

    return result.count > 0
  }

  async createInvite(actor: ActorContext, projectId: string): Promise<CreateProjectInviteResult> {
    const projectInviteModel = getProjectInviteModel(this.prisma)
    if (!projectInviteModel) {
      throw Object.assign(new Error('Invite model unavailable'), {
        code: 'INTERNAL_ERROR',
      })
    }

    const owner = await isProjectOwner(this.prisma, actor, projectId)
    if (!owner) {
      throw Object.assign(new Error('Forbidden'), {
        code: 'PROJECT_FORBIDDEN',
      })
    }

    if (!actor.subject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const actorSubject = actor.subject

    const { createHash, randomBytes } = await import('node:crypto')
    const inviteToken = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(inviteToken).digest('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const invite = await projectInviteModel.create({
      data: {
        id: createId(),
        projectId,
        tokenHash,
        role: 'editor',
        createdBySubject: actorSubject,
        expiresAt,
      },
    })

    return {
      invite: toInviteRecord(invite),
      inviteToken,
    }
  }

  async getInvitePreview(token: string): Promise<InvitePreviewRecord | null> {
    const projectInviteModel = getProjectInviteModel(this.prisma)
    if (!projectInviteModel) {
      return null
    }

    const { createHash } = await import('node:crypto')
    const tokenHash = createHash('sha256').update(token).digest('hex')

    const invite = await projectInviteModel.findFirst({
      where: {
        tokenHash,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!invite?.project) {
      return null
    }

    const now = Date.now()

    return {
      projectId: invite.project.id,
      projectName: invite.project.name,
      role: 'editor',
      expiresAt: invite.expiresAt.toISOString(),
      isExpired: invite.expiresAt.getTime() <= now,
      isConsumed: invite.consumedAt !== null,
      isRevoked: invite.revokedAt !== null,
    }
  }

  async acceptInvite(actor: ActorContext, token: string): Promise<ProjectRecord> {
    if (!actor.subject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const actorSubject = actor.subject

    const projectInviteModel = getProjectInviteModel(this.prisma)
    const projectMemberModel = getProjectMemberModel(this.prisma)
    if (!projectInviteModel || !projectMemberModel) {
      throw Object.assign(new Error('Invite model unavailable'), {
        code: 'INTERNAL_ERROR',
      })
    }

    const { createHash } = await import('node:crypto')
    const tokenHash = createHash('sha256').update(token).digest('hex')

    const invite = await projectInviteModel.findFirst({
      where: {
        tokenHash,
      },
    })

    if (!invite) {
      throw Object.assign(new Error('Invite not found'), {
        code: 'INVITE_INVALID',
      })
    }

    if (invite.revokedAt) {
      throw Object.assign(new Error('Invite revoked'), {
        code: 'INVITE_INVALID',
      })
    }

    if (invite.consumedAt) {
      throw Object.assign(new Error('Invite already used'), {
        code: 'INVITE_CONSUMED',
      })
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw Object.assign(new Error('Invite expired'), {
        code: 'INVITE_EXPIRED',
      })
    }

    await this.prisma.$transaction(async (transaction: unknown) => {
      const transactionProjectInvite = getProjectInviteModel(transaction as unknown as PrismaClient)
      const transactionProjectMember = getProjectMemberModel(transaction as unknown as PrismaClient)

      if (!transactionProjectInvite || !transactionProjectMember) {
        throw Object.assign(new Error('Invite model unavailable'), {
          code: 'INTERNAL_ERROR',
        })
      }

      const latestInvite = await transactionProjectInvite.findFirst({
        where: {
          tokenHash,
        },
      })

      if (!latestInvite || latestInvite.consumedAt || latestInvite.revokedAt || latestInvite.expiresAt.getTime() <= Date.now()) {
        throw Object.assign(new Error('Invite is no longer valid'), {
          code: 'INVITE_INVALID',
        })
      }

      const consumeResult = await transactionProjectInvite.updateMany({
        where: {
          id: latestInvite.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          consumedAt: new Date(),
          consumedBySubject: actorSubject,
        },
      })

      if (consumeResult.count !== 1) {
        throw Object.assign(new Error('Invite is no longer valid'), {
          code: 'INVITE_INVALID',
        })
      }

      await transactionProjectMember.upsert({
        where: {
          projectId_subject: {
            projectId: latestInvite.projectId,
            subject: actorSubject,
          },
        },
        create: {
          id: createId(),
          projectId: latestInvite.projectId,
          subject: actorSubject,
          role: 'editor',
          addedBySubject: latestInvite.createdBySubject,
        },
        update: {
          role: 'editor',
          addedBySubject: latestInvite.createdBySubject,
        },
      })
    })

    const project = await this.getById(actor, invite.projectId)
    if (!project) {
      throw Object.assign(new Error('Project not found'), {
        code: 'P2025',
      })
    }

    return project
  }
}
