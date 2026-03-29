import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Copy, LayoutPanelTop, Trash2, UserMinus, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { auth0Config } from '../../lib/auth0-config'
import { useToast } from '../ToastProvider'
import {
  createProjectInvite,
  deleteProject,
  getProjectDashboard,
  removeProjectCollaborator,
  updateProject,
} from '../../services/projects-api'

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return 'recently'
  }

  const minutes = Math.round((Date.now() - timestamp) / 60000)

  if (minutes < 1) {
    return 'just now'
  }

  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function formatSubject(subject: string | null) {
  if (!subject) {
    return 'Unknown user'
  }

  const [, rest] = subject.split('|')
  if (!rest) {
    return subject
  }

  return rest
}

type ProjectDashboardPanelProps = {
  projectId: string
  showBackButton?: boolean
  topControls?: ReactNode
  onDeleted?: () => Promise<void> | void
}

export default function ProjectDashboardPanel({
  projectId,
  showBackButton = true,
  topControls,
  onDeleted,
}: ProjectDashboardPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { getAccessTokenSilently } = useAuth0()
  const { success, error: toastError, toast } = useToast()
  const [nextTitle, setNextTitle] = useState('')

  async function getApiAccessToken() {
    return getAccessTokenSilently({
      authorizationParams: {
        audience: auth0Config.audience,
      },
    }).catch(() => null)
  }

  const dashboardQuery = useQuery({
    queryKey: ['project-dashboard', projectId],
    queryFn: async () => {
      const token = await getApiAccessToken()
      return getProjectDashboard(projectId, token)
    },
  })

  const renameProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await getApiAccessToken()
      return updateProject(projectId, { name }, token)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['project-dashboard', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', 'projects'] }),
      ])
      setNextTitle('')
      success('Project title updated')
    },
    onError: (mutationError) => {
      toastError(`Could not update title: ${mutationError.message}`)
    },
  })

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const token = await getApiAccessToken()
      return createProjectInvite(projectId, token)
    },
    onSuccess: async (invite) => {
      if (!invite.inviteToken) {
        toastError('Could not create invite link. Please try again.')
        return
      }

      const inviteLink = `${window.location.origin}/invite/${invite.inviteToken}`

      try {
        await navigator.clipboard.writeText(inviteLink)
        success('Invite link copied to clipboard')
      } catch {
        toast(`Invite link: ${inviteLink}`, 'info', 10000)
      }

      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', projectId] })
    },
    onError: (mutationError) => {
      toastError(`Could not create invite: ${mutationError.message}`)
    },
  })

  const removeCollaboratorMutation = useMutation({
    mutationFn: async (subject: string) => {
      const token = await getApiAccessToken()
      return removeProjectCollaborator(projectId, subject, token)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', projectId] })
      success('Collaborator removed')
    },
    onError: (mutationError) => {
      toastError(`Could not remove collaborator: ${mutationError.message}`)
    },
  })

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const token = await getApiAccessToken()
      return deleteProject(projectId, token)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace', 'projects'] }),
      ])
      success('Project deleted')

      if (onDeleted) {
        await onDeleted()
        return
      }

      await navigate({ to: '/projects' })
    },
    onError: (mutationError) => {
      toastError(`Could not delete project: ${mutationError.message}`)
    },
  })

  const dashboard = dashboardQuery.data
  const isOwner = dashboard?.actorRole === 'owner'

  const editorCollaborators = useMemo(() => {
    return (dashboard?.collaborators ?? []).filter((collaborator) => collaborator.role === 'editor')
  }, [dashboard])

  const ownerCollaborator = useMemo(() => {
    return (dashboard?.collaborators ?? []).find((collaborator) => collaborator.role === 'owner') ?? null
  }, [dashboard])

  return (
    <>
      <section className="rounded-[1.9rem] border border-[var(--line)] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--surface-strong)_90%,white)_0%,var(--surface)_100%)] px-6 py-7 shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(30,90,72,0.1),0_6px_18px_rgba(23,58,64,0.08)] sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Project dashboard</p>
            <h1 className="m-0 font-[Fraunces,Georgia,serif] text-3xl font-bold text-[var(--sea-ink)] sm:text-4xl">
              {dashboard?.project.name ?? 'Loading project'}
            </h1>
            <p className="mb-0 mt-2 text-sm text-[var(--sea-ink-soft)]">
              Manage your collaborators, title, and access from one place.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {topControls}
            {showBackButton ? (
              <button
                type="button"
                onClick={() => {
                  void navigate({ to: '/projects' })
                }}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)]"
              >
                <ArrowLeft size={14} />
                Back to projects
              </button>
            ) : null}

            <button
              type="button"
              disabled={!dashboard}
              onClick={() => {
                if (!dashboard) {
                  return
                }

                void navigate({
                  to: '/workspace',
                  search: {
                    projectId: dashboard.project.id,
                  },
                })
              }}
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowUpRight size={14} />
              Open in editor
            </button>
          </div>
        </div>
      </section>

      {dashboardQuery.isLoading ? (
        <p className="mt-6 text-sm text-[var(--sea-ink-soft)]">Loading dashboard...</p>
      ) : null}

      {dashboardQuery.isError ? (
        <p className="mt-6 text-sm text-[var(--sea-ink-soft)]">Could not load dashboard: {dashboardQuery.error.message}</p>
      ) : null}

      {dashboard ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <section className="space-y-4">
            <article className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--surface-strong)_88%,white)_0%,var(--surface)_100%)] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_12px_30px_rgba(23,58,64,0.08)]">
              <div className="mb-4 flex items-center gap-2">
                <LayoutPanelTop size={16} className="text-[var(--lagoon-deep)]" />
                <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Project overview</h2>
              </div>

              <dl className="m-0 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--sea-ink-soft)]">Role</dt>
                  <dd className="m-0 mt-1 font-semibold text-[var(--sea-ink)]">{dashboard.actorRole}</dd>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--sea-ink-soft)]">Updated</dt>
                  <dd className="m-0 mt-1 font-semibold text-[var(--sea-ink)]">{formatRelativeTime(dashboard.project.updatedAt)}</dd>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--sea-ink-soft)]">Collaborators</dt>
                  <dd className="m-0 mt-1 font-semibold text-[var(--sea-ink)]">{dashboard.collaborators.length}</dd>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--sea-ink-soft)]">Active invites</dt>
                  <dd className="m-0 mt-1 font-semibold text-[var(--sea-ink)]">{dashboard.activeInvites.length}</dd>
                </div>
              </dl>
            </article>

            <article className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--surface-strong)_88%,white)_0%,var(--surface)_100%)] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_12px_30px_rgba(23,58,64,0.08)]">
              <div className="mb-4 flex items-center gap-2">
                <Users size={16} className="text-[var(--lagoon-deep)]" />
                <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Collaborators</h2>
              </div>

              {ownerCollaborator ? (
                <div className="mb-3 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 text-sm">
                  <p className="m-0 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--sea-ink-soft)]">Owner</p>
                  <p className="m-0 mt-1 font-semibold text-[var(--sea-ink)]">{formatSubject(ownerCollaborator.subject)}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                {editorCollaborators.length === 0 ? (
                  <p className="m-0 text-sm text-[var(--sea-ink-soft)]">No editors yet.</p>
                ) : (
                  editorCollaborators.map((collaborator) => (
                    <div
                      key={`${collaborator.subject ?? 'unknown'}-${collaborator.createdAt}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="m-0 font-semibold text-[var(--sea-ink)]">{formatSubject(collaborator.subject)}</p>
                        <p className="m-0 text-xs text-[var(--sea-ink-soft)]">Added {formatRelativeTime(collaborator.createdAt)}</p>
                      </div>

                      {isOwner && collaborator.subject ? (
                        <button
                          type="button"
                          disabled={removeCollaboratorMutation.isPending}
                          onClick={() => {
                            void removeCollaboratorMutation.mutateAsync(collaborator.subject as string)
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(190,62,59,0.25)] bg-[rgba(190,62,59,0.08)] px-3 py-1.5 text-xs font-semibold text-[#9a312f] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <UserMinus size={12} />
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="space-y-4">
            <article className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--surface-strong)_88%,white)_0%,var(--surface)_100%)] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_12px_30px_rgba(23,58,64,0.08)]">
              <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Project settings</h2>
              <p className="mb-0 mt-1 text-sm text-[var(--sea-ink-soft)]">Rename your project and keep naming clean for your team.</p>

              <form
                className="mt-4 flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const normalizedName = nextTitle.trim()

                  if (!normalizedName || renameProjectMutation.isPending) {
                    return
                  }

                  void renameProjectMutation.mutateAsync(normalizedName)
                }}
              >
                <input
                  value={nextTitle}
                  onChange={(event) => setNextTitle(event.target.value)}
                  placeholder={dashboard.project.name}
                  className="min-w-[220px] flex-1 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm text-[var(--sea-ink)] outline-none"
                  aria-label="Project title"
                />
                <button
                  type="submit"
                  disabled={renameProjectMutation.isPending || nextTitle.trim().length === 0}
                  className="rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {renameProjectMutation.isPending ? 'Saving...' : 'Save title'}
                </button>
              </form>
            </article>

            <article className="rounded-2xl border border-[var(--line)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--surface-strong)_88%,white)_0%,var(--surface)_100%)] p-5 shadow-[inset_0_1px_0_var(--inset-glint),0_12px_30px_rgba(23,58,64,0.08)]">
              <h2 className="m-0 text-lg font-semibold text-[var(--sea-ink)]">Invite collaborators</h2>
              <p className="mb-0 mt-1 text-sm text-[var(--sea-ink-soft)]">Create an invite link and share it with your teammate.</p>

              <button
                type="button"
                disabled={!isOwner || createInviteMutation.isPending}
                onClick={() => {
                  void createInviteMutation.mutateAsync()
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-4 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Copy size={14} />
                {createInviteMutation.isPending ? 'Creating invite...' : 'Create invite link'}
              </button>

              {!isOwner ? (
                <p className="mb-0 mt-3 text-xs text-[var(--sea-ink-soft)]">Only project owners can create invite links.</p>
              ) : null}

              <div className="mt-4 space-y-2">
                {dashboard.activeInvites.length === 0 ? (
                  <p className="m-0 text-sm text-[var(--sea-ink-soft)]">No active invite links.</p>
                ) : (
                  dashboard.activeInvites.map((invite) => (
                    <div key={invite.id} className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                      <p className="m-0 text-xs font-semibold text-[var(--sea-ink)]">Invite created {formatRelativeTime(invite.createdAt)}</p>
                      <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">Expires {new Date(invite.expiresAt).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </article>

            {isOwner ? (
              <article className="rounded-2xl border border-[rgba(190,62,59,0.24)] bg-[linear-gradient(160deg,rgba(255,244,242,0.78),rgba(255,249,248,0.62))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_10px_22px_rgba(70,18,16,0.08)]">
                <h2 className="m-0 text-lg font-semibold text-[#7b2f2b]">Danger zone</h2>
                <p className="mb-0 mt-1 text-sm text-[#8c4a46]">Delete this project permanently. Files and shared access will be removed.</p>

                <button
                  type="button"
                  disabled={deleteProjectMutation.isPending}
                  onClick={() => {
                    const confirmed = window.confirm('Delete this project permanently? This cannot be undone.')
                    if (!confirmed) {
                      return
                    }

                    void deleteProjectMutation.mutateAsync()
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(190,62,59,0.28)] bg-[rgba(190,62,59,0.1)] px-4 py-2 text-sm font-semibold text-[#8f302d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete project'}
                </button>
              </article>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
