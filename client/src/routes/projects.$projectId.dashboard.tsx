import { createFileRoute } from '@tanstack/react-router'
import ProtectedRoute from '../auth/ProtectedRoute'
import ProjectDashboardPanel from '../components/projects/ProjectDashboardPanel'

export const Route = createFileRoute('/projects/$projectId/dashboard')({
  component: ProjectDashboardPage,
})

function ProjectDashboardPage() {
  const { projectId } = Route.useParams()

  return (
    <ProtectedRoute>
      <main className="mx-auto w-full max-w-[1160px] px-4 py-10 sm:py-12">
        <ProjectDashboardPanel projectId={projectId} showBackButton />
      </main>
    </ProtectedRoute>
  )
}
