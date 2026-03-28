export type TerminalOutputStream = 'stdout' | 'stderr' | 'system'

export interface RuntimeOutputChunk {
  stream: TerminalOutputStream
  chunk: string
  timestamp: string
}

export interface TerminalRuntime {
  prewarm?(context: { cwd: string; projectId: string; ownerSubject: string }): Promise<void>
  execute(
    command: string,
    context: { cwd: string; projectId: string; ownerSubject: string },
    onOutput: (chunk: RuntimeOutputChunk) => void,
  ): Promise<{ nextCwd: string }>
  dispose(): void
}
