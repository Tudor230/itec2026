import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../http/async-handler.js'
import { requireTokenPresent } from '../auth/require-token-present.middleware.js'
import { createDeepSeekEditSuggestion } from './deepseek.client.js'

const editCurrentFileSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  filePath: z.string().trim().min(1).max(1_024),
  fileContent: z.string().max(200_000),
  language: z.string().trim().max(64).optional(),
})

const diffLineSchema = z.object({
  type: z.enum(['context', 'add', 'remove']),
  content: z.string(),
})

const diffHunkSchema = z.object({
  oldStart: z.number().int().nonnegative(),
  oldLines: z.number().int().nonnegative(),
  newStart: z.number().int().nonnegative(),
  newLines: z.number().int().nonnegative(),
  lines: z.array(diffLineSchema),
})

const aiResponseSchema = z.object({
  summary: z.string(),
  diff: z.object({
    filePath: z.string(),
    oldPath: z.string(),
    newPath: z.string(),
    hunks: z.array(diffHunkSchema),
  }),
  updatedContent: z.string(),
  warnings: z.array(z.string()),
})

function logAiConfigStatus() {
  const hasApiKey = Boolean(process.env.DEEPSEEK_API_KEY?.trim())

  if (!hasApiKey) {
    console.warn('[ai] configuration:missing', {
      key: 'DEEPSEEK_API_KEY',
      message: 'DeepSeek requests will fail until this env var is set.',
    })
    return
  }

  console.log('[ai] configuration:ready', {
    model: process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com',
  })
}

function parseJsonPayload(rawResponse: string) {
  const trimmed = rawResponse.trim()

  if (trimmed.startsWith('```')) {
    const withoutFenceStart = trimmed.replace(/^```(?:json)?\s*/i, '')
    const withoutFenceEnd = withoutFenceStart.replace(/\s*```$/, '')
    return JSON.parse(withoutFenceEnd) as unknown
  }

  return JSON.parse(trimmed) as unknown
}

export function createAiRouter() {
  const router = Router()

  logAiConfigStatus()

  router.get('/health', (_request, response) => {
    response.json({
      ok: true,
      data: {
        module: 'ai',
        status: 'phase0-placeholder',
      },
    })
  })

  router.post('/edit-current-file', requireTokenPresent, asyncHandler(async (request, response) => {
    const requestId = randomUUID()
    const parsedInput = editCurrentFileSchema.safeParse(request.body)

    if (!parsedInput.success) {
      console.warn('[ai] interaction:invalid-input', {
        requestId,
        issueCount: parsedInput.error.issues.length,
      })
      response.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_AI_INPUT',
          message: parsedInput.error.message,
        },
      })
      return
    }

    const input = parsedInput.data

    console.log('[ai] interaction:start', {
      requestId,
      filePath: input.filePath,
      promptLength: input.prompt.length,
      fileContentLength: input.fileContent.length,
      language: input.language ?? 'unknown',
    })

    try {
      const rawResponse = await createDeepSeekEditSuggestion({
        requestId,
        prompt: input.prompt,
        filePath: input.filePath,
        fileContent: input.fileContent,
        language: input.language,
      })

      console.log('[ai] interaction:raw-response', {
        requestId,
        rawLength: rawResponse.length,
        rawResponse,
      })

      const rawJson = parseJsonPayload(rawResponse)
      const parsedOutput = aiResponseSchema.safeParse(rawJson)

      if (!parsedOutput.success) {
        console.error('[ai] interaction:parse-failed', {
          requestId,
          issueCount: parsedOutput.error.issues.length,
        })

        response.status(502).json({
          ok: false,
          error: {
            code: 'AI_RESPONSE_PARSE_FAILED',
            message: 'AI response could not be parsed',
          },
        })
        return
      }

      console.log('[ai] interaction:parsed-response', {
        requestId,
        parsedWarningCount: parsedOutput.data.warnings.length,
        parsedHunkCount: parsedOutput.data.diff.hunks.length,
        parsedResponse: parsedOutput.data,
      })

      console.log('[ai] interaction:success', {
        requestId,
        hunkCount: parsedOutput.data.diff.hunks.length,
        warningCount: parsedOutput.data.warnings.length,
      })

      response.json({
        ok: true,
        data: parsedOutput.data,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown AI error'
      console.error('[ai] interaction:error', {
        requestId,
        reason,
      })

      response.status(502).json({
        ok: false,
        error: {
          code: 'AI_PROVIDER_ERROR',
          message: 'AI request failed',
        },
      })
    }
  }))

  return router
}
