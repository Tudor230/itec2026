import { FileText, Folder, FolderOpen, Search, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FileDto } from '../../services/projects-api'
import { buildFileTree, filterFileTree, type FileTreeNode } from './files-tree'

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

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFile && node.fileId) {
            onOpenFile(node.fileId)
            return
          }

          setIsOpen((current) => !current)
        }}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
          isActive
            ? 'bg-[rgba(79,184,178,0.22)] text-[var(--sea-ink)]'
            : 'text-[var(--sea-ink-soft)] hover:bg-[rgba(79,184,178,0.12)] hover:text-[var(--sea-ink)]'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFile ? <FileText size={14} /> : isOpen ? <FolderOpen size={14} /> : <Folder size={14} />}
        <span className="truncate">{node.name}</span>
        {isDirty ? <span className="ml-auto text-[10px] font-semibold text-[var(--lagoon-deep)]">*</span> : null}
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

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[rgba(255,255,255,0.52)]">
      <div className="border-b border-[var(--line)] px-3 py-3">
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
            className="inline-flex items-center gap-1 rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1 text-xs font-semibold text-[var(--sea-ink)]"
          >
            <Plus size={12} />
            New
          </button>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-2 text-xs text-[var(--sea-ink-soft)]">
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

      <div className="flex-1 overflow-y-auto px-2 py-2">
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
