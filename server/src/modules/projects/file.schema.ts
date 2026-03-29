import { z } from 'zod'

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

const importFileSchema = z.object({
  path: z.string().trim().min(1).max(256).refine((value) => {
    return !value.includes('..') && !value.startsWith('/') && !value.startsWith('\\')
  }, { message: 'Invalid file path' }),
  content: z.string().max(500_000),
})

export const importFilesSchema = z.object({
  projectId: z.string().trim().min(1),
  files: z.array(importFileSchema).min(1).max(300),
  conflictStrategy: z.enum(['skip', 'overwrite', 'fail']).default('skip'),
})
