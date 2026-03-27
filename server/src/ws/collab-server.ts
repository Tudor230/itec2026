import type { Server as HttpServer } from 'node:http'
import type { Socket } from 'socket.io'
import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../modules/auth/actor-context.js'
import { createCollabGateway } from '../modules/collab/collab.gateway.js'
import { canEditProject, canReadProject } from '../modules/projects/project-access.js'

export function createCollabServer(
  server: HttpServer,
  prisma: PrismaClient,
  resolveActor: (socket: Socket) => Promise<ActorContext>,
) {
  return createCollabGateway(
    server,
    resolveActor,
    async (actor, projectId) => {
      return canReadProject(prisma, actor, projectId)
    },
    async (actor, projectId, fileId) => {
      if (!actor.subject) {
        return false
      }

      const canAccess = await canEditProject(prisma, actor, projectId)
      if (!canAccess) {
        return false
      }

      const file = await prisma.file.findFirst({
        where: {
          id: fileId,
          projectId,
        },
        select: {
          id: true,
        },
      })

      return Boolean(file)
    },
    async (actor, projectId, fileId) => {
      if (!actor.subject) {
        return null
      }

      const canAccess = await canEditProject(prisma, actor, projectId)
      if (!canAccess) {
        return null
      }

      const file = await prisma.file.findFirst({
        where: {
          id: fileId,
          projectId,
        },
        select: {
          content: true,
        },
      })

      return file?.content ?? null
    },
  )
}
