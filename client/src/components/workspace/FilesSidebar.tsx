import { FileText, Folder, FolderOpen, Search, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FileDto } from '../../services/projects-api'
import { buildFileTree, filterFileTree, type FileTreeNode } from './files-tree'
import { cn } from '../../lib/utils'

interface FilesSidebarProps {
  files: FileDto[]
  activeFileId: string | null
  dirtyFileIds?: string[]
  isLoading: boolean
  errorMessage: string | null
  onOpenFile: (fileId: string) => void
  onCreateFile: (path: string) => void
}

function isValidFilePath(path: string): boolean {
  if (path.length === 0 || path.length > 255) {
    return false
  }

  if (path.startsWith('/') || path.startsWith('\\')) {
    return false
  }

  if (path.includes('..')) {
    return false
  }

  const segments = path.split('/')
  if (segments.some((segment) => segment.trim().length === 0)) {
    return false
  }

  return true
}

function NodeRow({
  node,
  depth,
  activeFileId,
  dirtyFileIds,
  onOpenFile,
}: {
  node: FileTreeNode
  depth: number
  activeFileId: string | null
  dirtyFileIds: Set<string>
  onOpenFile: (fileId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(true)
  const isFile = node.type === 'file'
  const isActive = isFile && node.fileId === activeFileId
  const isDirty = isFile && !!node.fileId && dirtyFileIds.has(node.fileId)
  const iconColor = isFile
    ? isActive
      ? 'text-[var(--lagoon-deep)]'
      : 'text-[var(--sea-ink-soft)]'
    : 'text-[color-mix(in_oklab,var(--palm)_62%,var(--sea-ink)_38%)]'

  return (
    <div className="relative">
      {depth > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-px bg-[color-mix(in_oklab,var(--line)_72%,transparent)]"
          style={{ left: `${depth * 12 + 2}px` }}
        />
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (isFile && node.fileId) {
            onOpenFile(node.fileId)
            return
          }

          setIsOpen((current) => !current)
        }}
        className={cn(
          'group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-all',
          isActive
            ? 'bg-[color-mix(in_oklab,var(--chip-bg)_62%,rgba(var(--lagoon-rgb),0.28)_38%)] text-[var(--sea-ink)] shadow-[0_6px_16px_rgba(8,22,28,0.14)]'
            : 'text-[var(--sea-ink-soft)] hover:bg-[color-mix(in_oklab,var(--chip-bg)_66%,rgba(var(--lagoon-rgb),0.16)_34%)] hover:text-[var(--sea-ink)]'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isActive ? (
          <span
            aria-hidden
            className="absolute inset-y-1 left-[2px] w-[2px] rounded-full bg-[linear-gradient(180deg,var(--lagoon),var(--lagoon-deep))]"
          />
        ) : null}
        {isFile ? (
          <FileText size={14} className={iconColor} />
        ) : isOpen ? (
          <FolderOpen size={14} className={iconColor} />
        ) : (
          <Folder size={14} className={iconColor} />
        )}
        <span className="truncate text-[12px] font-medium">{node.name}</span>
        {isDirty ? (
          <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--lagoon)_48%,transparent)] bg-[rgba(var(--lagoon-rgb),0.16)] px-1 text-[9px] font-bold leading-none text-[var(--lagoon-deep)]">
            *
          </span>
        ) : null}
      </button>

      {!isFile && isOpen
        ? node.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              dirtyFileIds={dirtyFileIds}
              onOpenFile={onOpenFile}
            />
          ))
        : null}
    </div>
  )
}

export default function FilesSidebar({
  files,
  activeFileId,
  dirtyFileIds,
  isLoading,
  errorMessage,
  onOpenFile,
  onCreateFile,
}: FilesSidebarProps) {
  const [query, setQuery] = useState('')
  const dirtyIds = useMemo(() => new Set(dirtyFileIds ?? []), [dirtyFileIds])

  const filteredTree = useMemo(() => {
    const fullTree = buildFileTree(files)
    return filterFileTree(fullTree, query)
  }, [files, query])

  const folderCount = useMemo(() => {
    const uniqueFolders = new Set<string>()

    for (const file of files) {
      const segments = file.path.split('/')
      let currentPath = ''

      for (let index = 0; index < segments.length - 1; index += 1) {
        currentPath = currentPath ? `${currentPath}/${segments[index]}` : segments[index]
        uniqueFolders.add(currentPath)
      }
    }

    return uniqueFolders.size
  }, [files])

  return (
    <aside className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_78%,transparent),color-mix(in_oklab,var(--surface)_68%,transparent))]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-0 h-16 bg-[radial-gradient(ellipse_at_top,rgba(var(--lagoon-rgb),0.18),transparent_72%)]"
      />
      <div className="relative border-b border-[var(--line)] px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="m-0 text-xs font-semibold tracking-[0.14em] text-[var(--kicker)] uppercase">
            Files
          </p>
          <button
            type="button"
            onClick={() => {
              const raw = window.prompt('New file path (example: src/main.ts)')
              const nextPath = raw?.trim() ?? ''

              if (!nextPath) {
                return
              }

              if (!isValidFilePath(nextPath)) {
                window.alert('Please provide a valid relative file path (example: src/main.ts).')
                return
              }

              onCreateFile(nextPath)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1 text-xs font-semibold text-[var(--sea-ink)] transition-all hover:border-[color-mix(in_oklab,var(--lagoon-deep)_42%,var(--chip-line))] hover:bg-[color-mix(in_oklab,var(--chip-bg)_70%,rgba(var(--lagoon-rgb),0.18)_30%)]"
          >
            <Plus size={12} />
            New
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="workspace-hud-chip">{files.length} files</span>
          <span className="workspace-hud-chip">{folderCount} folders</span>
          <span className="workspace-hud-chip">{dirtyIds.size} dirty</span>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-[var(--chip-line)] bg-[color-mix(in_oklab,var(--chip-bg)_86%,transparent)] px-2 py-2 text-xs text-[var(--sea-ink-soft)] shadow-[0_1px_0_rgba(255,255,255,0.45)_inset]">
          <Search size={13} />
          <input
            aria-label="Filter files"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter files"
            className="w-full bg-transparent text-sm text-[var(--sea-ink)] outline-none placeholder:text-[var(--sea-ink-soft)]"
          />
        </label>
      </div>

      <div className="relative flex-1 overflow-y-auto px-2 py-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-1 h-[1px] bg-[linear-gradient(90deg,transparent,var(--line),transparent)]"
        />
        {isLoading ? <p className="px-2 text-sm text-[var(--sea-ink-soft)]">Loading files...</p> : null}

        {errorMessage ? <p className="px-2 text-sm text-[var(--sea-ink-soft)]">{errorMessage}</p> : null}

        {!isLoading && !errorMessage && files.length === 0 ? (
          <p className="px-2 text-sm text-[var(--sea-ink-soft)]">
            This project has no files yet.
          </p>
        ) : null}

        {!isLoading && !errorMessage && filteredTree
          ? filteredTree.children.map((child) => (
              <NodeRow
                key={child.id}
                node={child}
                depth={0}
                activeFileId={activeFileId}
                dirtyFileIds={dirtyIds}
                onOpenFile={onOpenFile}
              />
            ))
          : null}

        {!isLoading && !errorMessage && filteredTree && filteredTree.children.length === 0 ? (
          <p className="px-2 text-sm text-[var(--sea-ink-soft)]">No files match your filter.</p>
        ) : null}
      </div>
    </aside>
  )
}
