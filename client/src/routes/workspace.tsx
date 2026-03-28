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
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { motion } from 'framer-motion'
import { useAuthRuntime } from '../auth/AuthProvider'
import AuthSetupNotice from '../components/auth/AuthSetupNotice'
import FileTabs from '../components/workspace/FileTabs'
import FilesSidebar from '../components/workspace/FilesSidebar'
import EditorPane from '../components/workspace/EditorPane'
import QuickOpenModal from '../components/workspace/QuickOpenModal'
import TerminalPane from '../components/workspace/TerminalPane'
import RightSidebar, { type SidebarTab } from '../components/workspace/RightSidebar'
import BottomDrawers from '../components/workspace/BottomDrawers'
import WorkspaceSkeleton from '../components/workspace/WorkspaceSkeleton'
import UserInfo from '../components/auth/UserInfo'
import { useToast } from '../components/ToastProvider'
import { getWorkspaceShortcut } from '../components/workspace/workspace-shortcuts'
import WorkspaceAuthOverlay, {
  type AuthTab,
} from '../components/workspace/WorkspaceAuthOverlay'
import { auth0Config } from '../lib/auth0-config'
import {
  createProjectInvite,
  createFile,
  listFiles,
  listProjects,
  updateFile,
  type FileDto,
} from '../services/projects-api'
import {
  type CollabDocDirtyStatePayload,
  type CollabFileCreatedPayload,
  type CollabFileDeletedPayload,
  type CollabFileUpdatedPayload,
} from '../lib/collab-client'
import { useCollabDoc } from '../hooks/use-collab-doc'
import { cn } from '../lib/utils'

const AUTOSAVE_DELAY_MS = 200

export const Route = createFileRoute('/workspace')({
  validateSearch: (search: Record<string, unknown>) => {
    const normalizedProjectId =
      typeof search.projectId === 'string' ? search.projectId.trim() : ''

    const projectId = normalizedProjectId.length > 0 ? normalizedProjectId : undefined

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
    defaultSize: '24%',
    minSize: '18%',
    maxSize: '38%',
  },
  right: {
    defaultSize: '24%',
    minSize: '18%',
    maxSize: '40%',
  },
}

function WorkspaceWithHostedAuth() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { toast, success, error: toastError } = useToast()
  const {
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
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
  const [draftsByFileId, setDraftsByFileId] = useState<Record<string, string>>({})
  const [collabDirtyByFileId, setCollabDirtyByFileId] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false)
  const [rightSidebarTab, setRightSidebarTab] = useState<SidebarTab>('ai')
  const [centerView, setCenterView] = useState<'editor' | 'terminal'>('editor')
  const [isQuickOpenVisible, setIsQuickOpenVisible] = useState(false)
  const [authPanelOpen, setAuthPanelOpen] = useState(true)
  const [authTab, setAuthTab] = useState<AuthTab>('login')
  const [authActionPending, setAuthActionPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const autosaveTimeoutRef = useRef<number | null>(null)
  const leftPanelRef = usePanelRef()
  const rightPanelRef = usePanelRef()
  const lastLeftSizeRef = useRef<string>(SIDEBAR_LAYOUT.left.defaultSize)
  const lastRightSizeRef = useRef<string>(SIDEBAR_LAYOUT.right.defaultSize)

  const authRuntimeError = error ? 'Authentication failed. Please try again.' : null

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
      const message = caughtError instanceof Error ? caughtError.message : 'Could not start login flow.'
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

  const upsertFileInCache = useCallback((incomingFile: FileDto) => {
    queryClient.setQueryData<FileDto[]>(
      ['workspace', 'files', true, incomingFile.projectId],
      (previous) => {
        const current = previous ?? []
        const exists = current.some((file) => file.id === incomingFile.id)

        const next = exists
          ? current.map((file) => (file.id === incomingFile.id ? incomingFile : file))
          : [incomingFile, ...current]

        return [...next].sort((left, right) => {
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        })
      },
    )
  }, [queryClient])

  const onCollabFileCreated = useCallback((payload: CollabFileCreatedPayload) => {
    upsertFileInCache({
      ...payload,
      content: '',
      ownerSubject: null,
    })
  }, [upsertFileInCache])

  const onCollabFileUpdated = useCallback((payload: CollabFileUpdatedPayload) => {
    queryClient.invalidateQueries({
      queryKey: ['workspace', 'files', true, payload.projectId],
    }).catch(() => undefined)
  }, [queryClient])

  const onCollabFileDeleted = useCallback((payload: CollabFileDeletedPayload) => {
    queryClient.setQueryData<FileDto[]>(
      ['workspace', 'files', true, payload.projectId],
      (previous) => (previous ?? []).filter((file) => file.id !== payload.id),
    )

    setOpenFileIds((previous) => previous.filter((fileId) => fileId !== payload.id))
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
  }, [queryClient])

  const onCollabDirtyStateChanged = useCallback((payload: CollabDocDirtyStatePayload) => {
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
      queryClient.invalidateQueries({
        queryKey: ['workspace', 'files', true, payload.projectId],
      }).catch(() => {
        return undefined
      })
    }
  }, [queryClient])

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
        previous.includes(createdFile.id) ? previous : [...previous, createdFile.id],
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
      success(`Saved ${updated.path.split('/').pop()}`)
      setDraftsByFileId((previous) => {
        const latestDraft = previous[updated.id]
        if (latestDraft !== undefined && latestDraft !== updated.content) {
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

  const triggerSave = useCallback((fileId: string, content: string) => {
    clearAutosaveTimeout()

    if (saveFileMutation.isPending) {
      return
    }

    void saveFileMutation.mutateAsync({
      fileId,
      content,
    })
  }, [clearAutosaveTimeout, saveFileMutation])

  const files = filesQuery.data ?? []
  const activeFile = files.find((file) => file.id === activeFileId) ?? null
  const openTabs = openFileIds
    .map((fileId) => files.find((file) => file.id === fileId))
    .filter((file): file is FileDto => file !== undefined)
  const editorValue = activeFile
    ? draftsByFileId[activeFile.id] ?? activeFile.content
    : ''
  const localIsDirty = activeFile
    ? (draftsByFileId[activeFile.id] ?? activeFile.content) !== activeFile.content
    : false
  const isDirty = activeFile ? localIsDirty || Boolean(collabDirtyByFileId[activeFile.id]) : false

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

  const selectedProject = projectsQuery.data?.find((project) => project.id === activeProjectId) ?? null

  const { collabState, onEditorMount, markSaved } = useCollabDoc({
    projectId: activeProjectId,
    fileId: activeFileId,
    onFileCreated: onCollabFileCreated,
    onFileUpdated: onCollabFileUpdated,
    onFileDeleted: onCollabFileDeleted,
    onDirtyStateChanged: onCollabDirtyStateChanged,
  })

  const dirtyFileIds = files
    .filter((file) => {
      const draftValue = draftsByFileId[file.id]
      const locallyDirty = draftValue !== undefined ? draftValue !== file.content : false
      return locallyDirty || Boolean(collabDirtyByFileId[file.id])
    })
    .map((file) => file.id)

  useMutation({
    mutationFn: async (projectId: string) => {
      const token = await getApiAccessToken()
      return createProjectInvite(projectId, token)
    },
    onSuccess: async (invite) => {
      const inviteLink = `${window.location.origin}/invite/${invite.inviteToken}`

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

    const stillExists = projectsQuery.data.some((project) => project.id === activeProjectId)
    if (!stillExists) {
      setActiveProjectId(projectsQuery.data[0].id)
    }
  }, [activeProjectId, isAuthenticated, projectsQuery.data, search.projectId])

  useEffect(() => {
    setActiveFileId(null)
    setOpenFileIds([])
    setDraftsByFileId({})
    setCollabDirtyByFileId({})
    setSaveError(null)
    setCreateError(null)
    clearAutosaveTimeout()
  }, [activeProjectId, clearAutosaveTimeout])

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
      const firstFileId = filesQuery.data[0].id
      setActiveFileId(firstFileId)
      setOpenFileIds((previous) => (previous.includes(firstFileId) ? previous : [...previous, firstFileId]))
      return
    }

    const stillExists = filesQuery.data.some((file) => file.id === activeFileId)
    if (!stillExists) {
      const firstFileId = filesQuery.data[0].id
      setActiveFileId(firstFileId)
      setOpenFileIds((previous) => (previous.includes(firstFileId) ? previous : [...previous, firstFileId]))
    }
  }, [activeFileId, filesQuery.data, isAuthenticated])

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
        setCenterView((current) => (current === 'editor' ? 'terminal' : 'editor'))
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
  }, [activeFile, editorValue, isAuthenticated, localIsDirty, saveFileMutation.isPending, triggerSave])

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
      lastLeftSizeRef.current = `${leftSize}%`
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
      leftPanel.resize(lastLeftSizeRef.current)
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
        lastRightSizeRef.current = `${rightSize}%`
        rightPanel.resize(0)
      }
      return
    }

    const rightSize = rightPanel.getSize().asPercentage
    if (rightSize <= SIDEBAR_LAYOUT.expandThresholdPercent) {
      rightPanel.resize(lastRightSizeRef.current)
    }
  }, [isRightSidebarOpen, rightPanelRef])

  const openFileById = (fileId: string) => {
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

      if (activeFileId === fileId) {
        const closedIndex = previous.indexOf(fileId)
        const fallbackId = next[Math.max(0, closedIndex - 1)] ?? next[0] ?? null
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
    setOpenFileIds([fileId])
    setActiveFileId(fileId)
    setDraftsByFileId((previous) => {
      const next: Record<string, string> = {}
      if (fileId in previous) next[fileId] = previous[fileId]
      return next
    })
  }

  const closeAll = () => {
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
    <main className="m-0 h-dvh w-screen p-0">
      <section className="relative flex h-full min-h-0 flex-col">
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-hidden',
            isLocked && 'pointer-events-none select-none [transform:scale(0.998)]'
          )}
          {...lockedContentProps}
        >
          {/* Top Bar Refined */}
          <div className="grid items-center gap-3 border-b border-[var(--line)] bg-[rgba(var(--bg-rgb),0.6)] px-4 py-2 backdrop-blur-md md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={() => navigate({ to: '/projects' })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[rgba(255,255,255,0.05)] text-[var(--sea-ink)] hover:bg-[rgba(0,0,0,0.05)] transition-colors"
                title="Back to projects"
              >
                <ArrowLeft size={14} />
              </button>

              <div className="min-w-0 flex flex-col">
                <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--sea-ink-soft)]">Workspace</span>
                <h1 className="m-0 truncate text-sm font-extrabold text-[var(--sea-ink)] leading-none">
                  {selectedProject ? selectedProject.name : 'iTECify IDE'}
                </h1>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative flex rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.5)] p-1 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setCenterView('editor')}
                  className={cn(
                    "relative px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all z-10",
                    centerView === 'editor' 
                      ? "text-white" 
                      : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                  )}
                >
                  <Code size={14} />
                  <span>Editor</span>
                  {centerView === 'editor' && (
                    <motion.div 
                      layoutId="workspace-view-toggle"
                      className="absolute inset-0 bg-[var(--lagoon)] rounded-lg -z-10 shadow-md"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setCenterView('terminal')}
                  className={cn(
                    "relative px-4 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all z-10",
                    centerView === 'terminal' 
                      ? "text-white" 
                      : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                  )}
                >
                  <TerminalIcon size={14} />
                  <span>Terminal</span>
                  {centerView === 'terminal' && (
                    <motion.div 
                      layoutId="workspace-view-toggle"
                      className="absolute inset-0 bg-[var(--lagoon)] rounded-lg -z-10 shadow-md"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <div className="flex items-center gap-2 px-2 py-1 bg-[rgba(255,255,255,0.05)] border border-[var(--line)] rounded-lg">
                <button className="p-1.5 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] transition-colors">
                  <Search size={14} />
                </button>
                <button className="p-1.5 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] transition-colors">
                  <Bell size={14} />
                </button>
                <div className="w-[1px] h-4 bg-[var(--line)]" />
                <UserInfo 
                  onLogout={() => {
                    void logout({ logoutParams: { returnTo: window.location.origin } })
                  }} 
                />
              </div>
            </div>
          </div>

          <FileTabs
            tabs={openTabs.map((file) => {
              const draftValue = draftsByFileId[file.id]
              const localDirty = draftValue !== undefined ? draftValue !== file.content : false
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
          />

          <Group
            id="workspace-layout-panels"
            orientation="horizontal"
            className="flex-1 min-h-0 min-w-0"
            resizeTargetMinimumSize={{ coarse: 28, fine: 16 }}
            onLayoutChanged={(nextLayout) => {
              const nextLeftSize = nextLayout['left-sidebar'] ?? 0
              const nextRightSize = nextLayout['right-sidebar'] ?? 0
              const isLeftCollapsedNext = nextLeftSize <= SIDEBAR_LAYOUT.collapseThresholdPercent
              const isRightCollapsedNext = nextRightSize <= SIDEBAR_LAYOUT.collapseThresholdPercent

              if (isLeftSidebarCollapsed !== isLeftCollapsedNext) {
                setIsLeftSidebarCollapsed(isLeftCollapsedNext)
              }

              if (!isLeftCollapsedNext) {
                lastLeftSizeRef.current = `${nextLeftSize}%`
              }

              if (isRightSidebarOpen === isRightCollapsedNext) {
                setIsRightSidebarOpen(!isRightCollapsedNext)
              }

              if (!isRightCollapsedNext) {
                lastRightSizeRef.current = `${nextRightSize}%`
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
              className="flex min-h-0 min-w-0 flex-col"
            >
              <FilesSidebar
                files={files}
                activeFileId={activeFileId}
                dirtyFileIds={dirtyFileIds}
                isLoading={filesQuery.isLoading || projectsQuery.isLoading}
                errorMessage={
                  projectsQuery.isError
                    ? 'Could not load projects.'
                    : filesQuery.isError
                      ? 'Could not load files.'
                      : createError
                }
                onOpenFile={openFileById}
                onCreateFile={(path) => {
                  void createFileMutation.mutateAsync(path)
                }}
              />
            </Panel>
            <Separator
              disabled={isLeftSidebarCollapsed}
              className="group relative z-20 flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none data-[disabled]:w-0 data-[disabled]:cursor-default data-[disabled]:pointer-events-none"
            >
              <div className="h-full w-[1px] bg-[var(--line)] transition-all group-hover:w-[3px] group-hover:bg-[var(--lagoon)] group-active:bg-[var(--lagoon-deep)] data-[disabled]:w-[1px] data-[disabled]:opacity-30" />
            </Separator>

            {/* Central Editor/Terminal Panel */}
            <Panel id="main-editor" className="flex min-h-0 min-w-0 flex-col bg-[rgba(var(--bg-rgb),0.2)]">
               <div className="relative flex-1 flex min-h-0 min-w-0 flex-col">
                  {/* Sidebar Toggle Handle for Left */}
                  <button
                    onClick={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 z-30 px-2 py-6 bg-[var(--surface-strong)] border border-[var(--line)] border-l-0 rounded-r-xl text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[var(--chip-bg)] transition-all shadow-lg",
                      isLeftSidebarCollapsed && "bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon-deep)] border-transparent"
                    )}
                  >
                    {isLeftSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                  </button>

                  {/* Sidebar Toggle Handle for Right */}
                  <button
                    onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 z-30 px-2 py-6 bg-[var(--surface-strong)] border border-[var(--line)] border-r-0 rounded-l-xl text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[var(--chip-bg)] transition-all shadow-lg",
                      !isRightSidebarOpen && "bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon-deep)] border-transparent"
                    )}
                  >
                    {!isRightSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                  </button>

                  {centerView === 'editor' ? (
                    <EditorPane
                      file={activeFile}
                      initialValue={editorValue}
                      isDirty={isDirty}
                      canSave={localIsDirty}
                      isSaving={saveFileMutation.isPending}
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
                      onSave={() => {
                        if (!activeFile || !localIsDirty) {
                          return
                        }

                        triggerSave(activeFile.id, editorValue)
                      }}
                    />
                  ) : (
                    <TerminalPane projectId={activeProjectId} />
                  )}
               </div>
            </Panel>

            {/* Right Sidebar Panel */}
            <Separator
              disabled={!isRightSidebarOpen}
              className="group relative z-20 flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-transparent outline-none data-[disabled]:w-0 data-[disabled]:cursor-default data-[disabled]:pointer-events-none"
            >
              <div className="h-full w-[1px] bg-[var(--line)] transition-all group-hover:w-[3px] group-hover:bg-[var(--lagoon)] group-active:bg-[var(--lagoon-deep)] data-[disabled]:w-[1px] data-[disabled]:opacity-30" />
            </Separator>
            <Panel
              id="right-sidebar"
              panelRef={rightPanelRef}
              collapsible
              collapsedSize="0%"
              defaultSize="0%"
              minSize={SIDEBAR_LAYOUT.right.minSize}
              maxSize={SIDEBAR_LAYOUT.right.maxSize}
              className="flex min-h-0 min-w-0 flex-col"
            >
              <RightSidebar
                isOpen={isRightSidebarOpen}
                onToggle={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                activeTab={rightSidebarTab}
                setActiveTab={setRightSidebarTab}
              />
            </Panel>
          </Group>

          {/* Bottom Drawers */}
          <BottomDrawers />
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
