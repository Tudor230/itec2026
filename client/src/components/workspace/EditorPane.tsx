import MonacoEditor from '@monaco-editor/react'
import { useMemo, useState } from 'react'
import type { FileDto } from '../../services/projects-api'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Pencil, GripVertical, Sparkles } from 'lucide-react'
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

  const handleAcceptAi = () => {
    setShowAiBlock(false)
    success('AI suggestion applied')
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col relative">
      {/* Editor Header */}
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(var(--bg-rgb),0.4)] backdrop-blur-md px-4 py-2">
        <div className="min-w-0 flex flex-col">
          <p className="m-0 truncate text-xs font-bold text-[var(--sea-ink)]">{title}</p>
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
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all border",
              showAiBlock 
                ? "bg-[var(--lagoon)] text-white border-[var(--lagoon)]" 
                : "bg-[rgba(var(--lagoon-rgb),0.1)] text-[var(--lagoon-deep)] border-[rgba(var(--lagoon-rgb),0.2)] hover:bg-[rgba(var(--lagoon-rgb),0.2)]"
            )}
          >
            <Sparkles size={12} />
            <span>AI Suggest</span>
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!file || !(canSave ?? isDirty) || isSaving}
            className="rounded-full bg-[var(--sea-ink)] px-4 py-1 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 transition-opacity"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {saveError ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-1 text-[10px] font-semibold text-red-700">
          Save failed: {saveError}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 relative">
        {file ? (
          <div className="h-full flex flex-col">
            <div className="flex-1 bg-[rgba(var(--bg-rgb),0.1)]">
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
                  <div className="bg-[rgba(var(--bg-rgb),0.9)] backdrop-blur-2xl border border-[var(--lagoon)] rounded-xl shadow-2xl overflow-hidden flex flex-col">
                    <div className="bg-[rgba(var(--lagoon-rgb),0.05)] border-b border-[rgba(var(--lagoon-rgb),0.1)] px-3 py-2 flex items-center justify-between">
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
                    
                    <div className="p-4 bg-[rgba(var(--lagoon-rgb),0.02)] border-l-4 border-[var(--lagoon)]">
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
                        className="flex-1 py-2 flex items-center justify-center gap-2 text-[11px] font-bold text-green-600 hover:bg-green-50 transition-colors border-r border-[var(--line)]"
                      >
                        <Check size={14} />
                        ACCEPT
                      </button>
                      <button 
                        onClick={() => setShowAiBlock(false)}
                        className="flex-1 py-2 flex items-center justify-center gap-2 text-[11px] font-bold text-red-600 hover:bg-red-50 transition-colors"
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
            <div className="space-y-4 max-w-sm">
              <div className="w-16 h-16 bg-[rgba(var(--lagoon-rgb),0.1)] rounded-3xl flex items-center justify-center mx-auto text-[var(--lagoon)]">
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
