import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, FolderOpenDot, Github, LayoutPanelTop, Plus, Upload, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import ProtectedRoute from '../auth/ProtectedRoute'
import { cn } from '../lib/utils'
import {
  createProject,
  deleteProject,
  importGithubProject,
  importLocalFiles,
  listProjects,
} from '../services/projects-api'

type AddProjectMode = 'create' | 'local' | 'remote-git'

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
  const [githubRepoUrl, setGithubRepoUrl] = useState('')
  const [githubProjectName, setGithubProjectName] = useState('')
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false)
  const [addProjectMode, setAddProjectMode] = useState<AddProjectMode>('create')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const directoryInputProps = {
    webkitdirectory: '',
  } as Record<string, string>

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
      closeAddProjectModal()
      void navigate({
        to: '/workspace',
        search: {
          projectId: project.id,
        },
      })
    },
  })

  const importGithubMutation = useMutation({
    mutationFn: async (input: { repositoryUrl: string; projectName: string }) => {
      const token = await getAccessTokenSilently().catch(() => null)
      const createdProject = await createProject(input.projectName, token)
      let imported

      try {
        imported = await importGithubProject(
          {
            projectId: createdProject.id,
            repositoryUrl: input.repositoryUrl,
          },
          token,
        )
      } catch (error) {
        try {
          await deleteProject(createdProject.id, token)
        } catch {
          // best effort cleanup
        }

        throw error
      }

      return {
        projectId: createdProject.id,
        imported,
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      setGithubRepoUrl('')
      setGithubProjectName('')
      closeAddProjectModal()
      void navigate({
        to: '/workspace',
        search: {
          projectId: result.projectId,
        },
      })
    },
  })

  const importLocalFolderMutation = useMutation({
    mutationFn: async (input: {
      projectName: string
      files: Array<{ path: string; content: string }>
    }) => {
      const token = await getAccessTokenSilently().catch(() => null)
      const createdProject = await createProject(input.projectName, token)
      let imported

      try {
        imported = await importLocalFiles(
          {
            projectId: createdProject.id,
            files: input.files,
          },
          token,
        )
      } catch (error) {
        try {
          await deleteProject(createdProject.id, token)
        } catch {
          // best effort cleanup
        }

        throw error
      }

      return {
        projectId: createdProject.id,
        imported,
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      closeAddProjectModal()
      void navigate({
        to: '/workspace',
        search: {
          projectId: result.projectId,
        },
      })
    },
  })

  const projects = projectsQuery.data ?? []

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    if (normalized.length === 0) {
      return projects
    }

    return projects.filter((project) => project.name.toLowerCase().includes(normalized))
  }, [projects, query])

  const parseRepoNameFromUrl = (repositoryUrl: string) => {
    try {
      const parsed = new URL(repositoryUrl)
      const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0)
      const repo = segments[1] ?? 'imported-project'
      return repo.endsWith('.git') ? repo.slice(0, -4) : repo
    } catch {
      return 'imported-project'
    }
  }

  const closeAddProjectModal = () => {
    setIsAddProjectModalOpen(false)
  }

  const anyAddActionPending =
    createProjectMutation.isPending ||
    importGithubMutation.isPending ||
    importLocalFolderMutation.isPending

  return (
    <ProtectedRoute>
      <main className="mx-auto w-full max-w-[1160px] px-4 py-10 sm:py-12">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 shadow-[inset_0_1px_0_var(--inset-glint)] sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">Projects</h1>
              <p className="m-0 mt-1 text-sm text-[var(--sea-ink-soft)]">Create a new project or import one.</p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddProjectModalOpen(true)}
              className="inline-flex items-center gap-2 self-start rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] sm:self-auto"
            >
              <Plus size={14} />
              Add project
            </button>
          </div>
        </section>

        {isAddProjectModalOpen ? (
          <div
            className="fixed inset-0 z-[180] flex items-center justify-center bg-[rgba(8,20,24,0.34)] px-4 py-8 backdrop-blur-md"
            onClick={() => {
              if (anyAddActionPending) {
                return
              }

              closeAddProjectModal()
            }}
          >
            <div
              className="w-full max-w-[620px] rounded-3xl border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-5 shadow-[0_24px_60px_rgba(11,28,33,0.3)] sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Add Project</p>
                  <h3 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">Choose how you want to add it</h3>
                </div>
                <button
                  type="button"
                  disabled={anyAddActionPending}
                  onClick={closeAddProjectModal}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Close add project modal"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mb-5 rounded-full border border-[var(--chip-line)] bg-[rgba(var(--bg-rgb),0.44)] p-1">
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { value: 'create', label: 'Create' },
                    { value: 'local', label: 'Local folder' },
                    { value: 'remote-git', label: 'Remote Git' },
                  ] as Array<{ value: AddProjectMode; label: string }>).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAddProjectMode(option.value)}
                      className={cn(
                        'rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                        addProjectMode === option.value
                          ? 'bg-[rgba(var(--lagoon-rgb),0.2)] text-[var(--lagoon-deep)]'
                          : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {addProjectMode === 'create' ? (
                <form
                  className="flex flex-col gap-3"
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
                    placeholder="Project name"
                    className="rounded-xl border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none"
                    aria-label="New project name"
                  />
                  <button
                    type="submit"
                    disabled={createProjectMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus size={14} />
                    {createProjectMutation.isPending ? 'Creating...' : 'Create project'}
                  </button>
                  {createProjectMutation.isError ? (
                    <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                      Could not create project: {createProjectMutation.error.message}
                    </p>
                  ) : null}
                </form>
              ) : null}

              {addProjectMode === 'local' ? (
                <div className="flex flex-col gap-3">
                  <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
                    Pick a folder from your computer. A project will be created automatically with that folder name.
                  </p>
                  <button
                    type="button"
                    disabled={importLocalFolderMutation.isPending}
                    onClick={() => {
                      fileInputRef.current?.click()
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--chip-line)] bg-[rgba(var(--bg-rgb),0.6)] px-4 py-2.5 text-sm font-semibold text-[var(--sea-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload size={14} />
                    {importLocalFolderMutation.isPending ? 'Importing...' : 'Choose folder'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    multiple
                    {...directoryInputProps}
                    onChange={(event) => {
                      const fileList = event.target.files
                      if (!fileList || fileList.length === 0 || importLocalFolderMutation.isPending) {
                        return
                      }

                      const files = Array.from(fileList)
                      const firstRelative = files[0]?.webkitRelativePath || files[0]?.name || ''
                      const rootFolder = firstRelative.split('/')[0] || 'imported-project'
                      const nextProjectName = rootFolder.trim() || 'imported-project'

                      void Promise.all(files.map(async (file) => {
                        const relative = file.webkitRelativePath || file.name
                        return {
                          path: relative.replaceAll('\\', '/').replace(/^\/+/, ''),
                          content: await file.text(),
                        }
                      })).then((importedFiles) => {
                        const valid = importedFiles.filter((file) => file.path.length > 0)
                        if (valid.length === 0) {
                          return
                        }

                        return importLocalFolderMutation.mutateAsync({
                          projectName: nextProjectName,
                          files: valid,
                        })
                      })
                      event.currentTarget.value = ''
                    }}
                  />
                  {importLocalFolderMutation.isError ? (
                    <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                      Could not import local folder: {importLocalFolderMutation.error.message}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {addProjectMode === 'remote-git' ? (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const nextRepoUrl = githubRepoUrl.trim()
                    if (!nextRepoUrl || importGithubMutation.isPending) {
                      return
                    }

                    const fallbackName = parseRepoNameFromUrl(nextRepoUrl)
                    const nextProjectName = githubProjectName.trim() || fallbackName
                    void importGithubMutation.mutateAsync({
                      repositoryUrl: nextRepoUrl,
                      projectName: nextProjectName,
                    })
                  }}
                >
                  <input
                    value={githubRepoUrl}
                    onChange={(event) => setGithubRepoUrl(event.target.value)}
                    placeholder="https://github.com/owner/repo"
                    className="rounded-xl border border-[var(--chip-line)] bg-[rgba(var(--bg-rgb),0.55)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none"
                    aria-label="GitHub repository URL"
                  />
                  <input
                    value={githubProjectName}
                    onChange={(event) => setGithubProjectName(event.target.value)}
                    placeholder="Project name (optional)"
                    className="rounded-xl border border-[var(--chip-line)] bg-[rgba(var(--bg-rgb),0.55)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none"
                    aria-label="Imported project name"
                  />
                  <button
                    type="submit"
                    disabled={importGithubMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Github size={14} />
                    {importGithubMutation.isPending ? 'Importing...' : 'Import repository'}
                  </button>
                  {importGithubMutation.isError ? (
                    <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                      Could not import repository: {importGithubMutation.error.message}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="mt-7 rounded-[1.4rem] border border-[var(--line)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] backdrop-blur-[4px] sm:p-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">All Projects</p>
              <h2 className="m-0 text-2xl font-semibold text-[var(--sea-ink)]">Your workspace entries</h2>
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
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">Loading projects...</p>
          ) : null}

          {projectsQuery.isError ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              Could not load projects: {projectsQuery.error.message}
            </p>
          ) : null}

          {!projectsQuery.isLoading && !projectsQuery.isError && filteredProjects.length === 0 ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              {projects.length === 0
                ? 'No projects yet. Create your first one above.'
                : 'No projects match your search.'}
            </p>
          ) : null}

          {!projectsQuery.isLoading && !projectsQuery.isError && filteredProjects.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {filteredProjects.map((project) => (
                <article
                  key={project.id}
                  className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--surface-strong)_90%,white)_0%,var(--surface)_100%)] p-4 shadow-[inset_0_1px_0_var(--inset-glint),0_12px_28px_rgba(23,58,64,0.09)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--lagoon-deep)_34%,var(--line))] hover:shadow-[inset_0_1px_0_var(--inset-glint),0_18px_30px_rgba(23,58,64,0.12)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="mb-1 mt-0 text-lg font-semibold text-[var(--sea-ink)]">{project.name}</h3>
                      <p className="m-0 text-xs text-[var(--sea-ink-soft)]">{formatRelativeTime(project.updatedAt)}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.11em] text-[var(--sea-ink-soft)]">
                      Project
                    </span>
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
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)]"
                    >
                      <ArrowUpRight size={14} />
                      Open in editor
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void navigate({
                          to: '/dashboard',
                          search: {
                            projectId: project.id,
                          },
                        })
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)]"
                    >
                      <LayoutPanelTop size={14} />
                      Dashboard
                    </button>
                  </div>

                  <div className="mt-4 border-t border-[var(--line)] pt-3">
                    <p className="m-0 text-xs text-[var(--sea-ink-soft)]">{formatRelativeTime(project.updatedAt)}</p>
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
