import { useMemo, useState } from 'react'
import {
  Sparkles,
  History,
  Send,
  Plus,
  Zap,
  Code2,
  Bug,
  TestTube,
  X,
  MessageSquareText,
  Clock3,
  Bot,
  ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  requestAiEditCurrentFile,
  type AiEditResponse,
  type StructuredDiffLine,
} from '../../services/ai-api'
import { workspaceHudChipClass } from './ui-classes'

export type SidebarTab = 'ai' | 'history'

interface ActiveFileContext {
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
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user' | 'system'
  text?: string
  aiResponse?: AiEditResponse
  createdAt: string
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

function DiffLine({ line }: { line: StructuredDiffLine }) {
  if (line.type === 'add') {
    return <div className="font-mono text-[10px] text-emerald-700">+ {line.content}</div>
  }

  if (line.type === 'remove') {
    return <div className="font-mono text-[10px] text-rose-700">- {line.content}</div>
  }

  return <div className="font-mono text-[10px] text-[var(--sea-ink-soft)]">  {line.content}</div>
}

export default function RightSidebar({
  isOpen,
  onToggle,
  activeTab,
  setActiveTab,
  activeFileContext,
  getAccessToken,
}: RightSidebarProps) {
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      text: "Hello! I'm your iTECify assistant. Ask for a file-aware edit and I'll return structured hunks.",
      createdAt: new Date().toISOString(),
    },
  ])

  const quickActions = [
    { label: 'Refactor', icon: Zap, prompt: 'Refactor this file for readability while preserving behavior.' },
    { label: 'Explain', icon: Code2, prompt: 'Explain this file and suggest safe improvements.' },
    { label: 'Fix Bug', icon: Bug, prompt: 'Find and fix likely bugs in this file.' },
    { label: 'Tests', icon: TestTube, prompt: 'Suggest tests for this file and any missing edge cases.' },
  ]

  const historyRows = [
    { time: '2m ago', user: 'You', action: 'Refactored auth logic', type: 'commit' as const },
    { time: '1h ago', user: 'Sarah', action: 'Fixed CSS grid issue', type: 'merge' as const },
    { time: '3h ago', user: 'You', action: 'Initial project setup', type: 'commit' as const },
  ]

  const canSend = useMemo(() => {
    return chatInput.trim().length > 0 && activeFileContext !== null && !isSending
  }, [activeFileContext, chatInput, isSending])

  async function onSend() {
    const trimmedPrompt = chatInput.trim()
    if (!trimmedPrompt || !activeFileContext || isSending) {
      return
    }

    const requestId = crypto.randomUUID()
    const nextLanguage = activeFileContext.language ?? toLanguageFromPath(activeFileContext.path)

    console.log('[ai][sidebar] interaction:start', {
      requestId,
      filePath: activeFileContext.path,
      promptLength: trimmedPrompt.length,
      fileContentLength: activeFileContext.content.length,
      language: nextLanguage,
    })

    setChatInput('')
    setMessages((previous) => {
      return [
        ...previous,
        {
          id: `${requestId}-user`,
          role: 'user',
          text: trimmedPrompt,
          createdAt: new Date().toISOString(),
        },
      ]
    })

    setIsSending(true)

    try {
      const accessToken = await getAccessToken()
      console.log('[ai][sidebar] interaction:request', {
        requestId,
        hasAccessToken: Boolean(accessToken),
      })

      const aiResponse = await requestAiEditCurrentFile({
        prompt: trimmedPrompt,
        filePath: activeFileContext.path,
        fileContent: activeFileContext.content,
        language: nextLanguage,
      }, accessToken)

      console.log('[ai][sidebar] interaction:success', {
        requestId,
        hunkCount: aiResponse.diff.hunks.length,
        warningCount: aiResponse.warnings.length,
      })

      setMessages((previous) => {
        return [
          ...previous,
          {
            id: `${requestId}-assistant`,
            role: 'assistant',
            aiResponse,
            createdAt: new Date().toISOString(),
          },
        ]
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown AI request error'
      console.error('[ai][sidebar] interaction:error', {
        requestId,
        reason,
      })

      setMessages((previous) => {
        return [
          ...previous,
          {
            id: `${requestId}-system-error`,
            role: 'system',
            text: `AI request failed: ${reason}`,
            createdAt: new Date().toISOString(),
          },
        ]
      })
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) return null

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
            onClick={() => {
              setMessages((previous) => previous.slice(0, 1))
              console.log('[ai][sidebar] interaction:new-thread')
            }}
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
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.5)] p-4 shadow-[0_16px_30px_rgba(9,24,30,0.16)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-[rgba(var(--lagoon-rgb),0.12)] text-[var(--lagoon)]">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className="m-0 text-sm font-extrabold text-[var(--sea-ink)]">Pair AI</h3>
                    <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)]">
                      contextual assistant
                    </p>
                  </div>
                </div>

                    <span className={workspaceHudChipClass}>
                      <Clock3 size={11} /> online
                    </span>
                  </div>

              <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
                {activeFileContext
                  ? `Working against ${activeFileContext.path}`
                  : 'Open a file to send file-aware prompts.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <button
                  type="button"
                  key={action.label}
                  onClick={() => {
                    setChatInput(action.prompt)
                    console.log('[ai][sidebar] interaction:quick-action', {
                      label: action.label,
                    })
                  }}
                  className="group flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.36)] p-2 transition-all hover:border-[var(--lagoon)] hover:bg-[rgba(var(--lagoon-rgb),0.08)]"
                >
                  <action.icon size={12} className="text-[var(--sea-ink-soft)] group-hover:text-[var(--lagoon)]" />
                  <span className="text-[10px] font-bold text-[var(--sea-ink-soft)] group-hover:text-[var(--sea-ink)]">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-4">
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
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-[var(--sea-ink)]">{message.aiResponse.summary}</div>

                        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.35)] p-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)]">
                            {message.aiResponse.diff.oldPath} {'->'} {message.aiResponse.diff.newPath}
                          </div>
                          {message.aiResponse.diff.hunks.map((hunk, index) => (
                            <div key={`${message.id}-hunk-${index}`} className="rounded-md border border-[var(--line)] bg-white/30 p-2">
                              <div className="mb-1 font-mono text-[10px] text-[var(--sea-ink-soft)]">
                                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                              </div>
                              <div className="space-y-[2px]">
                                {hunk.lines.map((line, lineIndex) => (
                                  <DiffLine key={`${message.id}-hunk-${index}-line-${lineIndex}`} line={line} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <details className="rounded-lg border border-[var(--line)] bg-[rgba(var(--bg-rgb),0.25)] p-2">
                          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)]">
                            Updated content preview
                          </summary>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-[rgba(var(--bg-rgb),0.42)] p-2 font-mono text-[10px] text-[var(--sea-ink)]">
                            {message.aiResponse.updatedContent}
                          </pre>
                        </details>

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

              {isSending ? (
                <div className="flex max-w-[92%] items-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.2)] px-3 py-2 text-[10px] font-semibold text-[var(--sea-ink-soft)]">
                  <MessageSquareText size={12} />
                  Processing AI request...
                </div>
              ) : (
                <div className="flex max-w-[92%] items-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.2)] px-3 py-2 text-[10px] font-semibold text-[var(--sea-ink-soft)]">
                  <MessageSquareText size={12} />
                  Ask for file-aware edits, tests, or architecture checks.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.5)] p-3">
              <p className="m-0 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--kicker)]">
                Session Chronicle
              </p>
              <p className="m-0 mt-1 text-xs text-[var(--sea-ink-soft)]">Recent activity in this workspace.</p>
            </div>

            <div className="relative space-y-8 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-[2px] before:bg-[var(--line)]">
              {historyRows.map((item, i) => (
                <div key={i} className="relative group">
                  <div
                    className={cn(
                      'absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-[var(--surface-strong)] transition-transform group-hover:scale-125',
                      item.type === 'commit'
                        ? 'bg-[var(--lagoon)]'
                        : 'bg-[color-mix(in_oklab,var(--palm)_62%,var(--lagoon)_38%)]',
                    )}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[var(--sea-ink)]">{item.user}</span>
                      <span className="text-[9px] text-[var(--sea-ink-soft)]">{item.time}</span>
                    </div>
                    <p className="cursor-pointer text-xs text-[var(--sea-ink-soft)] transition-colors group-hover:text-[var(--sea-ink)]">
                      {item.action} <ChevronRight size={12} className="mb-[1px] inline" />
                    </p>
                  </div>
                </div>
              ))}
            </div>
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

                if (event.nativeEvent.isComposing) {
                  return
                }

                if (event.shiftKey) {
                  return
                }

                if (event.altKey) {
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
