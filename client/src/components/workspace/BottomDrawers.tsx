import { useState, useRef, useEffect } from 'react'
import {
  History,
  Play,
  Settings,
  Users,
  X,
  Maximize2,
  Minimize2,
  Clock3,
  Sparkles,
  ShieldCheck,
  FileClock,
  FolderGit2,
  RotateCcw,
  Download,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { workspaceHudChipClass } from './ui-classes'
import {
  getFileHistoryVersion,
  listFileHistory,
  listProjectHistory,
  restoreFileHistoryEntry,
  restoreProjectHistoryEntry,
  type FileHistoryEntryDto,
  type ProjectHistoryEntryDto,
} from '../../services/projects-api'

export type DrawerTab = 'timeline' | 'run' | 'env' | 'collab'

interface BottomDrawersProps {
  activeTab?: DrawerTab | null
  onActiveTabChange?: (tab: DrawerTab | null) => void
  onClose?: () => void
  projectId?: string | null
  activeFileId?: string | null
  getAccessToken?: () => Promise<string | null>
  onLoadVersion?: (fileId: string, content: string) => void
}

const DRAWER_ITEMS: { id: DrawerTab; label: string; subtitle: string; icon: LucideIcon }[] = [
  { id: 'timeline', label: 'Timeline', subtitle: 'recent changes', icon: History },
  { id: 'run', label: 'Run & Debug', subtitle: 'sandbox execution', icon: Play },
  { id: 'env', label: 'Environment', subtitle: 'runtime variables', icon: Settings },
  { id: 'collab', label: 'Collaboration', subtitle: 'team presence', icon: Users },
]

type TimelineSubtab = 'project' | 'file'

function toRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime()
  const deltaSeconds = Math.max(0, Math.floor(deltaMs / 1000))

  if (deltaSeconds < 60) {
    return 'just now'
  }

  const minutes = Math.floor(deltaSeconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function sourceLabel(source: 'snapshot' | 'update') {
  if (source === 'snapshot') {
    return 'Snapshot'
  }

  return 'Update'
}

export default function BottomDrawers({
  activeTab: controlledActiveTab,
  onActiveTabChange,
  onClose,
  projectId,
  activeFileId,
  getAccessToken,
  onLoadVersion,
}: BottomDrawersProps) {
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<DrawerTab | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [height, setHeight] = useState(400)
  const isDragging = useRef(false)
  const [isResizing, setIsResizing] = useState(false)
  const [timelineSubtab, setTimelineSubtab] = useState<TimelineSubtab>('project')
  const [projectHistoryRows, setProjectHistoryRows] = useState<ProjectHistoryEntryDto[]>([])
  const [fileHistoryRows, setFileHistoryRows] = useState<FileHistoryEntryDto[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null)
  const [restoringEntryId, setRestoringEntryId] = useState<string | null>(null)
  const isControlled = controlledActiveTab !== undefined
  const activeTab = isControlled ? controlledActiveTab : uncontrolledActiveTab
  const isOpen = activeTab !== null

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

  async function refreshTimelineHistory() {
    if (!projectId || !getAccessToken) {
      setProjectHistoryRows([])
      setFileHistoryRows([])
      setHistoryError(null)
      return
    }

    setIsHistoryLoading(true)
    setHistoryError(null)

    try {
      const accessToken = await getAccessToken()
      const [projectRows, fileRows] = await Promise.all([
        listProjectHistory(projectId, accessToken),
        activeFileId
          ? listFileHistory(projectId, activeFileId, accessToken)
          : Promise.resolve([]),
      ])

      setProjectHistoryRows(projectRows)
      setFileHistoryRows(fileRows)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not load history'
      setHistoryError(reason)
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab !== 'timeline') {
      return
    }

    void refreshTimelineHistory()
    // intentionally scoped to visible timeline dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, projectId, activeFileId])

  async function loadHistoryVersion(fileId: string, historyEntryId: string) {
    if (!projectId || !getAccessToken || !onLoadVersion) {
      return
    }

    setLoadingEntryId(`${fileId}:${historyEntryId}`)

    try {
      const accessToken = await getAccessToken()
      const version = await getFileHistoryVersion(projectId, fileId, historyEntryId, accessToken)
      onLoadVersion(fileId, version.content)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not load selected version'
      setHistoryError(reason)
    } finally {
      setLoadingEntryId(null)
    }
  }

  async function restoreFromProjectHistory(entry: ProjectHistoryEntryDto) {
    if (!projectId || !getAccessToken) {
      return
    }

    setRestoringEntryId(entry.id)

    try {
      const accessToken = await getAccessToken()
      const result = await restoreProjectHistoryEntry(entry.id, { projectId }, accessToken)
      onLoadVersion?.(result.file.id, result.file.content)
      await refreshTimelineHistory()
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not restore selected version'
      setHistoryError(reason)
    } finally {
      setRestoringEntryId(null)
    }
  }

  async function restoreFromFileHistory(entry: FileHistoryEntryDto) {
    if (!projectId || !getAccessToken) {
      return
    }

    setRestoringEntryId(`${entry.fileId}:${entry.id}`)

    try {
      const accessToken = await getAccessToken()
      const result = await restoreFileHistoryEntry(projectId, entry.fileId, entry.id, accessToken)
      onLoadVersion?.(result.file.id, result.file.content)
      await refreshTimelineHistory()
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Could not restore selected version'
      setHistoryError(reason)
    } finally {
      setRestoringEntryId(null)
    }
  }

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
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.34)] p-1">
                <button
                  type="button"
                  onClick={() => setTimelineSubtab('project')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                    timelineSubtab === 'project'
                      ? 'bg-[var(--chip-bg)] text-[var(--sea-ink)]'
                      : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
                  )}
                >
                  <FolderGit2 size={12} />
                  <span>Project History</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineSubtab('file')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                    timelineSubtab === 'file'
                      ? 'bg-[var(--chip-bg)] text-[var(--sea-ink)]'
                      : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
                  )}
                >
                  <FileClock size={12} />
                  <span>File History</span>
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.22)] px-3 py-2">
                <p className="m-0 text-[11px] font-semibold text-[var(--sea-ink-soft)]">
                  {timelineSubtab === 'project'
                    ? 'Project-wide snapshots and updates'
                    : activeFileId
                      ? 'Selected file versions'
                      : 'Open a file to inspect file-specific versions'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void refreshTimelineHistory()
                  }}
                  className="rounded-md border border-[var(--line)] px-2 py-1 text-[10px] font-bold text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)]"
                >
                  Refresh
                </button>
              </div>

              {historyError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {historyError}
                </div>
              ) : null}

              {isHistoryLoading ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] p-4 text-center text-xs text-[var(--sea-ink-soft)]">
                  Loading timeline history...
                </div>
              ) : null}

              {!isHistoryLoading && timelineSubtab === 'project' && (
                <div className="space-y-2">
                  {projectHistoryRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] p-4 text-center text-xs text-[var(--sea-ink-soft)]">
                      No project history entries found yet.
                    </div>
                  ) : (
                    projectHistoryRows.map((entry) => {
                      const loadingId = `${entry.fileId}:${entry.historyEntryId}`
                      const isLoadingRow = loadingEntryId === loadingId
                      const isRestoringRow = restoringEntryId === entry.id

                      return (
                        <article
                          key={entry.id}
                          className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.42)] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="m-0 truncate text-xs font-bold text-[var(--sea-ink)]">
                                {entry.filePath}
                              </p>
                              <p className="m-0 mt-1 text-[11px] text-[var(--sea-ink-soft)]">
                                {sourceLabel(entry.source)} #{entry.sequence} · {toRelativeTime(entry.createdAt)}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                disabled={isLoadingRow || isRestoringRow || !onLoadVersion}
                                onClick={() => {
                                  void loadHistoryVersion(entry.fileId, entry.historyEntryId)
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[10px] font-bold text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Download size={11} />
                                {isLoadingRow ? 'Loading' : 'Load'}
                              </button>
                              <button
                                type="button"
                                disabled={isRestoringRow}
                                onClick={() => {
                                  void restoreFromProjectHistory(entry)
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-[var(--lagoon)] px-2 py-1 text-[10px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <RotateCcw size={11} />
                                {isRestoringRow ? 'Restoring' : 'Restore'}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              )}

              {!isHistoryLoading && timelineSubtab === 'file' && (
                <div className="space-y-2">
                  {!activeFileId ? (
                    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] p-4 text-center text-xs text-[var(--sea-ink-soft)]">
                      Open a file to see its version timeline.
                    </div>
                  ) : fileHistoryRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] p-4 text-center text-xs text-[var(--sea-ink-soft)]">
                      No file history entries found yet.
                    </div>
                  ) : (
                    fileHistoryRows.map((entry) => {
                      const loadingId = `${entry.fileId}:${entry.id}`
                      const isLoadingRow = loadingEntryId === loadingId
                      const isRestoringRow = restoringEntryId === `${entry.fileId}:${entry.id}`

                      return (
                        <article
                          key={`${entry.fileId}:${entry.id}`}
                          className="rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.42)] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="m-0 truncate text-xs font-bold text-[var(--sea-ink)]">
                                {entry.filePath}
                              </p>
                              <p className="m-0 mt-1 text-[11px] text-[var(--sea-ink-soft)]">
                                {sourceLabel(entry.source)} #{entry.sequence} · {toRelativeTime(entry.createdAt)}
                              </p>
                            </div>

                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                disabled={isLoadingRow || isRestoringRow || !onLoadVersion}
                                onClick={() => {
                                  void loadHistoryVersion(entry.fileId, entry.id)
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[10px] font-bold text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Download size={11} />
                                {isLoadingRow ? 'Loading' : 'Load'}
                              </button>
                              <button
                                type="button"
                                disabled={isRestoringRow}
                                onClick={() => {
                                  void restoreFromFileHistory(entry)
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-[var(--lagoon)] px-2 py-1 text-[10px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <RotateCcw size={11} />
                                {isRestoringRow ? 'Restoring' : 'Restore'}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })
                  )}
                </div>
              )}
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
    </div>
  )
}
