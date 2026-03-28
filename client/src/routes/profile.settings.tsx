import { createFileRoute } from '@tanstack/react-router'
import { Bell, MonitorCog, ShieldCheck } from 'lucide-react'
import ProtectedRoute from '../auth/ProtectedRoute'
import ProfilePageFrame from '../components/profile/ProfilePageFrame'

export const Route = createFileRoute('/profile/settings')({
  component: ProfileSettingsRoute,
})

function ProfileSettingsRoute() {
  return (
    <ProtectedRoute>
      <ProfilePageFrame
        title="Settings"
        description="Review workspace preferences and security-related defaults."
      >
        <section className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-4">
            <p className="m-0 inline-flex items-center gap-2 text-sm font-bold text-[var(--sea-ink)]">
              <MonitorCog size={15} /> Workspace Defaults
            </p>
            <p className="m-0 mt-2 text-xs text-[var(--sea-ink-soft)]">
              Editor, assistant, and panel layout settings are inherited from your current workspace.
            </p>
          </article>

          <article className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-4">
            <p className="m-0 inline-flex items-center gap-2 text-sm font-bold text-[var(--sea-ink)]">
              <Bell size={15} /> Notifications
            </p>
            <p className="m-0 mt-2 text-xs text-[var(--sea-ink-soft)]">
              Notification channels are currently managed globally and will be configurable here.
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--chip-bg)] p-4">
          <p className="m-0 inline-flex items-center gap-2 text-sm font-bold text-[var(--sea-ink)]">
            <ShieldCheck size={15} /> Security
          </p>
          <p className="m-0 mt-2 text-xs text-[var(--sea-ink-soft)]">
            Account authentication and session policies are enforced through Auth0 and your organization setup.
          </p>
        </section>
      </ProfilePageFrame>
    </ProtectedRoute>
  )
}
