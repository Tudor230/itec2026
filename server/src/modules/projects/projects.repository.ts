import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../auth/actor-context.js'
import { createId } from './id.js'
import { canEditProject, canReadProject, isProjectOwner } from './project-access.js'
import type {
  ActiveProjectInviteRecord,
  CreateProjectInviteResult,
  InvitePreviewRecord,
  ProjectDashboardRecord,
  ProjectMemberProfileInput,
  ProjectMemberRecord,
  ProjectInput,
  ProjectCollaboratorRecord,
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
  findMany: (args: {
    where: {
      projectId: string
    }
    orderBy: {
      createdAt: 'asc' | 'desc'
    }
  }) => Promise<Array<{
    subject: string
    displayName: string | null
    email: string | null
    role: string
    addedBySubject: string | null
    createdAt: Date
  }>>
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
  }) => Promise<unknown>
  updateMany: (args: {
    where: {
      projectId: string
      subject: string
    }
    data: {
      displayName: string
      email: string | null
    }
  }) => Promise<{ count: number }>
  deleteMany: (args: {
    where: {
      projectId: string
      subject: string
    }
  }) => Promise<{ count: number }>
}

type ProjectInviteListItem = {
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

type ProjectInviteFindManyArgs = {
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
  // updateMany: (args: {
  //   where: {
  //     projectId: string
  //     subject: string
  //   }
  //   data: {
  //     displayName: string
  //     email: string | null
  //   }
  // }) => Promise<{ count: number }>
}

function getProjectInviteModel(prisma: PrismaClient): ProjectInviteModel | null {
  const model = (prisma as unknown as { projectInvite?: ProjectInviteModel }).projectInvite
  if (!model) {
    return null
  }

  return model
}

function getProjectInviteListModel(prisma: PrismaClient): {
  findMany: (args: ProjectInviteFindManyArgs) => Promise<ProjectInviteListItem[]>
} | null {
  const model = (prisma as unknown as {
    projectInvite?: { findMany?: (args: ProjectInviteFindManyArgs) => Promise<ProjectInviteListItem[]> }
  }).projectInvite

  if (!model?.findMany) {
    return null
  }

  const findMany = model.findMany.bind(model)

  return {
    findMany: (args) => findMany(args),
  }
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

    const projectMemberModel = getProjectMemberModel(this.prisma)
    if (projectMemberModel) {
      await projectMemberModel.upsert({
        where: {
          projectId_subject: {
            projectId: project.id,
            subject: ownerSubject,
          },
        },
        create: {
          id: createId(),
          projectId: project.id,
          subject: ownerSubject,
          displayName: actor.displayName ?? null,
          email: actor.email ?? null,
          role: 'owner',
          addedBySubject: ownerSubject,
        },
        update: {
          displayName: actor.displayName ?? null,
          email: actor.email ?? null,
          role: 'owner',
          addedBySubject: ownerSubject,
        },
      })
    }

    return toProjectRecord(project)
  }

  async listMembers(actor: ActorContext, projectId: string): Promise<ProjectMemberRecord[]> {
    const allowed = await canReadProject(this.prisma, actor, projectId)
    if (!allowed) {
      return []
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
      },
    })

    if (!project) {
      return []
    }

    const ownerEntry: ProjectMemberRecord | null = project.ownerSubject
      ? {
          subject: project.ownerSubject,
          displayName: null,
          email: null,
          role: 'owner',
        }
      : null

    const projectMemberModel = getProjectMemberModel(this.prisma)
    if (!projectMemberModel) {
      return ownerEntry ? [ownerEntry] : []
    }

    const members = await projectMemberModel.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    const deduped = new Map<string, ProjectMemberRecord>()

    if (ownerEntry) {
      deduped.set(ownerEntry.subject, ownerEntry)
    }

    members.forEach((member) => {
      const existing = deduped.get(member.subject)

      deduped.set(member.subject, {
        subject: member.subject,
        displayName: member.displayName,
        email: member.email,
        role: existing?.role === 'owner' ? 'owner' : member.role,
      })
    })

    return [...deduped.values()]
  }

  async updateMemberProfile(
    actor: ActorContext,
    projectId: string,
    input: ProjectMemberProfileInput,
  ): Promise<boolean> {
    if (!actor.subject) {
      throw Object.assign(new Error('Authentication is required'), {
        code: 'AUTH_REQUIRED',
      })
    }

    const allowed = await canReadProject(this.prisma, actor, projectId)
    if (!allowed) {
      return false
    }

    const projectMemberModel = getProjectMemberModel(this.prisma)
    if (!projectMemberModel) {
      return false
    }

    const update = await projectMemberModel.updateMany({
      where: {
        projectId,
        subject: actor.subject,
      },
      data: {
        displayName: input.displayName,
        email: input.email ?? null,
      },
    })

    if (update.count > 0) {
      return true
    }

    await projectMemberModel.upsert({
      where: {
        projectId_subject: {
          projectId,
          subject: actor.subject,
        },
      },
      create: {
        id: createId(),
        projectId,
        subject: actor.subject,
        displayName: input.displayName,
        email: input.email ?? null,
        role: 'editor',
        addedBySubject: actor.subject,
      },
      update: {
        displayName: input.displayName,
        email: input.email ?? null,
        role: 'editor',
        addedBySubject: actor.subject,
      },
    })

    return true
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

  async getDashboard(actor: ActorContext, projectId: string): Promise<ProjectDashboardRecord | null> {
    const project = await this.getById(actor, projectId)
    if (!project) {
      return null
    }

    const owner = await isProjectOwner(this.prisma, actor, projectId)
    const actorRole: 'owner' | 'editor' = owner ? 'owner' : 'editor'

    const projectMemberModel = getProjectMemberModel(this.prisma)
    const inviteListModel = getProjectInviteListModel(this.prisma)

    const memberRows = projectMemberModel
      ? await projectMemberModel.findMany({
        where: {
          projectId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      })
      : []

    const collaboratorsBySubject = new Map<string, ProjectCollaboratorRecord>()

    if (project.ownerSubject) {
      collaboratorsBySubject.set(project.ownerSubject, {
        subject: project.ownerSubject,
        displayName: null,
        email: null,
        role: 'owner',
        addedBySubject: null,
        createdAt: project.createdAt,
      })
    }

    memberRows.forEach((member) => {
      const existing = collaboratorsBySubject.get(member.subject)
      const nextRole: 'owner' | 'editor' =
        existing?.role === 'owner' || member.role === 'owner' ? 'owner' : 'editor'

      collaboratorsBySubject.set(member.subject, {
        subject: member.subject,
        displayName: member.displayName,
        email: member.email,
        role: nextRole,
        addedBySubject: member.addedBySubject,
        createdAt: existing?.createdAt ?? member.createdAt.toISOString(),
      })
    })

    const collaborators = [...collaboratorsBySubject.values()].sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'owner' ? -1 : 1
      }

      return left.createdAt.localeCompare(right.createdAt)
    })

    const activeInvites = inviteListModel
      ? (await inviteListModel.findMany({
        where: {
          projectId,
          consumedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })).map((invite) => toInviteRecord(invite))
      : []

    return {
      project,
      actorRole,
      collaborators,
      activeInvites,
    }
  }

  async removeCollaborator(actor: ActorContext, projectId: string, subject: string): Promise<boolean> {
    const ownerProject = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ownerSubject: actor.subject ?? '__none__',
      },
      select: {
        ownerSubject: true,
      },
    })

    if (!ownerProject) {
      return false
    }

    if (ownerProject.ownerSubject === subject) {
      throw Object.assign(new Error('Cannot remove owner'), {
        code: 'PROJECT_OWNER_IMMUTABLE',
      })
    }

    const projectMemberModel = getProjectMemberModel(this.prisma)
    if (!projectMemberModel) {
      return false
    }

    const result = await projectMemberModel.deleteMany({
      where: {
        projectId,
        subject,
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

  async listActiveInvites(actor: ActorContext, projectId: string): Promise<ActiveProjectInviteRecord[]> {
    const owner = await isProjectOwner(this.prisma, actor, projectId)
    if (!owner) {
      return []
    }

    if (!getProjectInviteModel(this.prisma)) {
      return []
    }

    const now = new Date()
    const invites = await this.prisma.projectInvite.findMany({
      where: {
        projectId,
        consumedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return invites.map((invite) => {
      return {
        id: invite.id,
        projectId: invite.projectId,
        role: 'editor',
        createdBySubject: invite.createdBySubject,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      }
    })
  }

  async revokeInvite(actor: ActorContext, projectId: string, inviteId: string): Promise<boolean> {
    const owner = await isProjectOwner(this.prisma, actor, projectId)
    if (!owner) {
      return false
    }

    const now = new Date()

    const result = await this.prisma.projectInvite.updateMany({
      where: {
        id: inviteId,
        projectId,
        consumedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    })

    return result.count > 0
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
          displayName: actor.displayName ?? null,
          email: actor.email ?? null,
          role: 'editor',
          addedBySubject: latestInvite.createdBySubject,
        },
        update: {
          displayName: actor.displayName ?? null,
          email: actor.email ?? null,
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
