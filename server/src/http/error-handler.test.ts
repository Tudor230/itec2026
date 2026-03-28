import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { errorHandler } from './error-handler.js'

async function startServer() {
  const app = express()

  app.get('/auth-required', () => {
    throw Object.assign(new Error('no token'), { code: 'AUTH_REQUIRED' })
  })

  app.get('/duplicate', () => {
    throw Object.assign(new Error('duplicate'), { code: 'P2002' })
  })

  app.get('/invalid-reference', () => {
    throw Object.assign(new Error('invalid reference'), { code: 'P2003' })
  })

  app.get('/resource-missing', () => {
    throw Object.assign(new Error('missing'), { code: 'P2025' })
  })

  app.get('/boom', () => {
    throw new Error('unexpected failure')
  })

  app.use(errorHandler)

  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started))
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Cannot determine error-handler test server address')
  }

  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
    close: () => {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
    },
  }
}

describe('errorHandler', () => {
  let baseUrl = ''
  let closeServer: (() => Promise<void>) | undefined
  let restoreConsoleError: (() => void) | undefined

  beforeEach(async () => {
    const originalConsoleError = console.error
    console.error = () => undefined
    restoreConsoleError = () => {
      console.error = originalConsoleError
    }

    const started = await startServer()
    baseUrl = started.baseUrl
    closeServer = started.close
  })

  afterEach(async () => {
    if (closeServer) {
      await closeServer()
      closeServer = undefined
    }

    if (restoreConsoleError) {
      restoreConsoleError()
      restoreConsoleError = undefined
    }
  })

  it('maps AUTH_REQUIRED to 401 with stable payload', async () => {
    const response = await fetch(`${baseUrl}/auth-required`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.deepEqual(payload, {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication is required',
      },
    })
  })

  it('maps duplicate and invalid reference db-like errors', async () => {
    const duplicate = await fetch(`${baseUrl}/duplicate`)
    const duplicatePayload = await duplicate.json()

    const invalidReference = await fetch(`${baseUrl}/invalid-reference`)
    const invalidReferencePayload = await invalidReference.json()

    assert.equal(duplicate.status, 409)
    assert.equal(duplicatePayload.error.code, 'DUPLICATE_RESOURCE')
    assert.equal(duplicatePayload.error.message, 'Resource already exists')

    assert.equal(invalidReference.status, 400)
    assert.equal(invalidReferencePayload.error.code, 'INVALID_REFERENCE')
    assert.equal(invalidReferencePayload.error.message, 'Invalid request data')
  })

  it('maps P2025 to 404 and unknown errors to 500', async () => {
    const missing = await fetch(`${baseUrl}/resource-missing`)
    const missingPayload = await missing.json()

    const unknown = await fetch(`${baseUrl}/boom`)
    const unknownPayload = await unknown.json()

    assert.equal(missing.status, 404)
    assert.equal(missingPayload.error.code, 'RESOURCE_NOT_FOUND')
    assert.equal(missingPayload.error.message, 'Resource not found')

    assert.equal(unknown.status, 500)
    assert.equal(unknownPayload.error.code, 'INTERNAL_ERROR')
    assert.equal(unknownPayload.error.message, 'Unexpected server error')
  })
})
