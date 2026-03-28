import { HelpCircle, X } from 'lucide-react'
import AuthEntryCard from '../auth/AuthEntryCard'

export type AuthTab = 'login' | 'register'

interface WorkspaceAuthOverlayProps {
  isLoading: boolean
  infoOpen: boolean
  activeTab: AuthTab
  authError: string | null
  runtimeError: string | null
  onCloseInfo: () => void
  onOpenInfo: () => void
  onChangeTab: (nextTab: AuthTab) => void
  onStartAuth: (mode: AuthTab, connection?: 'google-oauth2' | 'github') => void
}

export default function WorkspaceAuthOverlay({
  isLoading,
  infoOpen,
  activeTab,
  authError,
  runtimeError,
  onCloseInfo,
  onOpenInfo,
  onChangeTab,
  onStartAuth,
}: WorkspaceAuthOverlayProps) {
  const errorMessage = authError ?? runtimeError

  return (
    <div className="workspace-auth-overlay">
      <div className="workspace-auth-panels">
        {infoOpen ? (
          <section className="workspace-auth-card">
            <button
              type="button"
              onClick={onCloseInfo}
              className="workspace-auth-dismiss"
              aria-label="Hide context panel"
              title="Hide context panel"
            >
              <X size={16} />
            </button>
            <p className="island-kicker mb-2">Session Context</p>
            <h2 className="mb-3 text-2xl font-semibold text-[var(--sea-ink)]">
              Sign in to continue to your projects.
            </h2>
            <p className="mb-3 text-sm leading-7 text-[var(--sea-ink-soft)]">
              iTECify keeps your project data and editor state protected. Once authenticated,
              you land in Projects and can open any project directly in the editor.
            </p>
            <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
              <li>See your projects immediately after login.</li>
              <li>Open the exact project you need in one click.</li>
              <li>Resume coding with editor and files preloaded.</li>
            </ul>
          </section>
        ) : null}

        <section className="workspace-auth-card workspace-auth-card-auth">
          {!infoOpen ? (
            <button
              type="button"
              onClick={onOpenInfo}
              className="workspace-auth-help"
              aria-label="Show context panel"
              title="Show context panel"
            >
              <HelpCircle size={17} />
            </button>
          ) : null}

          <AuthEntryCard
            mode={activeTab}
            isLoading={isLoading}
            errorMessage={errorMessage}
            onModeChange={onChangeTab}
            onStartAuth={onStartAuth}
          />

          <p className="m-0 mt-4 text-xs text-[var(--sea-ink-soft)]">
            Hosted login is currently enabled for reliability while we build the
            full in-workspace authentication experience.
          </p>
        </section>
      </div>
    </div>
  )
}
