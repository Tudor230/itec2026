import { Router } from 'express'
import type { PrismaClient } from '@prisma/client'
import * as Y from 'yjs'
import { z } from 'zod'
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
  importGithubProjectSchema,
  importLocalFilesSchema,
  renameFolderSchema,
  updateFileSchema,
} from './file.schema.js'
import { canEditProject, canReadProject } from './project-access.js'
import { LocalFileBlobStore, resolveFilesStorageRoot, type FileBlobStore } from './file-blob-store.js'
import { FilesRepository } from './files.repository.js'
import { FilesService } from './files.service.js'
import type { ProjectWorkspaceSyncService } from './project-workspace-sync-service.js'

const MAX_HISTORY_LIMIT = 100

type HistorySource = 'snapshot' | 'update'

interface VersionPreview {
  source: HistorySource
  sequence: number
  content: string
}

function decodeHistoryUpdate(encoded: string) {
  return new Uint8Array(Buffer.from(encoded, 'base64'))
}

function parseHistoryLimit(value: unknown) {
  if (typeof value !== 'string') {
    return 50
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50
  }

  if (parsed > MAX_HISTORY_LIMIT) {
    return MAX_HISTORY_LIMIT
  }

  return parsed
}

function parseHistoryEntryId(value: string): { source: HistorySource; sequence: number } | null {
  const match = /^(snapshot|update):(\d+)$/.exec(value)
  if (!match) {
    return null
  }

  const parsedSequence = Number.parseInt(match[2], 10)
  if (!Number.isFinite(parsedSequence) || parsedSequence <= 0) {
    return null
  }

  return {
    source: match[1] as HistorySource,
    sequence: parsedSequence,
  }
}

function parseProjectHistoryEventId(eventId: string): { fileId: string; entryId: string } | null {
  const separatorIndex = eventId.indexOf('::')
  if (separatorIndex <= 0) {
    return null
  }

  const fileId = eventId.slice(0, separatorIndex).trim()
  const entryId = eventId.slice(separatorIndex + 2).trim()
  if (!fileId || !entryId) {
    return null
  }

  return {
    fileId,
    entryId,
  }
}

async function resolveFileVersionPreview(
  prisma: PrismaClient,
  projectId: string,
  fileId: string,
  entryId: string,
): Promise<VersionPreview | null> {
  const parsedEntryId = parseHistoryEntryId(entryId)
  if (!parsedEntryId) {
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

  if (parsedEntryId.source === 'snapshot') {
    const snapshotEntry = await prisma.yjsSnapshot.findFirst({
      where: {
        fileId,
        sequence: parsedEntryId.sequence,
      },
      select: {
        id: true,
      },
    })

    if (!snapshotEntry) {
      return null
    }
  }

  if (parsedEntryId.source === 'update') {
    const updateEntry = await prisma.yjsUpdate.findFirst({
      where: {
        fileId,
        sequence: parsedEntryId.sequence,
      },
      select: {
        id: true,
      },
    })

    if (!updateEntry) {
      return null
    }
  }

  const latestSnapshot = await prisma.yjsSnapshot.findFirst({
    where: {
      fileId,
      sequence: {
        lte: parsedEntryId.sequence,
      },
    },
    orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
    select: {
      sequence: true,
      updateBase64: true,
    },
  })

  const updates = await prisma.yjsUpdate.findMany({
    where: {
      fileId,
      sequence: {
        gt: latestSnapshot?.sequence ?? 0,
        lte: parsedEntryId.sequence,
      },
    },
    orderBy: {
      sequence: 'asc',
    },
    select: {
      updateBase64: true,
    },
  })

  const doc = new Y.Doc()
  if (latestSnapshot) {
    Y.applyUpdate(doc, decodeHistoryUpdate(latestSnapshot.updateBase64))
  }

  updates.forEach((entry) => {
    Y.applyUpdate(doc, decodeHistoryUpdate(entry.updateBase64))
  })

  return {
    source: parsedEntryId.source,
    sequence: parsedEntryId.sequence,
    content: doc.getText('content').toString(),
  }
}

export function createFilesRouter({
  prisma,
  blobStore = new LocalFileBlobStore(resolveFilesStorageRoot()),
  workspaceSync,
  fetchImpl,
}: {
  prisma: PrismaClient
  blobStore?: FileBlobStore
  workspaceSync?: ProjectWorkspaceSyncService
  fetchImpl?: typeof fetch
}) {
  const router = Router()
  const service = new FilesService(new FilesRepository(prisma, blobStore), fetchImpl)

  function emitImportedFiles(files: Array<{
    id: string
    projectId: string
    path: string
    createdAt: string
    updatedAt: string
  }>) {
    files.forEach((file) => {
      emitCollabFileCreated({
        id: file.id,
        projectId: file.projectId,
        path: file.path,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })
    })
  }

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

  router.get('/history/project', requireTokenPresent, asyncHandler(async (request, response) => {
    const projectId = request.query.projectId
    if (typeof projectId !== 'string' || projectId.trim().length === 0) {
      response.status(400).json({
        ok: false,
        error: { message: 'projectId query parameter is required', code: 'INVALID_QUERY' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const canRead = await canReadProject(prisma, actor, projectId)
    if (!canRead) {
      response.json({
        ok: true,
        data: [],
      })
      return
    }

    const limit = parseHistoryLimit(request.query.limit)

    const [snapshots, updates] = await Promise.all([
      prisma.yjsSnapshot.findMany({
        where: {
          file: {
            projectId,
          },
        },
        orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
        take: limit * 2,
        select: {
          fileId: true,
          sequence: true,
          createdAt: true,
          file: {
            select: {
              path: true,
            },
          },
        },
      }),
      prisma.yjsUpdate.findMany({
        where: {
          file: {
            projectId,
          },
        },
        orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
        take: limit * 2,
        select: {
          fileId: true,
          sequence: true,
          createdAt: true,
          file: {
            select: {
              path: true,
            },
          },
        },
      }),
    ])

    const rows = [
      ...snapshots.map((entry) => {
        const historyEntryId = `snapshot:${entry.sequence}`
        return {
          id: `${entry.fileId}::${historyEntryId}`,
          fileId: entry.fileId,
          filePath: entry.file.path,
          historyEntryId,
          source: 'snapshot' as const,
          sequence: entry.sequence,
          createdAt: entry.createdAt.toISOString(),
        }
      }),
      ...updates.map((entry) => {
        const historyEntryId = `update:${entry.sequence}`
        return {
          id: `${entry.fileId}::${historyEntryId}`,
          fileId: entry.fileId,
          filePath: entry.file.path,
          historyEntryId,
          source: 'update' as const,
          sequence: entry.sequence,
          createdAt: entry.createdAt.toISOString(),
        }
      }),
    ]
      .sort((left, right) => {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      })
      .slice(0, limit)

    response.json({
      ok: true,
      data: rows,
    })
  }))

  router.post('/history/project/:eventId/restore', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = z.object({
      projectId: z.string().trim().min(1),
    }).safeParse(request.body)

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FILE_INPUT' },
      })
      return
    }

    const decodedEvent = parseProjectHistoryEventId(request.params.eventId)
    if (!decodedEvent) {
      response.status(400).json({
        ok: false,
        error: { message: 'Invalid project history event id', code: 'INVALID_QUERY' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const canEdit = await canEditProject(prisma, actor, parsed.data.projectId)
    if (!canEdit) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    const versionPreview = await resolveFileVersionPreview(
      prisma,
      parsed.data.projectId,
      decodedEvent.fileId,
      decodedEvent.entryId,
    )

    if (!versionPreview) {
      response.status(404).json({
        ok: false,
        error: { message: 'File history entry not found', code: 'FILE_HISTORY_NOT_FOUND' },
      })
      return
    }

    const previousFile = await service.getById(actor, decodedEvent.fileId)
    if (!previousFile) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    if (!workspaceSync) {
      const updated = await service.update(actor, decodedEvent.fileId, {
        content: versionPreview.content,
      })

      if (!updated) {
        response.status(404).json({
          ok: false,
          error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
        })
        return
      }

      emitCollabFileUpdated({
        id: updated.id,
        projectId: updated.projectId,
        path: updated.path,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      })

      response.json({
        ok: true,
        data: {
          file: updated,
          restoredFrom: {
            fileId: decodedEvent.fileId,
            historyEntryId: decodedEvent.entryId,
            source: versionPreview.source,
            sequence: versionPreview.sequence,
          },
        },
      })
      return
    }

    const updated = await workspaceSync.runLocked(previousFile.projectId, async () => {
      const nextFile = await service.update(actor, decodedEvent.fileId, {
        content: versionPreview.content,
      })

      if (!nextFile) {
        return null
      }

      try {
        await workspaceSync.applyApiUpdateAlreadyLocked(previousFile, nextFile)
      } catch (error) {
        await service.updateFromSync(nextFile.id, {
          path: previousFile.path,
          content: previousFile.content,
        })
        throw error
      }

      return nextFile
    })

    if (!updated) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    emitCollabFileUpdated({
      id: updated.id,
      projectId: updated.projectId,
      path: updated.path,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })

    response.json({
      ok: true,
      data: {
        file: updated,
        restoredFrom: {
          fileId: decodedEvent.fileId,
          historyEntryId: decodedEvent.entryId,
          source: versionPreview.source,
          sequence: versionPreview.sequence,
        },
      },
    })
  }))

  router.get('/history/file/:fileId', requireTokenPresent, asyncHandler(async (request, response) => {
    const projectId = request.query.projectId
    if (typeof projectId !== 'string' || projectId.trim().length === 0) {
      response.status(400).json({
        ok: false,
        error: { message: 'projectId query parameter is required', code: 'INVALID_QUERY' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const canRead = await canReadProject(prisma, actor, projectId)
    if (!canRead) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    const file = await prisma.file.findFirst({
      where: {
        id: request.params.fileId,
        projectId,
      },
      select: {
        id: true,
        path: true,
      },
    })

    if (!file) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    const limit = parseHistoryLimit(request.query.limit)

    const [snapshots, updates] = await Promise.all([
      prisma.yjsSnapshot.findMany({
        where: {
          fileId: file.id,
        },
        orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: {
          sequence: true,
          createdAt: true,
        },
      }),
      prisma.yjsUpdate.findMany({
        where: {
          fileId: file.id,
        },
        orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: {
          sequence: true,
          createdAt: true,
        },
      }),
    ])

    const rows = [
      ...snapshots.map((entry) => {
        return {
          id: `snapshot:${entry.sequence}`,
          source: 'snapshot' as const,
          sequence: entry.sequence,
          createdAt: entry.createdAt.toISOString(),
          fileId: file.id,
          filePath: file.path,
        }
      }),
      ...updates.map((entry) => {
        return {
          id: `update:${entry.sequence}`,
          source: 'update' as const,
          sequence: entry.sequence,
          createdAt: entry.createdAt.toISOString(),
          fileId: file.id,
          filePath: file.path,
        }
      }),
    ]
      .sort((left, right) => {
        if (right.sequence !== left.sequence) {
          return right.sequence - left.sequence
        }

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      })
      .slice(0, limit)

    response.json({
      ok: true,
      data: rows,
    })
  }))

  router.get('/history/file/:fileId/:entryId', requireTokenPresent, asyncHandler(async (request, response) => {
    const projectId = request.query.projectId
    if (typeof projectId !== 'string' || projectId.trim().length === 0) {
      response.status(400).json({
        ok: false,
        error: { message: 'projectId query parameter is required', code: 'INVALID_QUERY' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const canRead = await canReadProject(prisma, actor, projectId)
    if (!canRead) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    const versionPreview = await resolveFileVersionPreview(
      prisma,
      projectId,
      request.params.fileId,
      request.params.entryId,
    )

    if (!versionPreview) {
      response.status(404).json({
        ok: false,
        error: { message: 'File history entry not found', code: 'FILE_HISTORY_NOT_FOUND' },
      })
      return
    }

    response.json({
      ok: true,
      data: {
        id: request.params.entryId,
        fileId: request.params.fileId,
        source: versionPreview.source,
        sequence: versionPreview.sequence,
        content: versionPreview.content,
      },
    })
  }))

  router.post('/history/file/:fileId/:entryId/restore', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = z.object({
      projectId: z.string().trim().min(1),
    }).safeParse(request.body)

    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FILE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    const canEdit = await canEditProject(prisma, actor, parsed.data.projectId)
    if (!canEdit) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    const versionPreview = await resolveFileVersionPreview(
      prisma,
      parsed.data.projectId,
      request.params.fileId,
      request.params.entryId,
    )

    if (!versionPreview) {
      response.status(404).json({
        ok: false,
        error: { message: 'File history entry not found', code: 'FILE_HISTORY_NOT_FOUND' },
      })
      return
    }

    const previousFile = await service.getById(actor, request.params.fileId)
    if (!previousFile) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    if (!workspaceSync) {
      const updated = await service.update(actor, request.params.fileId, {
        content: versionPreview.content,
      })

      if (!updated) {
        response.status(404).json({
          ok: false,
          error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
        })
        return
      }

      emitCollabFileUpdated({
        id: updated.id,
        projectId: updated.projectId,
        path: updated.path,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      })

      response.json({
        ok: true,
        data: {
          file: updated,
          restoredFrom: {
            historyEntryId: request.params.entryId,
            source: versionPreview.source,
            sequence: versionPreview.sequence,
          },
        },
      })
      return
    }

    const updated = await workspaceSync.runLocked(previousFile.projectId, async () => {
      const nextFile = await service.update(actor, request.params.fileId, {
        content: versionPreview.content,
      })

      if (!nextFile) {
        return null
      }

      try {
        await workspaceSync.applyApiUpdateAlreadyLocked(previousFile, nextFile)
      } catch (error) {
        await service.updateFromSync(nextFile.id, {
          path: previousFile.path,
          content: previousFile.content,
        })
        throw error
      }

      return nextFile
    })

    if (!updated) {
      response.status(404).json({
        ok: false,
        error: { message: 'File not found', code: 'FILE_NOT_FOUND' },
      })
      return
    }

    emitCollabFileUpdated({
      id: updated.id,
      projectId: updated.projectId,
      path: updated.path,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    })

    response.json({
      ok: true,
      data: {
        file: updated,
        restoredFrom: {
          historyEntryId: request.params.entryId,
          source: versionPreview.source,
          sequence: versionPreview.sequence,
        },
      },
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

  router.post('/import/local', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = importLocalFilesSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FILE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)

    if (!workspaceSync) {
      const imported = await service.importLocalFiles(actor, parsed.data)
      emitImportedFiles(imported.imported)

      response.status(201).json({
        ok: true,
        data: imported,
      })
      return
    }

    const imported = await workspaceSync.runLocked(parsed.data.projectId, async () => {
      const next = await service.importLocalFiles(actor, parsed.data)

      try {
        for (const file of next.imported) {
          await workspaceSync.applyApiCreateAlreadyLocked(file)
        }
      } catch (error) {
        await Promise.allSettled(next.imported.map((file) => service.remove(actor, file.id)))
        throw error
      }

      return next
    })

    emitImportedFiles(imported.imported)

    response.status(201).json({
      ok: true,
      data: imported,
    })
  }))

  router.post('/import/github', requireTokenPresent, asyncHandler(async (request, response) => {
    const parsed = importGithubProjectSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: { message: parsed.error.message, code: 'INVALID_FILE_INPUT' },
      })
      return
    }

    const actor = actorFromRequest(request)
    let imported

    try {
      if (!workspaceSync) {
        imported = await service.importFromGithub(actor, parsed.data)
      } else {
        imported = await workspaceSync.runLocked(parsed.data.projectId, async () => {
          const next = await service.importFromGithub(actor, parsed.data)

          try {
            for (const file of next.imported) {
              await workspaceSync.applyApiCreateAlreadyLocked(file)
            }
          } catch (error) {
            await Promise.allSettled(next.imported.map((file) => service.remove(actor, file.id)))
            throw error
          }

          return next
        })
      }
    } catch (error) {
      const errorLike = error as { code?: string; message?: string }
      if (errorLike.code === 'INVALID_GITHUB_REPOSITORY_URL') {
        response.status(400).json({
          ok: false,
          error: {
            code: 'INVALID_GITHUB_REPOSITORY_URL',
            message: errorLike.message ?? 'Invalid GitHub repository URL',
          },
        })
        return
      }

      if (errorLike.code === 'GITHUB_IMPORT_FAILED') {
        response.status(502).json({
          ok: false,
          error: {
            code: 'GITHUB_IMPORT_FAILED',
            message: errorLike.message ?? 'Could not import repository from GitHub',
          },
        })
        return
      }

      throw error
    }

    emitImportedFiles(imported.imported)

    response.status(201).json({
      ok: true,
      data: imported,
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
