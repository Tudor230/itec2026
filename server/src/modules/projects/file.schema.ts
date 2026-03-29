import { z } from 'zod'

const MAX_IMPORT_FILES = 1000
const MAX_IMPORT_FILE_CONTENT_LENGTH = 500_000
const MAX_IMPORT_TOTAL_CONTENT_LENGTH = 5_000_000

export const createFileSchema = z.object({
  projectId: z.string().trim().min(1),
  path: z.string().trim().min(1).max(256).refine((value) => {
    return !value.includes('..') && !value.startsWith('/') && !value.startsWith('\\')
  }, { message: 'Invalid file path' }),
  content: z.string().max(500_000).default(''),
})

export const updateFileSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .refine((value) => {
      return !value.includes('..') && !value.startsWith('/') && !value.startsWith('\\')
    }, { message: 'Invalid file path' })
    .optional(),
  content: z.string().max(500_000).optional(),
}).refine((value) => value.path !== undefined || value.content !== undefined, {
  message: 'At least one field must be provided',
})

const folderPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => {
    return !value.includes('..') && !value.startsWith('/') && !value.startsWith('\\')
  }, { message: 'Invalid folder path' })

export const createFolderSchema = z.object({
  projectId: z.string().trim().min(1),
  path: folderPathSchema,
})

export const renameFolderSchema = z.object({
  projectId: z.string().trim().min(1),
  fromPath: folderPathSchema,
  toPath: folderPathSchema,
}).refine((value) => value.fromPath !== value.toPath, {
  message: 'fromPath and toPath must differ',
}).refine((value) => !value.toPath.startsWith(`${value.fromPath}/`), {
  message: 'Cannot move folder into its own subtree',
})

export const deleteFolderSchema = z.object({
  projectId: z.string().trim().min(1),
  path: folderPathSchema,
})

const importFileEntrySchema = z.object({
  path: z.string().trim().min(1).max(256).refine((value) => {
    return !value.includes('..') && !value.startsWith('/') && !value.startsWith('\\')
  }, { message: 'Invalid file path' }),
  content: z.string().max(MAX_IMPORT_FILE_CONTENT_LENGTH),
})

export const importLocalFilesSchema = z.object({
  projectId: z.string().trim().min(1),
  files: z.array(importFileEntrySchema).min(1).max(MAX_IMPORT_FILES),
}).superRefine((value, context) => {
  const totalLength = value.files.reduce((sum, file) => sum + file.content.length, 0)
  if (totalLength > MAX_IMPORT_TOTAL_CONTENT_LENGTH) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Import payload is too large',
      path: ['files'],
    })
  }
})

const githubRepoUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value)
      return parsed.hostname.toLowerCase() === 'github.com'
    } catch {
      return false
    }
  }, { message: 'Only github.com repository URLs are supported' })

const githubBranchSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._\-/]+$/, 'Invalid branch name')

export const importGithubProjectSchema = z.object({
  projectId: z.string().trim().min(1),
  repositoryUrl: githubRepoUrlSchema,
  branch: githubBranchSchema.optional(),
})
