import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FileRecord } from './file.types.js'
import { ProjectWorkspaceLiveSync } from './project-workspace-live-sync.js'

class WorkspaceStoreDouble {
  ensureProjectWorkspaceCalls: string[] = []

  getProjectWorkspacePath(_projectId: string) {
    return process.cwd()
  }

  async ensureProjectWorkspace(projectId: string) {
    this.ensureProjectWorkspaceCalls.push(projectId)
  }
}

class WorkspaceSyncServiceDouble {
  reconcileCalls: string[] = []

  nextResults: Array<{
    created: FileRecord[]
    updated: FileRecord[]
    deleted: Array<{ id: string; projectId: string; path: string; deletedAt: string }>
  }> = []

  async reconcileProjectWorkspace(projectId: string) {
    this.reconcileCalls.push(projectId)
    const next = this.nextResults.shift()
    if (next) {
      return next
    }

    return {
      created: [],
      updated: [],
      deleted: [],
    }
  }
}

describe('project workspace live sync', () => {
  it('reconciles immediately and emits collab file events', async () => {
    const workspaceStore = new WorkspaceStoreDouble()
    const workspaceSyncService = new WorkspaceSyncServiceDouble()
    const now = new Date().toISOString()
    const emitted = {
      created: [] as string[],
      updated: [] as string[],
      deleted: [] as string[],
    }

    workspaceSyncService.nextResults.push({
      created: [
        {
          id: 'f-created',
          projectId: 'project-1',
          path: 'src/new.ts',
          content: 'new',
          storageKey: 'project-1/f-created',
          contentHash: 'hash-new',
          byteSize: 3,
          ownerSubject: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      updated: [
        {
          id: 'f-updated',
          projectId: 'project-1',
          path: 'src/updated.ts',
          content: 'updated',
          storageKey: 'project-1/f-updated',
          contentHash: 'hash-updated',
          byteSize: 7,
          ownerSubject: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      deleted: [
        {
          id: 'f-deleted',
          projectId: 'project-1',
          path: 'src/deleted.ts',
          deletedAt: now,
        },
      ],
    })

    const liveSync = new ProjectWorkspaceLiveSync(
      workspaceStore as never,
      workspaceSyncService as never,
      {
        emitCreated: (file) => {
          emitted.created.push(file.path)
        },
        emitUpdated: (file) => {
          emitted.updated.push(file.path)
        },
        emitDeleted: (file) => {
          emitted.deleted.push(file.path)
        },
      },
    )

    await liveSync.start('project-1')
    await liveSync.reconcileNow('project-1')
    await liveSync.stop('project-1')

    assert.equal(workspaceStore.ensureProjectWorkspaceCalls.length, 1)
    assert.equal(workspaceSyncService.reconcileCalls.length, 1)
    assert.deepEqual(emitted.created, ['src/new.ts'])
    assert.deepEqual(emitted.updated, ['src/updated.ts'])
    assert.deepEqual(emitted.deleted, ['src/deleted.ts'])
  })

  it('uses reference counting for project watchers', async () => {
    const workspaceStore = new WorkspaceStoreDouble()
    const workspaceSyncService = new WorkspaceSyncServiceDouble()
    const liveSync = new ProjectWorkspaceLiveSync(
      workspaceStore as never,
      workspaceSyncService as never,
      {
        emitCreated: () => undefined,
        emitUpdated: () => undefined,
        emitDeleted: () => undefined,
      },
    )

    await liveSync.start('project-2')
    await liveSync.start('project-2')

    await liveSync.stop('project-2')
    await liveSync.reconcileNow('project-2')
    assert.equal(workspaceSyncService.reconcileCalls.length, 1)

    await liveSync.stop('project-2')
    await liveSync.reconcileNow('project-2')
    assert.equal(workspaceSyncService.reconcileCalls.length, 1)
  })
})
