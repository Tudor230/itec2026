import MonacoEditor, { DiffEditor } from '@monaco-editor/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileDto } from '../../services/projects-api'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import { Sparkles } from 'lucide-react'
import { useThemePreset } from '../../theme/ThemeProvider'
import { defineMonacoThemes, getMonacoThemeForPreset } from '../../lib/workspace-monaco-theme'
import { workspaceHudChipClass } from './ui-classes'
import type { WorkspaceAiResponseCard } from './ai-response-types'

interface EditorPaneProps {
  file: FileDto | null
  initialValue: string
  instanceNonce?: number
  isDirty: boolean
  saveError: string | null
  collabState?: {
    connectionState: 'idle' | 'connecting' | 'synced' | 'disconnected' | 'error'
    message: string | null
  }
  aiResponse?: WorkspaceAiResponseCard | null
  aiActionPending?: boolean
  onAiDiffChange?: (nextValue: string) => void
  onAiDiffAccept?: () => void
  onAiDiffReject?: () => void
  onEditorMount?: (editor: MonacoEditorTypes.IStandaloneCodeEditor) => void
  onChange: (nextValue: string) => void
}

export default function EditorPane({
  file,
  initialValue,
  instanceNonce = 0,
  isDirty,
  saveError,
  collabState,
  aiResponse = null,
  aiActionPending = false,
  onAiDiffChange,
  onAiDiffAccept,
  onAiDiffReject,
  onEditorMount,
  onChange,
}: EditorPaneProps) {
  const { preset } = useThemePreset()
  const monacoTheme = getMonacoThemeForPreset(preset)
  const [editorInstance, setEditorInstance] = useState<MonacoEditorTypes.IStandaloneCodeEditor | null>(null)
  const suppressNextChangeRef = useRef(false)
  
  const language = useMemo(() => {
    if (!file) return 'plaintext'
    const lowerPath = file.path.toLowerCase()
    const fileName = lowerPath.split('/').pop() ?? ''
    if (fileName === 'dockerfile') return 'dockerfile'

    const extension = fileName.split('.').pop() ?? ''
    const mapping: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      mjs: 'javascript',
      cjs: 'javascript',
      json: 'json',
      jsonc: 'json',
      css: 'css',
      scss: 'scss',
      less: 'less',
      html: 'html',
      htm: 'html',
      xml: 'xml',
      svg: 'xml',
      md: 'markdown',
      mdx: 'mdx',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      h: 'c',
      cc: 'cpp',
      cpp: 'cpp',
      cxx: 'cpp',
      hpp: 'cpp',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      swift: 'swift',
      kt: 'kotlin',
      kts: 'kotlin',
      sql: 'sql',
      psql: 'pgsql',
      yml: 'yaml',
      yaml: 'yaml',
      sh: 'shell',
      bash: 'shell',
      zsh: 'shell',
      ps1: 'powershell',
      bat: 'bat',
      cmd: 'bat',
      ini: 'ini',
      conf: 'ini',
      toml: 'ini',
      lua: 'lua',
      r: 'r',
      dart: 'dart',
      scala: 'scala',
      clj: 'clojure',
      gql: 'graphql',
      graphql: 'graphql',
      proto: 'protobuf',
    }
    return mapping[extension] ?? 'plaintext'
  }, [file])

  useEffect(() => {
    if (aiResponse) {
      setEditorInstance(null)
    }
  }, [aiResponse])

  useEffect(() => {
    if (!editorInstance || !file || instanceNonce === 0) {
      return
    }

    const model = editorInstance.getModel()
    if (!model || model.getValue() === initialValue) {
      return
    }

    suppressNextChangeRef.current = true
    editorInstance.pushUndoStop()
    editorInstance.executeEdits('workspace-programmatic-sync', [
      {
        range: model.getFullModelRange(),
        text: initialValue,
        forceMoveMarkers: true,
      },
    ])
    editorInstance.pushUndoStop()
    window.setTimeout(() => {
      suppressNextChangeRef.current = false
    }, 0)
  }, [editorInstance, file, initialValue, instanceNonce])

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col relative">
      <style>{`
        .ai-diff-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ai-diff-button {
          border: 1px solid color-mix(in oklab, var(--line) 85%, transparent);
          background: color-mix(in oklab, var(--chip-bg) 85%, transparent);
          color: var(--sea-ink-soft);
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }
        .ai-diff-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ai-diff-button-accept {
          border-color: color-mix(in oklab, rgba(39, 174, 96, 0.62) 70%, transparent);
          color: color-mix(in oklab, rgba(39, 174, 96, 0.95) 70%, var(--sea-ink-soft));
        }
        .ai-diff-button-reject {
          border-color: color-mix(in oklab, rgba(231, 76, 60, 0.62) 70%, transparent);
          color: color-mix(in oklab, rgba(231, 76, 60, 0.95) 70%, var(--sea-ink-soft));
        }
        .ai-diff-note {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          color: var(--sea-ink-soft);
        }
      `}</style>

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
            {aiResponse ? (
              <span className={workspaceHudChipClass}>AI diff preview</span>
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
            {aiResponse ? (
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[rgba(var(--chip-bg-rgb),0.4)] px-4 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--sea-ink)]">{aiResponse.summary}</div>
                  <p className="ai-diff-note">
                    Review the inline diff, then accept or discard the full AI edit.
                  </p>
                </div>
                <div className="ai-diff-actions">
                  <button
                    type="button"
                    className="ai-diff-button ai-diff-button-accept"
                    onClick={onAiDiffAccept}
                    disabled={aiActionPending}
                  >
                    {aiActionPending ? 'Applying...' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="ai-diff-button ai-diff-button-reject"
                    onClick={onAiDiffReject}
                    disabled={aiActionPending}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
            <div className="relative flex-1 bg-[rgba(var(--bg-rgb),0.1)]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface)_64%,transparent),transparent)]"
              />
              {aiResponse ? (
                <DiffEditor
                  height="100%"
                  language={language}
                  key={`${file.id}-${aiResponse.responseId}`}
                  original={aiResponse.originalContent ?? initialValue}
                  modified={aiResponse.updatedContent}
                  theme={monacoTheme}
                  beforeMount={(monaco) => {
                    defineMonacoThemes(monaco)
                  }}
                  onMount={(editor) => {
                    const modifiedEditor = editor.getModifiedEditor()
                    modifiedEditor.focus()
                    modifiedEditor.onDidChangeModelContent(() => {
                      onAiDiffChange?.(modifiedEditor.getValue())
                    })
                  }}
                  options={{
                    automaticLayout: true,
                    renderSideBySide: false,
                    readOnly: false,
                    originalEditable: false,
                    minimap: { enabled: false },
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    fontSize: 14,
                    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                    fontLigatures: true,
                    scrollBeyondLastLine: false,
                    renderLineHighlight: 'all',
                    diffCodeLens: true,
                    renderOverviewRuler: true,
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
              ) : (
                <MonacoEditor
                  height="100%"
                  language={language}
                  key={file.id}
                  defaultValue={initialValue}
                  onChange={(nextValue) => {
                    if (suppressNextChangeRef.current) {
                      return
                    }

                    onChange(nextValue ?? '')
                  }}
                  onMount={(editor) => {
                    setEditorInstance(editor)
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
              )}
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
