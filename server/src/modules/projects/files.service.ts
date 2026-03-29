import type { ActorContext } from '../auth/actor-context.js'
import type {
  FileImportResult,
  FileInput,
  GithubImportInput,
  ImportFileInput,
  LocalFilesImportInput,
} from './file.types.js'
import { FilesRepository } from './files.repository.js'

const MAX_GITHUB_IMPORT_FILES = 1000
const GITHUB_API_BASE = 'https://api.github.com'
const IGNORED_PATH_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  '.turbo',
])
const IGNORED_FILE_NAMES = new Set([
  '.ds_store',
])

interface GithubTreeResponse {
  tree?: Array<{
    path: string
    type: 'blob' | 'tree' | string
    size?: number
    sha?: string
  }>
  truncated?: boolean
}

interface GithubBlobResponse {
  encoding?: string
  content?: string
}

interface GithubRepositoryResponse {
  default_branch?: string
}

interface GithubImportTarget {
  owner: string
  repo: string
  branchFromUrl?: string
}

interface FetchJsonSuccess<T> {
  ok: true
  data: T
}

interface FetchJsonFailure {
  ok: false
  reason: string
}

type FetchJsonResult<T> = FetchJsonSuccess<T> | FetchJsonFailure

function shouldIgnoreImportPath(path: string): boolean {
  const normalized = path.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0)
  if (segments.some((segment) => IGNORED_PATH_SEGMENTS.has(segment))) {
    return true
  }

  const fileName = segments[segments.length - 1]
  if (!fileName) {
    return true
  }

  if (IGNORED_FILE_NAMES.has(fileName)) {
    return true
  }

  return false
}

function parseGithubTarget(repositoryUrl: string): GithubImportTarget | null {
  try {
    const url = new URL(repositoryUrl)
    if (url.hostname.toLowerCase() !== 'github.com') {
      return null
    }

    const segments = url.pathname
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .split('/')
      .filter((segment) => segment.length > 0)

    if (segments.length < 2) {
      return null
    }

    const owner = segments[0]
    const repo = segments[1].endsWith('.git')
      ? segments[1].slice(0, -4)
      : segments[1]

    if (!owner || !repo) {
      return null
    }

    if (segments[2] === 'tree' && segments.length > 3) {
      return {
        owner,
        repo,
        branchFromUrl: decodeURIComponent(segments.slice(3).join('/')),
      }
    }

    return {
      owner,
      repo,
    }
  } catch {
    return null
  }
}

function isLikelyBinaryContent(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false
  }

  let controlCount = 0
  for (const byte of bytes) {
    if (byte === 0) {
      return true
    }

    const isControl = byte < 32 && byte !== 9 && byte !== 10 && byte !== 13
    if (isControl) {
      controlCount += 1
    }
  }

  return controlCount / bytes.length > 0.2
}

function decodeGithubBlobContent(base64Content: string): string | null {
  const compact = base64Content.replace(/\s+/g, '')
  const bytes = Buffer.from(compact, 'base64')
  if (isLikelyBinaryContent(bytes)) {
    return null
  }

  return bytes.toString('utf8')
}

function mapHttpStatusToGithubReason(status: number): string {
  if (status === 401 || status === 403) {
    return 'GitHub repository access is forbidden or rate-limited'
  }

  if (status === 404) {
    return 'GitHub repository or branch not found'
  }

  return 'GitHub import request failed'
}

export class FilesService {
  constructor(
    private readonly repository: FilesRepository,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async fetchJson<T>(url: string): Promise<FetchJsonResult<T>> {
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      })
    } catch {
      return {
        ok: false,
        reason: 'Could not reach GitHub',
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: mapHttpStatusToGithubReason(response.status),
      }
    }

    try {
      const payload = (await response.json()) as T
      return {
        ok: true,
        data: payload,
      }
    } catch {
      return {
        ok: false,
        reason: 'GitHub returned an invalid response',
      }
    }
  }

  private async fetchGithubTree(target: GithubImportTarget, branch: string) {
    const treeUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    return this.fetchJson<GithubTreeResponse>(treeUrl)
  }

  private async fetchGithubBlob(target: GithubImportTarget, sha: string) {
    const blobUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/git/blobs/${encodeURIComponent(sha)}`
    return this.fetchJson<GithubBlobResponse>(blobUrl)
  }

  private async fetchGithubRepository(target: GithubImportTarget) {
    const repoUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`
    return this.fetchJson<GithubRepositoryResponse>(repoUrl)
  }

  private async collectGithubImportFiles(
    target: GithubImportTarget,
    branch: string,
  ): Promise<{ files: ImportFileInput[]; skipped: FileImportResult['skipped']; failureReason: string | null }> {
    const treeResult = await this.fetchGithubTree(target, branch)
    if (!treeResult.ok) {
      return {
        files: [],
        skipped: [],
        failureReason: treeResult.reason,
      }
    }

    const treeEntries = treeResult.data.tree ?? []
    if (treeResult.data.truncated) {
      return {
        files: [],
        skipped: [],
        failureReason: 'Repository is too large to import via GitHub tree API',
      }
    }

    const blobEntries = treeEntries.filter((entry) => entry.type === 'blob' && entry.path && entry.sha)
    if (blobEntries.length > MAX_GITHUB_IMPORT_FILES) {
      return {
        files: [],
        skipped: [],
        failureReason: `Repository exceeds import file limit (${MAX_GITHUB_IMPORT_FILES})`,
      }
    }

    const files: ImportFileInput[] = []
    const skipped: FileImportResult['skipped'] = []

    for (const entry of blobEntries) {
      const path = entry.path.replaceAll('\\', '/').trim()
      if (!path) {
        continue
      }

      if (shouldIgnoreImportPath(path)) {
        skipped.push({
          path,
          reason: 'Ignored by import filters',
        })
        continue
      }

      if (!entry.sha) {
        skipped.push({
          path,
          reason: 'Missing blob SHA',
        })
        continue
      }

      const blobResult = await this.fetchGithubBlob(target, entry.sha)
      if (!blobResult.ok) {
        skipped.push({
          path,
          reason: blobResult.reason,
        })
        continue
      }

      if (blobResult.data.encoding !== 'base64' || typeof blobResult.data.content !== 'string') {
        skipped.push({
          path,
          reason: 'Unsupported blob encoding',
        })
        continue
      }

      const decoded = decodeGithubBlobContent(blobResult.data.content)
      if (decoded === null) {
        skipped.push({
          path,
          reason: 'Binary files are not supported',
        })
        continue
      }

      files.push({
        path,
        content: decoded,
      })
    }

    return {
      files,
      skipped,
      failureReason: null,
    }
  }

  listByProject(actor: ActorContext, projectId: string) {
    return this.repository.listByProject(actor, projectId)
  }

  listByProjectForSync(projectId: string) {
    return this.repository.listByProjectForSync(projectId)
  }

  getById(actor: ActorContext, fileId: string) {
    return this.repository.getById(actor, fileId)
  }

  create(actor: ActorContext, input: FileInput) {
    return this.repository.create(actor, input)
  }

  createFromSync(input: FileInput, ownerSubject: string | null = null) {
    return this.repository.createFromSync(input, ownerSubject)
  }

  update(
    actor: ActorContext,
    fileId: string,
    updates: Partial<Pick<FileInput, 'path' | 'content'>>,
  ) {
    return this.repository.update(actor, fileId, updates)
  }

  updateFromSync(
    fileId: string,
    updates: Partial<Pick<FileInput, 'path' | 'content'>>,
  ) {
    return this.repository.updateFromSync(fileId, updates)
  }

  remove(actor: ActorContext, fileId: string) {
    return this.repository.remove(actor, fileId)
  }

  removeFromSync(fileId: string) {
    return this.repository.removeFromSync(fileId)
  }

  listFoldersByProject(actor: ActorContext, projectId: string) {
    return this.repository.listFoldersByProject(actor, projectId)
  }

  createFolder(actor: ActorContext, projectId: string, path: string) {
    return this.repository.createFolder(actor, projectId, path)
  }

  importLocalFiles(actor: ActorContext, input: LocalFilesImportInput): Promise<FileImportResult> {
    return this.repository.importFilesSkipDuplicates(actor, input.projectId, input.files)
  }

  async importFromGithub(actor: ActorContext, input: GithubImportInput): Promise<FileImportResult> {
    const target = parseGithubTarget(input.repositoryUrl)
    if (!target) {
      throw Object.assign(new Error('Invalid GitHub repository URL'), {
        code: 'INVALID_GITHUB_REPOSITORY_URL',
      })
    }

    let branch = input.branch?.trim() || target.branchFromUrl || ''
    if (!branch) {
      const repository = await this.fetchGithubRepository(target)
      if (!repository.ok) {
        throw Object.assign(new Error(repository.reason), {
          code: 'GITHUB_IMPORT_FAILED',
        })
      }

      branch = repository.data.default_branch?.trim() || 'main'
    }

    const collected = await this.collectGithubImportFiles(target, branch)

    if (collected.failureReason) {
      throw Object.assign(new Error(collected.failureReason), {
        code: 'GITHUB_IMPORT_FAILED',
      })
    }

    const imported = await this.repository.importFilesSkipDuplicates(actor, input.projectId, collected.files)
    return {
      imported: imported.imported,
      skipped: [...collected.skipped, ...imported.skipped],
      failed: imported.failed,
    }
  }

  renameFolder(actor: ActorContext, projectId: string, fromPath: string, toPath: string) {
    return this.repository.renameFolder(actor, projectId, fromPath, toPath)
  }

  deleteFolder(actor: ActorContext, projectId: string, path: string) {
    return this.repository.deleteFolder(actor, projectId, path)
  }
}
