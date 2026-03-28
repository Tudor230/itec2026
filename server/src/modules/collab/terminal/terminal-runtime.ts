export type TerminalOutputStream = 'stdout' | 'stderr' | 'system'

export interface RuntimeOutputChunk {
  stream: TerminalOutputStream
  chunk: string
  timestamp: string
}

export interface RuntimeTerminalSize {
  cols: number
  rows: number
}

export interface TerminalRuntime {
  prewarm?(context: { cwd: string; projectId: string; ownerSubject: string }): Promise<void>
  openSession(
    context: { cwd: string; projectId: string; ownerSubject: string },
    onOutput: (chunk: RuntimeOutputChunk) => void,
    initialSize?: RuntimeTerminalSize,
  ): Promise<void>
  writeInput(
    input: string,
    context: { cwd: string; projectId: string; ownerSubject: string },
  ): Promise<void>
  resizeSession(
    size: RuntimeTerminalSize,
    context: { cwd: string; projectId: string; ownerSubject: string },
  ): Promise<void>
  closeSession(context: { cwd: string; projectId: string; ownerSubject: string }): Promise<void>
  dispose(): void
}
