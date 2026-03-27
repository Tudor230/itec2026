import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ProtectedRoute from '../auth/ProtectedRoute'
import { auth0Config } from '../lib/auth0-config'
import { acceptInvite, getInvitePreview } from '../services/projects-api'

export const Route = createFileRoute('/invite/$token')({
  component: InviteRoute,
})

function InviteRoute() {
  const { token } = Route.useParams()
  const { getAccessTokenSilently } = useAuth0()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const inviteQuery = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: async () => {
      const accessToken = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Config.audience,
        },
      }).catch(() => null)

      return getInvitePreview(token, accessToken)
    },
  })

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const accessToken = await getAccessTokenSilently({
        authorizationParams: {
          audience: auth0Config.audience,
        },
      }).catch(() => null)

      return acceptInvite(token, accessToken)
    },
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      await queryClient.invalidateQueries({ queryKey: ['workspace', 'projects'] })

      await navigate({
        to: '/workspace',
      })
    },
  })

  return (
    <ProtectedRoute>
      <main className="page-wrap px-4 py-10">
        <section className="island-shell mx-auto w-full max-w-2xl rounded-[1.5rem] p-8">
          <p className="island-kicker mb-2">Project invite</p>
          <h1 className="m-0 text-2xl font-bold text-[var(--sea-ink)]">Join shared project</h1>

          {inviteQuery.isLoading ? (
            <p className="mt-4 text-sm text-[var(--sea-ink-soft)]">Loading invite...</p>
          ) : null}

          {inviteQuery.isError ? (
            <p className="mt-4 text-sm text-[var(--sea-ink-soft)]">
              Could not load invite: {inviteQuery.error.message}
            </p>
          ) : null}

          {inviteQuery.data ? (
            <div className="mt-6 space-y-3 text-sm text-[var(--sea-ink-soft)]">
              <p className="m-0">
                Project: <span className="font-semibold text-[var(--sea-ink)]">{inviteQuery.data.projectName}</span>
              </p>
              <p className="m-0">Access: {inviteQuery.data.role}</p>
              <p className="m-0">Expires: {new Date(inviteQuery.data.expiresAt).toLocaleString()}</p>

              {inviteQuery.data.isExpired ? (
                <p className="m-0">This invite has expired.</p>
              ) : null}

              {inviteQuery.data.isConsumed ? (
                <p className="m-0">This invite has already been used.</p>
              ) : null}

              {inviteQuery.data.isRevoked ? (
                <p className="m-0">This invite has been revoked.</p>
              ) : null}

              <button
                type="button"
                disabled={
                  acceptMutation.isPending
                  || inviteQuery.data.isExpired
                  || inviteQuery.data.isConsumed
                  || inviteQuery.data.isRevoked
                }
                onClick={() => {
                  void acceptMutation.mutateAsync()
                }}
                className="mt-3 rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {acceptMutation.isPending ? 'Joining...' : 'Accept invite'}
              </button>

              {acceptMutation.isError ? (
                <p className="m-0">Could not accept invite: {acceptMutation.error.message}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </ProtectedRoute>
  )
}
