import { useCallback, useEffect, useMemo, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { cn } from '../../lib/utils'
import { useCollabTerminal } from '../../hooks/use-collab-terminal'
import type { QueuedTerminalCommand } from './run-current-file-command'
import { shouldSendQueuedCommand } from './terminal-queued-command'

interface TerminalPaneProps {
  projectId: string | null
  queuedCommand: QueuedTerminalCommand | null
  onQueuedCommandSent?: (commandId: number) => void
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

export default function TerminalPane({ projectId, queuedCommand, onQueuedCommandSent }: TerminalPaneProps) {
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
    sendInput,
    openActiveTerminal,
    resizeActiveTerminal,
    requestAccess,
    decideAccess,
    revokeControl,
  } = useCollabTerminal({ projectId })

  const xtermContainerRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<any>(null)
  const lastWrittenCountRef = useRef(0)
  const lastExecutedQueuedCommandIdRef = useRef<number>(0)
  const activeOutputRef = useRef(activeOutput)
  const sendInputRef = useRef(sendInput)
  const openActiveTerminalRef = useRef(openActiveTerminal)
  const resizeActiveTerminalRef = useRef(resizeActiveTerminal)

  const replayBufferedOutput = useCallback(() => {
    const term = xtermRef.current
    if (!term) {
      return
    }

    const output = activeOutputRef.current
    if (lastWrittenCountRef.current > output.length) {
      term.reset()
      lastWrittenCountRef.current = 0
    }

    for (let index = lastWrittenCountRef.current; index < output.length; index += 1) {
      term.write(output[index].chunk)
    }

    lastWrittenCountRef.current = output.length
  }, [])

  const isOwnerOfActiveTerminal = useMemo(() => {
    return Boolean(activeOwnerSubject && currentSubject && activeOwnerSubject === currentSubject)
  }, [activeOwnerSubject, currentSubject])

  const canWriteToActiveTerminal = useMemo(() => {
    if (!activeTerminalState || !currentSubject) {
      return false
    }

    return activeOwnerSubject === currentSubject || activeTerminalState.activeControllerSubject === currentSubject
  }, [activeOwnerSubject, activeTerminalState, currentSubject])

  const canRequestAccess = Boolean(
    activeOwnerSubject
      && currentSubject
      && activeOwnerSubject !== currentSubject
      && !canWriteToActiveTerminal
      && activeRequestStatus !== 'pending',
  )

  const pendingRequests = activeTerminalState?.pendingRequests ?? []

  useEffect(() => {
    activeOutputRef.current = activeOutput
    sendInputRef.current = sendInput
    openActiveTerminalRef.current = openActiveTerminal
    resizeActiveTerminalRef.current = resizeActiveTerminal
  }, [activeOutput, openActiveTerminal, resizeActiveTerminal, sendInput])

  useEffect(() => {
    const container = xtermContainerRef.current
    if (!container) {
      return
    }
    let cancelled = false
    let cleanup: (() => void) | null = null

    void (async () => {
      const xtermModule = await import('@xterm/xterm')
      const addonModule = await import('@xterm/addon-fit')

      const TerminalCtor = (xtermModule as { Terminal?: new (...args: any[]) => any }).Terminal
        ?? (xtermModule as { default?: { Terminal?: new (...args: any[]) => any } }).default?.Terminal
      const FitAddonCtor = (addonModule as { FitAddon?: new (...args: any[]) => any }).FitAddon
        ?? (addonModule as { default?: { FitAddon?: new (...args: any[]) => any } }).default?.FitAddon

      if (!TerminalCtor || !FitAddonCtor || cancelled) {
        return
      }

      const term = new TerminalCtor({
        convertEol: false,
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
        fontSize: 13,
        lineHeight: 1.3,
        theme: {
          background: '#08161c',
          foreground: '#d2f3ee',
          cursor: '#8ce0d4',
        },
      })

      const fit = new FitAddonCtor()
      term.loadAddon(fit)
      term.open(container)
      fit.fit()

      const disposable = term.onData((input: string) => {
        if (!canWriteToActiveTerminal) {
          return
        }

        sendInputRef.current(input)
      })

      const handleResize = () => {
        fit.fit()

        if (!activeOwnerSubject) {
          return
        }

        const cols = Math.max(1, term.cols)
        const rows = Math.max(1, term.rows)

        if (!activeTerminalState?.isSessionOpen && canWriteToActiveTerminal) {
          openActiveTerminalRef.current(cols, rows)
          return
        }

        if (activeTerminalState?.isSessionOpen) {
          resizeActiveTerminalRef.current(cols, rows)
        }
      }

      window.addEventListener('resize', handleResize)

      xtermRef.current = term

      replayBufferedOutput()
      handleResize()

      cleanup = () => {
        window.removeEventListener('resize', handleResize)
        disposable.dispose()
        term.dispose()
        xtermRef.current = null
        lastWrittenCountRef.current = 0
      }
    })().catch(() => undefined)

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [activeOwnerSubject, activeTerminalState?.isSessionOpen, canWriteToActiveTerminal, replayBufferedOutput])

  useEffect(() => {
    replayBufferedOutput()
  }, [activeOutput, replayBufferedOutput])

  useEffect(() => {
    if (!shouldSendQueuedCommand({
      queuedCommand,
      lastExecutedCommandId: lastExecutedQueuedCommandIdRef.current,
      canWriteToActiveTerminal,
      isSessionOpen: Boolean(activeTerminalState?.isSessionOpen),
    })) {
      return
    }

    sendInputRef.current(`${queuedCommand.command}\n`)
    lastExecutedQueuedCommandIdRef.current = queuedCommand.id
    onQueuedCommandSent?.(queuedCommand.id)
  }, [activeTerminalState?.isSessionOpen, canWriteToActiveTerminal, onQueuedCommandSent, queuedCommand])

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
            ? `Owner: ${formatSubject(activeOwnerSubject)} | Controller: ${formatSubject(activeTerminalState?.activeControllerSubject ?? null)} | Session: ${activeTerminalState?.isSessionOpen ? 'open' : 'closed'}`
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

      <div className="min-h-0 flex-1 px-4 py-3">
        <div ref={xtermContainerRef} className="h-full w-full rounded-md border border-[rgba(130,225,212,0.16)]" />
      </div>

      {message ? (
        <p className="m-0 border-t border-[rgba(130,225,212,0.18)] px-4 py-2 text-xs text-[#f2b7b7]">{message}</p>
      ) : null}
    </section>
  )
}
