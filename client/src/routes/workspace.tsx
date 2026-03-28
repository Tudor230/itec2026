import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Lock,
  Monitor,
  SquareTerminal,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthRuntime } from '../auth/AuthProvider'
import AuthSetupNotice from '../components/auth/AuthSetupNotice'
import FileTabs from '../components/workspace/FileTabs'
import FilesSidebar from '../components/workspace/FilesSidebar'
import EditorPane from '../components/workspace/EditorPane'
import QuickOpenModal from '../components/workspace/QuickOpenModal'
import RunButton from '../components/workspace/RunButton'
import TerminalPane from '../components/workspace/TerminalPane'
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
} from '../lib/collab-client'
import { useCollabDoc } from '../hooks/use-collab-doc'

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

function WorkspaceWithHostedAuth() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const {
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [centerView, setCenterView] = useState<'editor' | 'terminal'>('editor')
  const [isQuickOpenVisible, setIsQuickOpenVisible] = useState(false)
  const [authPanelOpen, setAuthPanelOpen] = useState(true)
  const [authTab, setAuthTab] = useState<AuthTab>('login')
  const [authActionPending, setAuthActionPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [runNotice, setRunNotice] = useState<{
    id: number
    text: string
  } | null>(null)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const autosaveTimeoutRef = useRef<number | null>(null)

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
          returnTo: '/projects',
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
  const requestedProjectMissing =
    Boolean(search.projectId) &&
    Boolean(projectsQuery.data) &&
    !(projectsQuery.data ?? []).some((project) => project.id === search.projectId)

  const { collabState, onEditorMount, markSaved } = useCollabDoc({
    projectId: activeProjectId,
    fileId: activeFileId,
    onFileCreated: onCollabFileCreated,
    onDirtyStateChanged: onCollabDirtyStateChanged,
  })

  const dirtyFileIds = files
    .filter((file) => {
      const draftValue = draftsByFileId[file.id]
      const locallyDirty = draftValue !== undefined ? draftValue !== file.content : false
      return locallyDirty || Boolean(collabDirtyByFileId[file.id])
    })
    .map((file) => file.id)

  const createInviteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const token = await getApiAccessToken()
      return createProjectInvite(projectId, token)
    },
    onSuccess: async (invite) => {
      const inviteLink = `${window.location.origin}/invite/${invite.inviteToken}`

      try {
        await navigator.clipboard.writeText(inviteLink)
        setInviteNotice('Invite link copied to clipboard')
      } catch {
        setInviteNotice(inviteLink)
      }
    },
    onError: (error) => {
      setInviteNotice(`Could not create invite: ${error.message}`)
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
  }, [activeProjectId])

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
        setIsSidebarCollapsed((current) => !current)
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
    if (runNotice === null) {
      return
    }

    const timeout = window.setTimeout(() => {
      setRunNotice(null)
    }, 2800)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [runNotice])

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

  const lockedContentProps = isLocked
    ? ({
      'aria-hidden': true,
      inert: true,
    } as const)
    : {}

  return (
    <main className="workspace-fullscreen-shell">
      <section className="workspace-shell flex h-full w-full min-h-0 min-w-[1280px] flex-col overflow-hidden">
        <div
          className={`workspace-content relative flex min-h-0 flex-1 flex-col ${isLocked ? 'workspace-content--locked' : ''}`}
          {...lockedContentProps}
        >
          <div className="workspace-toolbar grid items-center gap-3 border-b border-[var(--line)] bg-[rgba(255,255,255,0.58)] px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigate({ to: '/projects' })
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink)]"
                aria-label="Back to projects"
                title="Back to projects"
              >
                <ArrowLeft size={14} />
              </button>

              <div className="min-w-0">
                <p className="island-kicker mb-1">Workspace</p>
                <h1 className="m-0 truncate text-lg font-bold text-[var(--sea-ink)] sm:text-xl">
                  {selectedProject ? selectedProject.name : 'iTECify IDE'}
                </h1>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="workspace-segmented-control">
                <button
                  type="button"
                  onClick={() => setCenterView('editor')}
                  className={`workspace-segmented-option ${centerView === 'editor' ? 'is-active' : ''}`}
                  title="Show editor"
                >
                  <Monitor size={14} />
                  <span>Editor</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCenterView('terminal')}
                  className={`workspace-segmented-option ${centerView === 'terminal' ? 'is-active' : ''}`}
                  title="Show terminal (Ctrl+`)"
                >
                  <SquareTerminal size={14} />
                  <span>Terminal</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!activeProjectId || createInviteMutation.isPending}
                  onClick={() => {
                    if (!activeProjectId) {
                      return
                    }

                    void createInviteMutation.mutateAsync(activeProjectId)
                  }}
                  className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createInviteMutation.isPending ? 'Creating invite...' : 'Share'}
                </button>

                <label className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1.5 text-xs text-[var(--sea-ink-soft)]">
                  <span className="mr-2">Project</span>
                  <select
                    value={activeProjectId ?? ''}
                    onChange={(event) => {
                      const next = event.target.value.trim()
                      setActiveProjectId(next.length > 0 ? next : null)
                    }}
                    className="bg-transparent text-xs font-semibold text-[var(--sea-ink)] outline-none"
                  >
                    {(projectsQuery.data ?? []).map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <RunButton
                  onRunRequest={() => {
                    setRunNotice({
                      id: Date.now(),
                      text: 'Run is not available yet.',
                    })
                  }}
                />
              </div>
            </div>
          </div>

          {inviteNotice ? (
            <div className="border-b border-[var(--line)] bg-[rgba(255,255,255,0.52)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
              {inviteNotice}
            </div>
          ) : null}

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
          />

          {runNotice ? (
            <div className="workspace-run-notice rounded-xl border border-[rgba(50,143,151,0.25)] bg-[rgba(79,184,178,0.1)] px-4 py-3 text-sm text-[var(--sea-ink)]">
              <div className="flex items-center justify-between gap-3">
                <span key={runNotice.id} role="status" aria-live="polite">
                  {runNotice.text}
                </span>
                <button
                  type="button"
                  onClick={() => setRunNotice(null)}
                  className="rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-xs font-semibold text-[var(--sea-ink)]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          {requestedProjectMissing ? (
            <div className="mx-4 mt-3 rounded-xl border border-[rgba(210,140,60,0.35)] bg-[rgba(244,196,112,0.18)] px-4 py-3 text-sm text-[var(--sea-ink)]">
              The requested project is not available. Showing the first available project instead.
            </div>
          ) : null}

          <div className="workspace-main-panel flex min-h-0 flex-1 border-t border-[var(--line)]">
            <div className={`workspace-sidebar-region ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((current) => !current)}
                className={`workspace-sidebar-toggle ${isSidebarCollapsed ? 'is-collapsed' : ''}`}
                aria-label={isSidebarCollapsed ? 'Expand files sidebar' : 'Collapse files sidebar'}
                title={isSidebarCollapsed ? 'Expand files sidebar (Ctrl+B)' : 'Collapse files sidebar (Ctrl+B)'}
              >
                {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </button>

              {!isSidebarCollapsed ? (
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
              ) : null}
            </div>

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
              <TerminalPane />
            )}
          </div>
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

        {isLoading ? (
          <div className="workspace-auth-loading">
            <Lock size={14} />
            <span>Checking session...</span>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export function WorkspaceView() {
  const { isConfigured } = useAuthRuntime()

  if (!isConfigured) {
    return (
      <main className="page-wrap px-4 py-12">
        <AuthSetupNotice />
      </main>
    )
  }

  return <WorkspaceWithHostedAuth />
}
