interface FileTabItem {
  id: string
  path: string
  isActive: boolean
  isDirty: boolean
}

interface FileTabsProps {
  tabs: FileTabItem[]
  onSelectTab: (fileId: string) => void
  onCloseTab: (fileId: string) => void
}

export default function FileTabs({
  tabs,
  onSelectTab,
  onCloseTab,
}: FileTabsProps) {
  if (tabs.length === 0) {
    return (
      <div className="border-b border-[var(--line)] bg-[rgba(255,255,255,0.45)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
        No files open
      </div>
    )
  }

  return (
    <div className="workspace-tabs border-b border-[var(--line)] bg-[rgba(255,255,255,0.48)] px-2 py-1.5">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`workspace-tab-item ${tab.isActive ? 'is-active' : ''}`}
        >
          <button
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className="workspace-tab-open"
            title={tab.path}
          >
            <span className="truncate">{tab.path.split('/').pop() ?? tab.path}</span>
            {tab.isDirty ? <span className="workspace-tab-dot" aria-hidden="true" /> : null}
          </button>

          <button
            type="button"
            onClick={() => onCloseTab(tab.id)}
            className="workspace-tab-close"
            aria-label={`Close ${tab.path}`}
          >
            x
          </button>
        </div>
      ))}
    </div>
  )
}
