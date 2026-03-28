import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { useCollabTerminal } from '../../hooks/use-collab-terminal'

interface TerminalPaneProps {
  projectId: string | null
}

function formatSubject(subject: string | null) {
  if (!subject) {
    return 'unknown'
  }

  if (!subject.includes('|')) {
    return subject
  }

  const [, short] = subject.split('|')
  return short || subject
}

export default function TerminalPane({ projectId }: TerminalPaneProps) {
  const {
    terminals,
    currentSubject,
    activeOwnerSubject,
    activeTerminalState,
    activeOutput,
    activeRequestStatus,
    connectionState,
    message,
    setActiveOwnerSubject,
    clearActiveOutput,
    sendCommand,
    requestAccess,
    decideAccess,
    revokeControl,
  } = useCollabTerminal({ projectId })

  const [command, setCommand] = useState('')

  const isOwnerOfActiveTerminal = useMemo(() => {
    return Boolean(activeOwnerSubject && currentSubject && activeOwnerSubject === currentSubject)
  }, [activeOwnerSubject, currentSubject])

  const isController = useMemo(() => {
    if (!activeTerminalState || !currentSubject) {
      return false
    }

    return activeTerminalState.activeControllerSubject === currentSubject
  }, [activeTerminalState, currentSubject])

  const canRequestAccess = Boolean(
    activeOwnerSubject
      && currentSubject
      && activeOwnerSubject !== currentSubject
      && !isController
      && activeRequestStatus !== 'pending',
  )

  const pendingRequests = activeTerminalState?.pendingRequests ?? []

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-[rgba(7,16,20,0.92)] text-[#d2f3ee]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(130,225,212,0.18)] px-4 py-2">
        <p className="m-0 text-xs font-semibold tracking-[0.12em] uppercase text-[#95d6cc]">
          Terminal
        </p>

        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-md border border-[rgba(130,225,212,0.22)] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-[#95d6cc]">
            {connectionState}
          </span>
          <button
            type="button"
            onClick={clearActiveOutput}
            className="rounded-md border border-[rgba(130,225,212,0.22)] px-2 py-1 text-xs text-[#a7e0d7]"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-[rgba(130,225,212,0.1)] px-4 py-2">
        {terminals.length === 0 ? (
          <span className="text-xs text-[#89b7b1]">No collaborators online yet.</span>
        ) : (
          terminals.map((terminal) => {
            const active = terminal.ownerSubject === activeOwnerSubject
            const mine = terminal.ownerSubject === currentSubject
            return (
              <button
                key={terminal.ownerSubject}
                type="button"
                onClick={() => setActiveOwnerSubject(terminal.ownerSubject)}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-[#8ce0d4] bg-[rgba(130,225,212,0.14)] text-[#d4faf4]'
                    : 'border-[rgba(130,225,212,0.22)] text-[#9ed5cc] hover:bg-[rgba(130,225,212,0.08)]',
                )}
              >
                {mine ? 'You' : formatSubject(terminal.ownerSubject)}
                {terminal.pendingRequestCount > 0 ? ` (${terminal.pendingRequestCount})` : ''}
              </button>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between border-b border-[rgba(130,225,212,0.1)] px-4 py-2 text-xs">
        <div className="text-[#9ed5cc]">
          {activeOwnerSubject
            ? `Owner: ${formatSubject(activeOwnerSubject)} | Controller: ${formatSubject(activeTerminalState?.activeControllerSubject ?? null)}`
            : 'Select a terminal to start'}
        </div>
        <div className="flex items-center gap-2">
          {!isOwnerOfActiveTerminal && canRequestAccess ? (
            <button
              type="button"
              onClick={requestAccess}
              className="rounded-md border border-[rgba(130,225,212,0.22)] px-2 py-1 text-xs text-[#a7e0d7]"
            >
              Request access
            </button>
          ) : null}

          {!isOwnerOfActiveTerminal && activeRequestStatus === 'pending' ? (
            <span className="text-[#d4d19a]">Request pending</span>
          ) : null}

          {!isOwnerOfActiveTerminal && (activeRequestStatus === 'rejected' || activeRequestStatus === 'revoked') ? (
            <span className="text-[#db9b9b]">Request {activeRequestStatus}</span>
          ) : null}

          {isOwnerOfActiveTerminal && activeTerminalState?.activeControllerSubject !== currentSubject ? (
            <button
              type="button"
              onClick={revokeControl}
              className="rounded-md border border-[rgba(231,130,130,0.38)] px-2 py-1 text-xs text-[#f2b7b7]"
            >
              Revoke control
            </button>
          ) : null}
        </div>
      </div>

      {isOwnerOfActiveTerminal && pendingRequests.length > 0 ? (
        <div className="flex flex-col gap-2 border-b border-[rgba(130,225,212,0.1)] px-4 py-2">
          {pendingRequests.map((request) => (
            <div
              key={request.requesterSubject}
              className="flex items-center justify-between rounded-md border border-[rgba(130,225,212,0.22)] bg-[rgba(130,225,212,0.06)] px-3 py-2"
            >
              <span className="text-xs text-[#c2ece6]">
                {formatSubject(request.requesterSubject)} requests control
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => decideAccess(request.requesterSubject, true)}
                  className="rounded-md border border-[rgba(130,225,212,0.3)] px-2 py-1 text-xs text-[#9fe2d8]"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decideAccess(request.requesterSubject, false)}
                  className="rounded-md border border-[rgba(231,130,130,0.38)] px-2 py-1 text-xs text-[#f2b7b7]"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 font-mono text-xs leading-6 sm:text-sm">
        {activeOutput.length === 0 ? (
          <p className="m-0 text-[#89b7b1]">No terminal output yet.</p>
        ) : (
          activeOutput.map((line, index) => (
            <p
              key={`${line.timestamp}-${index}`}
              className={cn(
                'm-0 whitespace-pre-wrap break-words',
                line.stream === 'stderr'
                  ? 'text-[#f4b3b3]'
                  : line.stream === 'system'
                    ? 'text-[#b4dad4]'
                    : 'text-[#d2f3ee]',
              )}
            >
              {line.chunk}
            </p>
          ))
        )}
      </div>

      <form
        className="border-t border-[rgba(130,225,212,0.18)] px-4 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!isController) {
            return
          }

          if (!command.trim()) {
            return
          }

          sendCommand(command)
          setCommand('')
        }}
      >
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          disabled={!isController}
          placeholder={isController ? 'Type a command and press Enter' : 'Read-only terminal'}
          className="w-full rounded-md border border-[rgba(130,225,212,0.22)] bg-[rgba(8,22,28,0.8)] px-3 py-2 font-mono text-xs text-[#d2f3ee] outline-none placeholder:text-[#7da9a3] disabled:cursor-not-allowed disabled:opacity-60"
        />
        {message ? (
          <p className="m-0 mt-2 text-xs text-[#f2b7b7]">{message}</p>
        ) : null}
      </form>
    </section>
  )
}
