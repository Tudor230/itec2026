import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/dashboard')({
  component: DashboardRedirect,
})

function DashboardRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    void navigate({ to: '/projects', replace: true })
  }, [navigate])

  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 py-12">
      <p className="text-sm text-[var(--sea-ink-soft)]">Redirecting to projects...</p>
    </main>
  )
}
