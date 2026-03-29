import { useMemo, useState } from 'react'
import {
  Sparkles,
  History,
  Send,
  Plus,
  X,
  MessagesSquare,
  CircleDashed,
  Pencil,
  Trash2,
  FileCode2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { requestAiEditCurrentFile } from '../../services/ai-api'
import type { StructuredDiffLine } from '../../services/ai-api'
import type { WorkspaceAiResponseCard } from './ai-response-types'

export type SidebarTab = 'ai' | 'history'

interface ActiveFileContext {
  fileId: string
  path: string
  content: string
  language?: string
}

interface RightSidebarProps {
  isOpen: boolean
  onToggle: () => void
  activeTab: SidebarTab
  setActiveTab: (tab: SidebarTab) => void
  activeFileContext: ActiveFileContext | null
  getAccessToken: () => Promise<string | null>
  onAiResponseReady: (card: WorkspaceAiResponseCard) => void
  onJumpToSuggestionFile: (fileId: string) => void
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user' | 'system'
  text?: string
  aiResponse?: {
    summary: string
    warnings: string[]
    diffLines: StructuredDiffLine[]
  }
  fileId?: string | null
  filePath?: string
  createdAt: string
}

interface ChatThread {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

interface ChatState {
  threads: ChatThread[]
  activeThreadId: string
}

function createChatThread(): ChatThread {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function createThreadTitle(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return 'New chat'
  }

  if (normalized.length <= 40) {
    return normalized
  }

  return `${normalized.slice(0, 40)}...`
}

function createRenamedThreadTitle(nextTitle: string) {
  const normalized = nextTitle.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return 'New chat'
  }

  if (normalized.length <= 40) {
    return normalized
  }

  return `${normalized.slice(0, 40)}...`
}

function toRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime()
  const deltaSeconds = Math.max(0, Math.floor(deltaMs / 1000))

  if (deltaSeconds < 60) {
    return 'just now'
  }

  const minutes = Math.floor(deltaSeconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function toLanguageFromPath(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.tsx')) return 'typescriptreact'
  if (lower.endsWith('.js')) return 'javascript'
  if (lower.endsWith('.jsx')) return 'javascriptreact'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.html')) return 'html'
  return 'plaintext'
}

function hasUserMessages(thread: ChatThread | null) {
  if (!thread) {
    return false
  }

  return thread.messages.some((message) => message.role === 'user')
}

function uniqueModifiedFiles(messages: ChatMessage[]) {
  const seen = new Set<string>()
  const rows: Array<{ fileId: string; filePath: string; responseId: string }> = []

  messages.forEach((message) => {
    if (!message.aiResponse || !message.fileId || !message.filePath) {
      return
    }

    if (seen.has(message.fileId)) {
      return
    }

    seen.add(message.fileId)
    rows.push({
      fileId: message.fileId,
      filePath: message.filePath,
      responseId: message.id,
    })
  })

  return rows
}

export default function RightSidebar({
  isOpen,
  onToggle,
  activeTab,
  setActiveTab,
  activeFileContext,
  getAccessToken,
  onAiResponseReady,
  onJumpToSuggestionFile,
}: RightSidebarProps) {
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [threadRenameId, setThreadRenameId] = useState<string | null>(null)
  const [threadRenameDraft, setThreadRenameDraft] = useState('')
  const [chatState, setChatState] = useState<ChatState>(() => {
    const initialThread = createChatThread()

    return {
      threads: [initialThread],
      activeThreadId: initialThread.id,
    }
  })

  const activeThread = useMemo(() => {
    return chatState.threads.find((thread) => thread.id === chatState.activeThreadId) ?? null
  }, [chatState.activeThreadId, chatState.threads])

  const chatHistoryRows = useMemo(() => {
    return chatState.threads.map((thread) => {
      const messageCount = thread.messages.filter((message) => message.role !== 'system').length

      return {
        id: thread.id,
        title: thread.title,
        messageCount,
        updatedAt: thread.updatedAt,
      }
    })
  }, [chatState.threads])

  const messages = activeThread?.messages ?? []
  const modifiedFiles = useMemo(() => uniqueModifiedFiles(messages), [messages])

  const canSend = useMemo(() => {
    return chatInput.trim().length > 0 && activeFileContext !== null && !isSending && activeThread !== null
  }, [activeFileContext, activeThread, chatInput, isSending])

  function updateThread(threadId: string, transform: (thread: ChatThread) => ChatThread) {
    setChatState((previous) => {
      const threadIndex = previous.threads.findIndex((thread) => thread.id === threadId)
      if (threadIndex < 0) {
        return previous
      }

      const currentThread = previous.threads[threadIndex]
      const nextThread = transform(currentThread)
      const remainingThreads = previous.threads.filter((thread) => thread.id !== threadId)

      return {
        ...previous,
        threads: [nextThread, ...remainingThreads],
      }
    })
  }

  function appendMessageToThread(threadId: string, message: ChatMessage) {
    updateThread(threadId, (thread) => {
      const shouldPromoteTitle = thread.title === 'New chat' && message.role === 'user' && message.text

      return {
        ...thread,
        title: shouldPromoteTitle ? createThreadTitle(message.text ?? '') : thread.title,
        updatedAt: message.createdAt,
        messages: [...thread.messages, message],
      }
    })
  }

  function deleteThread(threadId: string) {
    setChatState((previous) => {
      const nextThreads = previous.threads.filter((thread) => thread.id !== threadId)
      const fallbackThreads = nextThreads.length > 0 ? nextThreads : [createChatThread()]

      const nextActiveId = previous.activeThreadId === threadId
        ? fallbackThreads[0]?.id ?? previous.activeThreadId
        : previous.activeThreadId

      return {
        activeThreadId: nextActiveId,
        threads: fallbackThreads,
      }
    })
  }

  function createNewThread() {
    if (hasUserMessages(activeThread) === false) {
      return
    }

    const nextThread = createChatThread()

    setChatState((previous) => {
      return {
        activeThreadId: nextThread.id,
        threads: [nextThread, ...previous.threads],
      }
    })

    setChatInput('')
  }

  async function onSend() {
    const trimmedPrompt = chatInput.trim()
    if (!trimmedPrompt || !activeFileContext || isSending || !activeThread) {
      return
    }

    const targetThreadId = activeThread.id
    const requestId = crypto.randomUUID()
    const nextLanguage = activeFileContext.language ?? toLanguageFromPath(activeFileContext.path)

    setChatInput('')
    appendMessageToThread(targetThreadId, {
      id: `${requestId}-user`,
      role: 'user',
      text: trimmedPrompt,
      createdAt: new Date().toISOString(),
    })

    setIsSending(true)

    try {
      const accessToken = await getAccessToken()
      const aiResponse = await requestAiEditCurrentFile({
        prompt: trimmedPrompt,
        filePath: activeFileContext.path,
        fileContent: activeFileContext.content,
        language: nextLanguage,
      }, accessToken)

      const responseMessage: ChatMessage = {
        id: `${requestId}-assistant`,
        role: 'assistant',
        aiResponse: {
          summary: aiResponse.summary,
          warnings: aiResponse.warnings,
          diffLines: aiResponse.diff.hunks.flatMap((hunk) => hunk.lines),
        },
        fileId: activeFileContext.fileId,
        filePath: activeFileContext.path,
        createdAt: new Date().toISOString(),
      }

      appendMessageToThread(targetThreadId, responseMessage)

      onAiResponseReady({
        responseId: responseMessage.id,
        threadId: targetThreadId,
        fileId: activeFileContext.fileId,
        filePath: activeFileContext.path,
        summary: aiResponse.summary,
        updatedContent: aiResponse.updatedContent,
        diff: aiResponse.diff,
        warnings: aiResponse.warnings,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown AI request error'

      appendMessageToThread(targetThreadId, {
        id: `${requestId}-system-error`,
        role: 'system',
        text: `AI request failed: ${reason}`,
        createdAt: new Date().toISOString(),
      })
    } finally {
      setIsSending(false)
    }
  }

  function beginRenameThread(threadId: string, currentTitle: string) {
    setThreadRenameId(threadId)
    setThreadRenameDraft(currentTitle)
  }

  function commitRenameThread() {
    if (!threadRenameId) {
      return
    }

    const nextTitle = createRenamedThreadTitle(threadRenameDraft)
    updateThread(threadRenameId, (thread) => {
      return {
        ...thread,
        title: nextTitle,
      }
    })

    setThreadRenameId(null)
    setThreadRenameDraft('')
  }

  function cancelRenameThread() {
    setThreadRenameId(null)
    setThreadRenameDraft('')
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_78%,transparent),color-mix(in_oklab,var(--surface)_68%,transparent))]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 top-0 h-20 bg-[radial-gradient(ellipse_at_top,rgba(var(--lagoon-rgb),0.22),transparent_72%)]"
      />

      <div className="relative flex h-[54px] items-center justify-between whitespace-nowrap border-b border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.34)] px-2.5">
        <div className="flex rounded-lg bg-[rgba(0,0,0,0.1)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold transition-all',
              activeTab === 'ai'
                ? 'bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm'
                : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
            )}
          >
            <Sparkles size={12} />
            <span>AI</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold transition-all',
              activeTab === 'history'
                ? 'bg-[var(--chip-bg)] text-[var(--sea-ink)] shadow-sm'
                : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]',
            )}
          >
            <History size={12} />
            <span>History</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={createNewThread}
            aria-label="Start new assistant thread"
            className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] transition-colors hover:bg-[rgba(0,0,0,0.05)]"
            title="New thread"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Close assistant panel"
            className="rounded-lg p-1.5 text-[var(--sea-ink-soft)] transition-colors hover:bg-[rgba(0,0,0,0.05)]"
            title="Close assistant panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="relative w-full flex-1 overflow-y-auto p-4">
        {activeTab === 'ai' ? (
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="relative overflow-hidden rounded-2xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.22)] px-4 py-8 text-center">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(var(--lagoon-rgb),0.12),transparent_38%),radial-gradient(circle_at_82%_78%,rgba(47,106,74,0.12),transparent_40%)]"
                />
                <div className="relative space-y-2">
                  <div className="mx-auto grid h-8 w-8 place-items-center rounded-full border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.4)] text-[var(--lagoon)]">
                    <CircleDashed size={14} />
                  </div>
                  <p className="m-0 text-xs font-semibold text-[var(--sea-ink)]">
                    Describe the change you want for the open file.
                  </p>
                  <p className="m-0 text-[11px] text-[var(--sea-ink-soft)]">
                    I will propose code changes directly in your editor.
                  </p>
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex flex-col gap-1', message.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'max-w-[95%] rounded-2xl border p-3 text-xs',
                    message.role === 'user' &&
                      'rounded-tr-none border-[var(--lagoon)] bg-[rgba(var(--lagoon-rgb),0.12)] text-[var(--sea-ink)]',
                    message.role === 'assistant' &&
                      'rounded-tl-none border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.56)] text-[var(--sea-ink)]',
                    message.role === 'system' &&
                      'rounded-tl-none border-rose-300 bg-rose-50 text-rose-800',
                  )}
                >
                  {message.text ? <div>{message.text}</div> : null}

                  {message.aiResponse ? (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[var(--sea-ink)]">
                        {message.aiResponse.summary}
                      </div>

                      {message.aiResponse.diffLines.length > 0 ? (
                        <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.26)]">
                          <div className="border-b border-[var(--line)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)]">
                            Proposed diff
                          </div>
                          <code className="m-0 block max-h-56 overflow-auto px-2 py-1.5 text-[10px] leading-5 text-[var(--sea-ink)]">
                            {message.aiResponse.diffLines.map((line, lineIndex) => {
                              const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
                              const tone = line.type === 'add'
                                ? 'text-emerald-700'
                                : line.type === 'remove'
                                  ? 'text-rose-700'
                                  : 'text-[var(--sea-ink-soft)]'

                              return (
                                <div key={`${message.id}-diff-${lineIndex}`} className={cn('font-mono whitespace-pre', tone)}>
                                  {prefix} {line.content}
                                </div>
                              )
                            })}
                          </code>
                        </div>
                      ) : null}

                      {message.aiResponse.warnings.length > 0 ? (
                        <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2">
                          {message.aiResponse.warnings.map((warning, warningIndex) => (
                            <div key={`${message.id}-warning-${warningIndex}`} className="text-[10px] text-amber-800">
                              {warning}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <span className="ml-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)]">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}

            {modifiedFiles.length > 0 ? (
              <div className="space-y-2">
                {modifiedFiles.map((row) => (
                  <button
                    key={row.responseId}
                    type="button"
                    onClick={() => {
                      onJumpToSuggestionFile(row.fileId)
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.36)] px-3 py-2 text-left transition-colors hover:border-[var(--lagoon)] hover:bg-[rgba(var(--lagoon-rgb),0.08)]"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--sea-ink)]">
                      <FileCode2 size={12} className="shrink-0" />
                      <span className="truncate">{row.filePath}</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)]">
                      View changes
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {isSending ? (
              <div className="flex max-w-[92%] items-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.2)] px-3 py-2 text-[10px] font-semibold text-[var(--sea-ink-soft)]">
                Processing AI request...
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {chatHistoryRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] p-4 text-center text-xs text-[var(--sea-ink-soft)]">
                No chats yet. Start a prompt to build your history.
              </div>
            ) : (
              chatHistoryRows.map((thread) => {
                const isActive = thread.id === chatState.activeThreadId
                const isRenameActive = threadRenameId === thread.id

                return (
                  <div
                    key={thread.id}
                    className={cn(
                      'w-full rounded-lg border px-2 py-1.5 transition-colors',
                      isActive
                        ? 'border-[var(--lagoon)] bg-[rgba(var(--lagoon-rgb),0.08)]'
                        : 'border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.24)] hover:bg-[rgba(var(--chip-bg-rgb),0.4)]',
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {isRenameActive ? (
                        <input
                          value={threadRenameDraft}
                          onChange={(event) => {
                            setThreadRenameDraft(event.target.value)
                          }}
                          autoFocus
                          onBlur={commitRenameThread}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              commitRenameThread()
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault()
                              cancelRenameThread()
                            }
                          }}
                          className="min-w-0 flex-1 rounded border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.32)] px-2 py-1 text-xs font-semibold text-[var(--sea-ink)] outline-none focus:border-[var(--lagoon)]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setChatState((previous) => {
                              return {
                                ...previous,
                                activeThreadId: thread.id,
                              }
                            })
                            setActiveTab('ai')
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="m-0 flex min-w-0 items-center gap-1 text-xs font-bold text-[var(--sea-ink)]">
                            <MessagesSquare size={12} className="shrink-0" />
                            <span className="truncate">{thread.title}</span>
                          </p>
                        </button>
                      )}

                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)]">
                        {toRelativeTime(thread.updatedAt)}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          beginRenameThread(thread.id, thread.title)
                        }}
                        className="rounded p-1 text-[var(--sea-ink-soft)] transition-colors hover:text-[var(--sea-ink)]"
                        title="Rename chat"
                      >
                        <Pencil size={11} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          deleteThread(thread.id)
                        }}
                        className="rounded p-1 text-[var(--sea-ink-soft)] transition-colors hover:text-rose-700"
                        title="Delete chat"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    <p className="m-0 mt-0.5 pl-5 text-[10px] font-semibold text-[var(--sea-ink-soft)]">
                      {thread.messageCount} messages
                    </p>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {activeTab === 'ai' && (
        <div className="w-full border-t border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.32)] p-4">
          <div className="relative">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={activeFileContext ? 'Ask anything...' : 'Open a file to enable AI edits...'}
              className="min-h-[80px] w-full resize-none rounded-xl border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.48)] px-3 py-2 pr-10 text-xs outline-none transition-colors focus:border-[var(--lagoon)]"
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return
                }

                if (event.nativeEvent.isComposing || event.shiftKey || event.altKey) {
                  return
                }

                if ((event.metaKey || event.ctrlKey) || (!event.metaKey && !event.ctrlKey)) {
                  event.preventDefault()
                  void onSend()
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                void onSend()
              }}
              disabled={!canSend}
              className="absolute bottom-2 right-2 rounded-lg bg-[var(--lagoon)] p-1.5 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
