import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DownloadCloud, FolderOpenDot, Github, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import ProtectedRoute from '../auth/ProtectedRoute'
import {
  createProject,
  importFiles,
  importProjectFromGithub,
  listProjects,
} from '../services/projects-api'
import {
  buildImportPayload,
  chunkImportFiles,
  collectEntriesFromDirectoryHandle,
  collectEntriesFromFileList
  
} from '../lib/file-import'
import type {DirectoryHandleLike} from '../lib/file-import';

export const Route = createFileRoute('/projects')({
  component: ProjectsPage,
})

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return 'Updated recently'
  }

  const minutes = Math.round((Date.now() - timestamp) / 60000)

  if (minutes < 1) {
    return 'Updated just now'
  }

  if (minutes < 60) {
    return `Updated ${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `Updated ${hours}h ago`
  }

  const days = Math.round(hours / 24)
  return `Updated ${days}d ago`
}

function ProjectsPage() {
  const navigate = useNavigate()
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()

  const [projectName, setProjectName] = useState('')
  const [query, setQuery] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const folderPickerInputRef = useRef<HTMLInputElement | null>(null)

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const token = await getAccessTokenSilently().catch(() => null)
      return listProjects(token)
    },
  })

  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await getAccessTokenSilently().catch(() => null)
      return createProject(name, token)
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setProjectName('')
      void navigate({
        to: '/workspace',
        search: {
          projectId: project.id,
        },
      })
    },
  })

  const importGithubMutation = useMutation({
    mutationFn: async (url: string) => {
      const token = await getAccessTokenSilently().catch(() => null)
      return importProjectFromGithub({ githubUrl: url }, token)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setGithubUrl('')
      void navigate({
        to: '/workspace',
        search: {
          projectId: result.project.id,
        },
      })
    },
  })

  const importLocalFolderMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const token = await getAccessTokenSilently().catch(() => null)
      if (!token) {
        throw new Error('Authentication token is required to import a folder.')
      }

      const payload = await buildImportPayload(
        collectEntriesFromFileList(files),
      )
      if (payload.files.length === 0) {
        throw new Error('No text files found in selected folder.')
      }

      const firstRelativePath = (
        files[0] as File & { webkitRelativePath?: string }
      ).webkitRelativePath

      const normalizedProjectName = firstRelativePath
        ? firstRelativePath.split('/')[0].trim()
        : ''
      const suggestedProjectName =
        normalizedProjectName || 'Imported local project'
      const project = await createProject(suggestedProjectName, token)

      const chunks = chunkImportFiles(payload.files)
      for (const filesChunk of chunks) {
        await importFiles(
          {
            projectId: project.id,
            files: filesChunk,
            conflictStrategy: 'skip',
          },
          token,
        )
      }

      return project
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      void navigate({
        to: '/workspace',
        search: {
          projectId: project.id,
        },
      })
    },
  })

  const importDirectoryHandleMutation = useMutation({
    mutationFn: async () => {
      const token = await getAccessTokenSilently().catch(() => null)
      if (!token) {
        throw new Error('Authentication token is required to import a folder.')
      }

      const showDirectoryPicker = (
        window as Window & {
          showDirectoryPicker?: () => Promise<DirectoryHandleLike>
        }
      ).showDirectoryPicker

      if (!showDirectoryPicker) {
        throw new Error('Directory picker is not supported in this browser.')
      }

      const handle = await showDirectoryPicker()
      const entries = await collectEntriesFromDirectoryHandle(handle)
      const payload = await buildImportPayload(entries)

      if (payload.files.length === 0) {
        throw new Error('No text files found in selected folder.')
      }

      const project = await createProject(
        handle.name || 'Imported local project',
        token,
      )

      const chunks = chunkImportFiles(payload.files)
      for (const filesChunk of chunks) {
        await importFiles(
          {
            projectId: project.id,
            files: filesChunk,
            conflictStrategy: 'skip',
          },
          token,
        )
      }

      return project
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      void navigate({
        to: '/workspace',
        search: {
          projectId: project.id,
        },
      })
    },
  })

  const isAnyImportPending =
    importGithubMutation.isPending ||
    importLocalFolderMutation.isPending ||
    importDirectoryHandleMutation.isPending

  const projects = projectsQuery.data ?? []

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    if (normalized.length === 0) {
      return projects
    }

    return projects.filter((project) =>
      project.name.toLowerCase().includes(normalized),
    )
  }, [projects, query])

  return (
    <ProtectedRoute>
      <main className="mx-auto w-full max-w-[1080px] px-4 py-10 sm:py-12">
        <section className="rounded-[1.8rem] border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] px-6 py-8 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px] sm:px-8">
          <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
            Projects Hub
          </p>
          <h1 className="mb-3 font-[Fraunces,Georgia,serif] text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Pick a project and jump into the editor.
          </h1>
          <p className="mb-6 max-w-3xl text-sm leading-7 text-[var(--sea-ink-soft)] sm:text-base">
            Create, browse, and open projects directly in the editor.
          </p>

          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const nextName = projectName.trim()

              if (!nextName || createProjectMutation.isPending) {
                return
              }

              void createProjectMutation.mutateAsync(nextName)
            }}
          >
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="New project name"
              className="min-w-[220px] flex-1 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm text-[var(--sea-ink)] outline-none"
              aria-label="New project name"
            />
            <button
              type="submit"
              disabled={createProjectMutation.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={14} />
              {createProjectMutation.isPending
                ? 'Creating...'
                : 'Create project'}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
              className="min-w-[220px] flex-1 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm text-[var(--sea-ink)] outline-none"
              aria-label="GitHub repository URL"
            />
            <button
              type="button"
              disabled={isAnyImportPending || githubUrl.trim().length === 0}
              onClick={() => {
                const nextUrl = githubUrl.trim()
                if (!nextUrl) {
                  return
                }

                void importGithubMutation.mutateAsync(nextUrl)
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Github size={14} />
              {importGithubMutation.isPending
                ? 'Importing...'
                : 'Import GitHub repo'}
            </button>
            <button
              type="button"
              disabled={isAnyImportPending}
              onClick={() => {
                if (
                  (window as Window & { showDirectoryPicker?: unknown })
                    .showDirectoryPicker
                ) {
                  void importDirectoryHandleMutation.mutateAsync()
                  return
                }

                folderPickerInputRef.current?.click()
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DownloadCloud size={14} />
              {importLocalFolderMutation.isPending ||
              importDirectoryHandleMutation.isPending
                ? 'Importing...'
                : 'Import local folder'}
            </button>
            <input
              ref={folderPickerInputRef}
              type="file"
              className="hidden"
              // @ts-expect-error webkitdirectory is not in React type defs
              webkitdirectory=""
              multiple
              onChange={(event) => {
                const files = event.target.files
                if (!files || files.length === 0) {
                  return
                }

                void importLocalFolderMutation.mutateAsync(files)
                event.currentTarget.value = ''
              }}
            />
          </div>

          {createProjectMutation.isError ? (
            <p className="mb-0 mt-3 text-sm text-[var(--sea-ink-soft)]">
              Could not create project: {createProjectMutation.error.message}
            </p>
          ) : null}

          {importGithubMutation.isError ? (
            <p className="mb-0 mt-3 text-sm text-[var(--sea-ink-soft)]">
              Could not import GitHub project:{' '}
              {importGithubMutation.error.message}
            </p>
          ) : null}

          {importLocalFolderMutation.isError ||
          importDirectoryHandleMutation.isError ? (
            <p className="mb-0 mt-3 text-sm text-[var(--sea-ink-soft)]">
              Could not import folder:{' '}
              {(importLocalFolderMutation.error || importDirectoryHandleMutation.error).message}
            </p>
          ) : null}
        </section>

        <section className="mt-7 rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px] sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
                All Projects
              </p>
              <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">
                Your workspace entries
              </h2>
            </div>
            <div className="inline-flex items-center gap-[0.35rem] rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-[0.8rem] py-[0.42rem] text-xs text-[var(--sea-ink-soft)]">
              <span>{projects.length}</span>
              <span>{projects.length === 1 ? 'project' : 'projects'}</span>
            </div>
          </div>

          <label className="mb-5 flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-2 text-sm text-[var(--sea-ink-soft)]">
            <FolderOpenDot size={14} />
            <input
              aria-label="Filter projects"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter projects by name"
              className="w-full bg-transparent text-sm text-[var(--sea-ink)] outline-none placeholder:text-[var(--sea-ink-soft)]"
            />
          </label>

          {projectsQuery.isLoading ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              Loading projects...
            </p>
          ) : null}

          {projectsQuery.isError ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              Could not load projects: {projectsQuery.error.message}
            </p>
          ) : null}

          {!projectsQuery.isLoading &&
          !projectsQuery.isError &&
          filteredProjects.length === 0 ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              {projects.length === 0
                ? 'No projects yet. Create your first one above.'
                : 'No projects match your search.'}
            </p>
          ) : null}

          {!projectsQuery.isLoading &&
          !projectsQuery.isError &&
          filteredProjects.length > 0 ? (
            <div className="grid gap-[0.85rem] lg:grid-cols-2">
              {filteredProjects.map((project) => (
                <article
                  key={project.id}
                  className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-4 shadow-[inset_0_1px_0_var(--inset-glint),0_10px_24px_rgba(23,58,64,0.08)] transition-transform duration-180 hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--lagoon-deep)_34%,var(--line))]"
                >
                  <div>
                    <h3 className="mb-1 mt-0 text-lg font-semibold text-[var(--sea-ink)]">
                      {project.name}
                    </h3>
                    <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                      {formatRelativeTime(project.updatedAt)}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigate({
                          to: '/workspace',
                          search: {
                            projectId: project.id,
                          },
                        })
                      }}
                      className="rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)]"
                    >
                      Open in editor
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </ProtectedRoute>
  )
}
