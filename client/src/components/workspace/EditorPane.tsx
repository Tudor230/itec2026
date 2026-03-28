import MonacoEditor from '@monaco-editor/react'
import { useMemo, useState } from 'react'
import type { FileDto } from '../../services/projects-api'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Pencil, GripVertical, Sparkles, Command, FileCode2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useToast } from '../ToastProvider'

interface EditorPaneProps {
  file: FileDto | null
  initialValue: string
  isDirty: boolean
  canSave?: boolean
  isSaving: boolean
  saveError: string | null
  collabState?: {
    connectionState: 'idle' | 'connecting' | 'synced' | 'disconnected' | 'error'
    message: string | null
  }
  onEditorMount?: (editor: MonacoEditorTypes.IStandaloneCodeEditor) => void
  onChange: (nextValue: string) => void
  onSave: () => void
}

export default function EditorPane({
  file,
  initialValue,
  isDirty,
  canSave,
  isSaving,
  saveError,
  collabState,
  onEditorMount,
  onChange,
  onSave,
}: EditorPaneProps) {
  const [showAiBlock, setShowAiBlock] = useState(false)
  const { success } = useToast()
  
  const language = useMemo(() => {
    if (!file) return 'plaintext'
    const extension = file.path.split('.').pop()?.toLowerCase() ?? ''
    const mapping: Record<string, string> = {
      ts: 'typescript', tsx: 'typescriptreact',
      js: 'javascript', jsx: 'javascriptreact',
      json: 'json', css: 'css', html: 'html',
      md: 'markdown', py: 'python', rs: 'rust',
      go: 'go', java: 'java'
    }
    return mapping[extension] ?? 'plaintext'
  }, [file])

  const title = file ? file.path : 'No file selected'
  const extension = file?.path.split('.').pop()?.toUpperCase() ?? 'TXT'

  const handleAcceptAi = () => {
    setShowAiBlock(false)
    success('AI suggestion applied')
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col relative">
      <div className="relative border-b border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_84%,transparent),color-mix(in_oklab,var(--surface)_68%,transparent))] px-4 py-2 backdrop-blur-md">
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-[linear-gradient(90deg,transparent,rgba(var(--lagoon-rgb),0.44),transparent)]"
        />

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex flex-col">
            <p className="m-0 truncate text-xs font-extrabold tracking-[0.02em] text-[var(--sea-ink)]">{title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="workspace-hud-chip">
                <FileCode2 size={11} /> {extension}
              </span>
            </div>

          {file && (
            <p className="m-0 text-[10px] text-[var(--sea-ink-soft)] font-medium">
              {isDirty ? 'Unsaved changes' : 'Saved'}
              {collabState && collabState.connectionState !== 'idle' ? ` • Live: ${collabState.connectionState}` : ''}
            </p>
          )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiBlock(!showAiBlock)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold transition-all',
                showAiBlock
                  ? 'border-[var(--lagoon)] bg-[var(--lagoon)] text-white shadow-[0_8px_18px_rgba(var(--lagoon-rgb),0.38)]'
                  : 'border-[rgba(var(--lagoon-rgb),0.3)] bg-[rgba(var(--lagoon-rgb),0.12)] text-[var(--lagoon-deep)] hover:bg-[rgba(var(--lagoon-rgb),0.22)]'
              )}
            >
              <Sparkles size={12} />
              <span>AI Suggest</span>
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!file || !(canSave ?? isDirty) || isSaving}
              className="rounded-full border border-[color-mix(in_oklab,var(--lagoon-deep)_34%,var(--line))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--sea-ink)_84%,black_16%),var(--sea-ink))] px-4 py-1 text-[10px] font-bold text-white shadow-[0_8px_16px_rgba(9,23,30,0.22)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {saveError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-1 text-[10px] font-semibold text-red-700">
          Save failed: {saveError}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        {file ? (
          <div className="flex h-full flex-col">
            <div className="relative flex-1 bg-[rgba(var(--bg-rgb),0.1)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface)_64%,transparent),transparent)]"
              />
              <MonacoEditor
                height="100%"
                language={language}
                key={file.id}
                defaultValue={initialValue}
                onChange={(nextValue) => onChange(nextValue ?? '')}
                onMount={(editor) => {
                  onEditorMount?.(editor)
                }}
                options={{
                  automaticLayout: true,
                  minimap: { enabled: true },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                  fontLigatures: true,
                  scrollBeyondLastLine: false,
                  renderLineHighlight: 'all',
                  scrollbar: {
                    vertical: 'visible',
                    horizontal: 'visible',
                    useShadows: false,
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                  },
                  padding: { top: 16 },
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                }}
              />

              <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-2 rounded-md border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.74)] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--sea-ink-soft)] md:inline-flex">
                <Command size={10} />
                <span>Ctrl+S save</span>
              </div>
            </div>

            {/* AI Suggestion Block (Mockup) */}
            <AnimatePresence>
              {showAiBlock && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-xl"
                >
                  <div className="flex flex-col overflow-hidden rounded-xl border border-[rgba(var(--lagoon-rgb),0.46)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_84%,transparent),color-mix(in_oklab,var(--surface)_70%,transparent))] shadow-[0_26px_50px_rgba(8,24,29,0.28)] backdrop-blur-2xl">
                    <div className="flex items-center justify-between border-b border-[rgba(var(--lagoon-rgb),0.2)] bg-[rgba(var(--lagoon-rgb),0.08)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-[var(--lagoon)] rounded text-white">
                          <Sparkles size={10} />
                        </div>
                        <span className="text-[10px] font-bold text-[var(--sea-ink)]">AI REFACTORING SUGGESTION</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="p-1 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]" title="Modify">
                          <Pencil size={12} />
                        </button>
                        <button className="p-1 text-[var(--sea-ink-soft)] cursor-grab" title="Move">
                          <GripVertical size={12} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="border-l-4 border-[var(--lagoon)] bg-[rgba(var(--lagoon-rgb),0.04)] p-4">
                      <pre className="text-[11px] font-mono text-[var(--sea-ink)] leading-relaxed">
{`// Refactored to use async/await for better readability
async function fetchData() {
  try {
    const response = await fetch(API_URL);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch:', error);
  }
}`}
                      </pre>
                    </div>

                    <div className="flex items-center border-t border-[var(--line)]">
                      <button 
                        onClick={handleAcceptAi}
                        className="flex flex-1 items-center justify-center gap-2 border-r border-[var(--line)] py-2 text-[11px] font-bold text-green-600 transition-colors hover:bg-green-50"
                      >
                        <Check size={14} />
                        ACCEPT
                      </button>
                      <button 
                        onClick={() => setShowAiBlock(false)}
                        className="flex flex-1 items-center justify-center gap-2 py-2 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <X size={14} />
                        DECLINE
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid h-full place-items-center bg-[rgba(var(--bg-rgb),0.2)] p-6 text-center">
            <div className="max-w-sm space-y-4 rounded-2xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.52)] p-5 shadow-[0_18px_30px_rgba(9,24,30,0.14)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[rgba(var(--lagoon-rgb),0.1)] text-[var(--lagoon)]">
                <Sparkles size={32} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-[var(--sea-ink)]">Welcome to your Workspace</h2>
                <p className="mt-2 text-sm text-[var(--sea-ink-soft)] font-medium">
                  Select a file from the explorer to start your collaborative journey. 
                  Press <kbd className="px-1.5 py-0.5 bg-[var(--line)] rounded text-xs font-mono font-bold italic">Ctrl+P</kbd> for quick search.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
