import { useCallback, useRef, useState } from 'react'
import {
  buildRunCurrentFileCommand,
  type QueuedTerminalCommand,
} from '../components/workspace/run-current-file-command'

interface UseRunCurrentFileOptions {
  activeFilePath: string | null
  onRunStart: () => void
  onRunError: (message: string) => void
}

export function useRunCurrentFile({
  activeFilePath,
  onRunStart,
  onRunError,
}: UseRunCurrentFileOptions) {
  const [queuedTerminalCommand, setQueuedTerminalCommand] = useState<QueuedTerminalCommand | null>(null)
  const queuedTerminalCommandIdRef = useRef(1)

  const runCurrentFile = useCallback(() => {
    if (!activeFilePath) {
      onRunError('Open a file before running.')
      return
    }

    const resolved = buildRunCurrentFileCommand(activeFilePath)
    if (!resolved.ok) {
      onRunError(resolved.reason)
      return
    }

    onRunStart()

    const nextId = queuedTerminalCommandIdRef.current
    queuedTerminalCommandIdRef.current += 1

    setQueuedTerminalCommand({
      id: nextId,
      command: resolved.command,
    })
  }, [activeFilePath, onRunError, onRunStart])

  const clearQueuedTerminalCommand = useCallback((sentCommandId: number) => {
    setQueuedTerminalCommand((previous) => {
      if (!previous || previous.id !== sentCommandId) {
        return previous
      }

      return null
    })
  }, [])

  const resetQueuedTerminalCommand = useCallback(() => {
    setQueuedTerminalCommand(null)
  }, [])

  return {
    queuedTerminalCommand,
    runCurrentFile,
    clearQueuedTerminalCommand,
    resetQueuedTerminalCommand,
  }
}
