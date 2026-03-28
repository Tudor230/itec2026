import type { FileRecord, FileInput } from './file.types.js'
import type { FilesService } from './files.service.js'
import { normalizeProjectFilePath, type ProjectWorkspaceStore, type WorkspaceTextFile } from './project-workspace-store.js'

export interface WorkspaceSyncDeletedFile {
  id: string
  projectId: string
  path: string
  deletedAt: string
}

export interface WorkspaceSyncResult {
  created: FileRecord[]
  updated: FileRecord[]
  deleted: WorkspaceSyncDeletedFile[]
}

function toFileInput(projectId: string, file: WorkspaceTextFile): FileInput {
  return {
    projectId,
    path: normalizeProjectFilePath(file.path),
    content: file.content,
  }
}

function byPath<T extends { path: string }>(files: T[]) {
  return new Map(files.map((file) => [file.path, file]))
}

function buildHashBuckets(files: FileRecord[]) {
  const buckets = new Map<string, FileRecord[]>()

  files.forEach((file) => {
    const bucket = buckets.get(file.contentHash) ?? []
    bucket.push(file)
    buckets.set(file.contentHash, bucket)
  })

  return buckets
}

function consumeByHash(
  buckets: Map<string, FileRecord[]>,
  hash: string,
): FileRecord | null {
  const bucket = buckets.get(hash)
  if (!bucket || bucket.length === 0) {
    return null
  }

  const match = bucket.pop() ?? null
  if (bucket.length === 0) {
    buckets.delete(hash)
  } else {
    buckets.set(hash, bucket)
  }

  return match
}

export class ProjectWorkspaceSyncService {
  private readonly projectLocks = new Map<string, Promise<void>>()

  constructor(
    private readonly filesService: FilesService,
    private readonly workspaceStore: ProjectWorkspaceStore,
  ) {}

  private async applyApiCreateUnlocked(file: FileRecord) {
    await this.workspaceStore.writeFile(file.projectId, file.path, file.content)
  }

  private async applyApiUpdateUnlocked(previous: FileRecord, next: FileRecord) {
    if (previous.path === next.path) {
      await this.workspaceStore.writeFile(next.projectId, next.path, next.content)
      return
    }

    await this.workspaceStore.moveFile(next.projectId, previous.path, next.path, next.content)
  }

  private async applyApiDeleteUnlocked(file: FileRecord) {
    await this.workspaceStore.deleteFile(file.projectId, file.path)
  }

  async runLocked<T>(projectId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.projectLocks.get(projectId) ?? Promise.resolve()

    let result: T | null = null
    let actionError: unknown = null

    const next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          result = await action()
        } catch (error) {
          actionError = error
        }
      })
      .finally(() => {
        if (this.projectLocks.get(projectId) === next) {
          this.projectLocks.delete(projectId)
        }
      })

    this.projectLocks.set(projectId, next)
    await next

    if (actionError) {
      throw actionError
    }

    return result as T
  }

  async hydrateProjectWorkspace(projectId: string) {
    await this.runLocked(projectId, async () => {
      const files = await this.filesService.listByProjectForSync(projectId)
      await this.workspaceStore.replaceProjectFiles(
        projectId,
        files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      )
    })
  }

  async applyApiCreate(file: FileRecord) {
    await this.runLocked(file.projectId, async () => {
      await this.applyApiCreateUnlocked(file)
    })
  }

  async applyApiCreateAlreadyLocked(file: FileRecord) {
    await this.applyApiCreateUnlocked(file)
  }

  async applyApiUpdate(previous: FileRecord, next: FileRecord) {
    await this.runLocked(next.projectId, async () => {
      await this.applyApiUpdateUnlocked(previous, next)
    })
  }

  async applyApiUpdateAlreadyLocked(previous: FileRecord, next: FileRecord) {
    await this.applyApiUpdateUnlocked(previous, next)
  }

  async applyApiDelete(file: FileRecord) {
    await this.runLocked(file.projectId, async () => {
      await this.applyApiDeleteUnlocked(file)
    })
  }

  async applyApiDeleteAlreadyLocked(file: FileRecord) {
    await this.applyApiDeleteUnlocked(file)
  }

  async reconcileProjectWorkspace(projectId: string): Promise<WorkspaceSyncResult> {
    return this.runLocked(projectId, async () => {
      const dbFiles = await this.filesService.listByProjectForSync(projectId)
      const workspaceFiles = await this.workspaceStore.listTextFiles(projectId)

      const dbByPath = byPath(dbFiles)
      const workspaceByPath = byPath(workspaceFiles)

      const created: FileRecord[] = []
      const updated: FileRecord[] = []
      const deleted: WorkspaceSyncDeletedFile[] = []

      for (const [filePath, dbFile] of dbByPath.entries()) {
        const workspaceFile = workspaceByPath.get(filePath)
        if (!workspaceFile) {
          continue
        }

        if (workspaceFile.contentHash !== dbFile.contentHash || workspaceFile.byteSize !== dbFile.byteSize) {
          const next = await this.filesService.updateFromSync(dbFile.id, {
            content: workspaceFile.content,
          })

          if (next) {
            updated.push(next)
            dbByPath.set(filePath, next)
          }
        }

        dbByPath.delete(filePath)
        workspaceByPath.delete(filePath)
      }

      const unmatchedDbFiles = [...dbByPath.values()]
      const unmatchedByHash = buildHashBuckets(unmatchedDbFiles)
      const renamedFileIds = new Set<string>()

      for (const [workspacePath, workspaceFile] of workspaceByPath.entries()) {
        const renameCandidate = consumeByHash(unmatchedByHash, workspaceFile.contentHash)
        if (!renameCandidate) {
          continue
        }

        const next = await this.filesService.updateFromSync(renameCandidate.id, {
          path: workspacePath,
        })

        if (next) {
          updated.push(next)
          renamedFileIds.add(renameCandidate.id)
        }

        workspaceByPath.delete(workspacePath)
      }

      for (const workspaceFile of workspaceByPath.values()) {
        const createdFile = await this.filesService.createFromSync(toFileInput(projectId, workspaceFile), null)
        created.push(createdFile)
      }

      for (const dbFile of unmatchedDbFiles) {
        if (renamedFileIds.has(dbFile.id)) {
          continue
        }

        const removed = await this.filesService.removeFromSync(dbFile.id)
        if (!removed) {
          continue
        }

        deleted.push({
          id: dbFile.id,
          projectId: dbFile.projectId,
          path: dbFile.path,
          deletedAt: new Date().toISOString(),
        })
      }

      return {
        created,
        updated,
        deleted,
      }
    })
  }
}
