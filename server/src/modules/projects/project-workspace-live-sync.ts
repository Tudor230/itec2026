import { watch, type FSWatcher } from 'node:fs'
import { emitCollabFileCreated, emitCollabFileDeleted, emitCollabFileUpdated } from '../collab/collab-events.js'
import type { ProjectWorkspaceSyncService } from './project-workspace-sync-service.js'
import type { ProjectWorkspaceStore } from './project-workspace-store.js'
import type { FileRecord } from './file.types.js'

interface ProjectWatcherState {
  projectId: string
  refs: number
  watcher: FSWatcher | null
  pollInterval: NodeJS.Timeout | null
  debounceTimer: NodeJS.Timeout | null
  isReconciling: boolean
  reconcileQueued: boolean
}

const DEFAULT_DEBOUNCE_MS = 500
const DEFAULT_POLL_MS = 1000

interface LiveSyncEventEmitter {
  emitCreated: (file: FileRecord) => void
  emitUpdated: (file: FileRecord) => void
  emitDeleted: (file: { id: string; projectId: string; path: string; deletedAt: string }) => void
}

function readPositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

export class ProjectWorkspaceLiveSync {
  private readonly statesByProject = new Map<string, ProjectWatcherState>()

  private readonly debounceMs: number

  private readonly pollMs: number

  constructor(
    private readonly workspaceStore: ProjectWorkspaceStore,
    private readonly workspaceSyncService: ProjectWorkspaceSyncService,
    private readonly events: LiveSyncEventEmitter = {
      emitCreated: (file) => {
        emitCollabFileCreated({
          id: file.id,
          projectId: file.projectId,
          path: file.path,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        })
      },
      emitUpdated: (file) => {
        emitCollabFileUpdated({
          id: file.id,
          projectId: file.projectId,
          path: file.path,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          source: 'workspace_sync',
          content: file.content,
        })
      },
      emitDeleted: (file) => {
        emitCollabFileDeleted({
          id: file.id,
          projectId: file.projectId,
          path: file.path,
          deletedAt: file.deletedAt,
        })
      },
    },
  ) {
    this.debounceMs = readPositiveInt(process.env.COLLAB_WORKSPACE_LIVE_SYNC_DEBOUNCE_MS, DEFAULT_DEBOUNCE_MS)
    this.pollMs = readPositiveInt(process.env.COLLAB_WORKSPACE_LIVE_SYNC_POLL_MS, DEFAULT_POLL_MS)
  }

  async start(projectId: string) {
    const existing = this.statesByProject.get(projectId)
    if (existing) {
      existing.refs += 1
      return
    }

    await this.workspaceStore.ensureProjectWorkspace(projectId)
    const workspacePath = this.workspaceStore.getProjectWorkspacePath(projectId)

    const state: ProjectWatcherState = {
      projectId,
      refs: 1,
      watcher: null,
      pollInterval: null,
      debounceTimer: null,
      isReconciling: false,
      reconcileQueued: false,
    }

    try {
      state.watcher = watch(workspacePath, { recursive: true }, () => {
        this.scheduleReconcile(state)
      })

      state.watcher.on('error', () => {
        this.scheduleReconcile(state)
      })
    } catch {
      state.watcher = null
    }

    state.pollInterval = setInterval(() => {
      this.scheduleReconcile(state)
    }, this.pollMs)

    this.statesByProject.set(projectId, state)
  }

  async stop(projectId: string) {
    const state = this.statesByProject.get(projectId)
    if (!state) {
      return
    }

    state.refs -= 1
    if (state.refs > 0) {
      return
    }

    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
      state.debounceTimer = null
    }

    if (state.watcher) {
      state.watcher.close()
      state.watcher = null
    }

    if (state.pollInterval) {
      clearInterval(state.pollInterval)
      state.pollInterval = null
    }

    this.statesByProject.delete(projectId)
  }

  async reconcileNow(projectId: string) {
    const state = this.statesByProject.get(projectId)
    if (!state) {
      return
    }

    await this.runReconcile(state)
  }

  private scheduleReconcile(state: ProjectWatcherState) {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
    }

    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null
      void this.runReconcile(state)
    }, this.debounceMs)
  }

  private async runReconcile(state: ProjectWatcherState): Promise<void> {
    if (state.isReconciling) {
      state.reconcileQueued = true
      return
    }

    state.isReconciling = true
    try {
      const sync = await this.workspaceSyncService.reconcileProjectWorkspace(state.projectId)

      sync.created.forEach((file) => {
        this.events.emitCreated(file)
      })

      sync.updated.forEach((file) => {
        this.events.emitUpdated(file)
      })

      sync.deleted.forEach((file) => {
        this.events.emitDeleted(file)
      })
    } finally {
      state.isReconciling = false
      if (state.reconcileQueued) {
        state.reconcileQueued = false
        await this.runReconcile(state)
      }
    }
  }
}
