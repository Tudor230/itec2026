import { describe, expect, it } from 'vitest'
import { sanitizeReturnToPath } from './auth0-config'

describe('sanitizeReturnToPath', () => {
  it('returns safe local paths', () => {
    expect(sanitizeReturnToPath('/workspace', '/')).toBe('/workspace')
    expect(sanitizeReturnToPath('/projects', '/')).toBe('/projects')
    expect(sanitizeReturnToPath('/auth?mode=login', '/')).toBe('/auth?mode=login')
  })

  it('rejects empty and non-local values', () => {
    expect(sanitizeReturnToPath('', '/workspace')).toBe('/workspace')
    expect(sanitizeReturnToPath('workspace', '/workspace')).toBe('/workspace')
    expect(sanitizeReturnToPath('https://evil.example', '/workspace')).toBe('/workspace')
  })

  it('rejects protocol-relative paths', () => {
    expect(sanitizeReturnToPath('//evil.example', '/workspace')).toBe('/workspace')
  })
})
