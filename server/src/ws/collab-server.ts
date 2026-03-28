import type { Server as HttpServer } from 'node:http'
import type { Socket } from 'socket.io'
import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../modules/auth/actor-context.js'
import { YjsHistoryRepository } from '../modules/collab/yjs-history.repository.js'
import { LocalFileBlobStore, type FileBlobStore, resolveFilesStorageRoot } from '../modules/projects/file-blob-store.js'
import { createCollabGateway } from '../modules/collab/collab.gateway.js'
import { canEditProject, canReadProject } from '../modules/projects/project-access.js'

export function createCollabServer(
  server: HttpServer,
  prisma: PrismaClient,
  resolveActor: (socket: Socket) => Promise<ActorContext>,
  blobStore: FileBlobStore = new LocalFileBlobStore(resolveFilesStorageRoot()),
) {
  const yjsHistoryRepository = new YjsHistoryRepository(prisma)

  const canEditFile = async (actor: ActorContext, projectId: string, fileId: string) => {
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
  }

  return createCollabGateway(
    server,
    resolveActor,
    async (actor, projectId) => {
      return canReadProject(prisma, actor, projectId)
    },
    async (actor, projectId, fileId) => {
      return canEditFile(actor, projectId, fileId)
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
          storageKey: true,
        },
      })

      if (!file) {
        return null
      }

      return blobStore.readText(file.storageKey)
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
          id: true,
        },
      })

      if (!file) {
        return null
      }

      return yjsHistoryRepository.getHydratedState(fileId)
    },
    async (actor, projectId, fileId, update) => {
      if (!actor.subject) {
        throw Object.assign(new Error('Authentication is required'), {
          code: 'AUTH_REQUIRED',
        })
      }

      const canAccess = await canEditFile(actor, projectId, fileId)
      if (!canAccess) {
        throw Object.assign(new Error('File not found'), {
          code: 'P2025',
        })
      }

      return yjsHistoryRepository.appendUpdate(fileId, update)
    },
    async (actor, projectId, fileId, sequence, update) => {
      if (!actor.subject) {
        throw Object.assign(new Error('Authentication is required'), {
          code: 'AUTH_REQUIRED',
        })
      }

      const canAccess = await canEditFile(actor, projectId, fileId)
      if (!canAccess) {
        throw Object.assign(new Error('File not found'), {
          code: 'P2025',
        })
      }

      await yjsHistoryRepository.saveSnapshot(fileId, sequence, update)
    },
  )
}
