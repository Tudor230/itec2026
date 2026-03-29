import MonacoEditor from '@monaco-editor/react'
import { useMemo } from 'react'
import type { FileDto } from '../../services/projects-api'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import { Sparkles, FileCode2 } from 'lucide-react'
import { useThemePreset } from '../../theme/ThemeProvider'
import { defineMonacoThemes, getMonacoThemeForPreset } from '../../lib/workspace-monaco-theme'
import { workspaceHudChipClass } from './ui-classes'

interface EditorPaneProps {
  file: FileDto | null
  initialValue: string
  isDirty: boolean
  saveError: string | null
  collabState?: {
    connectionState: 'idle' | 'connecting' | 'synced' | 'disconnected' | 'error'
    message: string | null
  }
  onEditorMount?: (editor: MonacoEditorTypes.IStandaloneCodeEditor) => void
  onChange: (nextValue: string) => void
}

export default function EditorPane({
  file,
  initialValue,
  isDirty,
  saveError,
  collabState,
  onEditorMount,
  onChange,
}: EditorPaneProps) {
  const { preset } = useThemePreset()
  const monacoTheme = getMonacoThemeForPreset(preset)
  
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

  const extension = file?.path.split('.').pop()?.toUpperCase() ?? 'TXT'

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col relative">
      <div className="relative border-b border-[var(--line)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-strong)_84%,transparent),color-mix(in_oklab,var(--surface)_68%,transparent))] px-4 py-2 backdrop-blur-md">
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-0 h-[1px] bg-[linear-gradient(90deg,transparent,rgba(var(--lagoon-rgb),0.44),transparent)]"
        />

        <div className="flex items-center justify-between gap-3">
        {file ? (
            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
            <span className={workspaceHudChipClass}>
              {isDirty ? 'Unsaved changes' : 'Saved'}
            </span>
            {collabState && collabState.connectionState !== 'idle' ? (
              <span className={workspaceHudChipClass}>Live: {collabState.connectionState}</span>
            ) : null}
          </div>
        ) : (
          <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-[var(--kicker)]">No file opened</p>
        )}
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
                beforeMount={(monaco) => {
                  defineMonacoThemes(monaco)
                }}
                theme={monacoTheme}
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
          </div>
        ) : (
          <div className="grid h-full place-items-center bg-[rgba(var(--bg-rgb),0.2)] p-6 text-center">
            <div className="max-w-sm space-y-4 rounded-2xl border border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.52)] p-5 shadow-[0_18px_30px_rgba(9,24,30,0.14)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[rgba(var(--lagoon-rgb),0.1)] text-[var(--lagoon)]">
                <Sparkles size={32} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-[var(--sea-ink)]">No open files</h2>
                <p className="mt-2 text-sm text-[var(--sea-ink-soft)] font-medium">
                  Open a file from the explorer or Quick Open to start editing.
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
