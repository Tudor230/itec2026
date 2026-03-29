import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Code,
  Terminal as TerminalIcon,
  Search,
  Bell,
  GitBranch,
  Layers3,
  Activity,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { motion } from 'framer-motion'
import { useAuthRuntime } from '../auth/AuthProvider'
import AuthSetupNotice from '../components/auth/AuthSetupNotice'
import FileTabs from '../components/workspace/FileTabs'
import FilesSidebar from '../components/workspace/FilesSidebar'
import EditorPane from '../components/workspace/EditorPane'
import QuickOpenModal from '../components/workspace/QuickOpenModal'
import TerminalPane from '../components/workspace/TerminalPane'
import RunButton from '../components/workspace/RunButton'
import RightSidebar from '../components/workspace/RightSidebar'
import type {SidebarTab} from '../components/workspace/RightSidebar';
import BottomDrawers from '../components/workspace/BottomDrawers'
import type {DrawerTab} from '../components/workspace/BottomDrawers';
import WorkspaceSkeleton from '../components/workspace/WorkspaceSkeleton'
import ProfileButton from '../components/profile/ProfileButton'
import { useToast } from '../components/ToastProvider'
import { getWorkspaceShortcut } from '../components/workspace/workspace-shortcuts'
import WorkspaceAuthOverlay from '../components/workspace/WorkspaceAuthOverlay'
import type {AuthTab} from '../components/workspace/WorkspaceAuthOverlay';
import { auth0Config } from '../lib/auth0-config'
import {
  createFolder,
  createProjectInvite,
  createFile,
  deleteFile,
  deleteFolder,
  importFiles,
  listFiles,
  listFolders,
  listProjectInvites,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  renameFolder,
  revokeProjectInvite,
  updateMyProjectMemberProfile,
  updateFile
  
  
  
} from '../services/projects-api'
import type {ActiveProjectInviteDto, FileDto, ProjectMemberDto} from '../services/projects-api';
import {
  buildImportPayload,
  chunkImportFiles,
} from '../lib/file-import'
import type { ImportFileEntry } from '../lib/file-import'
import type {
  CollabDocDirtyStatePayload,
  CollabDocExternalChangePayload,
  CollabFileCreatedPayload,
  CollabFileDeletedPayload,
  CollabFileUpdatedPayload,
  CollabProjectActivityPayload,
} from '../lib/collab-client'
import { getCollaboratorColor } from '../components/workspace/collab-colors'
import { useCollabDoc } from '../hooks/use-collab-doc'
import { useRunCurrentFile } from '../hooks/use-run-current-file'
import { cn } from '../lib/utils'
import { workspaceHudChipClass } from '../components/workspace/ui-classes'

const AUTOSAVE_DELAY_MS = 200

export const Route = createFileRoute('/workspace')({
  validateSearch: (search: Record<string, unknown>) => {
    const normalizedProjectId =
      typeof search.projectId === 'string' ? search.projectId.trim() : ''

    const projectId =
      normalizedProjectId.length > 0 ? normalizedProjectId : undefined

    return {
      projectId,
    }
  },
  component: WorkspaceView,
})

const SIDEBAR_LAYOUT = {
  collapseThresholdPercent: 1,
  expandThresholdPercent: 2,
  left: {
    defaultSize: '16%',
    minSize: '16%',
    maxSize: '38%',
  },
  right: {
    defaultSize: '16%',
    minSize: '16%',
    maxSize: '40%',
  },
}

const workspaceControlButtonClass =
  'border border-[color-mix(in_oklab,var(--chip-line)_76%,var(--line)_24%)] bg-[color-mix(in_oklab,var(--chip-bg)_80%,transparent_20%)] text-[var(--sea-ink-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[color,border-color,background-color,transform] duration-150 hover:text-[var(--sea-ink)] hover:border-[color-mix(in_oklab,var(--lagoon-deep)_34%,var(--chip-line))] hover:-translate-y-px'

function WorkspaceWithHostedAuth() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { toast, success, info, error: toastError } = useToast()
  const {
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
    error,
  } = useAuth0()
  const queryClient = useQueryClient()
  const isLocked = !isAuthenticated

  async function getApiAccessToken() {
    return getAccessTokenSilently({
      authorizationParams: {
        audience: auth0Config.audience,
      },
    }).catch(() => null)
  }

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [openFileIds, setOpenFileIds] = useState<string[]>([])
  const [draftsByFileId, setDraftsByFileId] = useState<Record<string, string>>(
    {},
  )
  const [collabDirtyByFileId, setCollabDirtyByFileId] = useState<
    Record<string, boolean>
  >({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)
  const [rightSidebarTab, setRightSidebarTab] = useState<SidebarTab>('ai')
  const [centerView, setCenterView] = useState<'editor' | 'terminal'>('editor')
  const [isQuickOpenVisible, setIsQuickOpenVisible] = useState(false)
  const [authPanelOpen, setAuthPanelOpen] = useState(true)
  const [authTab, setAuthTab] = useState<AuthTab>('login')
  const [authActionPending, setAuthActionPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [bottomDrawerTab, setBottomDrawerTab] = useState<DrawerTab | null>(null)
  const [hasClosedAllTabs, setHasClosedAllTabs] = useState(false)
  const [virtualFoldersByProjectId, setVirtualFoldersByProjectId] = useState<
    Record<string, string[]>
  >({})
  const [inviteLinksByInviteId, setInviteLinksByInviteId] = useState<
    Record<string, string>
  >({})
  const [collabActivityByFileId, setCollabActivityByFileId] = useState<
    Record<string, string[]>
  >({})
  const collabRefreshTimerRef = useRef<number | null>(null)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const activeFileIdRef = useRef<string | null>(null)
  const leftPanelRef = usePanelRef()
  const rightPanelRef = usePanelRef()

  const authRuntimeError = error
    ? 'Authentication failed. Please try again.'
    : null

  const startHostedAuth = async (
    mode: AuthTab,
    connection?: 'google-oauth2' | 'github',
  ) => {
    setAuthError(null)
    setAuthActionPending(true)

    try {
      await loginWithRedirect({
        appState: {
          returnTo: window.location.pathname + window.location.search,
        },
        authorizationParams: {
          redirect_uri: auth0Config.redirectUri,
          screen_hint: mode === 'register' ? 'signup' : undefined,
          connection,
        },
      })
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not start login flow.'
      setAuthError(message)
      setAuthActionPending(false)
    }
  }

  const projectsQuery = useQuery({
    queryKey: ['workspace', 'projects', isAuthenticated],
    queryFn: async () => {
      const token = await getApiAccessToken()

      if (!token) {
        return []
      }

      return listProjects(token)
    },
    enabled: isAuthenticated,
  })

  const filesQuery = useQuery({
    queryKey: ['workspace', 'files', isAuthenticated, activeProjectId],
    queryFn: async () => {
      const token = await getApiAccessToken()

      if (!activeProjectId || !token) {
        return [] as FileDto[]
      }

      return listFiles(activeProjectId, token)
    },
    enabled: isAuthenticated && activeProjectId !== null,
  })

  const foldersQuery = useQuery({
    queryKey: ['workspace', 'folders', isAuthenticated, activeProjectId],
    queryFn: async () => {
      const token = await getApiAccessToken()

      if (!activeProjectId || !token) {
        return [] as { path: string }[]
      }

      return listFolders(activeProjectId, token)
    },
    enabled: isAuthenticated && activeProjectId !== null,
  })

  const projectMembersQuery = useQuery({
    queryKey: [
      'workspace',
      'project-members',
      isAuthenticated,
      activeProjectId,
    ],
    queryFn: async () => {
      const token = await getApiAccessToken()

      if (!activeProjectId || !token) {
        return [] as ProjectMemberDto[]
      }

      return listProjectMembers(activeProjectId, token)
    },
    enabled: isAuthenticated && activeProjectId !== null,
  })

  const profileSnapshotMutation = useMutation({
    mutationFn: async () => {
      const token = await getApiAccessToken()

      if (!activeProjectId || !token) {
        return { updated: false }
      }

      const email = user?.email?.trim() || undefined
      const fallbackFromEmail = email?.split('@')[0]?.trim() || undefined
      const displayName =
        user?.name?.trim() || user?.nickname?.trim() || fallbackFromEmail
      if (!displayName) {
        return { updated: false }
      }

      return updateMyProjectMemberProfile(
        activeProjectId,
        { displayName, email },
        token,
      )
    },
    onSuccess: async (result) => {
      if (!result.updated) {
        return
      }

      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'project-members'],
      })
    },
  })

  const activeInvitesQuery = useQuery({
    queryKey: [
      'workspace',
      'project-invites',
      isAuthenticated,
      activeProjectId,
    ],
    queryFn: async () => {
      const token = await getApiAccessToken()

      if (!activeProjectId || !token) {
        return [] as ActiveProjectInviteDto[]
      }

      return listProjectInvites(activeProjectId, token)
    },
    enabled: isAuthenticated && activeProjectId !== null,
  })

  const upsertFileInCache = useCallback(
    (incomingFile: FileDto) => {
      queryClient.setQueryData<FileDto[]>(
        ['workspace', 'files', true, incomingFile.projectId],
        (previous) => {
          const current = previous ?? []
          const exists = current.some((file) => file.id === incomingFile.id)

          const next = exists
            ? current.map((file) =>
                file.id === incomingFile.id ? incomingFile : file,
              )
            : [incomingFile, ...current]

          return [...next].sort((left, right) => {
            return (
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime()
            )
          })
        },
      )
    },
    [queryClient],
  )

  const onCollabFileCreated = useCallback(
    (payload: CollabFileCreatedPayload) => {
      upsertFileInCache({
        ...payload,
        content: '',
        ownerSubject: null,
      })
    },
    [upsertFileInCache],
  )

  const onCollabFileUpdated = useCallback(
    (payload: CollabFileUpdatedPayload) => {
      queryClient
        .invalidateQueries({
          queryKey: ['workspace', 'files', true, payload.projectId],
        })
        .catch(() => undefined)
    },
    [queryClient],
  )

  const onCollabFileDeleted = useCallback(
    (payload: CollabFileDeletedPayload) => {
      queryClient.setQueryData<FileDto[]>(
        ['workspace', 'files', true, payload.projectId],
        (previous) => (previous ?? []).filter((file) => file.id !== payload.id),
      )

      setOpenFileIds((previous) =>
        previous.filter((fileId) => fileId !== payload.id),
      )
      setDraftsByFileId((previous) => {
        if (!(payload.id in previous)) {
          return previous
        }

        const next = { ...previous }
        delete next[payload.id]
        return next
      })

      setCollabDirtyByFileId((previous) => {
        if (!(payload.id in previous)) {
          return previous
        }

        const next = { ...previous }
        delete next[payload.id]
        return next
      })

      setActiveFileId((previous) => (previous === payload.id ? null : previous))
    },
    [queryClient],
  )

  const onCollabDirtyStateChanged = useCallback(
    (payload: CollabDocDirtyStatePayload) => {
      setCollabDirtyByFileId((previous) => {
        if (payload.isDirty) {
          if (previous[payload.fileId]) {
            return previous
          }

          return {
            ...previous,
            [payload.fileId]: true,
          }
        }

        if (!(payload.fileId in previous)) {
          return previous
        }

        const next = { ...previous }
        delete next[payload.fileId]
        return next
      })

      if (!payload.isDirty) {
        queryClient
          .invalidateQueries({
            queryKey: ['workspace', 'files', true, payload.projectId],
          })
          .catch(() => {
            return undefined
          })
      }
    },
    [queryClient],
  )

  const onProjectActivityChanged = useCallback(
    (payload: CollabProjectActivityPayload) => {
      setCollabActivityByFileId((previous) => {
        const next = { ...previous }

        Object.keys(next).forEach((fileId) => {
          const filtered = next[fileId].filter(
            (subject) => subject !== payload.subject,
          )
          if (filtered.length === 0) {
            delete next[fileId]
            return
          }

          next[fileId] = filtered
        })

        if (!payload.cleared && payload.fileId) {
          const existing = next[payload.fileId] ?? []
          if (!existing.includes(payload.subject)) {
            next[payload.fileId] = [...existing, payload.subject]
          }
        }

        return next
      })
    },
    [],
  )

  const onCollabExternalDocChange = useCallback((payload: CollabDocExternalChangePayload) => {
    if (payload.state === 'stale') {
      setCollabDirtyByFileId((previous) => {
        if (previous[payload.fileId]) {
          return previous
        }

        return {
          ...previous,
          [payload.fileId]: true,
        }
      })

      if (payload.fileId === activeFileIdRef.current) {
        toastError('File changed externally. Save your edits or reopen to sync.')
      }

      return
    }

    setCollabDirtyByFileId((previous) => {
      if (!(payload.fileId in previous)) {
        return previous
      }

      const next = { ...previous }
      delete next[payload.fileId]
      return next
    })

    queryClient.invalidateQueries({
      queryKey: ['workspace', 'files', true, payload.projectId],
    }).catch(() => undefined)

    if (payload.fileId === activeFileIdRef.current) {
      info('Editor reloaded with terminal changes')
    }
  }, [info, queryClient, toastError])

  const createFileMutation = useMutation({
    mutationFn: async (path: string) => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        throw new Error('Select a project before creating files.')
      }

      if (!token) {
        throw new Error('Authentication token is required to create files.')
      }

      return createFile(
        {
          projectId: activeProjectId,
          path,
          content: '',
        },
        token,
      )
    },
    onSuccess: async (createdFile) => {
      setCreateError(null)
      upsertFileInCache(createdFile)
      success(`File created: ${createdFile.path.split('/').pop()}`)
      setActiveFileId(createdFile.id)
      setOpenFileIds((previous) =>
        previous.includes(createdFile.id)
          ? previous
          : [...previous, createdFile.id],
      )
      setDraftsByFileId((previous) => {
        const next = { ...previous }
        delete next[createdFile.id]
        return next
      })

      await queryClient.invalidateQueries({ queryKey: ['workspace', 'files'] })
    },
    onError: (error) => {
      setCreateError(error.message)
      toastError(`Could not create file: ${error.message}`)
    },
  })

  const renameFileMutation = useMutation({
    mutationFn: async (input: { fileId: string; path: string }) => {
      const token = await getApiAccessToken()
      if (!token) {
        throw new Error('Authentication token is required to rename files.')
      }

      return updateFile(input.fileId, { path: input.path }, token)
    },
    onSuccess: async (updated) => {
      upsertFileInCache(updated)
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'files'] })
      success(`Renamed to ${updated.path.split('/').pop()}`)
    },
    onError: (error) => {
      toastError(`Could not rename file: ${error.message}`)
    },
  })

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const token = await getApiAccessToken()
      if (!token) {
        throw new Error('Authentication token is required to delete files.')
      }

      return deleteFile(fileId, token)
    },
    onSuccess: async (_result, fileId) => {
      closeTabById(fileId)
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'files'] })
      success('File deleted')
    },
    onError: (error) => {
      toastError(`Could not delete file: ${error.message}`)
    },
  })

  const createFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        throw new Error('Select a project before creating folders.')
      }

      if (!token) {
        throw new Error('Authentication token is required to create folders.')
      }

      return createFolder({ projectId: activeProjectId, path }, token)
    },
    onSuccess: async (createdFolder) => {
      if (activeProjectId) {
        setVirtualFoldersByProjectId((previous) => {
          const current = previous[activeProjectId] ?? []
          if (current.includes(createdFolder.path)) {
            return previous
          }

          return {
            ...previous,
            [activeProjectId]: [...current, createdFolder.path],
          }
        })
      }

      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'folders'],
      })
      success('Folder created')
    },
    onError: (error) => {
      toastError(`Could not create folder: ${error.message}`)
    },
  })

  const renameFolderMutation = useMutation({
    mutationFn: async (input: { fromPath: string; toPath: string }) => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        throw new Error('Select a project before renaming folders.')
      }

      if (!token) {
        throw new Error('Authentication token is required to rename folders.')
      }

      return renameFolder(
        {
          projectId: activeProjectId,
          fromPath: input.fromPath,
          toPath: input.toPath,
        },
        token,
      )
    },
    onSuccess: async (_result, input) => {
      if (activeProjectId) {
        setVirtualFoldersByProjectId((previous) => {
          const current = previous[activeProjectId] ?? []
          const next = current.map((folderPath) => {
            if (folderPath === input.fromPath) {
              return input.toPath
            }

            if (folderPath.startsWith(`${input.fromPath}/`)) {
              return `${input.toPath}${folderPath.slice(input.fromPath.length)}`
            }

            return folderPath
          })

          return {
            ...previous,
            [activeProjectId]: [...new Set(next)],
          }
        })
      }

      await queryClient.invalidateQueries({ queryKey: ['workspace', 'files'] })
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'folders'],
      })
      success('Folder renamed')
    },
    onError: (error) => {
      toastError(`Could not rename folder: ${error.message}`)
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: async (path: string) => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        throw new Error('Select a project before deleting folders.')
      }

      if (!token) {
        throw new Error('Authentication token is required to delete folders.')
      }

      return deleteFolder({ projectId: activeProjectId, path }, token)
    },
    onSuccess: async (_result, folderPath) => {
      if (activeProjectId) {
        setVirtualFoldersByProjectId((previous) => {
          const current = previous[activeProjectId] ?? []
          const next = current.filter((entry) => {
            return !(entry === folderPath || entry.startsWith(`${folderPath}/`))
          })

          return {
            ...previous,
            [activeProjectId]: next,
          }
        })
      }

      setOpenFileIds((previous) => {
        const next = previous.filter((fileId) => {
          const file = files.find((candidate) => candidate.id === fileId)
          if (!file) {
            return false
          }

          return !(
            file.path === folderPath || file.path.startsWith(`${folderPath}/`)
          )
        })

        return next
      })

      await queryClient.invalidateQueries({ queryKey: ['workspace', 'files'] })
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'folders'],
      })
      success('Folder deleted')
    },
    onError: (error) => {
      toastError(`Could not delete folder: ${error.message}`)
    },
  })

  const importFilesMutation = useMutation({
    mutationFn: async (input: {
      entries: ImportFileEntry[]
      targetFolderPath: string | null
      conflictStrategy?: 'skip' | 'overwrite' | 'fail'
    }) => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        throw new Error('Select a project before importing files.')
      }

      if (!token) {
        throw new Error('Authentication token is required to import files.')
      }

      const payload = await buildImportPayload(input.entries, {
        targetPrefix: input.targetFolderPath,
      })

      if (payload.files.length === 0) {
        throw new Error('No text files to import from the selected source.')
      }

      const chunks = chunkImportFiles(payload.files)
      const aggregated = {
        created: [] as Awaited<ReturnType<typeof importFiles>>['created'],
        updated: [] as Awaited<ReturnType<typeof importFiles>>['updated'],
        skipped: [] as Awaited<ReturnType<typeof importFiles>>['skipped'],
      }

      for (const filesChunk of chunks) {
        const result = await importFiles(
          {
            projectId: activeProjectId,
            files: filesChunk,
            conflictStrategy: input.conflictStrategy ?? 'skip',
          },
          token,
        )

        aggregated.created.push(...result.created)
        aggregated.updated.push(...result.updated)
        aggregated.skipped.push(...result.skipped)
      }

      return {
        ...aggregated,
        skippedByClient: payload.skippedCount,
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'files'] })
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'folders'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'projects'],
      })

      const totalSkipped = result.skipped.length + result.skippedByClient
      const importedCount = result.created.length + result.updated.length

      if (importedCount < 1) {
        success(
          `Import complete. Skipped ${totalSkipped} file${totalSkipped === 1 ? '' : 's'}.`,
        )
        return
      }

      success(
        `Imported ${importedCount} file${importedCount === 1 ? '' : 's'}${totalSkipped > 0 ? `, skipped ${totalSkipped}` : ''}.`,
      )
    },
    onError: (error) => {
      toastError(`Could not import files: ${error.message}`)
    },
  })

  const saveFileMutation = useMutation({
    mutationFn: async (input: { fileId: string; content: string }) => {
      const token = await getApiAccessToken()

      if (!token) {
        throw new Error('Authentication token is required to save files.')
      }

      return updateFile(input.fileId, { content: input.content }, token)
    },
    onSuccess: async (updated) => {
      setSaveError(null)
      upsertFileInCache(updated)
      markSaved(updated.projectId, updated.id)
      setDraftsByFileId((previous) => {
        const latestDraft = previous[updated.id]
        if (latestDraft && latestDraft !== updated.content) {
          return previous
        }

        const next = { ...previous }
        delete next[updated.id]
        return next
      })

      await queryClient.invalidateQueries({ queryKey: ['workspace', 'files'] })
    },
    onError: (error) => {
      setSaveError(error.message)
      toastError(`Save failed: ${error.message}`)
    },
  })

  const clearAutosaveTimeout = useCallback(() => {
    if (autosaveTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(autosaveTimeoutRef.current)
    autosaveTimeoutRef.current = null
  }, [])

  const triggerSave = useCallback(
    (fileId: string, content: string) => {
      clearAutosaveTimeout()

      if (saveFileMutation.isPending) {
        return
      }

      void saveFileMutation.mutateAsync({
        fileId,
        content,
      })
    },
    [clearAutosaveTimeout, saveFileMutation],
  )

  const files = filesQuery.data ?? []
  const activeFile = files.find((file) => file.id === activeFileId) ?? null
  const openTabs = openFileIds
    .map((fileId) => files.find((file) => file.id === fileId))
    .filter((file): file is FileDto => file !== undefined)
  const editorValue = activeFile
    ? (draftsByFileId[activeFile.id] ?? activeFile.content)
    : ''
  const localIsDirty = activeFile
    ? (draftsByFileId[activeFile.id] ?? activeFile.content) !==
      activeFile.content
    : false
  const isDirty = activeFile
    ? localIsDirty || Boolean(collabDirtyByFileId[activeFile.id])
    : false
  const {
    queuedTerminalCommand,
    runCurrentFile,
    clearQueuedTerminalCommand,
    resetQueuedTerminalCommand,
  } = useRunCurrentFile({
    activeFilePath: activeFile?.path ?? null,
    onRunStart: () => {
      setCenterView('terminal')
      setBottomDrawerTab('run')
    },
    onRunError: toastError,
  })

  useEffect(() => {
    clearAutosaveTimeout()

    if (!isAuthenticated || !activeFile || !localIsDirty) {
      return
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      if (saveFileMutation.isPending) {
        return
      }

      triggerSave(activeFile.id, editorValue)
    }, AUTOSAVE_DELAY_MS)

    return clearAutosaveTimeout
  }, [
    activeFile,
    clearAutosaveTimeout,
    editorValue,
    isAuthenticated,
    localIsDirty,
    saveFileMutation.isPending,
    triggerSave,
  ])

  const dirtyFileIds = files
    .filter((file) => {
      const draftValue = draftsByFileId[file.id]
      const locallyDirty = draftValue ? draftValue !== file.content : false
      return locallyDirty || Boolean(collabDirtyByFileId[file.id])
    })
    .map((file) => file.id)
  const dirtyFileCount = dirtyFileIds.length
  const virtualFolders = useMemo(() => {
    if (!activeProjectId) {
      return []
    }

    const backendFolders = (foldersQuery.data ?? []).map(
      (folder) => folder.path,
    )
    const localFolders = virtualFoldersByProjectId[activeProjectId] ?? []

    return [...new Set([...backendFolders, ...localFolders])]
  }, [activeProjectId, foldersQuery.data, virtualFoldersByProjectId])

  const collabMembers = useMemo(() => {
    const apiMembers = projectMembersQuery.data ?? []
    const currentSubject = user?.sub ?? null

    const mapped = apiMembers.map((member) => {
      const isYou = currentSubject !== null && member.subject === currentSubject
      const email = member.email?.trim() || 'Not available'
      const fallbackFromEmail =
        email !== 'Not available'
          ? email.split('@')[0]?.trim() || undefined
          : undefined

      return {
        id: member.subject,
        name: member.displayName?.trim() || fallbackFromEmail || 'Unknown user',
        email,
        role: member.role,
        isYou,
      }
    })

    return mapped
  }, [projectMembersQuery.data, user])

  const collaboratorNameBySubject = useMemo(() => {
    return collabMembers.reduce<Record<string, string>>(
      (accumulator, member) => {
        accumulator[member.id] = member.name
        return accumulator
      },
      {},
    )
  }, [collabMembers])

  const resolveCollaboratorName = useCallback(
    (subject: string) => {
      return collaboratorNameBySubject[subject] ?? 'Collaborator'
    },
    [collaboratorNameBySubject],
  )

  const { collabState, onEditorMount, markSaved } = useCollabDoc({
    projectId: activeProjectId,
    fileId: activeFileId,
    onFileCreated: onCollabFileCreated,
    onFileUpdated: onCollabFileUpdated,
    onFileDeleted: onCollabFileDeleted,
    onDirtyStateChanged: onCollabDirtyStateChanged,
    onProjectActivityChanged,
    onExternalDocChange: onCollabExternalDocChange,
    resolveCollaboratorName,
  })

  const selectedProject =
    projectsQuery.data?.find((project) => project.id === activeProjectId) ??
    null

  const collaboratorInitials = useMemo(() => {
    return collabMembers.slice(0, 3).map((member) => {
      const words = member.name.split(/\s+/).filter((word) => word.length > 0)
      if (words.length === 0) {
        return member.name.slice(0, 2).toUpperCase()
      }

      if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase()
      }

      const firstInitial = words[0][0]
      const secondInitial = words[1][0]

      return `${firstInitial}${secondInitial}`.toUpperCase()
    })
  }, [collabMembers])

  const collabActivityOutlineByFileId = useMemo(() => {
    const entries = Object.entries(collabActivityByFileId)
    const mapped: Record<string, string> = {}

    entries.forEach(([fileId, subjects]) => {
      const firstSubject = subjects[0]
      if (!firstSubject) {
        return
      }

      mapped[fileId] = getCollaboratorColor(firstSubject)
    })

    return mapped
  }, [collabActivityByFileId])

  const activeInviteLinks = useMemo(() => {
    return (activeInvitesQuery.data ?? []).map((invite) => {
      return {
        id: invite.id,
        url: inviteLinksByInviteId[invite.id] ?? `Invite ${invite.id}`,
        hasLink: Boolean(inviteLinksByInviteId[invite.id]),
        expiresAt: invite.expiresAt,
      }
    })
  }, [activeInvitesQuery.data, inviteLinksByInviteId])

  useEffect(() => {
    setInviteLinksByInviteId({})
  }, [activeProjectId])

  useEffect(() => {
    if (!activeProjectId || !isAuthenticated) {
      return
    }

    if (profileSnapshotMutation.isPending) {
      return
    }

    void profileSnapshotMutation.mutateAsync()
  }, [
    activeProjectId,
    isAuthenticated,
    profileSnapshotMutation,
    user?.email,
    user?.name,
    user?.nickname,
  ])

  useEffect(() => {
    setCollabActivityByFileId({})
  }, [activeProjectId])

  const createInviteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const token = await getApiAccessToken()

      if (!token) {
        throw new Error('Authentication token is required to create invites.')
      }

      return createProjectInvite(projectId, token)
    },
    onSuccess: async (invite) => {
      const inviteLink = `${window.location.origin}/invite/${invite.inviteToken}`

      setInviteLinksByInviteId((previous) => {
        return {
          ...previous,
          [invite.id]: inviteLink,
        }
      })

      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'project-invites'],
      })

      try {
        await navigator.clipboard.writeText(inviteLink)
        success('Invite link copied to clipboard')
      } catch {
        toast(`Invite link: ${inviteLink}`, 'info', 10000)
      }
    },
    onError: (error) => {
      toastError(`Could not create invite: ${error.message}`)
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        throw new Error('Select a project before revoking invites.')
      }

      if (!token) {
        throw new Error('Authentication token is required to revoke invites.')
      }

      return revokeProjectInvite(activeProjectId, { inviteId }, token)
    },
    onSuccess: async (_result, inviteId) => {
      setInviteLinksByInviteId((previous) => {
        if (!(inviteId in previous)) {
          return previous
        }

        const next = { ...previous }
        delete next[inviteId]
        return next
      })

      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'project-invites'],
      })
      success('Invite link invalidated')
    },
    onError: (error) => {
      toastError(`Could not invalidate invite: ${error.message}`)
    },
  })

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveProjectId(null)
      return
    }

    if (!projectsQuery.data || projectsQuery.data.length === 0) {
      setActiveProjectId(null)
      return
    }

    if (search.projectId) {
      const requestedProject = projectsQuery.data.find(
        (project) => project.id === search.projectId,
      )

      if (requestedProject) {
        if (activeProjectId !== requestedProject.id) {
          setActiveProjectId(requestedProject.id)
        }
        return
      }
    }

    if (!activeProjectId) {
      setActiveProjectId(projectsQuery.data[0].id)
      return
    }

    const stillExists = projectsQuery.data.some(
      (project) => project.id === activeProjectId,
    )
    if (!stillExists) {
      setActiveProjectId(projectsQuery.data[0].id)
    }
  }, [activeProjectId, isAuthenticated, projectsQuery.data, search.projectId])

  useEffect(() => {
    activeFileIdRef.current = activeFileId
  }, [activeFileId])

  useEffect(() => {
    setActiveFileId(null)
    setOpenFileIds([])
    resetQueuedTerminalCommand()
    setHasClosedAllTabs(false)
    setDraftsByFileId({})
    setCollabDirtyByFileId({})
    setSaveError(null)
    setCreateError(null)
    clearAutosaveTimeout()
  }, [activeProjectId, clearAutosaveTimeout, resetQueuedTerminalCommand])

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveFileId(null)
      return
    }

    if (!filesQuery.data) {
      return
    }

    if (filesQuery.data.length === 0) {
      setActiveFileId(null)
      setOpenFileIds([])
      return
    }

    if (!activeFileId) {
      if (hasClosedAllTabs) {
        return
      }

      const firstFileId = filesQuery.data[0].id
      setActiveFileId(firstFileId)
      setOpenFileIds((previous) =>
        previous.includes(firstFileId) ? previous : [...previous, firstFileId],
      )
      return
    }

    const stillExists = filesQuery.data.some((file) => file.id === activeFileId)
    if (!stillExists) {
      const firstFileId = filesQuery.data[0].id
      setActiveFileId(firstFileId)
      setOpenFileIds((previous) =>
        previous.includes(firstFileId) ? previous : [...previous, firstFileId],
      )
    }
  }, [activeFileId, filesQuery.data, hasClosedAllTabs, isAuthenticated])

  useEffect(() => {
    if (!filesQuery.data) {
      return
    }

    setOpenFileIds((previous) => {
      const fileIds = new Set(filesQuery.data.map((file) => file.id))
      const next = previous.filter((fileId) => fileIds.has(fileId))

      if (next.length === previous.length) {
        return previous
      }

      return next
    })
  }, [filesQuery.data])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = getWorkspaceShortcut(event)

      if (shortcut === 'quick-open') {
        event.preventDefault()
        setIsQuickOpenVisible(true)
        return
      }

      if (shortcut === 'toggle-sidebar') {
        event.preventDefault()
        setIsLeftSidebarCollapsed((current) => !current)
        return
      }

      if (shortcut === 'toggle-terminal') {
        event.preventDefault()
        setCenterView((current) =>
          current === 'editor' ? 'terminal' : 'editor',
        )
        return
      }

      if (shortcut === 'command-palette') {
        event.preventDefault()
        setIsQuickOpenVisible(true)
        return
      }

      if (shortcut !== 'save') {
        return
      }

      event.preventDefault()

      if (!activeFile || !localIsDirty || saveFileMutation.isPending) {
        return
      }

      triggerSave(activeFile.id, editorValue)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [
    activeFile,
    editorValue,
    isAuthenticated,
    localIsDirty,
    saveFileMutation.isPending,
    triggerSave,
  ])

  useEffect(() => {
    if (isAuthenticated) {
      setAuthActionPending(false)
      setAuthError(null)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isLeftSidebarCollapsed) {
      return
    }

    const leftPanel = leftPanelRef.current

    if (!leftPanel) {
      return
    }

    const leftSize = leftPanel.getSize().asPercentage
    if (leftSize > SIDEBAR_LAYOUT.collapseThresholdPercent) {
      leftPanel.resize(0)
    }
  }, [isLeftSidebarCollapsed, leftPanelRef])

  useEffect(() => {
    const leftPanel = leftPanelRef.current

    if (!leftPanel) {
      return
    }

    if (isLeftSidebarCollapsed) {
      return
    }

    const leftSize = leftPanel.getSize().asPercentage
    if (leftSize <= SIDEBAR_LAYOUT.expandThresholdPercent) {
      leftPanel.resize(SIDEBAR_LAYOUT.left.minSize)
    }
  }, [isLeftSidebarCollapsed, leftPanelRef])

  useEffect(() => {
    const rightPanel = rightPanelRef.current

    if (!rightPanel) {
      return
    }

    if (!isRightSidebarOpen) {
      const rightSize = rightPanel.getSize().asPercentage
      if (rightSize > SIDEBAR_LAYOUT.collapseThresholdPercent) {
        rightPanel.resize(0)
      }
      return
    }

    const rightSize = rightPanel.getSize().asPercentage
    if (rightSize <= SIDEBAR_LAYOUT.expandThresholdPercent) {
      rightPanel.resize(SIDEBAR_LAYOUT.right.minSize)
    }
  }, [isRightSidebarOpen, rightPanelRef])

  const openFileById = (fileId: string) => {
    setHasClosedAllTabs(false)
    setActiveFileId(fileId)
    setSaveError(null)
    setCenterView('editor')
    setOpenFileIds((previous) => {
      if (previous.includes(fileId)) {
        return previous
      }

      return [...previous, fileId]
    })
  }

  const closeTabById = (fileId: string) => {
    setOpenFileIds((previous) => {
      const next = previous.filter((candidate) => candidate !== fileId)

      if (next.length === 0) {
        setHasClosedAllTabs(true)
      }

      if (activeFileId === fileId) {
        const closedIndex = previous.indexOf(fileId)
        const fallbackId = next[Math.max(0, closedIndex - 1)] || null
        setActiveFileId(fallbackId)
      }

      return next
    })

    setDraftsByFileId((previous) => {
      if (!(fileId in previous)) {
        return previous
      }

      const next = { ...previous }
      delete next[fileId]
      return next
    })
  }

  const closeOthers = (fileId: string) => {
    setHasClosedAllTabs(false)
    setOpenFileIds([fileId])
    setActiveFileId(fileId)
    setDraftsByFileId((previous) => {
      const next: Record<string, string> = {}
      if (fileId in previous) next[fileId] = previous[fileId]
      return next
    })
  }

  const closeAll = () => {
    setHasClosedAllTabs(true)
    setOpenFileIds([])
    setActiveFileId(null)
    setDraftsByFileId({})
  }

  if (isLoading && isAuthenticated) {
    return <WorkspaceSkeleton />
  }

  const lockedContentProps = isLocked
    ? ({
        'aria-hidden': true,
        inert: true,
      } as const)
    : {}

  return (
    <main className="relative isolate m-0 h-dvh w-screen bg-[linear-gradient(160deg,color-mix(in_oklab,var(--bg-base)_88%,var(--foam)_12%)_0%,color-mix(in_oklab,var(--bg-base)_92%,black_8%)_100%)] p-0 before:pointer-events-none before:absolute before:inset-0 before:-z-[2] before:opacity-[0.34] before:[background:radial-gradient(circle_at_14%_16%,rgba(255,255,255,0.58),transparent_34%),radial-gradient(circle_at_84%_24%,color-mix(in_oklab,var(--lagoon)_38%,transparent),transparent_42%),radial-gradient(circle_at_48%_84%,color-mix(in_oklab,var(--palm)_28%,transparent),transparent_46%)] after:pointer-events-none after:absolute after:inset-0 after:-z-[1] after:opacity-[0.12] after:[background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] after:[background-size:26px_26px] after:[mask-image:radial-gradient(circle_at_50%_30%,black,transparent_78%)]">
      <section className="relative flex h-full min-h-0 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[rgba(var(--lagoon-rgb),0.2)] blur-[110px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-16 h-64 w-64 rounded-full bg-[rgba(47,106,74,0.16)] blur-[100px]"
        />
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-hidden',
            isLocked &&
              'pointer-events-none select-none [transform:scale(0.998)] [filter:blur(12px)_saturate(0.86)]',
          )}
          {...lockedContentProps}
        >
          <div className="grid items-center gap-3 border-b border-[color-mix(in_oklab,var(--line)_82%,var(--lagoon)_18%)] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--surface-strong)_78%,transparent),color-mix(in_oklab,var(--surface)_76%,transparent))] px-4 py-2.5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--inset-glint)_74%,transparent),0_8px_20px_rgba(12,28,34,0.14)] backdrop-blur-[16px] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => navigate({ to: '/projects' })}
                aria-label="Back to projects"
                className={cn(
                  workspaceControlButtonClass,
                  'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                )}
                title="Back to projects"
              >
                <ArrowLeft size={14} />
              </button>

              <div className="relative min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.64)] px-3 py-2">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-16 w-16 rounded-full bg-[rgba(var(--lagoon-rgb),0.16)] blur-2xl"
                />
                <div className="relative flex min-w-0 items-center gap-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.66)] text-[var(--lagoon-deep)]">
                    <Layers3 size={13} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sea-ink-soft)]">
                      Command Deck
                    </span>
                    <h1 className="m-0 truncate text-sm font-extrabold leading-none text-[var(--sea-ink)]">
                      {selectedProject ? selectedProject.name : 'iTECify IDE'}
                    </h1>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative flex rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.62)] p-1 shadow-[0_6px_18px_rgba(8,22,28,0.16)] backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setCenterView('editor')}
                  className={cn(
                    'relative px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all z-10',
                    centerView === 'editor'
                      ? 'text-white'
                      : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
                  )}
                >
                  <Code size={14} />
                  <span>Editor</span>
                  {centerView === 'editor' && (
                    <motion.div
                      layoutId="workspace-view-toggle"
                      className="absolute inset-0 bg-[var(--lagoon)] rounded-lg -z-10 shadow-md"
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCenterView('terminal')}
                  className={cn(
                    'relative px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all z-10',
                    centerView === 'terminal'
                      ? 'text-white'
                      : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
                  )}
                >
                  <TerminalIcon size={14} />
                  <span>Terminal</span>
                  {centerView === 'terminal' && (
                    <motion.div
                      layoutId="workspace-view-toggle"
                      className="absolute inset-0 bg-[var(--lagoon)] rounded-lg -z-10 shadow-md"
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <div className="hidden items-center gap-1.5 lg:flex">
                <span className={workspaceHudChipClass}>
                  <GitBranch size={11} /> main
                </span>
                <span className={workspaceHudChipClass}>
                  <Activity size={11} />{' '}
                  {dirtyFileCount === 0 ? 'Clean' : `${dirtyFileCount} Unsaved`}
                </span>
              </div>

              <RunButton
                onRunRequest={runCurrentFile}
                label="Run current file"
              />

              <div className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.58)] p-1.5 shadow-[0_5px_14px_rgba(9,25,30,0.12)] backdrop-blur-sm">
                <button
                  type="button"
                  aria-label="Search"
                  className={cn(
                    workspaceControlButtonClass,
                    'rounded-md p-1.5 transition-colors',
                  )}
                  title="Search"
                >
                  <Search size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Notifications"
                  className={cn(
                    workspaceControlButtonClass,
                    'rounded-md p-1.5 transition-colors',
                  )}
                  title="Notifications"
                >
                  <Bell size={14} />
                </button>
                <div className="w-[1px] h-4 bg-[var(--line)]" />
                <ProfileButton
                  onLogout={() => {
                    void logout({
                      logoutParams: { returnTo: window.location.origin },
                    })
                  }}
                />
              </div>
            </div>
          </div>

          <FileTabs
            tabs={openTabs.map((file) => {
              const draftValue = draftsByFileId[file.id]
              const localDirty = draftValue ? draftValue !== file.content : false
              const dirty = localDirty || Boolean(collabDirtyByFileId[file.id])

              return {
                id: file.id,
                path: file.path,
                isActive: file.id === activeFileId,
                isDirty: dirty,
              }
            })}
            onSelectTab={openFileById}
            onCloseTab={closeTabById}
            onCloseOthers={closeOthers}
            onCloseAll={closeAll}
            collaborators={collaboratorInitials}
            onOpenCollaboration={() => setBottomDrawerTab('collab')}
          />

          <Group
            id="workspace-layout-panels"
            orientation="horizontal"
            className="flex-1 min-h-0 min-w-0"
            resizeTargetMinimumSize={{ coarse: 28, fine: 16 }}
            onLayoutChanged={(nextLayout) => {
              const nextLeftSize = nextLayout['left-sidebar'] ?? 0
              const nextRightSize = nextLayout['right-sidebar'] ?? 0
              const isLeftCollapsedNext =
                nextLeftSize <= SIDEBAR_LAYOUT.collapseThresholdPercent
              const isRightCollapsedNext =
                nextRightSize <= SIDEBAR_LAYOUT.collapseThresholdPercent

              if (isLeftSidebarCollapsed !== isLeftCollapsedNext) {
                setIsLeftSidebarCollapsed(isLeftCollapsedNext)
              }

              if (!isLeftCollapsedNext) {
                // noop: sidebar opens at min size by design
              }

              if (isRightSidebarOpen === isRightCollapsedNext) {
                setIsRightSidebarOpen(!isRightCollapsedNext)
              }

              if (!isRightCollapsedNext) {
                // noop: sidebar opens at min size by design
              }
            }}
          >
            {/* Left Sidebar Panel */}
            <Panel
              id="left-sidebar"
              panelRef={leftPanelRef}
              collapsible
              collapsedSize="0%"
              defaultSize={SIDEBAR_LAYOUT.left.defaultSize}
              minSize={SIDEBAR_LAYOUT.left.minSize}
              maxSize={SIDEBAR_LAYOUT.left.maxSize}
              className="flex min-h-0 min-w-0 flex-col border-t border-[color-mix(in_oklab,var(--line)_76%,transparent)] bg-[color-mix(in_oklab,var(--surface)_74%,transparent_26%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)] backdrop-blur-[12px]"
            >
              <FilesSidebar
                files={files}
                virtualFolders={virtualFolders}
                activeFileId={activeFileId}
                dirtyFileIds={dirtyFileIds}
                collabActivityOutlineByFileId={collabActivityOutlineByFileId}
                isLoading={filesQuery.isLoading || projectsQuery.isLoading}
                errorMessage={
                  projectsQuery.isError
                    ? 'Could not load projects.'
                    : filesQuery.isError
                      ? 'Could not load files.'
                      : createError
                }
                onOpenFile={openFileById}
                onCreateFile={async (path, type) => {
                  if (type === 'folder') {
                    await createFolderMutation.mutateAsync(path)
                    return
                  }

                  await createFileMutation.mutateAsync(path)
                }}
                onRenameFile={async (fileId, path) => {
                  await renameFileMutation.mutateAsync({ fileId, path })
                }}
                onDeleteFile={async (fileId) => {
                  await deleteFileMutation.mutateAsync(fileId)
                }}
                onRenameFolder={async (fromPath, toPath) => {
                  await renameFolderMutation.mutateAsync({ fromPath, toPath })
                }}
                onDeleteFolder={async (path) => {
                  await deleteFolderMutation.mutateAsync(path)
                }}
                onDropExternalFiles={async (entries, targetFolderPath) => {
                  await importFilesMutation.mutateAsync({
                    entries,
                    targetFolderPath,
                    conflictStrategy: 'skip',
                  })
                }}
                onClose={() => setIsLeftSidebarCollapsed(true)}
              />
            </Panel>
            <Separator
              disabled={isLeftSidebarCollapsed}
              className="group relative z-20 flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none data-[disabled]:w-0 data-[disabled]:cursor-default data-[disabled]:pointer-events-none"
            >
              <div className="h-full w-[0.5px] bg-[color-mix(in_oklab,var(--line)_88%,transparent)] group-hover:bg-[var(--lagoon)] group-active:bg-[var(--lagoon-deep)] data-[disabled]:opacity-30" />
            </Separator>

            {/* Central Editor/Terminal Panel */}
            <Panel
              id="main-editor"
              className="relative flex min-h-0 min-w-0 flex-col bg-[rgba(var(--bg-rgb),0.2)] [background:linear-gradient(160deg,color-mix(in_oklab,var(--surface)_66%,transparent_34%)_0%,color-mix(in_oklab,var(--surface-strong)_52%,transparent_48%)_100%)] before:pointer-events-none before:absolute before:inset-0 before:opacity-[0.18] before:[background:radial-gradient(circle_at_16%_14%,color-mix(in_oklab,var(--lagoon)_34%,transparent),transparent_30%),radial-gradient(circle_at_86%_18%,color-mix(in_oklab,var(--palm)_30%,transparent),transparent_34%)]"
            >
              <div className="relative flex-1 flex min-h-0 min-w-0 flex-col">
                {/* Sidebar Toggle Handle for Left */}
                {isLeftSidebarCollapsed ? (
                  <button
                    type="button"
                    aria-label="Open files panel"
                    onClick={() => setIsLeftSidebarCollapsed(false)}
                    className="absolute left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-xl border border-l-0 border-[color-mix(in_oklab,var(--line)_46%,var(--lagoon-deep)_54%)] bg-[color-mix(in_oklab,var(--surface-strong)_95%,var(--bg-base)_5%)] px-2 py-5 text-[var(--sea-ink)] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--inset-glint)_88%,transparent),0_10px_22px_rgba(7,20,26,0.2)] transition-colors"
                    title="Open files panel"
                  >
                    <ChevronRight size={16} />
                  </button>
                ) : null}

                {/* Sidebar Toggle Handle for Right */}
                {!isRightSidebarOpen ? (
                  <button
                    type="button"
                    aria-label="Open assistant panel"
                    onClick={() => setIsRightSidebarOpen(true)}
                    className="absolute right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-xl border border-r-0 border-[color-mix(in_oklab,var(--line)_46%,var(--lagoon-deep)_54%)] bg-[color-mix(in_oklab,var(--surface-strong)_95%,var(--bg-base)_5%)] px-2 py-5 text-[var(--sea-ink)] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--inset-glint)_88%,transparent),0_10px_22px_rgba(7,20,26,0.2)] transition-colors"
                    title="Open assistant panel"
                  >
                    <ChevronLeft size={16} />
                  </button>
                ) : null}

                {centerView === 'editor' ? (
                  <EditorPane
                    file={activeFile}
                    initialValue={editorValue}
                    isDirty={isDirty}
                    saveError={saveError}
                    collabState={collabState}
                    onEditorMount={onEditorMount}
                    onChange={(nextValue) => {
                      if (!activeFile) {
                        return
                      }

                      setDraftsByFileId((previous) => {
                        return {
                          ...previous,
                          [activeFile.id]: nextValue,
                        }
                      })
                    }}
                  />
                ) : (
                  <TerminalPane
                    projectId={activeProjectId}
                    queuedCommand={queuedTerminalCommand}
                    onQueuedCommandSent={clearQueuedTerminalCommand}
                  />
                )}
              </div>
            </Panel>

            {/* Right Sidebar Panel */}
            <Separator
              disabled={!isRightSidebarOpen}
              className="group relative z-20 flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none data-[disabled]:w-0 data-[disabled]:cursor-default data-[disabled]:pointer-events-none"
            >
              <div className="h-full w-[0.5px] bg-[color-mix(in_oklab,var(--line)_88%,transparent)] group-hover:bg-[var(--lagoon)] group-active:bg-[var(--lagoon-deep)] data-[disabled]:opacity-30" />
            </Separator>
            <Panel
              id="right-sidebar"
              panelRef={rightPanelRef}
              collapsible
              collapsedSize="0%"
              defaultSize={SIDEBAR_LAYOUT.right.defaultSize}
              minSize={SIDEBAR_LAYOUT.right.minSize}
              maxSize={SIDEBAR_LAYOUT.right.maxSize}
              className="flex min-h-0 min-w-0 flex-col border-t border-[color-mix(in_oklab,var(--line)_76%,transparent)] bg-[color-mix(in_oklab,var(--surface)_74%,transparent_26%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)] backdrop-blur-[12px]"
            >
              <RightSidebar
                isOpen={isRightSidebarOpen}
                onToggle={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                activeTab={rightSidebarTab}
                setActiveTab={setRightSidebarTab}
                activeFileContext={
                  activeFile
                    ? {
                        path: activeFile.path,
                        content: editorValue,
                      }
                    : null
                }
                getAccessToken={getApiAccessToken}
              />
            </Panel>
          </Group>

          {/* Bottom Drawers */}
          <BottomDrawers
            activeTab={bottomDrawerTab}
            onActiveTabChange={setBottomDrawerTab}
            collabMembers={collabMembers}
            activeInviteLinks={activeInviteLinks}
            isInvitePending={createInviteMutation.isPending}
            onCreateInviteLink={() => {
              if (!activeProjectId) {
                toastError('Select a project before creating invite links.')
                return
              }

              void createInviteMutation.mutateAsync(activeProjectId)
            }}
            onInvalidateInviteLink={(inviteId) => {
              void revokeInviteMutation.mutateAsync(inviteId)
            }}
          />
        </div>

        <QuickOpenModal
          isOpen={isQuickOpenVisible}
          items={files.map((file) => ({ id: file.id, path: file.path }))}
          onClose={() => setIsQuickOpenVisible(false)}
          onOpenFile={openFileById}
        />

        {isLocked ? (
          <WorkspaceAuthOverlay
            isLoading={isLoading || authActionPending}
            infoOpen={authPanelOpen}
            activeTab={authTab}
            authError={authError}
            runtimeError={authRuntimeError}
            onCloseInfo={() => setAuthPanelOpen(false)}
            onOpenInfo={() => setAuthPanelOpen(true)}
            onChangeTab={(nextTab) => {
              setAuthTab(nextTab)
              setAuthError(null)
            }}
            onStartAuth={(mode, connection) => {
              void startHostedAuth(mode, connection)
            }}
          />
        ) : null}
      </section>
    </main>
  )
}

export function WorkspaceView() {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return (
      <main className="mx-auto w-full max-w-[1080px] px-4 py-12">
        <AuthSetupNotice />
      </main>
    )
  }

  return <WorkspaceWithHostedAuth />
}
