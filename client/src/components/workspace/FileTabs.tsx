import { FileText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'
import { getFileIconComponent } from './file-icon-components'
import { getFileIconMeta } from './file-icon-map'

export interface TabItem {
  id: string
  path: string
  isActive: boolean
  isDirty: boolean
}

interface FileTabsProps {
  tabs: TabItem[]
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseOthers?: (id: string) => void
  onCloseAll?: () => void
  collaborators?: string[]
  onOpenCollaboration?: () => void
}

export default function FileTabs({
  tabs,
  onSelectTab,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
  collaborators,
  onOpenCollaboration,
}: FileTabsProps) {
  const [menuState, setMenuState] = useState<{
    tabId: string
    left: number
    top: number
  } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const holdTriggeredTabIdRef = useRef<string | null>(null)

  const TAB_MENU_WIDTH_PX = 170

  const clearHoldTimer = () => {
    if (holdTimerRef.current === null) {
      return
    }

    window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
  }

  const clearHoldState = () => {
    clearHoldTimer()
    holdTriggeredTabIdRef.current = null
  }

  const closeMenu = () => {
    setMenuState(null)
    clearHoldState()
  }

  useEffect(() => {
    return () => {
      clearHoldTimer()
    }
  }, [])

  useEffect(() => {
    if (menuState === null) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        closeMenu()
        return
      }

      if (menuRef.current?.contains(target)) {
        return
      }

      closeMenu()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuState])

  const getMenuPosition = (anchorRect: DOMRect) => {
    const viewportWidth = window.innerWidth
    const left = Math.min(
      Math.max(8, anchorRect.right - TAB_MENU_WIDTH_PX),
      Math.max(8, viewportWidth - TAB_MENU_WIDTH_PX - 8),
    )

    return {
      left,
      top: anchorRect.bottom + 6,
    }
  }

  const openMenu = (tabId: string, anchorRect: DOMRect) => {
    setMenuState({ tabId, ...getMenuPosition(anchorRect) })
  }

  const startCloseHold = (tabId: string, anchorRect: DOMRect) => {
    clearHoldState()

    holdTimerRef.current = window.setTimeout(() => {
      holdTriggeredTabIdRef.current = tabId
      openMenu(tabId, anchorRect)
    }, 500)
  }

  const finishCloseClick = (tabId: string) => {
    if (holdTriggeredTabIdRef.current === tabId) {
      clearHoldState()
      holdTriggeredTabIdRef.current = null
      return
    }

    clearHoldState()

    onCloseTab(tabId)
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Open files"
        className="relative flex min-h-[46px] items-center justify-between gap-2 border-b border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_74%,transparent),color-mix(in_oklab,var(--surface)_64%,transparent))] px-3 py-2"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--lagoon)_42%,transparent),transparent)]"
        />

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pr-2">
          {tabs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.28)] px-3 py-1 text-xs font-semibold text-[var(--sea-ink-soft)]">
              No files opened
            </div>
          ) : (
            tabs.map((tab) => {
              const iconMeta = getFileIconMeta(tab.path)
              const ResolvedIcon = getFileIconComponent(iconMeta.iconKey)
              const isDefaultIcon = ResolvedIcon === null
              const iconStyle = iconMeta.color
                ? { color: iconMeta.color }
                : undefined

              return (
                <div key={tab.id}>
                  <div
                    role="tab"
                    tabIndex={0}
                    aria-selected={tab.isActive}
                    className={cn(
                      'group relative flex h-8 min-w-[128px] max-w-[260px] cursor-pointer select-none items-center rounded-lg border transition-all',
                      tab.isActive
                        ? 'border-[color-mix(in_oklab,var(--lagoon-deep)_40%,var(--line))] bg-[color-mix(in_oklab,var(--chip-bg)_72%,rgba(var(--lagoon-rgb),0.22)_28%)] text-[var(--sea-ink)] shadow-[0_8px_18px_rgba(8,22,28,0.16)]'
                        : 'border-transparent bg-[rgba(var(--chip-bg-rgb),0.24)] text-[var(--sea-ink-soft)] hover:border-[color-mix(in_oklab,var(--line)_72%,transparent)] hover:bg-[rgba(var(--chip-bg-rgb),0.48)] hover:text-[var(--sea-ink)]',
                    )}
                    onClick={() => {
                      closeMenu()
                      onSelectTab(tab.id)
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      clearHoldState()
                      openMenu(
                        tab.id,
                        event.currentTarget.getBoundingClientRect(),
                      )
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onSelectTab(tab.id)
                        return
                      }

                      if (
                        (event.shiftKey && event.key === 'F10') ||
                        event.key === 'ContextMenu'
                      ) {
                        event.preventDefault()
                        clearHoldState()
                        openMenu(
                          tab.id,
                          event.currentTarget.getBoundingClientRect(),
                        )
                      }
                    }}
                  >
                    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                      {tab.isActive ? (
                        <span className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--lagoon)_84%,white),color-mix(in_oklab,var(--lagoon-deep)_84%,white))]" />
                      ) : null}
                    </span>

                    <span className="flex flex-1 items-center gap-2 px-2.5 text-left text-xs font-bold outline-none">
                      <span
                        className={cn(
                          'grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border border-[color-mix(in_oklab,var(--line)_82%,transparent)] bg-[rgba(var(--chip-bg-rgb),0.65)]',
                          isDefaultIcon
                            ? 'text-[var(--sea-ink-soft)]'
                            : undefined,
                        )}
                      >
                        {ResolvedIcon ? (
                          <ResolvedIcon size={11} style={iconStyle} />
                        ) : (
                          <FileText size={11} />
                        )}
                      </span>
                      <span className="truncate">
                        {tab.path.split('/').pop()}
                      </span>
                      {tab.isDirty && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lagoon)] shadow-[0_0_0_3px_rgba(var(--lagoon-rgb),0.18)]" />
                      )}
                    </span>

                    <button
                      type="button"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        startCloseHold(
                          tab.id,
                          event.currentTarget.getBoundingClientRect(),
                        )
                      }}
                      onPointerUp={(event) => {
                        event.stopPropagation()
                        clearHoldTimer()
                      }}
                      onPointerLeave={clearHoldTimer}
                      onPointerCancel={clearHoldTimer}
                      onClick={(event) => {
                        event.stopPropagation()
                        finishCloseClick(tab.id)
                      }}
                      className={cn(
                        'mr-1 flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-all hover:bg-[rgba(0,0,0,0.08)]',
                        'group-hover:opacity-100',
                        tab.isActive && 'opacity-100',
                      )}
                      title="Close tab (hold for more)"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <button
          type="button"
          onClick={onOpenCollaboration}
          className="shrink-0 rounded-xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.6)] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)]"
          title="Open collaboration drawer"
        >
          <span className="mr-2">Collab</span>
          <span className="inline-flex -space-x-2 align-middle">
            {(collaborators && collaborators.length > 0
              ? collaborators
              : ['JD', 'AS']
            )
              .slice(0, 3)
              .map((initials) => (
                <span
                  key={initials}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--chip-bg)] text-[9px] font-bold text-[var(--sea-ink)]"
                >
                  {initials}
                </span>
              ))}
          </span>
        </button>
      </div>

      {menuState
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Tab actions"
              style={{ left: `${menuState.left}px`, top: `${menuState.top}px` }}
              className="fixed z-[120] min-w-[170px] rounded-xl border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.92)] p-1 backdrop-blur-xl shadow-2xl"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  onCloseTab(menuState.tabId)
                  closeMenu()
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--sea-ink-soft)] outline-none transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--sea-ink)]"
              >
                Close
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  onCloseOthers?.(menuState.tabId)
                  closeMenu()
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--sea-ink-soft)] outline-none transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--sea-ink)]"
              >
                Close Others
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  onCloseAll?.()
                  closeMenu()
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--sea-ink-soft)] outline-none transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--sea-ink)]"
              >
                Close All
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
