import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import { asyncHandler } from '../../http/async-handler.js'
import { actorFromRequest } from '../auth/request-actor.js'
import { requireTokenPresent } from '../auth/require-token-present.middleware.js'
import { emitCollabFileCreated } from '../collab/collab-events.js'
import { createFileSchema, updateFileSchema } from './file.schema.js'
import { FilesRepository } from './files.repository.js'
import { FilesService } from './files.service.js'

export function createFilesRouter({ prisma }: { prisma: PrismaClient }) {
  const router = Router()
  const service = new FilesService(new FilesRepository(prisma))

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
    const file = await service.update(actor, request.params.fileId, parsed.data)

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

  router.delete('/:fileId', requireTokenPresent, asyncHandler(async (request, response) => {
    const actor = actorFromRequest(request)
    const removed = await service.remove(actor, request.params.fileId)

    if (!removed) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: { deleted: true },
    })
  }))

  return router
}
