import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { useState } from 'react'
import ProtectedRoute from '../auth/ProtectedRoute'
import LogoutButton from '../components/auth/LogoutButton'
import UserInfo from '../components/auth/UserInfo'
import { createProject, listProjects } from '../services/projects-api'
import { auth0Config } from '../lib/auth0-config'

export const Route = createFileRoute('/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()
  const [projectName, setProjectName] = useState('')

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Config.audience,
        },
      }).catch(() => null)
      return listProjects(token)
    },
  })

  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Config.audience,
        },
      }).catch(() => null)
      return createProject(name, token)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  async function handleCreateProject(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault()

    const name = projectName.trim()
    if (!name) {
      return
    }

    try {
      await createProjectMutation.mutateAsync(name)
      setProjectName('')
    } catch {
      return
    }
  }

  return (
    <ProtectedRoute>
      <main className="page-wrap px-4 py-12">
        <section className="island-shell rounded-[2rem] px-6 py-10 sm:px-10 sm:py-12">
          <p className="island-kicker mb-3">Protected Route</p>
          <h1 className="display-title mb-4 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
            Dashboard
          </h1>
          <p className="mb-8 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
            If you can see this page, Auth0 confirmed your session and the app
            returned you to the protected route you originally requested. The
            project list below now comes from the Phase 0 backend API.
          </p>
          <div className="flex flex-wrap gap-3">
            <LogoutButton />
          </div>
        </section>

        <section className="island-shell mt-8 rounded-2xl p-6">
          <p className="island-kicker mb-2">Projects API</p>
          <form className="mb-4 flex flex-wrap gap-2" onSubmit={handleCreateProject}>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="New project name"
              className="min-w-[220px] flex-1 rounded-full border border-[var(--chip-line)] bg-white/70 px-4 py-2 text-sm text-[var(--sea-ink)]"
            />
            <button
              type="submit"
              disabled={createProjectMutation.isPending}
              className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)]"
            >
              {createProjectMutation.isPending ? 'Creating...' : 'Create project'}
            </button>
          </form>

          {projectsQuery.isLoading ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">Loading projects...</p>
          ) : null}

          {projectsQuery.isError ? (
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              Could not load projects: {projectsQuery.error.message}
            </p>
          ) : null}

          {createProjectMutation.isError ? (
            <p className="m-0 mt-2 text-sm text-[var(--sea-ink-soft)]">
              Could not create project: {createProjectMutation.error.message}
            </p>
          ) : null}

          {projectsQuery.data ? (
            projectsQuery.data.length > 0 ? (
              <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
                {projectsQuery.data.map((project) => (
                  <li key={project.id}>
                    <span className="font-medium text-[var(--sea-ink)]">{project.name}</span>{' '}
                    <span>({project.id})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
                No projects yet. Create one to confirm frontend-backend wiring.
              </p>
            )
          ) : null}
        </section>

        <div className="mt-8">
          <UserInfo />
        </div>
      </main>
    </ProtectedRoute>
  )
}
