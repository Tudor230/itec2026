import { X } from 'lucide-react'
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
  if (tabs.length === 0) {
    return null
  }

  return (
    <div className="flex min-h-[44px] items-center gap-1 overflow-x-auto border-b border-[var(--line)] bg-[rgba(var(--bg-rgb),0.2)] px-4 py-2">
      {tabs.map((tab) => (
        <DropdownMenu.Root key={tab.id}>
          <DropdownMenu.Trigger asChild>
            <div
              className={cn(
                "group flex items-center min-w-[120px] max-w-[240px] h-8 rounded-lg border transition-all cursor-pointer select-none",
                tab.isActive 
                  ? "bg-[rgba(var(--lagoon-rgb),0.1)] border-[rgba(var(--lagoon-rgb),0.3)] text-[var(--sea-ink)] shadow-sm" 
                  : "bg-[rgba(255,255,255,0.03)] border-transparent text-[var(--sea-ink-soft)] hover:bg-[rgba(0,0,0,0.03)] hover:text-[var(--sea-ink)]"
              )}
              onClick={() => onSelectTab(tab.id)}
            >
              <button
                type="button"
                className="flex-1 flex items-center gap-2 px-3 text-xs font-bold truncate text-left outline-none"
              >
                <span className="truncate">{tab.path.split('/').pop()}</span>
                {tab.isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--lagoon)] shrink-0" />
                )}
              </button>
              
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                className={cn(
                  "flex items-center justify-center w-6 h-6 mr-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[rgba(0,0,0,0.05)] transition-all",
                  tab.isActive && "opacity-100"
                )}
              >
                <X size={12} />
              </button>
            </div>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content 
              className="z-[100] min-w-[160px] bg-[rgba(var(--bg-rgb),0.9)] backdrop-blur-xl border border-[var(--line)] rounded-xl p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            >
              <DropdownMenu.Item 
                onClick={() => onCloseTab(tab.id)}
                className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[rgba(0,0,0,0.05)] rounded-lg outline-none cursor-pointer transition-colors"
              >
                Close
              </DropdownMenu.Item>
              <DropdownMenu.Item 
                onClick={() => onCloseOthers?.(tab.id)}
                className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[rgba(0,0,0,0.05)] rounded-lg outline-none cursor-pointer transition-colors"
              >
                Close Others
              </DropdownMenu.Item>
              <DropdownMenu.Item 
                onClick={() => onCloseAll?.()}
                className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] hover:bg-[rgba(0,0,0,0.05)] rounded-lg outline-none cursor-pointer transition-colors"
              >
                Close All
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ))}
    </div>
  )
}
