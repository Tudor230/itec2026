import { useEffect, useMemo, useState } from 'react'

interface QuickOpenItem {
  id: string
  path: string
}

interface QuickOpenModalProps {
  isOpen: boolean
  items: QuickOpenItem[]
  onClose: () => void
  onOpenFile: (fileId: string) => void
}

export default function QuickOpenModal({
  isOpen,
  items,
  onClose,
  onOpenFile,
}: QuickOpenModalProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    if (!normalized) {
      return items
    }

    return items.filter((item) => item.path.toLowerCase().includes(normalized))
  }, [items, query])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="workspace-quickopen-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-quick-open-title"
      onClick={onClose}
    >
      <div
        className="workspace-quickopen-shell"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="workspace-quickopen-head">
          <p id="workspace-quick-open-title" className="island-kicker m-0">Quick Open</p>
          <button
            type="button"
            onClick={onClose}
            className="workspace-auth-help"
            aria-label="Close quick open"
            title="Close quick open"
          >
            x
          </button>
        </div>

        <input
          autoFocus
          aria-label="Quick open file search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type file name or path"
          className="workspace-quickopen-input"
        />

        <div className="workspace-quickopen-list">
          {filtered.length === 0 ? (
            <p className="m-0 px-2 py-2 text-sm text-[var(--sea-ink-soft)]">
              No files found.
            </p>
          ) : (
            filtered.slice(0, 40).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onOpenFile(item.id)
                  onClose()
                }}
                className="workspace-quickopen-item"
              >
                <span>{item.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
