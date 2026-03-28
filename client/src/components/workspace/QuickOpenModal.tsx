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
      className="absolute inset-0 z-[18] grid place-items-center bg-[rgba(7,17,23,0.36)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-quick-open-title"
      onClick={onClose}
    >
      <div
        className="w-[min(690px,calc(100%-2rem))] rounded-2xl border border-[color-mix(in_oklab,var(--line)_72%,var(--lagoon)_28%)] bg-[linear-gradient(165deg,var(--surface-strong),var(--surface))] p-[0.8rem] shadow-[inset_0_1px_0_var(--inset-glint),0_22px_44px_rgba(10,22,27,0.28)]"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="mb-[0.5rem] flex items-center justify-between">
          <p id="workspace-quick-open-title" className="m-0 text-[0.69rem] font-bold uppercase tracking-[0.16em] text-[var(--kicker)]">Quick Open</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]"
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
          className="w-full rounded-[0.7rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-[0.7rem] py-[0.56rem] text-[0.85rem] text-[var(--sea-ink)] outline-none focus:border-[color-mix(in_oklab,var(--lagoon-deep)_45%,var(--chip-line))]"
        />

        <div className="mt-[0.55rem] grid max-h-[360px] gap-[0.3rem] overflow-y-auto">
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
                className="w-full rounded-[0.65rem] border border-[var(--chip-line)] bg-[var(--chip-bg)] px-[0.62rem] py-[0.5rem] text-left text-[0.8rem] font-semibold text-[var(--sea-ink)] transition-colors hover:border-[color-mix(in_oklab,var(--lagoon-deep)_35%,var(--chip-line))] hover:bg-[color-mix(in_oklab,var(--chip-bg)_72%,rgba(79,184,178,0.22)_28%)]"
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
