import { createHash } from 'node:crypto'

export function subjectFromToken(token: string): string {
  const digest = createHash('sha256').update(token).digest('hex')
  return `token:${digest}`
}
