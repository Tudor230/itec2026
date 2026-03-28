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
