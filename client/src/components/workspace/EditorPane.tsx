import MonacoEditor from '@monaco-editor/react'
import { useMemo } from 'react'
import type { FileDto } from '../../services/projects-api'
import type { editor as MonacoEditorTypes } from 'monaco-editor'

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
  const language = useMemo(() => {
    if (!file) {
      return 'plaintext'
    }

    const extension = file.path.split('.').pop()?.toLowerCase() ?? ''

    if (extension === 'ts' || extension === 'tsx') {
      if (extension === 'tsx') {
        return 'typescriptreact'
      }

      return 'typescript'
    }

    if (extension === 'js' || extension === 'jsx') {
      if (extension === 'jsx') {
        return 'javascriptreact'
      }

      return 'javascript'
    }

    if (extension === 'json') {
      return 'json'
    }

    if (extension === 'css') {
      return 'css'
    }

    if (extension === 'html') {
      return 'html'
    }

    if (extension === 'md') {
      return 'markdown'
    }

    if (extension === 'py') {
      return 'python'
    }

    if (extension === 'rs') {
      return 'rust'
    }

    if (extension === 'go') {
      return 'go'
    }

    if (extension === 'java') {
      return 'java'
    }

    return 'plaintext'
  }, [file])

  const title = useMemo(() => {
    if (!file) {
      return 'No file selected'
    }

    return file.path
  }, [file])

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[rgba(255,255,255,0.52)] px-4 py-2">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-[var(--sea-ink)]">{title}</p>
          {file ? (
            <p className="m-0 text-xs text-[var(--sea-ink-soft)]">
              {isDirty ? 'Unsaved changes' : 'Saved'}
              {collabState && collabState.connectionState !== 'idle' ? ` | Live: ${collabState.connectionState}` : ''}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={!file || !(canSave ?? isDirty) || isSaving}
          className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-4 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {file ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 bg-[rgba(255,255,255,0.4)]">
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
                fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, "Courier New", monospace',
                fontLigatures: true,
                scrollBeyondLastLine: false,
              }}
            />
          </div>

          {saveError ? (
            <div className="border-t border-[var(--line)] bg-[rgba(255,255,255,0.52)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
              {saveError}
            </div>
          ) : null}

          {collabState?.message ? (
            <div className="border-t border-[var(--line)] bg-[rgba(255,255,255,0.52)] px-4 py-2 text-xs text-[var(--sea-ink-soft)]">
              {collabState.message}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center bg-[rgba(255,255,255,0.35)] p-6 text-center">
          <div>
            <p className="m-0 text-base font-semibold text-[var(--sea-ink)]">Welcome to Workspace</p>
            <p className="mt-2 mb-0 text-sm text-[var(--sea-ink-soft)]">
              Pick a file from the sidebar to start editing.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
