import path from 'node:path'
import type { ImportedFileInput } from './file.types.js'

const DEFAULT_MAX_FILES = 300
const DEFAULT_MAX_FILE_BYTES = 500_000

type FetchLike = typeof fetch

interface GithubRepositoryResponse {
  default_branch: string
}

interface GithubTreeEntry {
  path: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

interface GithubTreeResponse {
  truncated?: boolean
  tree: GithubTreeEntry[]
}

interface GithubBlobResponse {
  encoding: string
  content: string
  size: number
}

export interface GithubImportSource {
  owner: string
  repo: string
  ref: string
}

export interface GithubImportResult {
  source: GithubImportSource
  files: ImportedFileInput[]
  skippedFileCount: number
}

function asImportError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

function normalizeRelativePath(rawPath: string) {
  const normalized = path.posix.normalize(rawPath.trim().replace(/\\+/g, '/'))

  if (!normalized || normalized === '.' || normalized.startsWith('/')) {
    return null
  }

  if (normalized.startsWith('../') || normalized.includes('/../') || normalized.includes('..')) {
    return null
  }

  if (normalized.length > 256) {
    return null
  }

  return normalized
}

function isIgnoredPath(filePath: string) {
  const segments = filePath.split('/')
  return segments.some((segment) => {
    return segment === '.git'
      || segment === 'node_modules'
      || segment === '.next'
      || segment === 'dist'
      || segment === 'build'
      || segment === 'coverage'
      || segment === '.cache'
  })
}

function parseGithubUrl(githubUrl: string): { owner: string; repo: string; ref?: string } {
  let url: URL
  try {
    url = new URL(githubUrl)
  } catch {
    throw asImportError('GITHUB_IMPORT_INVALID_URL', 'GitHub URL is invalid')
  }

  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw asImportError('GITHUB_IMPORT_INVALID_URL', 'Only https://github.com URLs are supported')
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw asImportError('GITHUB_IMPORT_INVALID_URL', 'GitHub URL must include owner and repository')
  }

  const owner = segments[0]?.trim()
  const repoRaw = segments[1]?.trim()
  if (!owner || !repoRaw) {
    throw asImportError('GITHUB_IMPORT_INVALID_URL', 'GitHub URL must include owner and repository')
  }

  const repo = repoRaw.endsWith('.git') ? repoRaw.slice(0, -4) : repoRaw
  const maybeTreeKeyword = segments[2]
  const refSegments = segments.slice(3)

  if (!repo) {
    throw asImportError('GITHUB_IMPORT_INVALID_URL', 'GitHub URL must include repository name')
  }

  return {
    owner,
    repo,
    ref: maybeTreeKeyword === 'tree' && refSegments.length > 0
      ? refSegments.join('/')
      : undefined,
  }
}

export class GithubPublicImporter {
  private readonly fetchFn: FetchLike

  private readonly maxFiles: number

  private readonly maxFileBytes: number

  private readonly requestTimeoutMs: number

  constructor(options?: {
    fetchFn?: FetchLike
    maxFiles?: number
    maxFileBytes?: number
    requestTimeoutMs?: number
  }) {
    this.fetchFn = options?.fetchFn ?? fetch
    this.maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES
    this.maxFileBytes = options?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 10_000
  }

  private async requestGithubJson<T>(url: string): Promise<T> {
    const abortController = new AbortController()
    const timeout = setTimeout(() => {
      abortController.abort()
    }, this.requestTimeoutMs)

    let response: Response
    try {
      response = await this.fetchFn(url, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'itec2026-github-importer',
        },
        signal: abortController.signal,
      })
    } catch (error) {
      const errorLike = error as { name?: string }
      if (errorLike.name === 'AbortError') {
        throw asImportError('GITHUB_IMPORT_TIMEOUT', 'GitHub import timed out, please try again')
      }

      throw asImportError('GITHUB_IMPORT_FAILED', 'Could not fetch repository metadata from GitHub')
    } finally {
      clearTimeout(timeout)
    }

    if (response.status === 404) {
      throw asImportError('GITHUB_REPO_NOT_FOUND', 'Repository not found or not publicly accessible')
    }

    if (response.status === 403) {
      throw asImportError('GITHUB_IMPORT_RATE_LIMITED', 'GitHub rate limit reached, please try again later')
    }

    if (!response.ok) {
      throw asImportError('GITHUB_IMPORT_FAILED', 'Could not fetch repository metadata from GitHub')
    }

    return response.json() as Promise<T>
  }

  async importRepository(githubUrl: string): Promise<GithubImportResult> {
    const parsed = parseGithubUrl(githubUrl)

    const repository = await this.requestGithubJson<GithubRepositoryResponse>(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
    )

    const ref = parsed.ref ?? repository.default_branch
    const treeResponse = await this.requestGithubJson<GithubTreeResponse>(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    )

    if (treeResponse.truncated) {
      throw asImportError(
        'GITHUB_IMPORT_TOO_LARGE',
        `Repository tree is too large to import (limit ${this.maxFiles} files).`,
      )
    }

    const blobEntries = treeResponse.tree.filter((entry) => entry.type === 'blob')
    if (blobEntries.length > this.maxFiles) {
      throw asImportError(
        'GITHUB_IMPORT_TOO_LARGE',
        `Repository has too many files (${blobEntries.length}); max supported is ${this.maxFiles}.`,
      )
    }

    let skippedFileCount = 0
    const files: ImportedFileInput[] = []

    for (const entry of blobEntries) {
      const normalizedPath = normalizeRelativePath(entry.path)
      if (!normalizedPath || isIgnoredPath(normalizedPath)) {
        skippedFileCount += 1
        continue
      }

      if ((entry.size ?? 0) > this.maxFileBytes) {
        skippedFileCount += 1
        continue
      }

      const blob = await this.requestGithubJson<GithubBlobResponse>(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/blobs/${entry.sha}`,
      )

      if (blob.encoding !== 'base64') {
        skippedFileCount += 1
        continue
      }

      const rawContent = blob.content.replace(/\n/g, '')
      const contentBuffer = Buffer.from(rawContent, 'base64')
      if (contentBuffer.byteLength > this.maxFileBytes) {
        skippedFileCount += 1
        continue
      }

      const textContent = contentBuffer.toString('utf8')
      if (!Buffer.from(textContent, 'utf8').equals(contentBuffer) || textContent.includes('\u0000')) {
        skippedFileCount += 1
        continue
      }

      files.push({
        path: normalizedPath,
        content: textContent,
      })
    }

    if (files.length === 0) {
      throw asImportError('GITHUB_IMPORT_EMPTY', 'Repository does not contain importable text files')
    }

    return {
      source: {
        owner: parsed.owner,
        repo: parsed.repo,
        ref,
      },
      files,
      skippedFileCount,
    }
  }
}
