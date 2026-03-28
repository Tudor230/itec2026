import type { QueuedTerminalCommand } from './run-current-file-command'

interface ShouldSendQueuedCommandInput {
  queuedCommand: QueuedTerminalCommand | null
  lastExecutedCommandId: number
  canWriteToActiveTerminal: boolean
  isSessionOpen: boolean
}

export function shouldSendQueuedCommand({
  queuedCommand,
  lastExecutedCommandId,
  canWriteToActiveTerminal,
  isSessionOpen,
}: ShouldSendQueuedCommandInput): queuedCommand is QueuedTerminalCommand {
  if (!queuedCommand) {
    return false
  }

  if (queuedCommand.id <= lastExecutedCommandId) {
    return false
  }

  if (!canWriteToActiveTerminal) {
    return false
  }

  if (!isSessionOpen) {
    return false
  }

  return true
}
