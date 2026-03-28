import { createHash } from 'node:crypto'
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function resolveStorageRoot() {
  const configured = process.env.FILES_STORAGE_ROOT?.trim()
  if (configured) {
    return configured
  }

  return path.resolve(process.cwd(), '.data/files')
}

async function ensureStorageRoot(rootDirectory) {
  await mkdir(rootDirectory, { recursive: true, mode: 0o700 })

  const resolvedRoot = await realpath(rootDirectory)
  const stats = await lstat(resolvedRoot)
  if (!stats.isDirectory()) {
    throw new Error('FILES_STORAGE_ROOT must resolve to a directory')
  }

  return resolvedRoot
}

function validateStorageKey(storageKey) {
  if (!/^[A-Za-z0-9/_-]+$/.test(storageKey)) {
    throw new Error(`Invalid storage key: ${storageKey}`)
  }

  if (storageKey.includes('..') || storageKey.startsWith('/')) {
    throw new Error(`Invalid storage key: ${storageKey}`)
  }
}

function toHash(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

async function run() {
  const storageRoot = resolveStorageRoot()
  const rootPath = await ensureStorageRoot(storageRoot)

  let cursor = ''
  let processed = 0

  while (true) {
    const files = await prisma.$queryRaw`
      SELECT id, project_id, content
      FROM files
      WHERE id > ${cursor}
      ORDER BY id ASC
      LIMIT 500
    `

    if (!Array.isArray(files) || files.length === 0) {
      break
    }

    for (const file of files) {
      const id = String(file.id)
      const projectId = String(file.project_id)
      const content = String(file.content ?? '')
      const storageKey = `${projectId}/${id}`
      validateStorageKey(storageKey)

      const storagePath = path.resolve(rootPath, storageKey)
      if (!storagePath.startsWith(`${rootPath}${path.sep}`)) {
        throw new Error(`Storage path traversal blocked for ${storageKey}`)
      }

      await mkdir(path.dirname(storagePath), { recursive: true })
      await writeFile(storagePath, Buffer.from(content, 'utf8'))

      const contentHash = toHash(content)
      const byteSize = Buffer.from(content, 'utf8').byteLength

      await prisma.$executeRaw`
        UPDATE files
        SET storage_key = ${storageKey},
            content_hash = ${contentHash},
            byte_size = ${byteSize}
        WHERE id = ${id}
      `

      processed += 1
      cursor = id
    }
  }

  console.log(`Backfilled ${processed} files into ${rootPath}`)
}

run()
  .catch((error) => {
    console.error('Backfill failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
