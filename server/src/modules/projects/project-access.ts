import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../auth/actor-context.js'

const EDITOR_ROLE = 'editor'

type ProjectMemberModel = {
  findFirst: (args: {
    where: {
      projectId: string
      subject: string
      role?: string
    }
    select: {
      id: true
    }
  }) => Promise<{ id: string } | null>
}

function getProjectMemberModel(prisma: PrismaClient): ProjectMemberModel | null {
  const model = (prisma as unknown as { projectMember?: ProjectMemberModel }).projectMember
  if (!model) {
    return null
  }

  return model
}

export async function isProjectOwner(
  prisma: PrismaClient,
  actor: ActorContext,
  projectId: string,
): Promise<boolean> {
  if (!actor.subject) {
    return false
  }

  const owner = await prisma.project.findFirst({
    where: {
      id: projectId,
      ownerSubject: actor.subject,
    },
    select: {
      id: true,
    },
  })

  return Boolean(owner)
}

export async function canReadProject(
  prisma: PrismaClient,
  actor: ActorContext,
  projectId: string,
): Promise<boolean> {
  if (!actor.subject) {
    return false
  }

  if (await isProjectOwner(prisma, actor, projectId)) {
    return true
  }

  const projectMemberModel = getProjectMemberModel(prisma)
  if (!projectMemberModel) {
    return false
  }

  const member = await projectMemberModel.findFirst({
    where: {
      projectId,
      subject: actor.subject,
    },
    select: {
      id: true,
    },
  })

  return Boolean(member)
}

export async function canEditProject(
  prisma: PrismaClient,
  actor: ActorContext,
  projectId: string,
): Promise<boolean> {
  if (!actor.subject) {
    return false
  }

  if (await isProjectOwner(prisma, actor, projectId)) {
    return true
  }

  const projectMemberModel = getProjectMemberModel(prisma)
  if (!projectMemberModel) {
    return false
  }

  const member = await projectMemberModel.findFirst({
    where: {
      projectId,
      subject: actor.subject,
      role: EDITOR_ROLE,
    },
    select: {
      id: true,
    },
  })

  return Boolean(member)
}
