import type { Server as HttpServer } from 'node:http'
import type { Socket } from 'socket.io'
import type { PrismaClient } from '@prisma/client'
import type { ActorContext } from '../modules/auth/actor-context.js'
import { YjsHistoryRepository } from '../modules/collab/yjs-history.repository.js'
import { DockerSandboxManager } from '../modules/collab/terminal/docker-sandbox-manager.js'
import { DockerShellRuntime } from '../modules/collab/terminal/docker-shell-runtime.js'
import { TerminalSessionManager } from '../modules/collab/terminal/terminal-session-manager.js'
import { LocalFileBlobStore, type FileBlobStore, resolveFilesStorageRoot } from '../modules/projects/file-blob-store.js'
import { FilesRepository } from '../modules/projects/files.repository.js'
import { FilesService } from '../modules/projects/files.service.js'
import {
  LocalProjectWorkspaceStore,
  type ProjectWorkspaceStore,
  resolveProjectWorkspaceRoot,
} from '../modules/projects/project-workspace-store.js'
import { ProjectWorkspaceSyncService } from '../modules/projects/project-workspace-sync-service.js'
import { ProjectWorkspaceLiveSync } from '../modules/projects/project-workspace-live-sync.js'
import { createCollabGateway } from '../modules/collab/collab.gateway.js'
import { canEditProject, canReadProject } from '../modules/projects/project-access.js'

export function createCollabServer(
  server: HttpServer,
  prisma: PrismaClient,
  resolveActor: (socket: Socket) => Promise<ActorContext>,
  blobStore: FileBlobStore = new LocalFileBlobStore(resolveFilesStorageRoot()),
  workspaceStore: ProjectWorkspaceStore = new LocalProjectWorkspaceStore(resolveProjectWorkspaceRoot()),
) {
  const yjsHistoryRepository = new YjsHistoryRepository(prisma)
  const filesService = new FilesService(new FilesRepository(prisma, blobStore))
  const workspaceSyncService = new ProjectWorkspaceSyncService(filesService, workspaceStore)
  const workspaceLiveSync = new ProjectWorkspaceLiveSync(workspaceStore, workspaceSyncService)
  const dockerSandboxManager = new DockerSandboxManager(workspaceStore)

  void dockerSandboxManager.ping().then((ok) => {
    if (ok) {
      return
    }

    console.error('[docker-sandbox] docker ping failed at startup; terminal commands will fail until daemon is reachable')
  })

  const terminalSessionManager = new TerminalSessionManager(
    ({ projectId, ownerSubject }) => new DockerShellRuntime(dockerSandboxManager, projectId, ownerSubject),
    {
      beforeSessionOpen: async ({ projectId }) => {
        await workspaceSyncService.hydrateProjectWorkspace(projectId)
      },
      afterSessionOpen: async ({ projectId }) => {
        await workspaceLiveSync.start(projectId)
      },
      afterSessionClose: async ({ projectId }) => {
        await workspaceLiveSync.reconcileNow(projectId)
        await workspaceLiveSync.stop(projectId)
      },
    },
    {
      resolveDefaultCwd: () => '/workspace',
    },
  )

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
    async (actor, projectId, fileId, options) => {
      if (!actor.subject) {
        return {
          entries: [],
          rewindEdges: [],
          headSequence: 0,
        }
      }

      const canAccess = await canEditProject(prisma, actor, projectId)
      if (!canAccess) {
        return {
          entries: [],
          rewindEdges: [],
          headSequence: 0,
        }
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
        return {
          entries: [],
          rewindEdges: [],
          headSequence: 0,
        }
      }

      const [entries, rewindEdges, headSequence] = await Promise.all([
        yjsHistoryRepository.listTimelineEntries(fileId, options),
        yjsHistoryRepository.listRewindEdges(fileId, {
          limit: options?.limit,
          beforeAppliedSequence: options?.beforeSequence,
        }),
        yjsHistoryRepository.getHeadSequence(fileId),
      ])

      return {
        entries: entries.map((entry) => ({
          sequence: entry.sequence,
          kind: entry.kind,
          createdAt: entry.createdAt.toISOString(),
        })),
        rewindEdges: rewindEdges.map((edge) => ({
          appliedSequence: edge.appliedSequence,
          targetSequence: edge.targetSequence,
          previousHeadSequence: edge.previousHeadSequence,
          createdAt: edge.createdAt.toISOString(),
        })),
        headSequence,
      }
    },
    async (actor, projectId, fileId, sequence) => {
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

      return yjsHistoryRepository.getHydratedStateAtSequence(fileId, sequence)
    },
    async (actor, projectId, fileId, sequence) => {
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

      if (!file) {
        return false
      }

      return yjsHistoryRepository.hasSnapshotAtSequence(fileId, sequence)
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
    async (actor, projectId, fileId, appliedSequence, targetSequence, previousHeadSequence) => {
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

      await yjsHistoryRepository.saveRewind(
        fileId,
        appliedSequence,
        targetSequence,
        previousHeadSequence,
      )
    },
    async (actor, projectId) => {
      return canEditProject(prisma, actor, projectId)
    },
    terminalSessionManager,
  )
}
