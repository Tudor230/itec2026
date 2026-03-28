import { FileText, Folder, FolderOpen, FolderPlus, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FileDto } from '../../services/projects-api'
import { buildFileTree, filterFileTree, type FileTreeNode } from './files-tree'
import { cn } from '../../lib/utils'

interface FilesSidebarProps {
  files: FileDto[]
  virtualFolders?: string[]
  activeFileId: string | null
  dirtyFileIds?: string[]
  isLoading: boolean
  errorMessage: string | null
  onOpenFile: (fileId: string) => void
  onCreateFile: (path: string, type: 'file' | 'folder') => Promise<void> | void
  onClose?: () => void
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

function toJoinedPath(basePath: string, name: string) {
  if (!basePath) {
    return name
  }

  if (!name) {
    return `${basePath}/`
  }

  return `${basePath}/${name}`
}

function getInitialCreatePath(
  createType: 'file' | 'folder',
  activeFileId: string | null,
  files: FileDto[],
  tree: FileTreeNode | null,
) {
  if (activeFileId) {
    const activeFile = files.find((candidate) => candidate.id === activeFileId)
    if (activeFile) {
      const segments = activeFile.path.split('/')
      const parentPath = segments.slice(0, -1).join('/')
      return toJoinedPath(parentPath, createType === 'file' ? '' : 'new-folder')
    }
  }

  const firstFolder = tree?.children.find((child) => child.type === 'folder')
  if (firstFolder) {
    return toJoinedPath(firstFolder.path, createType === 'file' ? '' : 'new-folder')
  }

  return createType === 'file' ? '' : 'new-folder'
}

function getParentPath(path: string) {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path
  if (!normalized) {
    return ''
  }

  const parts = normalized.split('/')
  if (parts.length <= 1) {
    return ''
  }

  return parts.slice(0, -1).join('/')
}

function getLeafName(path: string) {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path
  if (!normalized) {
    return ''
  }

  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

function NodeRow({
  node,
  depth,
  activeFileId,
  dirtyFileIds,
  pendingCreatePath,
  pendingCreateType,
  selectedFolderPath,
  onOpenFile,
  onSelectFolder,
  onStartCreate,
  onPendingPathChange,
  onConfirmCreate,
  onCancelCreate,
}: {
  node: FileTreeNode
  depth: number
  activeFileId: string | null
  dirtyFileIds: Set<string>
  pendingCreatePath: string | null
  pendingCreateType: 'file' | 'folder' | null
  selectedFolderPath: string | null
  onOpenFile: (fileId: string) => void
  onSelectFolder: (folderPath: string | null) => void
  onStartCreate: (type: 'file' | 'folder', basePath: string) => void
  onPendingPathChange: (nextPath: string) => void
  onConfirmCreate: () => void
  onCancelCreate: () => void
}) {
  const [isOpen, setIsOpen] = useState(true)
  const isFile = node.type === 'file'
  const isActive = isFile && node.fileId === activeFileId
  const isSelectedFolder = !isFile && selectedFolderPath === node.path
  const isDirty = isFile && !!node.fileId && dirtyFileIds.has(node.fileId)
  const pendingParentPath = pendingCreatePath
    ? pendingCreatePath
        .split('/')
        .slice(0, -1)
        .join('/')
    : null
  const iconColor = isFile
    ? isActive
      ? 'text-[var(--lagoon-deep)]'
      : 'text-[var(--sea-ink-soft)]'
    : 'text-[color-mix(in_oklab,var(--palm)_62%,var(--sea-ink)_38%)]'

  const renderInlineCreate = !isFile && isOpen && pendingParentPath === node.path

  return (
    <div className="relative">
      {depth > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 top-0 w-px bg-[color-mix(in_oklab,var(--line)_72%,transparent)]"
          style={{ left: `${depth * 12 + 2}px` }}
        />
      ) : null}

      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isFile && node.fileId) {
            onSelectFolder(null)
            onOpenFile(node.fileId)
            return
          }

          onSelectFolder(node.path)
          setIsOpen((current) => !current)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return
          }

          event.preventDefault()

          if (isFile && node.fileId) {
            onSelectFolder(null)
            onOpenFile(node.fileId)
            return
          }

          onSelectFolder(node.path)
          setIsOpen((current) => !current)
        }}
        className={cn(
          'group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-all',
          isActive
            ? 'bg-[color-mix(in_oklab,var(--chip-bg)_62%,rgba(var(--lagoon-rgb),0.28)_38%)] text-[var(--sea-ink)] shadow-[0_6px_16px_rgba(8,22,28,0.14)]'
            : isSelectedFolder
              ? 'bg-[rgba(var(--lagoon-rgb),0.16)] text-[var(--sea-ink)]'
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

        {!isFile ? (
          <span className="ml-auto inline-flex w-9 shrink-0 items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setIsOpen(true)
                onStartCreate('file', node.path)
              }}
              onKeyDown={(event) => {
                event.stopPropagation()
              }}
              className="grid h-4 w-4 place-items-center text-[var(--sea-ink-soft)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--sea-ink)]"
              title="New file in folder"
              aria-label="New file in folder"
            >
              <Plus size={10} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                setIsOpen(true)
                onStartCreate('folder', node.path)
              }}
              onKeyDown={(event) => {
                event.stopPropagation()
              }}
              className="grid h-4 w-4 place-items-center text-[var(--sea-ink-soft)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--sea-ink)]"
              title="New folder in folder"
              aria-label="New folder in folder"
            >
              <FolderPlus size={10} />
            </button>
          </span>
        ) : null}
      </div>

      {!isFile && isOpen
        ? node.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              dirtyFileIds={dirtyFileIds}
              pendingCreatePath={pendingCreatePath}
              pendingCreateType={pendingCreateType}
              selectedFolderPath={selectedFolderPath}
              onOpenFile={onOpenFile}
              onSelectFolder={onSelectFolder}
              onStartCreate={onStartCreate}
              onPendingPathChange={onPendingPathChange}
              onConfirmCreate={onConfirmCreate}
              onCancelCreate={onCancelCreate}
            />
          ))
        : null}

      {renderInlineCreate ? (
        <div style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }} className="mt-1">
          <label className="flex items-center gap-2 rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1">
            {pendingCreateType === 'folder' ? <Folder size={13} /> : <FileText size={13} />}
            <input
              autoFocus
              value={pendingCreatePath.split('/').pop() ?? ''}
              onChange={(event) => {
                const currentName = pendingCreatePath.split('/').pop() ?? ''
                const parentPath = pendingCreatePath.endsWith(`/${currentName}`)
                  ? pendingCreatePath.slice(0, Math.max(0, pendingCreatePath.length - currentName.length - 1))
                  : ''
                const nextName = event.target.value
                onPendingPathChange(parentPath ? `${parentPath}/${nextName}` : nextName)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onConfirmCreate()
                }

                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCancelCreate()
                }
              }}
              className="w-full bg-transparent text-xs font-semibold text-[var(--sea-ink)] outline-none"
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}

export default function FilesSidebar({
  files,
  virtualFolders,
  activeFileId,
  dirtyFileIds,
  isLoading,
  errorMessage,
  onOpenFile,
  onCreateFile,
  onClose,
}: FilesSidebarProps) {
  const [query, setQuery] = useState('')
  const dirtyIds = useMemo(() => new Set(dirtyFileIds ?? []), [dirtyFileIds])
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null)
  const [pendingCreatePath, setPendingCreatePath] = useState<string | null>(null)
  const [pendingCreateType, setPendingCreateType] = useState<'file' | 'folder' | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [isCreatePending, setIsCreatePending] = useState(false)

  const tree = useMemo(() => buildFileTree(files, virtualFolders), [files, virtualFolders])

  const filteredTree = useMemo(() => {
    return filterFileTree(tree, query)
  }, [tree, query])

  const handleStartCreate = (type: 'file' | 'folder', basePath: string) => {
    const defaultName = type === 'file' ? '' : 'new-folder'
    const nextPath = toJoinedPath(basePath, defaultName)
    setSelectedFolderPath(basePath)
    setPendingCreateType(type)
    setPendingCreatePath(nextPath)
    setInlineError(null)
  }

  const handleTopLevelCreate = (type: 'file' | 'folder') => {
    const initialPath = getInitialCreatePath(type, activeFileId, files, tree)
    setSelectedFolderPath(null)
    setPendingCreateType(type)
    setPendingCreatePath(initialPath)
    setInlineError(null)
  }

  const shouldShowRootInlineCreate = pendingCreatePath !== null && !pendingCreatePath.includes('/')

  const handleConfirmCreate = async () => {
    if (pendingCreatePath === null || !pendingCreateType || isCreatePending) {
      return
    }

    const nextPath = pendingCreatePath.trim()

    if (!isValidFilePath(nextPath)) {
      setInlineError('Please provide a valid relative path.')
      return
    }

    setIsCreatePending(true)

    try {
      await onCreateFile(nextPath, pendingCreateType)
      setPendingCreatePath(null)
      setPendingCreateType(null)
      setInlineError(null)
    } finally {
      setIsCreatePending(false)
    }
  }

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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleTopLevelCreate('file')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)]"
              title="New file"
            >
              <FileText size={12} />
            </button>

            <button
              type="button"
              onClick={() => handleTopLevelCreate('folder')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)]"
              title="New folder"
            >
              <Folder size={12} />
            </button>

            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)]"
                title="Close files panel"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
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

        {shouldShowRootInlineCreate ? (
          <div className="mb-2 px-2">
            <label className="mt-2 flex items-center gap-2 rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1">
              {pendingCreateType === 'folder' ? <Folder size={13} /> : <FileText size={13} />}
              <input
                autoFocus
                value={pendingCreatePath?.split('/').pop() ?? ''}
                disabled={isCreatePending}
                onChange={(event) => setPendingCreatePath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleConfirmCreate()
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setPendingCreatePath(null)
                    setPendingCreateType(null)
                    setInlineError(null)
                    setIsCreatePending(false)
                  }
                }}
                className="w-full bg-transparent text-xs font-semibold text-[var(--sea-ink)] outline-none"
              />
            </label>
          </div>
        ) : null}

        {!isLoading && !errorMessage && filteredTree
          ? filteredTree.children.map((child) => (
              <NodeRow
                key={child.id}
                node={child}
                depth={0}
                activeFileId={activeFileId}
                dirtyFileIds={dirtyIds}
                pendingCreatePath={pendingCreatePath}
                pendingCreateType={pendingCreateType}
                selectedFolderPath={selectedFolderPath}
                onOpenFile={onOpenFile}
                onSelectFolder={setSelectedFolderPath}
                onStartCreate={handleStartCreate}
                onPendingPathChange={setPendingCreatePath}
                onConfirmCreate={handleConfirmCreate}
                onCancelCreate={() => {
                  setPendingCreatePath(null)
                  setPendingCreateType(null)
                  setInlineError(null)
                  setIsCreatePending(false)
                }}
              />
            ))
          : null}

        {!isLoading && !errorMessage && filteredTree && filteredTree.children.length === 0 ? (
          <p className="px-2 text-sm text-[var(--sea-ink-soft)]">No files match your filter.</p>
        ) : null}

        {pendingCreatePath && filteredTree?.children.length === 0 && !shouldShowRootInlineCreate ? (
          <div className="px-2">
            <label className="mt-2 flex items-center gap-2 rounded-md border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2 py-1">
              {pendingCreateType === 'folder' ? <Folder size={13} /> : <FileText size={13} />}
              <input
                autoFocus
                value={pendingCreatePath}
                disabled={isCreatePending}
                onChange={(event) => setPendingCreatePath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleConfirmCreate()
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setPendingCreatePath(null)
                    setPendingCreateType(null)
                    setInlineError(null)
                    setIsCreatePending(false)
                  }
                }}
                className="w-full bg-transparent text-xs font-semibold text-[var(--sea-ink)] outline-none"
              />
            </label>
          </div>
        ) : null}

        {inlineError ? (
          <p className="mx-2 mt-2 rounded-md border border-[rgba(195,76,76,0.32)] bg-[rgba(195,76,76,0.12)] px-2 py-1 text-xs font-semibold text-[var(--sea-ink)]">
            {inlineError}
          </p>
        ) : null}
      </div>
    </aside>
  )
}
