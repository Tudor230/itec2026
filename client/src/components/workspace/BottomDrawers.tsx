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
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'

export type DrawerTab = 'timeline' | 'run' | 'env' | 'collab'

interface BottomDrawersProps {
  onClose?: () => void
}

const DRAWER_ITEMS: { id: DrawerTab; label: string; subtitle: string; icon: LucideIcon }[] = [
  { id: 'timeline', label: 'Timeline', subtitle: 'recent changes', icon: History },
  { id: 'run', label: 'Run & Debug', subtitle: 'sandbox execution', icon: Play },
  { id: 'env', label: 'Environment', subtitle: 'runtime variables', icon: Settings },
  { id: 'collab', label: 'Collaboration', subtitle: 'team presence', icon: Users },
]

export default function BottomDrawers({ onClose }: BottomDrawersProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [height, setHeight] = useState(400)
  const isDragging = useRef(false)
  const isOpen = activeTab !== null

  const toggleTab = (tab: DrawerTab) => {
    setActiveTab((current) => {
      if (current === tab) {
        setIsExpanded(false)
        onClose?.()
        return null
      }

      return tab
    })
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
      document.body.style.cursor = 'default'
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
    }
  }, [])

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
                  ? 'z-30 -mb-px h-9 border-[color-mix(in_oklab,var(--chip-line)_70%,var(--line))] bg-[color-mix(in_oklab,var(--surface-strong)_78%,transparent)] text-[var(--sea-ink)]'
                  : 'z-10 border-transparent bg-[rgba(var(--chip-bg-rgb),0.08)] text-[var(--sea-ink-soft)] hover:bg-[rgba(var(--chip-bg-rgb),0.28)] hover:text-[var(--sea-ink)]'
              )}
            >
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute inset-x-2 top-0 h-[1px] rounded-full bg-[var(--lagoon)]"
                />
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

      {isOpen ? (
        <div
          style={{ height: drawerHeight }}
          className={cn(
            'relative z-0 mx-0 mb-0 flex flex-col overflow-hidden rounded-t-xl rounded-b-none border-x border-t border-b-0 border-[var(--line)] bg-[color-mix(in_oklab,var(--surface)_88%,var(--bg-base))] pointer-events-auto backdrop-blur-md'
          )}
        >
            <div 
              className="group flex h-3 w-full cursor-ns-resize items-center justify-center border-b border-[var(--line)]"
              onMouseDown={() => {
                isDragging.current = true
                document.body.style.cursor = 'ns-resize'
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
                <span className="workspace-hud-chip hidden md:inline-flex">
                  <Clock3 size={11} /> live
                </span>

                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
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
                  {[
                    { label: 'Opened workspace', time: 'Just now', tone: 'bg-[rgba(var(--lagoon-rgb),0.14)] text-[var(--lagoon-deep)]' },
                    { label: 'Fetched latest files', time: '14 sec ago', tone: 'bg-[rgba(47,106,74,0.14)] text-[var(--kicker)]' },
                    { label: 'Synced project metadata', time: '1 min ago', tone: 'bg-[rgba(99,122,138,0.14)] text-[var(--sea-ink-soft)]' },
                  ].map((entry, index) => (
                    <article
                      key={entry.label}
                      className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.42)] p-3"
                    >
                      <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-[linear-gradient(180deg,var(--lagoon),var(--lagoon-deep))]" />
                      <div className="ml-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="m-0 text-sm font-semibold text-[var(--sea-ink)]">{entry.label}</p>
                          <p className="m-0 mt-1 text-[11px] text-[var(--sea-ink-soft)]">Workspace event #{index + 1}</p>
                        </div>
                        <span className={cn('rounded-full px-2 py-1 text-[10px] font-bold', entry.tone)}>
                          {entry.time}
                        </span>
                      </div>
                    </article>
                  ))}

                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] p-4 text-center text-xs text-[var(--sea-ink-soft)]">
                    Full timeline stream will appear here as executions and edits are connected.
                  </div>
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
      ) : null}
    </div>
  )
}
