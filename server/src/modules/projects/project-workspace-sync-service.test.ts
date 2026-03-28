import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FileInput, FileRecord } from './file.types.js'
import { ProjectWorkspaceSyncService } from './project-workspace-sync-service.js'
import type { ProjectWorkspaceStore, WorkspaceTextFile } from './project-workspace-store.js'

class FilesServiceDouble {
  private readonly files = new Map<string, FileRecord>()

  seed(files: FileRecord[]) {
    for (const file of files) {
      this.files.set(file.id, file)
    }
  }

  listByProjectForSync(projectId: string) {
    return Promise.resolve(
      [...this.files.values()]
        .filter((file) => file.projectId === projectId)
        .sort((left, right) => left.path.localeCompare(right.path)),
    )
  }

  async createFromSync(input: FileInput, ownerSubject: string | null = null) {
    const id = `file-${Math.random().toString(36).slice(2, 8)}`
    const created: FileRecord = {
      id,
      projectId: input.projectId,
      path: input.path,
      content: input.content,
      storageKey: `${input.projectId}/${id}`,
      contentHash: `hash-${input.content}`,
      byteSize: Buffer.from(input.content, 'utf8').byteLength,
      ownerSubject,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.files.set(created.id, created)
    return created
  }

  async updateFromSync(id: string, updates: Partial<Pick<FileInput, 'path' | 'content'>>) {
    const existing = this.files.get(id)
    if (!existing) {
      return null
    }

    const next: FileRecord = {
      ...existing,
      path: updates.path ?? existing.path,
      content: updates.content ?? existing.content,
      contentHash: `hash-${updates.content ?? existing.content}`,
      byteSize: Buffer.from(updates.content ?? existing.content, 'utf8').byteLength,
      updatedAt: new Date().toISOString(),
    }

    this.files.set(id, next)
    return next
  }

  async removeFromSync(id: string) {
    return this.files.delete(id)
  }
}

class WorkspaceStoreDouble implements ProjectWorkspaceStore {
  private readonly files = new Map<string, WorkspaceTextFile>()

  getProjectWorkspacePath(projectId: string): string {
    return `/tmp/${projectId}`
  }

  ensureProjectWorkspace(_projectId: string): Promise<void> {
    return Promise.resolve()
  }

  writeFile(_projectId: string, filePath: string, content: string): Promise<void> {
    this.files.set(filePath, {
      path: filePath,
      content,
      contentHash: `hash-${content}`,
      byteSize: Buffer.from(content, 'utf8').byteLength,
    })
    return Promise.resolve()
  }

  moveFile(_projectId: string, fromPath: string, toPath: string, content: string): Promise<void> {
    this.files.delete(fromPath)
    this.files.set(toPath, {
      path: toPath,
      content,
      contentHash: `hash-${content}`,
      byteSize: Buffer.from(content, 'utf8').byteLength,
    })
    return Promise.resolve()
  }

  deleteFile(_projectId: string, filePath: string): Promise<void> {
    this.files.delete(filePath)
    return Promise.resolve()
  }

  replaceProjectFiles(_projectId: string, files: Array<{ path: string; content: string }>): Promise<void> {
    this.files.clear()
    for (const file of files) {
      this.files.set(file.path, {
        path: file.path,
        content: file.content,
        contentHash: `hash-${file.content}`,
        byteSize: Buffer.from(file.content, 'utf8').byteLength,
      })
    }
    return Promise.resolve()
  }

  listTextFiles(_projectId: string): Promise<WorkspaceTextFile[]> {
    return Promise.resolve([...this.files.values()])
  }
}

describe('project workspace sync service', () => {
  it('reconciles create, update, rename and delete from workspace state', async () => {
    const filesService = new FilesServiceDouble()
    const workspaceStore = new WorkspaceStoreDouble()
    const now = new Date().toISOString()

    filesService.seed([
      {
        id: 'f1',
        projectId: 'p1',
        path: 'src/rename-me.ts',
        content: 'const same = 1',
        storageKey: 'p1/f1',
        contentHash: 'hash-const same = 1',
        byteSize: 14,
        ownerSubject: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'f2',
        projectId: 'p1',
        path: 'src/update.ts',
        content: 'old',
        storageKey: 'p1/f2',
        contentHash: 'hash-old',
        byteSize: 3,
        ownerSubject: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'f3',
        projectId: 'p1',
        path: 'src/delete.ts',
        content: 'bye',
        storageKey: 'p1/f3',
        contentHash: 'hash-bye',
        byteSize: 3,
        ownerSubject: null,
        createdAt: now,
        updatedAt: now,
      },
    ])

    await workspaceStore.replaceProjectFiles('p1', [
      { path: 'src/renamed.ts', content: 'const same = 1' },
      { path: 'src/update.ts', content: 'new' },
      { path: 'src/new.ts', content: 'new file' },
    ])

    const service = new ProjectWorkspaceSyncService(filesService as never, workspaceStore)
    const result = await service.reconcileProjectWorkspace('p1')

    assert.equal(result.created.length, 1)
    assert.equal(result.created[0]?.path, 'src/new.ts')
    assert.ok(result.updated.some((file) => file.path === 'src/renamed.ts'))
    assert.ok(result.updated.some((file) => file.path === 'src/update.ts' && file.content === 'new'))
    assert.equal(result.deleted.length, 1)
    assert.equal(result.deleted[0]?.path, 'src/delete.ts')
  })

  it('serializes operations with project lock', async () => {
    const filesService = new FilesServiceDouble()
    const workspaceStore = new WorkspaceStoreDouble()
    const service = new ProjectWorkspaceSyncService(filesService as never, workspaceStore)

    const events: string[] = []

    const first = service.runLocked('p1', async () => {
      events.push('first-start')
      await new Promise((resolve) => setTimeout(resolve, 30))
      events.push('first-end')
    })

    const second = service.runLocked('p1', async () => {
      events.push('second-start')
      events.push('second-end')
    })

    await Promise.all([first, second])

    assert.deepEqual(events, ['first-start', 'first-end', 'second-start', 'second-end'])
  })
})
