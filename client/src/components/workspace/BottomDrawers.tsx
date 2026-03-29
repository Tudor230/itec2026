import { useState, useRef, useEffect } from 'react'
import {
  History,
  Play,
  Settings,
  Users,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  X,
  Maximize2,
  Minimize2,
  Clock3,
  Sparkles,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { workspaceHudChipClass } from './ui-classes'

export type DrawerTab = 'timeline' | 'run' | 'env' | 'collab'

export interface TimelineEntry {
  sequence: number
  kind: 'snapshot' | 'update'
  createdAt: string
}

interface BottomDrawersProps {
  activeTab?: DrawerTab | null
  onActiveTabChange?: (tab: DrawerTab | null) => void
  onClose?: () => void
  timelineEntries?: TimelineEntry[]
  timelineHeadSequence?: number
  timelineIsLoading?: boolean
  timelineError?: string | null
  timelineRewindPending?: boolean
  timelinePreviewPending?: boolean
  timelinePreviewSequence?: number | null
  timelinePreviewError?: string | null
  onTimelineRefresh?: () => void
  onTimelinePreview?: (targetSequence: number) => void
  onTimelineRewind?: (targetSequence: number) => void
  onTimelineReturnToLatest?: () => void
}

function formatRelativeTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown time'
  }

  const diffMs = Date.now() - parsed.getTime()
  const diffSeconds = Math.max(0, Math.round(diffMs / 1000))
  if (diffSeconds < 5) {
    return 'just now'
  }
  if (diffSeconds < 60) {
    return `${diffSeconds} sec ago`
  }

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} hr ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

const DRAWER_ITEMS: { id: DrawerTab; label: string; subtitle: string; icon: LucideIcon }[] = [
  { id: 'timeline', label: 'Timeline', subtitle: 'recent changes', icon: History },
  { id: 'run', label: 'Run & Debug', subtitle: 'sandbox execution', icon: Play },
  { id: 'env', label: 'Environment', subtitle: 'runtime variables', icon: Settings },
  { id: 'collab', label: 'Collaboration', subtitle: 'team presence', icon: Users },
]

export default function BottomDrawers({
  activeTab: controlledActiveTab,
  onActiveTabChange,
  onClose,
  timelineEntries = [],
  timelineHeadSequence = 0,
  timelineIsLoading = false,
  timelineError = null,
  timelineRewindPending = false,
  timelinePreviewPending = false,
  timelinePreviewSequence = null,
  timelinePreviewError = null,
  onTimelineRefresh,
  onTimelinePreview,
  onTimelineRewind,
  onTimelineReturnToLatest,
}: BottomDrawersProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<DrawerTab | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [height, setHeight] = useState(400)
  const isDragging = useRef(false)
  const [isResizing, setIsResizing] = useState(false)
  const [rewindConfirmSequence, setRewindConfirmSequence] = useState<number | null>(null)
  const [replayTargetSequence, setReplayTargetSequence] = useState<number | null>(null)
  const isControlled = controlledActiveTab !== undefined
  const activeTab = isControlled ? controlledActiveTab : uncontrolledActiveTab
  const isOpen = activeTab !== null
  const snapshotEntries = timelineEntries
    .filter((entry) => entry.kind === 'snapshot')
    .sort((left, right) => left.sequence - right.sequence)
  const latestSnapshot = snapshotEntries.length > 0
    ? snapshotEntries[snapshotEntries.length - 1]
    : null
  const selectedSnapshotSequence = replayTargetSequence ?? latestSnapshot?.sequence ?? null

  const setActiveTab = (next: DrawerTab | null) => {
    if (!isControlled) {
      setUncontrolledActiveTab(next)
    }

    onActiveTabChange?.(next)
  }

  const toggleTab = (tab: DrawerTab) => {
    const nextTab = activeTab === tab ? null : tab

    if (nextTab === null) {
      setIsExpanded(false)
      onClose?.()
    }

    setActiveTab(nextTab)
  }

  const closeDrawer = () => {
    setActiveTab(null)
    setIsExpanded(false)
    onClose?.()
  }

  const activeItem = DRAWER_ITEMS.find((item) => item.id === activeTab) ?? null
  const drawerHeight = isExpanded ? '80vh' : `${height}px`

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return

      const newHeight = window.innerHeight - e.clientY - 40

      if (newHeight >= 200 && newHeight <= window.innerHeight * 0.9) {
        setHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      isDragging.current = false
      setIsResizing(false)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = ''
    }
  }, [])

  useEffect(() => {
    if (snapshotEntries.length === 0) {
      setReplayTargetSequence(null)
      return
    }

    if (replayTargetSequence !== null && snapshotEntries.some((entry) => entry.sequence === replayTargetSequence)) {
      return
    }

    setReplayTargetSequence(snapshotEntries[snapshotEntries.length - 1].sequence)
  }, [replayTargetSequence, snapshotEntries])

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end">
      <div className="pointer-events-auto relative z-10 flex items-end gap-1.5 pl-5 pr-2">
        {DRAWER_ITEMS.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => toggleTab(item.id)}
              className={cn(
                'group relative flex h-8 items-center gap-1.5 rounded-t-lg border border-b-0 px-2.5 text-[11px] transition-colors',
                isActive
                  ? 'z-30 -mb-px h-9 border-[color-mix(in_oklab,var(--chip-line)_70%,var(--line))] bg-[color-mix(in_oklab,var(--surface-strong)_94%,var(--bg-base)_6%)] text-[var(--sea-ink)] shadow-[0_-5px_14px_rgba(8,22,28,0.15)]'
                  : 'z-10 border-[color-mix(in_oklab,var(--line)_72%,transparent)] bg-[color-mix(in_oklab,var(--surface-strong)_90%,var(--bg-base)_10%)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
              )}
            >
              {isActive ? (
                <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-t-lg">
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-[1px] bg-[var(--lagoon)]"
                  />
                </span>
              ) : null}

              <span
                className={cn(
                  'grid h-4 w-4 shrink-0 place-items-center rounded-sm',
                  isActive
                    ? 'text-[var(--lagoon-deep)]'
                    : 'text-[var(--sea-ink-soft)]'
                )}
              >
                <Icon size={12} />
              </span>

              <div className="min-w-0 text-left">
                <span className="block truncate text-[10px] font-bold uppercase tracking-[0.1em]">
                  {item.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div
        style={{
          height: isOpen ? drawerHeight : '0px',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          opacity: isOpen ? 1 : 0,
        }}
        className={cn(
          'relative z-0 mx-0 mb-0 flex flex-col overflow-hidden rounded-t-xl rounded-b-none border-x border-t border-b-0 border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_88%,var(--bg-base))] pointer-events-auto backdrop-blur-md',
          isResizing ? 'transition-none' : 'transition-all duration-[220ms] ease-out'
        )}
      >
        <div
          className="group flex h-3 w-full cursor-ns-resize items-center justify-center border-b border-[var(--line)]"
          onMouseDown={() => {
            isDragging.current = true
            setIsResizing(true)
            document.body.style.cursor = 'ns-resize'
            document.body.style.userSelect = 'none'
          }}
        >
          <div className="h-[0.5px] w-16 rounded-full bg-[var(--line)] group-hover:bg-[var(--lagoon-deep)]" />
        </div>

        <div className="relative z-10 flex items-center justify-between border-b border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.22)] px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.62)] text-[var(--lagoon-deep)]">
              {activeItem ? <activeItem.icon size={15} /> : <Sparkles size={15} />}
            </div>

            <div className="min-w-0">
              <p className="m-0 truncate text-xs font-black uppercase tracking-[0.12em] text-[var(--kicker)]">
                {activeItem?.label ?? 'Panel'}
              </p>
              <p className="m-0 truncate text-[11px] text-[var(--sea-ink-soft)]">
                {activeItem?.subtitle ?? 'workspace tools'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className={`${workspaceHudChipClass} hidden md:inline-flex`}>
              <Clock3 size={11} /> live
            </span>

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Shrink panel' : 'Expand panel'}
              className="rounded-md p-1.5 text-[var(--sea-ink-soft)] transition-colors hover:bg-[rgba(0,0,0,0.05)]"
              title={isExpanded ? 'Shrink panel' : 'Expand panel'}
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              type="button"
              onClick={() => {
                closeDrawer()
              }}
              aria-label="Close panel"
              className="rounded-md p-1.5 text-[var(--sea-ink-soft)] transition-colors hover:bg-[rgba(0,0,0,0.05)]"
              title="Close panel"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div key={activeTab} className="mt-2 flex-1 overflow-y-auto p-4">
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onTimelineRefresh?.()}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.45)] px-2 py-1 text-[11px] font-semibold text-[var(--sea-ink)] transition-colors hover:bg-[rgba(var(--chip-bg-rgb),0.68)]"
                  disabled={timelineIsLoading}
                >
                  <RefreshCw size={12} className={timelineIsLoading ? 'animate-spin' : ''} />
                  refresh
                </button>

                <button
                  type="button"
                  onClick={() => onTimelineReturnToLatest?.()}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.45)] px-2 py-1 text-[11px] font-semibold text-[var(--sea-ink)] transition-colors hover:bg-[rgba(var(--chip-bg-rgb),0.68)] disabled:opacity-50"
                  disabled={timelineRewindPending || timelineHeadSequence <= 0}
                >
                  <RotateCcw size={12} />
                  return to latest
                </button>
              </div>

              {timelineError ? (
                <div className="flex items-center gap-2 rounded-xl border border-[rgba(178,72,55,0.32)] bg-[rgba(178,72,55,0.09)] p-3 text-xs text-[var(--sea-ink)]">
                  <AlertTriangle size={13} className="text-[rgb(178,72,55)]" />
                  {timelineError}
                </div>
              ) : null}

              {timelinePreviewError ? (
                <div className="flex items-center gap-2 rounded-xl border border-[rgba(178,72,55,0.32)] bg-[rgba(178,72,55,0.09)] p-3 text-xs text-[var(--sea-ink)]">
                  <AlertTriangle size={13} className="text-[rgb(178,72,55)]" />
                  {timelinePreviewError}
                </div>
              ) : null}

              {snapshotEntries.length === 0 && !timelineIsLoading ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] p-4 text-center text-xs text-[var(--sea-ink-soft)]">
                  No snapshots yet for this file. Save changes to create replay markers.
                </div>
              ) : null}

              {snapshotEntries.length > 0 ? (
                <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.32)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="m-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--kicker)]">Replay Bar</p>
                    <span className="text-[11px] text-[var(--sea-ink-soft)]">{snapshotEntries.length} snapshots</span>
                  </div>

                  <div className="relative px-2 py-3">
                    <div className="absolute left-2 right-2 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[rgba(99,122,138,0.3)]" />

                    <div className="relative flex items-center justify-between gap-2">
                      {snapshotEntries.map((entry) => {
                        const isSelected = entry.sequence === selectedSnapshotSequence
                        const isHead = entry.sequence === timelineHeadSequence

                        return (
                          <button
                            key={`snapshot-${entry.sequence}`}
                            type="button"
                            onClick={() => {
                              setReplayTargetSequence(entry.sequence)
                              onTimelinePreview?.(entry.sequence)
                            }}
                            className={cn(
                              'relative z-10 h-4 w-4 rounded-full border transition-all',
                              isSelected
                                ? 'scale-110 border-[var(--lagoon-deep)] bg-[var(--lagoon)] shadow-[0_0_0_4px_rgba(var(--lagoon-rgb),0.2)]'
                                : 'border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-strong)_88%,var(--bg-base)_12%)] hover:border-[var(--lagoon)]',
                              timelineRewindPending || timelinePreviewPending ? 'pointer-events-none opacity-60' : ''
                            )}
                            aria-label={`Select snapshot ${entry.sequence}`}
                            title={`Snapshot #${entry.sequence} - ${new Date(entry.createdAt).toLocaleString()}`}
                          >
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {selectedSnapshotSequence !== null ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.45)] px-3 py-2">
                      <div className="text-xs text-[var(--sea-ink)]">
                        <span className="font-semibold">Target:</span> snapshot #{selectedSnapshotSequence}
                        {timelinePreviewSequence === selectedSnapshotSequence ? ' (previewing)' : ''}
                      </div>
                      <div className="text-[11px] text-[var(--sea-ink-soft)]">
                        {formatRelativeTime(
                          snapshotEntries.find((entry) => entry.sequence === selectedSnapshotSequence)?.createdAt ?? new Date().toISOString()
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedSnapshotSequence !== null) {
                          setRewindConfirmSequence(selectedSnapshotSequence)
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.4)] px-2 py-1 text-[11px] font-semibold text-[var(--sea-ink)] transition-colors hover:bg-[rgba(var(--chip-bg-rgb),0.65)] disabled:opacity-45"
                      disabled={
                        timelineRewindPending
                        || timelinePreviewPending
                        || selectedSnapshotSequence === null
                        || selectedSnapshotSequence === timelineHeadSequence
                      }
                    >
                      <RotateCcw size={12} /> rewind to selected snapshot
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === 'run' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-[rgba(var(--lagoon-rgb),0.22)] bg-[rgba(var(--lagoon-rgb),0.08)] p-4">
                <div className="rounded-full bg-[var(--lagoon)] p-3 text-white shadow-[0_8px_16px_rgba(var(--lagoon-rgb),0.35)]">
                  <Play size={20} />
                </div>
                <div>
                  <p className="font-bold text-[var(--sea-ink)]">Ready to Run</p>
                  <p className="text-xs text-[var(--sea-ink-soft)]">Click run to execute your project in the Docker sandbox.</p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.46)] p-3">
                  <p className="m-0 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--kicker)]">Default target</p>
                  <p className="m-0 mt-1 text-sm font-semibold text-[var(--sea-ink)]">Docker sandbox</p>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.46)] p-3">
                  <p className="m-0 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--kicker)]">Permission</p>
                  <p className="m-0 mt-1 text-sm font-semibold text-[var(--sea-ink)]">Read + execute</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'env' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[var(--sea-ink)]">Environment Variables</h3>
              <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.42)] p-3 text-[11px] text-[var(--sea-ink-soft)]">
                Keys are scoped to this workspace session.
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    placeholder="KEY"
                    className="flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--lagoon)]"
                  />
                  <input
                    placeholder="VALUE"
                    className="flex-1 rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--lagoon)]"
                  />
                </div>
              </div>
              <button
                type="button"
                className="w-full rounded-lg bg-[linear-gradient(180deg,color-mix(in_oklab,var(--sea-ink)_88%,black_12%),var(--sea-ink))] py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
              >
                Add Variable
              </button>
            </div>
          )}

          {activeTab === 'collab' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.42)] p-6 text-center">
                <p className="text-sm font-medium text-[var(--sea-ink)]">Active Collaborators</p>
                <div className="mt-4 flex justify-center -space-x-2">
                  <div className="w-10 h-10 rounded-full border-2 border-white bg-blue-500 flex items-center justify-center text-white text-xs font-bold">JD</div>
                  <div className="w-10 h-10 rounded-full border-2 border-white bg-teal-500 flex items-center justify-center text-white text-xs font-bold">AS</div>
                </div>
                <button type="button" className="mt-6 text-xs font-bold text-[var(--lagoon)] hover:underline">
                  Invite more people
                </button>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-[rgba(47,106,74,0.26)] bg-[rgba(47,106,74,0.12)] px-3 py-2 text-[11px] font-medium text-[var(--sea-ink)]">
                <ShieldCheck size={14} className="text-[var(--kicker)]" />
                Presence data updates securely in real time.
              </div>
            </div>
          )}
        </div>
      </div>

      {rewindConfirmSequence !== null ? (
        <div className="pointer-events-auto absolute inset-0 z-[60] grid place-items-center bg-[rgba(5,14,18,0.45)] p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[color-mix(in_oklab,var(--surface-strong)_96%,var(--bg-base)_4%)] p-4 shadow-[0_20px_40px_rgba(7,20,26,0.26)]">
            <p className="m-0 text-sm font-bold text-[var(--sea-ink)]">Confirm rewind</p>
            <p className="m-0 mt-2 text-xs text-[var(--sea-ink-soft)]">
              Rewind this file to sequence #{rewindConfirmSequence}. This is non-destructive and will append a new update.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRewindConfirmSequence(null)}
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink)]"
                disabled={timelineRewindPending}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (rewindConfirmSequence !== null) {
                    const selected = snapshotEntries.find((entry) => entry.sequence === rewindConfirmSequence)
                    if (!selected) {
                      return
                    }
                    onTimelineRewind?.(rewindConfirmSequence)
                  }
                  setRewindConfirmSequence(null)
                }}
                className="rounded-md bg-[var(--lagoon)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={timelineRewindPending}
              >
                {timelineRewindPending ? 'rewinding...' : 'confirm rewind'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
