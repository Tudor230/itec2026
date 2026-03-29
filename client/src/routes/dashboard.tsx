import { useAuth0 } from '@auth0/auth0-react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import ProtectedRoute from '../auth/ProtectedRoute'
import ProjectDashboardPanel from '../components/projects/ProjectDashboardPanel'
import { auth0Config } from '../lib/auth0-config'
import { listProjects } from '../services/projects-api'

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>) => {
    const normalizedProjectId =
      typeof search.projectId === 'string' ? search.projectId.trim() : ''

    return {
      projectId: normalizedProjectId.length > 0 ? normalizedProjectId : undefined,
    }
  },
  component: DashboardRoute,
})

function DashboardRoute() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { getAccessTokenSilently } = useAuth0()

  const projectsQuery = useQuery({
    queryKey: ['dashboard-projects'],
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Config.audience,
        },
      }).catch(() => null)

      if (!token) {
        return []
      }

      return listProjects(token)
    },
  })

  const selectedProjectId = useMemo(() => {
    if (search.projectId) {
      return search.projectId
    }

    return projectsQuery.data?.[0]?.id
  }, [projectsQuery.data, search.projectId])

  return (
    <ProtectedRoute>
      <main className="mx-auto w-full max-w-[1160px] px-4 py-10 sm:py-12">
        <section className="rounded-[1.9rem] border border-[var(--line)] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--surface-strong)_90%,white)_0%,var(--surface)_100%)] px-6 py-7 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Dashboard</p>
              <h1 className="m-0 font-[Fraunces,Georgia,serif] text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
                Project management
              </h1>
              <p className="mb-0 mt-2 text-sm text-[var(--sea-ink-soft)]">
                Pick a project and manage collaborators, title, and access.
              </p>
            </div>

            <div className="min-w-[260px]">
              <label className="mb-1 block text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--sea-ink-soft)]" htmlFor="dashboard-project-select">
                Selected project
              </label>
              <select
                id="dashboard-project-select"
                value={selectedProjectId ?? ''}
                disabled={projectsQuery.isLoading || (projectsQuery.data?.length ?? 0) === 0}
                onChange={(event) => {
                  const nextProjectId = event.target.value
                  void navigate({
                    to: '/dashboard',
                    search: {
                      projectId: nextProjectId.length > 0 ? nextProjectId : undefined,
                    },
                    replace: true,
                  })
                }}
                className="w-full rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm text-[var(--sea-ink)] outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {(projectsQuery.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {projectsQuery.isLoading ? (
          <p className="mt-6 text-sm text-[var(--sea-ink-soft)]">Loading projects...</p>
        ) : null}

        {projectsQuery.isError ? (
          <p className="mt-6 text-sm text-[var(--sea-ink-soft)]">Could not load projects: {projectsQuery.error.message}</p>
        ) : null}

        {!projectsQuery.isLoading && !projectsQuery.isError && (projectsQuery.data?.length ?? 0) === 0 ? (
          <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--surface-strong)_88%,white)_0%,var(--surface)_100%)] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_12px_30px_rgba(23,58,64,0.08)]">
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">No projects available yet. Create a project first.</p>
          </section>
        ) : null}

        {selectedProjectId ? (
          <div className="mt-6">
            <ProjectDashboardPanel
              projectId={selectedProjectId}
              showBackButton={false}
              onDeleted={async () => {
                const refreshed = await projectsQuery.refetch()
                const nextProjects = refreshed.data ?? []
                const remaining = nextProjects.filter((project) => project.id !== selectedProjectId)
                const nextProjectId = remaining[0]?.id

                await navigate({
                  to: '/dashboard',
                  search: {
                    projectId: nextProjectId,
                  },
                  replace: true,
                })
              }}
            />
          </div>
        ) : null}
      </main>
    </ProtectedRoute>
  )
}
