import { Router } from 'express'

export function createAiRouter() {
  const router = Router()

  router.get('/health', (_request, response) => {
    response.json({
      ok: true,
      data: {
        module: 'ai',
        status: 'phase0-placeholder',
      },
    })
  })

  return router
}
