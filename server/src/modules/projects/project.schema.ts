import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
}).refine((value) => value.name !== undefined, {
  message: 'At least one field must be provided',
})

export const createProjectInviteSchema = z.object({
  role: z.literal('editor').default('editor'),
})

export const revokeProjectInviteSchema = z.object({
  inviteId: z.string().trim().min(1),
})

export const updateProjectMemberProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).optional(),
})
