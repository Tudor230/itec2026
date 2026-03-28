import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../../http/async-handler.js'
import { actorFromRequest } from '../auth/request-actor.js'
import { requireTokenPresent } from '../auth/require-token-present.middleware.js'
import {
  emitCollabFileCreated,
  emitCollabFileDeleted,
  emitCollabFileUpdated,
} from '../collab/collab-events.js'
import {
  createFileSchema,
  createFolderSchema,
  deleteFolderSchema,
  renameFolderSchema,
  updateFileSchema,
} from './file.schema.js'
import { LocalFileBlobStore, resolveFilesStorageRoot, type FileBlobStore } from './file-blob-store.js'
import { FilesRepository } from './files.repository.js'
import { FilesService } from './files.service.js'
import type { ProjectWorkspaceSyncService } from './project-workspace-sync-service.js'

export function createFilesRouter({
  prisma,
  blobStore = new LocalFileBlobStore(resolveFilesStorageRoot()),
  workspaceSync,
}: {
  prisma: PrismaClient
  blobStore?: FileBlobStore
  workspaceSync?: ProjectWorkspaceSyncService
}) {
  const router = Router()
  const service = new FilesService(new FilesRepository(prisma, blobStore))

  router.get('/', requireTokenPresent, asyncHandler(async (request, response) => {
    const projectId = request.query.projectId
    if (typeof projectId !== 'string' || projectId.trim().length === 0) {
      response.status(400).json({
        ok: false,
        error: { message: 'projectId query parameter is required', code: 'INVALID_QUERY' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const files = await service.listByProject(actor, projectId)

    response.json({
      ok: true,
      data: files,
    })
  }))

  router.get('/folders', requireTokenPresent, asyncHandler(async (request, response) => {
    const projectId = request.query.projectId
    if (typeof projectId !== 'string' || projectId.trim().length === 0) {
      response.status(400).json({
        ok: false,
        error: { message: 'projectId query parameter is required', code: 'INVALID_QUERY' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const folders = await service.listFoldersByProject(actor, projectId)

    response.json({
      ok: true,
      data: folders,
    })
  }))

  router.get('/:fileId', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const file = await service.getById(actor, request.params.fileId)

    if (!file) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: file,
    })
  }))

  router.post('/', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = createFileSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FILE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const projectId = parsed.data.projectId

    if (!workspaceSync) {
      const file = await service.create(actor, parsed.data)
      emitCollabFileCreated({
        id: file.id,
        projectId: file.projectId,
        path: file.path,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })

      response.status(201).json({
        ok: true,
        data: file,
      })
      return
    }

    const file = await workspaceSync.runLocked(projectId, async () => {
      const created = await service.create(actor, parsed.data)

      try {
        await workspaceSync.applyApiCreateAlreadyLocked(created)
      } catch (error) {
        await service.remove(actor, created.id)
        throw error
      }

      return created
    })

    emitCollabFileCreated({
      id: file.id,
      projectId: file.projectId,
      path: file.path,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    })

    response.status(201).json({
      ok: true,
      data: file,
    })
  }))

  router.post('/folders', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = createFolderSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FOLDER_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const folder = await service.createFolder(actor, parsed.data.projectId, parsed.data.path)

    response.status(201).json({
      ok: true,
      data: folder,
    })
  }))

  router.patch('/folders', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = renameFolderSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FOLDER_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const renamed = await service.renameFolder(
      actor,
      parsed.data.projectId,
      parsed.data.fromPath,
      parsed.data.toPath,
    )

    if (!renamed) {
      response.status(404).json({
        ok: false,
        error: { message: 'Folder not found', code: 'FOLDER_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: { renamed: true },
    })
  }))

  router.patch('/:fileId', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = updateFileSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FILE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)

    const previousFile = await service.getById(actor, request.params.fileId)
    if (!previousFile) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    if (!workspaceSync) {
      const file = await service.update(actor, request.params.fileId, parsed.data)
      if (!file) {
        response.status(404).json({
          ok: false,
          error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
        })
        return
      }

      emitCollabFileUpdated({
        id: file.id,
        projectId: file.projectId,
        path: file.path,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })

      response.json({
        ok: true,
        data: file,
      })
      return
    }

    const file = await workspaceSync.runLocked(previousFile.projectId, async () => {
      const updated = await service.update(actor, request.params.fileId, parsed.data)
      if (!updated) {
        return null
      }

      try {
        await workspaceSync.applyApiUpdateAlreadyLocked(previousFile, updated)
      } catch (error) {
        await service.updateFromSync(updated.id, {
          path: previousFile.path,
          content: previousFile.content,
        })
        throw error
      }

      return updated
    })

    if (!file) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    emitCollabFileUpdated({
      id: file.id,
      projectId: file.projectId,
      path: file.path,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    })

    response.json({
      ok: true,
      data: file,
    })
  }))

  router.delete('/folders', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = deleteFolderSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FOLDER_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const removed = await service.deleteFolder(actor, parsed.data.projectId, parsed.data.path)

    if (!removed) {
      response.status(404).json({
        ok: false,
        error: { message: 'Folder not found', code: 'FOLDER_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: { deleted: true },
    })
  }))

  router.delete('/:fileId', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const file = await service.getById(actor, request.params.fileId)
    if (!file) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    if (!workspaceSync) {
      const removed = await service.remove(actor, request.params.fileId)
      if (!removed) {
        response.status(404).json({
          ok: false,
          error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
        })
        return
      }

      emitCollabFileDeleted({
        id: file.id,
        projectId: file.projectId,
        path: file.path,
        deletedAt: new Date().toISOString(),
      })

      response.json({
        ok: true,
        data: { deleted: true },
      })
      return
    }

    const removed = await workspaceSync.runLocked(file.projectId, async () => {
      await workspaceSync.applyApiDeleteAlreadyLocked(file)

      const deleted = await service.remove(actor, request.params.fileId)
      if (!deleted) {
        await workspaceSync.applyApiCreateAlreadyLocked(file)
        return false
      }

      return true
    })

    if (!removed) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    emitCollabFileDeleted({
      id: file.id,
      projectId: file.projectId,
      path: file.path,
      deletedAt: new Date().toISOString(),
    })

    response.json({
      ok: true,
      data: { deleted: true },
    })
  }))

  return router
}
