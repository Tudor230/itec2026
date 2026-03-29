import type { ImportedFileInputDto } from '../services/projects-api'

export const MAX_IMPORT_FILES = 300
export const MAX_IMPORT_FILE_BYTES = 500_000

export interface ImportFileEntry {
  file: File
  relativePath: string
}

interface FileSystemEntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  file: (
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void
}

interface FileSystemDirectoryReaderLike {
  readEntries: (
    successCallback: (entries: FileSystemEntryLike[]) => void,
    errorCallback?: (error: DOMException) => void,
  ) => void
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  createReader: () => FileSystemDirectoryReaderLike
}

export interface DirectoryHandleLike {
  kind: 'directory'
  name: string
  entries: () => AsyncIterableIterator<
    [string, FileHandleLike | DirectoryHandleLike]
  >
}

interface FileHandleLike {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
}

export function chunkImportFiles(
  files: ImportedFileInputDto[],
  options?: {
    maxChunkBytes?: number
    maxFilesPerChunk?: number
  },
) {
  const maxChunkBytes = options?.maxChunkBytes ?? 450_000
  const maxFilesPerChunk = options?.maxFilesPerChunk ?? 80
  const encoder = new TextEncoder()

  const chunks: ImportedFileInputDto[][] = []
  let currentChunk: ImportedFileInputDto[] = []
  let currentChunkBytes = 0

  for (const file of files) {
    const estimatedBytes =
      encoder.encode(file.path).byteLength +
      encoder.encode(file.content).byteLength +
      64

    const wouldExceedByteLimit =
      currentChunkBytes + estimatedBytes > maxChunkBytes
    const wouldExceedFileLimit = currentChunk.length >= maxFilesPerChunk

    if (
      currentChunk.length > 0 &&
      (wouldExceedByteLimit || wouldExceedFileLimit)
    ) {
      chunks.push(currentChunk)
      currentChunk = []
      currentChunkBytes = 0
    }

    currentChunk.push(file)
    currentChunkBytes += estimatedBytes
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

function normalizePath(pathValue: string) {
  const normalized = pathValue.trim().replace(/\\+/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) {
    return null
  }

  const segments = normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length === 0) {
    return null
  }

  const joined = segments.join('/')
  if (joined.length > 256) {
    return null
  }

  return joined
}

function joinTargetPrefix(
  targetPrefix: string | null,
  relativePath: string,
) {
  if (!targetPrefix || targetPrefix.trim().length === 0) {
    return relativePath
  }

  return `${targetPrefix}/${relativePath}`
}

function decodeUtf8(buffer: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return null
  }
}

function containsBinaryNullCharacter(content: string) {
  return content.includes('\u0000')
}

async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReaderLike,
): Promise<FileSystemEntryLike[]> {
  const entries: FileSystemEntryLike[] = []

  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>(
      (resolve, reject) => {
        reader.readEntries(resolve, reject)
      },
    )

    if (batch.length === 0) {
      return entries
    }

    entries.push(...batch)
  }
}

async function collectFromWebkitEntry(
  entry: FileSystemEntryLike,
  currentPrefix: string,
): Promise<ImportFileEntry[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      ;(entry as FileSystemFileEntryLike).file(resolve, reject)
    })

    const relativePath = currentPrefix
      ? `${currentPrefix}/${file.name}`
      : file.name
    return [{ file, relativePath }]
  }

  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntryLike
    const nextPrefix = currentPrefix
      ? `${currentPrefix}/${directory.name}`
      : directory.name
    const reader = directory.createReader()
    const children = await readAllDirectoryEntries(reader)

    const nested = await Promise.all(
      children.map((child) => collectFromWebkitEntry(child, nextPrefix)),
    )
    return nested.flat()
  }

  return []
}

export function collectEntriesFromFileList(
  fileList: FileList,
): ImportFileEntry[] {
  return Array.from(fileList).map((file) => {
    const extended = file as File & { webkitRelativePath?: string }
    const relativePath =
      extended.webkitRelativePath &&
      extended.webkitRelativePath.trim().length > 0
        ? extended.webkitRelativePath
        : file.name

    return {
      file,
      relativePath,
    }
  })
}

export async function collectEntriesFromDrop(
  dataTransfer: DataTransfer,
): Promise<ImportFileEntry[]> {
  const withEntries = Array.from(dataTransfer.items)
    .map((item) => {
      const extendedItem = item as DataTransferItem & {
        webkitGetAsEntry: () => FileSystemEntryLike | null
      }

      return extendedItem.webkitGetAsEntry()
    })
    .filter((entry): entry is FileSystemEntryLike => Boolean(entry))

  if (withEntries.length === 0) {
    return collectEntriesFromFileList(dataTransfer.files)
  }

  const nested = await Promise.all(
    withEntries.map((entry) => collectFromWebkitEntry(entry, '')),
  )
  return nested.flat()
}

export async function collectEntriesFromDirectoryHandle(
  rootDirectory: DirectoryHandleLike,
): Promise<ImportFileEntry[]> {
  async function walkDirectory(
    directory: DirectoryHandleLike,
    prefix: string,
  ): Promise<ImportFileEntry[]> {
    const entries: ImportFileEntry[] = []

    for await (const [name, handle] of directory.entries()) {
      if (handle.kind === 'directory') {
        const nextPrefix = prefix ? `${prefix}/${name}` : name
        const nested = await walkDirectory(handle, nextPrefix)
        entries.push(...nested)
        continue
      }

      const file = await handle.getFile()
      const relativePath = prefix ? `${prefix}/${name}` : name
      entries.push({
        file,
        relativePath,
      })
    }

    return entries
  }

  return walkDirectory(rootDirectory, '')
}

export async function buildImportPayload(
  entries: ImportFileEntry[],
  options?: {
    targetPrefix?: string | null
    maxFiles?: number
    maxFileBytes?: number
  },
): Promise<{
  files: ImportedFileInputDto[]
  skippedCount: number
}> {
  const maxFiles = options?.maxFiles ?? MAX_IMPORT_FILES
  const maxFileBytes = options?.maxFileBytes ?? MAX_IMPORT_FILE_BYTES
  const deduped = new Map<string, ImportedFileInputDto>()
  let skippedCount = 0

  for (const entry of entries) {
    const normalized = normalizePath(
      joinTargetPrefix(options?.targetPrefix ?? null, entry.relativePath),
    )
    if (!normalized) {
      skippedCount += 1
      continue
    }

    if (entry.file.size > maxFileBytes) {
      skippedCount += 1
      continue
    }

    if (!deduped.has(normalized) && deduped.size >= maxFiles) {
      skippedCount += 1
      continue
    }

    const contentBuffer = await entry.file.arrayBuffer()
    const content = decodeUtf8(contentBuffer)

    if (content === null || containsBinaryNullCharacter(content)) {
      skippedCount += 1
      continue
    }

    deduped.set(normalized, {
      path: normalized,
      content,
    })
  }

  return {
    files: [...deduped.values()],
    skippedCount,
  }
}
