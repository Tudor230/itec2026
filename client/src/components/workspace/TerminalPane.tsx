import { useCallback, useEffect, useMemo, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { cn } from '../../lib/utils'
import { resolveTerminalTheme } from '../../lib/terminal-theme'
import { useThemePreset } from '../../theme/ThemeProvider'
import { useCollabTerminal } from '../../hooks/use-collab-terminal'
import type { QueuedTerminalCommand } from './run-current-file-command'
import { shouldSendQueuedCommand } from './terminal-queued-command'

interface TerminalPaneProps {
  projectId: string | null
  queuedCommand: QueuedTerminalCommand | null
  onQueuedCommandSent?: (commandId: number) => void
  collaboratorIdentityBySubject?: Record<string, { name: string; email: string }>
}

type ConnectionState = 'idle' | 'connecting' | 'synced' | 'disconnected' | 'error'

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

function resolveCollaboratorIdentity(
  subject: string | null,
  map: Record<string, { name: string; email: string }>,
) {
  if (!subject) {
    return {
      name: 'Unknown user',
      email: 'Not available',
    }
  }

  const mapped = map[subject]
  if (mapped) {
    return mapped
  }

  return {
    name: formatSubject(subject),
    email: 'Not available',
  }
}

function resolveConnectionTone(state: ConnectionState) {
  if (state === 'synced') {
    return 'text-[var(--terminal-success)]'
  }

  if (state === 'connecting') {
    return 'text-[var(--terminal-warning)]'
  }

  if (state === 'error' || state === 'disconnected') {
    return 'text-[var(--terminal-danger)]'
  }

  return 'text-[var(--terminal-panel-muted)]'
}

function resolveMessageTone(state: ConnectionState) {
  if (state === 'error' || state === 'disconnected') {
    return 'bg-[var(--terminal-message-error-bg)] text-[var(--terminal-message-error-fg)]'
  }

  return 'bg-[var(--terminal-request-bg)] text-[var(--terminal-panel-muted)]'
}

const BUTTON_CLASS =
  'rounded-md border border-[var(--terminal-button-border)] bg-[var(--terminal-button-bg)] px-2 py-1 text-xs text-[var(--terminal-button-fg)] transition-colors hover:bg-[var(--terminal-button-bg-hover)]'

const DANGER_BUTTON_CLASS =
  'rounded-md border border-[var(--terminal-danger-border)] bg-[var(--terminal-danger-bg)] px-2 py-1 text-xs text-[var(--terminal-danger-fg)] transition-colors hover:bg-[color-mix(in_oklab,var(--terminal-danger)_22%,var(--terminal-button-bg-hover)_78%)]'

export default function TerminalPane({
  projectId,
  queuedCommand,
  onQueuedCommandSent,
  collaboratorIdentityBySubject = {},
}: TerminalPaneProps) {
  const { preset } = useThemePreset()
  const terminalTheme = useMemo(() => resolveTerminalTheme(preset), [preset])

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
  const terminalThemeRef = useRef(terminalTheme)
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
    terminalThemeRef.current = terminalTheme
    const term = xtermRef.current

    if (!term) {
      return
    }

    if (typeof term.setOption === 'function') {
      term.setOption('theme', terminalTheme)
      return
    }

    term.options = {
      ...term.options,
      theme: terminalTheme,
    }
  }, [terminalTheme])

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
          theme: terminalThemeRef.current,
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
    <section className="flex h-full min-w-0 flex-1 flex-col bg-[var(--terminal-panel-bg)] text-[var(--terminal-panel-fg)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--terminal-border)] px-4 py-2">
        <p className="m-0 text-xs font-semibold tracking-[0.12em] uppercase text-[var(--terminal-panel-muted)]">
          Terminal
        </p>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              'rounded-md border border-[var(--terminal-button-border)] bg-[var(--terminal-button-bg)] px-2 py-1 text-[10px] uppercase tracking-[0.1em]',
              resolveConnectionTone(connectionState),
            )}
          >
            {connectionState}
          </span>
          <button
            type="button"
            onClick={clearActiveOutput}
            className={BUTTON_CLASS}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-[var(--terminal-border)] px-4 py-2">
        {terminals.length === 0 ? (
          <span className="text-xs text-[var(--terminal-panel-muted)]">No collaborators online yet.</span>
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
                    ? 'border-[var(--terminal-accent)] bg-[var(--terminal-accent-soft)] text-[var(--terminal-panel-fg)]'
                    : 'border-[var(--terminal-button-border)] bg-[var(--terminal-button-bg)] text-[var(--terminal-panel-muted)] hover:bg-[var(--terminal-button-bg-hover)]',
                )}
              >
                {mine
                  ? 'You'
                  : resolveCollaboratorIdentity(
                    terminal.ownerSubject,
                    collaboratorIdentityBySubject,
                  ).name}
                {terminal.pendingRequestCount > 0 ? ` (${terminal.pendingRequestCount})` : ''}
              </button>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between border-b border-[var(--terminal-border)] px-4 py-2 text-xs">
        <div className="text-[var(--terminal-panel-muted)]">
          {activeOwnerSubject
            ? `Owner: ${resolveCollaboratorIdentity(activeOwnerSubject, collaboratorIdentityBySubject).name} | Controller: ${resolveCollaboratorIdentity(activeTerminalState?.activeControllerSubject ?? null, collaboratorIdentityBySubject).name} | Session: ${activeTerminalState?.isSessionOpen ? 'open' : 'closed'}`
            : 'Select a terminal to start'}
        </div>
        <div className="flex items-center gap-2">
          {!isOwnerOfActiveTerminal && canRequestAccess ? (
            <button
              type="button"
              onClick={requestAccess}
              className={BUTTON_CLASS}
            >
              Request access
            </button>
          ) : null}

          {!isOwnerOfActiveTerminal && activeRequestStatus === 'pending' ? (
            <span className="rounded-md bg-[var(--terminal-pending-bg)] px-2 py-1 text-[var(--terminal-pending-fg)]">Request pending</span>
          ) : null}

          {!isOwnerOfActiveTerminal && (activeRequestStatus === 'rejected' || activeRequestStatus === 'revoked') ? (
            <span className="rounded-md bg-[var(--terminal-danger-bg)] px-2 py-1 text-[var(--terminal-danger-fg)]">Request {activeRequestStatus}</span>
          ) : null}

          {isOwnerOfActiveTerminal && activeTerminalState?.activeControllerSubject !== currentSubject ? (
            <button
              type="button"
              onClick={revokeControl}
              className={DANGER_BUTTON_CLASS}
            >
              Revoke control
            </button>
          ) : null}
        </div>
      </div>

      {isOwnerOfActiveTerminal && pendingRequests.length > 0 ? (
        <div className="flex flex-col gap-2 border-b border-[var(--terminal-border)] px-4 py-2">
          {pendingRequests.map((request) => (
            <div
              key={request.requesterSubject}
              className="flex items-center justify-between rounded-md border border-[var(--terminal-button-border)] bg-[var(--terminal-request-bg)] px-3 py-2"
            >
              <span className="text-xs text-[var(--terminal-panel-fg)]">
                {resolveCollaboratorIdentity(
                  request.requesterSubject,
                  collaboratorIdentityBySubject,
                ).name} requests control
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => decideAccess(request.requesterSubject, true)}
                  className={BUTTON_CLASS}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decideAccess(request.requesterSubject, false)}
                  className={DANGER_BUTTON_CLASS}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 px-4 py-3">
        <div ref={xtermContainerRef} className="h-full w-full rounded-md border border-[var(--terminal-border)]" />
      </div>

      {message ? (
        <p className={cn('m-0 border-t border-[var(--terminal-border)] px-4 py-2 text-xs', resolveMessageTone(connectionState))}>
          {message}
        </p>
      ) : null}
    </section>
  )
}
