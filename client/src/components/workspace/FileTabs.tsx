import { FileCode2, FileJson2, FileText, X } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../../lib/utils'

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
}

export default function FileTabs({ 
  tabs, 
  onSelectTab, 
  onCloseTab,
  onCloseOthers,
  onCloseAll
}: FileTabsProps) {
  const getTabAccent = (path: string) => {
    const extension = path.split('.').pop()?.toLowerCase() ?? ''

    if (['ts', 'tsx', 'js', 'jsx'].includes(extension)) {
      return {
        Icon: FileCode2,
        color: 'text-[color-mix(in_oklab,var(--lagoon-deep)_72%,var(--sea-ink)_28%)]',
      }
    }

    if (['json', 'yaml', 'yml', 'toml'].includes(extension)) {
      return {
        Icon: FileJson2,
        color: 'text-[color-mix(in_oklab,var(--palm)_62%,var(--sea-ink)_38%)]',
      }
    }

    return {
      Icon: FileText,
      color: 'text-[var(--sea-ink-soft)]',
    }
  }

  if (tabs.length === 0) {
    return null
  }

  return (
    <div className="relative flex min-h-[46px] items-center gap-1.5 overflow-x-auto border-b border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_74%,transparent),color-mix(in_oklab,var(--surface)_64%,transparent))] px-3 py-2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--lagoon)_42%,transparent),transparent)]"
      />
      {tabs.map((tab) => {
        const { Icon, color } = getTabAccent(tab.path)

        return (
        <DropdownMenu.Root key={tab.id}>
          <DropdownMenu.Trigger asChild>
            <div
              className={cn(
                "group relative flex h-8 min-w-[128px] max-w-[260px] cursor-pointer select-none items-center rounded-lg border transition-all",
                tab.isActive 
                  ? "border-[color-mix(in_oklab,var(--lagoon-deep)_40%,var(--line))] bg-[color-mix(in_oklab,var(--chip-bg)_72%,rgba(var(--lagoon-rgb),0.22)_28%)] text-[var(--sea-ink)] shadow-[0_8px_18px_rgba(8,22,28,0.16)]" 
                  : "border-transparent bg-[rgba(var(--chip-bg-rgb),0.24)] text-[var(--sea-ink-soft)] hover:border-[color-mix(in_oklab,var(--line)_72%,transparent)] hover:bg-[rgba(var(--chip-bg-rgb),0.48)] hover:text-[var(--sea-ink)]"
              )}
              onClick={() => onSelectTab(tab.id)}
            >
              {tab.isActive ? (
                <span className="absolute inset-x-2 top-0 h-[2px] rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--lagoon)_84%,white),color-mix(in_oklab,var(--lagoon-deep)_84%,white))]" />
              ) : null}

              <button
                type="button"
                className="flex flex-1 items-center gap-2 px-2.5 text-left text-xs font-bold outline-none"
              >
                <span
                  className={cn(
                    'grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border border-[color-mix(in_oklab,var(--line)_82%,transparent)] bg-[rgba(var(--chip-bg-rgb),0.65)]',
                    color
                  )}
                >
                  <Icon size={11} />
                </span>
                <span className="truncate">{tab.path.split('/').pop()}</span>
                {tab.isDirty && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lagoon)] shadow-[0_0_0_3px_rgba(var(--lagoon-rgb),0.18)]" />
                )}
              </button>
              
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                className={cn(
                  "mr-1 flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition-all hover:bg-[rgba(0,0,0,0.08)]",
                  "group-hover:opacity-100",
                  tab.isActive && "opacity-100"
                )}
              >
                <X size={12} />
              </button>
            </div>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content 
              className="z-[100] min-w-[170px] rounded-xl border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.92)] p-1 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            >
              <DropdownMenu.Item 
                onClick={() => onCloseTab(tab.id)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] outline-none transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--sea-ink)]"
              >
                Close
              </DropdownMenu.Item>
              <DropdownMenu.Item 
                onClick={() => onCloseOthers?.(tab.id)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] outline-none transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--sea-ink)]"
              >
                Close Others
              </DropdownMenu.Item>
              <DropdownMenu.Item 
                onClick={() => onCloseAll?.()}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] outline-none transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--sea-ink)]"
              >
                Close All
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )})}
    </div>
  )
}
