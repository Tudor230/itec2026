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
import { useEffect, useState } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
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
import { useCollabDoc } from '../hooks/use-collab-doc'
import { cn } from '../lib/utils'

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
      success(`Saved ${updated.path.split('/').pop()}`)
      setDraftsByFileId((previous) => {
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

  const files = filesQuery.data ?? []
  const activeFile = files.find((file) => file.id === activeFileId) ?? null
  const openTabs = openFileIds
    .map((fileId) => files.find((file) => file.id === fileId))
    .filter((file): file is FileDto => file !== undefined)
  const editorValue = activeFile
    ? draftsByFileId[activeFile.id] ?? activeFile.content
    : ''
  const isDirty = activeFile
    ? (draftsByFileId[activeFile.id] ?? activeFile.content) !== activeFile.content
    : false

  const selectedProject = projectsQuery.data?.find((project) => project.id === activeProjectId) ?? null

  const { collabState, onEditorMount } = useCollabDoc({
    projectId: activeProjectId,
    fileId: activeFileId,
  })

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

      if (!activeFile || !isDirty || saveFileMutation.isPending) {
        return
      }

      void saveFileMutation.mutateAsync({
        fileId: activeFile.id,
        content: editorValue,
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [activeFile, editorValue, isAuthenticated, isDirty, saveFileMutation])

  useEffect(() => {
    if (isAuthenticated) {
      setAuthActionPending(false)
      setAuthError(null)
    }
  }, [isAuthenticated])

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
    <main className="workspace-fullscreen-shell">
      <section className="workspace-shell">
        <div
          className={cn(
            "workspace-content relative flex min-h-0 flex-1 flex-col",
            isLocked && "workspace-content--locked"
          )}
          {...lockedContentProps}
        >
          {/* Top Bar Refined */}
          <div className="workspace-toolbar grid items-center gap-3 border-b border-[var(--line)] bg-[rgba(var(--bg-rgb),0.6)] backdrop-blur-md px-4 py-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
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
              <div className="workspace-segmented-control bg-[rgba(var(--chip-bg-rgb),0.5)] backdrop-blur-md p-1 rounded-xl border border-[var(--line)] relative flex">
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
              const dirty = draftValue !== undefined ? draftValue !== file.content : false

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

          <Group autoSaveId="workspace-layout-panels" orientation="horizontal" className="flex-1 min-h-0">
            {/* Left Sidebar Panel */}
            {!isLeftSidebarCollapsed && (
              <>
                <Panel id="left-sidebar" order={1} defaultSize={20} minSize={15} maxSize={40} className="flex flex-col min-h-0">
                  <FilesSidebar
                    files={files}
                    activeFileId={activeFileId}
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
                <Separator className="w-[1px] bg-[var(--line)] hover:bg-[var(--lagoon)] transition-colors hover:w-[2px] cursor-col-resize" />
              </>
            )}

            {/* Central Editor/Terminal Panel */}
            <Panel id="main-editor" order={2} className="flex flex-col min-h-0 bg-[rgba(var(--bg-rgb),0.2)]">
               <div className="relative flex-1 flex flex-col min-h-0">
                  {/* Sidebar Toggle Handle for Left */}
                  <button
                    onClick={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 py-3 bg-[var(--bg)] border border-[var(--line)] rounded-r-lg text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[var(--chip-bg)] transition-all shadow-md",
                      isLeftSidebarCollapsed && "bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon-deep)] border-transparent"
                    )}
                  >
                    {isLeftSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                  </button>

                  {/* Sidebar Toggle Handle for Right */}
                  <button
                    onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    className={cn(
                      "absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 py-3 bg-[var(--bg)] border border-[var(--line)] rounded-l-lg text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[var(--chip-bg)] transition-all shadow-md",
                      !isRightSidebarOpen && "bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon-deep)] border-transparent"
                    )}
                  >
                    {!isRightSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {centerView === 'editor' ? (
                    <EditorPane
                      file={activeFile}
                      initialValue={editorValue}
                      isDirty={isDirty}
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
                        if (!activeFile || !isDirty) {
                          return
                        }

                        void saveFileMutation.mutateAsync({
                          fileId: activeFile.id,
                          content: editorValue,
                        })
                      }}
                    />
                  ) : (
                    <TerminalPane />
                  )}
               </div>
            </Panel>

            {/* Right Sidebar Panel */}
            {isRightSidebarOpen && (
              <>
                <Separator className="w-[1px] bg-[var(--line)] hover:bg-[var(--lagoon)] transition-colors hover:w-[2px] cursor-col-resize" />
                <Panel id="right-sidebar" order={3} defaultSize={20} minSize={15} maxSize={40} className="flex flex-col min-h-0">
                  <RightSidebar 
                    isOpen={isRightSidebarOpen} 
                    onToggle={() => setIsRightSidebarOpen(!isRightSidebarOpen)} 
                    activeTab={rightSidebarTab}
                    setActiveTab={setRightSidebarTab}
                  />
                </Panel>
              </>
            )}
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
      <main className="page-wrap px-4 py-12">
        <AuthSetupNotice />
      </main>
    )
  }

  return <WorkspaceWithHostedAuth />
}
