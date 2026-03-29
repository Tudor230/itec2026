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
    <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(0,0,0,0.6)] p-[clamp(1rem,2.5vw,2rem)] backdrop-blur-xl">
      <div className="grid w-full max-w-[1100px] items-stretch gap-4 lg:grid-cols-2">
        {infoOpen ? (
          <section className="relative rounded-2xl border border-[color-mix(in_oklab,var(--line)_78%,var(--lagoon)_22%)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-[1.15rem] shadow-[inset_0_1px_0_var(--inset-glint),0_24px_45px_rgba(10,25,31,0.28)]">
            <button
              type="button"
              onClick={onCloseInfo}
              className="absolute right-[0.7rem] top-[0.7rem] grid h-8 w-8 place-items-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]"
              aria-label="Hide context panel"
              title="Hide context panel"
            >
              <X size={16} />
            </button>
            <p className="mb-2 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">
              Session Context
            </p>
            <h2 className="mb-3 text-2xl font-semibold text-[var(--sea-ink)]">
              Sign in to continue to your projects.
            </h2>
            <p className="mb-3 text-sm leading-7 text-[var(--sea-ink-soft)]">
              iTECify keeps your project data and editor state protected. Once
              authenticated, you land in Projects and can open any project
              directly in the editor.
            </p>
            <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
              <li>See your projects immediately after login.</li>
              <li>Open the exact project you need in one click.</li>
              <li>Resume coding with editor and files preloaded.</li>
            </ul>
          </section>
        ) : null}

        <section className="relative min-h-[360px] rounded-2xl border border-[color-mix(in_oklab,var(--line)_78%,var(--lagoon)_22%)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-[1.15rem] shadow-[inset_0_1px_0_var(--inset-glint),0_24px_45px_rgba(10,25,31,0.28)]">
          {!infoOpen ? (
            <button
              type="button"
              onClick={onOpenInfo}
              className="absolute right-[0.7rem] top-[0.7rem] grid h-8 w-8 place-items-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]"
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
