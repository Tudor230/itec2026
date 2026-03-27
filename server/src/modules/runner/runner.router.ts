import { Router } from 'express'

export function createRunnerRouter() {
  const router = Router()

  router.get('/health', (_request, response) => {
    response.json({
      ok: true,
      data: {
        module: 'runner',
        status: 'phase0-placeholder',
      },
    })
  })

  return router
}
