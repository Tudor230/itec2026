import { createFileRoute } from '@tanstack/react-router'
import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import ProtectedRoute from '../auth/ProtectedRoute'
import FilesSidebar from '../components/workspace/FilesSidebar'
import EditorPane from '../components/workspace/EditorPane'
import RunButton from '../components/workspace/RunButton'
import {
  createProjectInvite,
  createFile,
  listFiles,
  listProjects,
  updateFile,
  type FileDto,
} from '../services/projects-api'
import { auth0Config } from '../lib/auth0-config'
import { useCollabDoc } from '../hooks/use-collab-doc'

export const Route = createFileRoute('/workspace')({
  component: WorkspaceView,
})

export function WorkspaceView() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  async function getApiAccessToken() {
    return getAccessTokenSilently({
      authorizationParams: {
        audience: auth0Config.audience,
      },
    }).catch(() => null)
  }

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [draftsByFileId, setDraftsByFileId] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [runNotice, setRunNotice] = useState<{
    id: number
    text: string
  } | null>(null)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)

  const projectsQuery = useQuery({
    queryKey: ['workspace', 'projects'],
    queryFn: async () => {
      const token = await getApiAccessToken()
      return listProjects(token)
    },
  })

  const filesQuery = useQuery({
    queryKey: ['workspace', 'files', activeProjectId],
    queryFn: async () => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        return [] as FileDto[]
      }

      return listFiles(activeProjectId, token)
    },
    enabled: activeProjectId !== null,
  })

  const createFileMutation = useMutation({
    mutationFn: async (path: string) => {
      const token = await getApiAccessToken()

      if (!activeProjectId) {
        throw new Error('Select a project before creating files.')
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
      setActiveFileId(createdFile.id)
      setDraftsByFileId((previous) => {
        const next = { ...previous }
        delete next[createdFile.id]
        return next
      })

      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'files', activeProjectId],
      })
    },
    onError: (error) => {
      setCreateError(error.message)
    },
  })

  const saveFileMutation = useMutation({
    mutationFn: async (input: { fileId: string; content: string }) => {
      const token = await getApiAccessToken()
      return updateFile(input.fileId, { content: input.content }, token)
    },
    onSuccess: async (updated) => {
      setSaveError(null)
      setDraftsByFileId((previous) => {
        const next = { ...previous }
        delete next[updated.id]
        return next
      })

      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'files', activeProjectId],
      })
    },
    onError: (error) => {
      setSaveError(error.message)
    },
  })

  const files = filesQuery.data ?? []
  const activeFile = files.find((file) => file.id === activeFileId) ?? null
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
    if (!projectsQuery.data || projectsQuery.data.length === 0) {
      setActiveProjectId(null)
      return
    }

    if (!activeProjectId) {
      setActiveProjectId(projectsQuery.data[0].id)
      return
    }

    const stillExists = projectsQuery.data.some((project) => project.id === activeProjectId)
    if (!stillExists) {
      setActiveProjectId(projectsQuery.data[0].id)
    }
  }, [activeProjectId, projectsQuery.data])

  useEffect(() => {
    setActiveFileId(null)
    setDraftsByFileId({})
    setSaveError(null)
    setCreateError(null)
  }, [activeProjectId])

  useEffect(() => {
    if (!filesQuery.data) {
      return
    }

    if (filesQuery.data.length === 0) {
      setActiveFileId(null)
      return
    }

    if (!activeFileId) {
      setActiveFileId(filesQuery.data[0].id)
      return
    }

    const stillExists = filesQuery.data.some((file) => file.id === activeFileId)
    if (!stillExists) {
      setActiveFileId(filesQuery.data[0].id)
    }
  }, [activeFileId, filesQuery.data])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSave = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'

      if (!isSave) {
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
  }, [activeFile, editorValue, isDirty, saveFileMutation])

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

  return (
    <ProtectedRoute>
      <main className="px-4 py-6">
        <section className="island-shell mx-auto flex h-[calc(100vh-9.5rem)] w-full max-w-[1400px] min-w-[1024px] min-h-[620px] flex-col overflow-hidden rounded-[1.2rem]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[rgba(255,255,255,0.58)] px-4 py-3">
            <div className="min-w-0">
              <p className="island-kicker mb-1">Workspace</p>
              <h1 className="m-0 truncate text-lg font-bold text-[var(--sea-ink)] sm:text-xl">
                {selectedProject ? selectedProject.name : 'iTECify IDE'}
              </h1>
            </div>

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

          {inviteNotice ? (
            <div className="border-b border-[var(--line)] bg-[rgba(255,255,255,0.52)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
              {inviteNotice}
            </div>
          ) : null}

          {runNotice ? (
            <div className="mt-4 rounded-xl border border-[rgba(50,143,151,0.25)] bg-[rgba(79,184,178,0.1)] px-4 py-3 text-sm text-[var(--sea-ink)]">
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

          <div className="flex min-h-0 flex-1 border-t border-[var(--line)]">
            <FilesSidebar
              files={files}
              activeFileId={activeFileId}
              isLoading={filesQuery.isLoading || projectsQuery.isLoading}
              errorMessage={
                projectsQuery.isError
                  ? `Could not load projects: ${projectsQuery.error.message}`
                  : filesQuery.isError
                    ? `Could not load files: ${filesQuery.error.message}`
                    : createError
              }
              onOpenFile={(fileId) => {
                setActiveFileId(fileId)
                setSaveError(null)
              }}
              onCreateFile={(path) => {
                void createFileMutation.mutateAsync(path)
              }}
            />

            <EditorPane
              file={activeFile}
              initialValue={activeFile?.content ?? ''}
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
          </div>
        </section>
      </main>
    </ProtectedRoute>
  )
}
