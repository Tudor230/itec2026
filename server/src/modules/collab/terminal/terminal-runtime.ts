export type TerminalOutputStream = 'stdout' | 'stderr' | 'system'

export interface RuntimeOutputChunk {
  stream: TerminalOutputStream
  chunk: string
  timestamp: string
}

export interface TerminalRuntime {
  execute(
    command: string,
    context: { cwd: string },
    onOutput: (chunk: RuntimeOutputChunk) => void,
  ): Promise<{ nextCwd: string }>
  dispose(): void
}
