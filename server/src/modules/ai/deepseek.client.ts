const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
const DEFAULT_TIMEOUT_MS = 30_000

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface DeepSeekChatCompletionRequest {
  model: string
  messages: DeepSeekMessage[]
  temperature?: number
}

interface DeepSeekChatCompletionChoice {
  message?: {
    content?: string
  }
}

interface DeepSeekChatCompletionResponse {
  choices?: DeepSeekChatCompletionChoice[]
}

function resolveTimeoutMs() {
  const configured = Number(process.env.DEEPSEEK_TIMEOUT_MS ?? '')

  if (Number.isFinite(configured) && configured > 0) {
    return configured
  }

  return DEFAULT_TIMEOUT_MS
}

function resolveBaseUrl() {
  const configured = process.env.DEEPSEEK_BASE_URL?.trim()

  if (configured && configured.length > 0) {
    return configured
  }

  return DEFAULT_DEEPSEEK_BASE_URL
}

function resolveModel() {
  const configured = process.env.DEEPSEEK_MODEL?.trim()

  if (configured && configured.length > 0) {
    return configured
  }

  return DEFAULT_DEEPSEEK_MODEL
}

function parseAssistantText(payload: DeepSeekChatCompletionResponse) {
  const firstChoice = payload.choices?.[0]
  const text = firstChoice?.message?.content

  if (!text || text.trim().length === 0) {
    throw new Error('DeepSeek returned an empty assistant message')
  }

  return text
}

export async function createDeepSeekEditSuggestion({
  requestId,
  prompt,
  filePath,
  fileContent,
  language,
}: {
  requestId: string
  prompt: string
  filePath: string
  fileContent: string
  language?: string
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('DeepSeek API key is not configured')
  }

  const model = resolveModel()
  const timeoutMs = resolveTimeoutMs()
  const baseUrl = resolveBaseUrl()

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  const systemPrompt = [
    'You are a careful coding assistant.',
    'Return ONLY valid JSON matching this schema:',
    '{"summary":"string","diff":{"filePath":"string","oldPath":"string","newPath":"string","hunks":[{"oldStart":number,"oldLines":number,"newStart":number,"newLines":number,"lines":[{"type":"context|add|remove","content":"string"}]}]},"updatedContent":"string","warnings":["string"]}',
    'Do not include markdown fences or prose outside JSON.',
    'Keep edits scoped strictly to the user request.',
    'If request is ambiguous, include warnings.',
  ].join(' ')

  const userPrompt = [
    `User prompt: ${prompt}`,
    `File path: ${filePath}`,
    `Language: ${language ?? 'unknown'}`,
    'Current file content follows:',
    fileContent,
  ].join('\n\n')

  const payload: DeepSeekChatCompletionRequest = {
    model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }

  console.log('[ai][deepseek] request:start', {
    requestId,
    model,
    timeoutMs,
    filePath,
    promptLength: prompt.length,
    fileContentLength: fileContent.length,
    apiKeyConfigured: true,
  })

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const textBody = await response.text()

    if (!response.ok) {
      const responseBodyPreview = textBody.slice(0, 300)
      console.error('[ai][deepseek] request:failed', {
        requestId,
        status: response.status,
        statusText: response.statusText,
        responseBodyPreview,
      })

      if (response.status === 401) {
        throw new Error('DeepSeek authentication failed (401). Check DEEPSEEK_API_KEY and account access.')
      }

      throw new Error(`DeepSeek request failed with status ${response.status}`)
    }

    const json = JSON.parse(textBody) as DeepSeekChatCompletionResponse
    const assistantText = parseAssistantText(json)

    console.log('[ai][deepseek] request:success', {
      requestId,
      responseLength: assistantText.length,
    })

    return assistantText
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown DeepSeek error'
    console.error('[ai][deepseek] request:error', {
      requestId,
      reason,
    })
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
