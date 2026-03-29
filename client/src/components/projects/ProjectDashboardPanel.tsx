import { useAuth0 } from '@auth0/auth0-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowUpRight,
  Copy,
  Crown,
  Mail,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { auth0Config } from '../../lib/auth0-config'
import {
  createProjectInvite,
  deleteProject,
  getProjectDashboard,
  removeProjectCollaborator,
  updateProject,
  type ProjectCollaboratorDto,
} from '../../services/projects-api'
import { useToast } from '../ToastProvider'

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

function resolveCollaboratorIdentity(collaborator: ProjectCollaboratorDto) {
  const normalizedEmail = collaborator.email?.trim() || null
  const fallbackFromEmail = normalizedEmail?.split('@')[0]?.trim() || null
  const fallbackFromSubject = collaborator.subject
    ? (collaborator.subject.includes('|')
      ? collaborator.subject.split('|')[1]?.trim() || collaborator.subject
      : collaborator.subject)
    : null

  return {
    name: collaborator.displayName?.trim() || fallbackFromEmail || fallbackFromSubject || 'Unknown user',
    email: normalizedEmail || 'Not available',
  }
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
      <section className="rounded-3xl border border-[var(--line)] bg-[linear-gradient(170deg,color-mix(in_oklab,var(--surface-strong)_82%,white)_0%,var(--surface)_100%)] p-6 shadow-[inset_0_1px_0_var(--inset-glint),0_20px_34px_rgba(10,28,34,0.1)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Project dashboard</p>
            <h1 className="m-0 text-3xl font-semibold tracking-tight text-[var(--sea-ink)] sm:text-4xl">
              {dashboard?.project.name ?? 'Loading project'}
            </h1>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">
              Team, invites, and project controls in one place.
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
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-2 text-sm font-semibold text-[var(--sea-ink)]"
              >
                <ArrowLeft size={14} />
                Back
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
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="space-y-4">
            <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <h2 className="m-0 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--kicker)]">Overview</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <p className="m-0 text-[11px] text-[var(--sea-ink-soft)]">Your role</p>
                  <p className="m-0 mt-1 text-sm font-semibold text-[var(--sea-ink)]">{dashboard.actorRole}</p>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <p className="m-0 text-[11px] text-[var(--sea-ink-soft)]">Updated</p>
                  <p className="m-0 mt-1 text-sm font-semibold text-[var(--sea-ink)]">{formatRelativeTime(dashboard.project.updatedAt)}</p>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <p className="m-0 text-[11px] text-[var(--sea-ink-soft)]">Collaborators</p>
                  <p className="m-0 mt-1 text-sm font-semibold text-[var(--sea-ink)]">{dashboard.collaborators.length}</p>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <p className="m-0 text-[11px] text-[var(--sea-ink-soft)]">Active invites</p>
                  <p className="m-0 mt-1 text-sm font-semibold text-[var(--sea-ink)]">{dashboard.activeInvites.length}</p>
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-[var(--lagoon-deep)]" />
                <h2 className="m-0 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--kicker)]">Collaborators</h2>
              </div>

              {ownerCollaborator ? (
                <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
                        {resolveCollaboratorIdentity(ownerCollaborator).name}
                      </p>
                      <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)] inline-flex items-center gap-1">
                        <Mail size={11} />
                        {resolveCollaboratorIdentity(ownerCollaborator).email}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[rgba(var(--lagoon-rgb),0.12)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--lagoon-deep)]">
                      <Crown size={11} />
                      Owner
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {editorCollaborators.length === 0 ? (
                  <p className="m-0 text-sm text-[var(--sea-ink-soft)]">No editors yet.</p>
                ) : (
                  editorCollaborators.map((collaborator) => {
                    const identity = resolveCollaboratorIdentity(collaborator)
                    return (
                      <div
                        key={`${collaborator.subject ?? 'unknown'}-${collaborator.createdAt}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-3 py-2"
                      >
                        <div>
                          <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{identity.name}</p>
                          <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">{identity.email}</p>
                          <p className="m-0 mt-1 text-[11px] text-[var(--sea-ink-soft)]">Added {formatRelativeTime(collaborator.createdAt)}</p>
                        </div>

                        {isOwner && collaborator.subject ? (
                          <button
                            type="button"
                            disabled={removeCollaboratorMutation.isPending}
                            onClick={() => {
                              void removeCollaboratorMutation.mutateAsync(collaborator.subject as string)
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(190,62,59,0.25)] bg-[rgba(190,62,59,0.08)] px-3 py-1.5 text-xs font-semibold text-[#9a312f] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <UserMinus size={12} />
                            Remove
                          </button>
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </article>
          </section>

          <section className="space-y-4">
            <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <h2 className="m-0 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--kicker)]">Project settings</h2>
              <p className="m-0 mt-2 text-sm text-[var(--sea-ink-soft)]">Rename your project.</p>

              <form
                className="mt-4 flex flex-col gap-2"
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
                  className="rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-2 text-sm text-[var(--sea-ink)] outline-none"
                  aria-label="Project title"
                />
                <button
                  type="submit"
                  disabled={renameProjectMutation.isPending || nextTitle.trim().length === 0}
                  className="inline-flex items-center justify-center rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {renameProjectMutation.isPending ? 'Saving...' : 'Save title'}
                </button>
              </form>
            </article>

            <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <h2 className="m-0 text-sm font-semibold uppercase tracking-[0.12em] text-[var(--kicker)]">Invite collaborators</h2>
              <p className="m-0 mt-2 text-sm text-[var(--sea-ink-soft)]">Create and copy an invite link.</p>

              <button
                type="button"
                disabled={!isOwner || createInviteMutation.isPending}
                onClick={() => {
                  void createInviteMutation.mutateAsync()
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[rgba(50,143,151,0.35)] bg-[rgba(79,184,178,0.16)] px-3 py-2 text-sm font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
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
              <article className="rounded-2xl border border-[rgba(190,62,59,0.24)] bg-[linear-gradient(160deg,rgba(255,244,242,0.82),rgba(255,249,248,0.72))] p-5">
                <h2 className="m-0 text-sm font-semibold uppercase tracking-[0.12em] text-[#7b2f2b]">Danger zone</h2>
                <p className="mb-0 mt-2 text-sm text-[#8c4a46]">Delete this project permanently.</p>

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
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[rgba(190,62,59,0.28)] bg-[rgba(190,62,59,0.1)] px-3 py-2 text-sm font-semibold text-[#8f302d] disabled:cursor-not-allowed disabled:opacity-60"
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
