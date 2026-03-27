import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import { prisma } from './db/prisma.js'
import { errorHandler } from './http/error-handler.js'
import { notFoundHandler } from './http/not-found-handler.js'
import { authBoundaryMiddleware } from './modules/auth/auth-boundary.middleware.js'
import { actorContextFromSocket } from './modules/auth/auth-socket-context.js'
import { createAiRouter } from './modules/ai/ai.router.js'
import { createProjectsRouter } from './modules/projects/projects.router.js'
import { createFilesRouter } from './modules/projects/files.router.js'
import { createRunnerRouter } from './modules/runner/runner.router.js'
import { createCollabServer } from './ws/collab-server.js'

async function bootstrap() {
  const app = express()
  const server = createServer(app)

  const allowedOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:3000'

  app.use(
    cors({
      origin: allowedOrigin,
    }),
  )
  app.use(express.json({ limit: '600kb' }))
  app.use(authBoundaryMiddleware)

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      data: { status: 'healthy' },
    })
  })

  app.use('/api/projects', createProjectsRouter({ prisma }))
  app.use('/api/files', createFilesRouter({ prisma }))
  app.use('/api/runner', createRunnerRouter())
  app.use('/api/ai', createAiRouter())
  app.use(notFoundHandler)
  app.use(errorHandler)

  createCollabServer(server, actorContextFromSocket)

  const port = Number(process.env.PORT ?? 4000)
  server.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`)
  })

  let isShuttingDown = false

  const shutdown = (signal: NodeJS.Signals) => {
    if (isShuttingDown) {
      return
    }

    isShuttingDown = true
    console.log(`Received ${signal}, shutting down`)

    server.close(() => {
      prisma
        .$disconnect()
        .catch(() => undefined)
        .finally(() => {
          process.exit(0)
        })
    })
  }

  process.once('SIGINT', () => {
    shutdown('SIGINT')
  })

  process.once('SIGTERM', () => {
    shutdown('SIGTERM')
  })
}

void bootstrap().catch((error: unknown) => {
  console.error('Failed to start server', error)
  prisma
    .$disconnect()
    .catch(() => undefined)
    .finally(() => {
      process.exit(1)
    })
})
