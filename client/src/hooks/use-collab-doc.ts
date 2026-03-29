import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import type { Doc as YDoc } from 'yjs'
import type { StructuredDiffHunk } from '../services/ai-api'
import { applySingleHunk } from '../lib/apply-structured-diff'
import {
  CollabClient,
  type CollabDocCursorPayload,
  type CollabProjectActivityPayload,
} from '../lib/collab-client'
import type {CollabDocRewindResult, CollabDocRewindEdge, CollabDocSnapshotPreview, CollabDocTimelineEntry, CollabDocDirtyStatePayload, CollabFileCreatedPayload, CollabFileDeletedPayload, CollabFileUpdatedPayload, WatchProjectCallbacks} from '../lib/collab-client';
import { auth0Config } from '../lib/auth0-config'
import { getCollaboratorClassSuffix, getCollaboratorColor } from '../components/workspace/collab-colors'

interface CollabDocState {
  connectionState: 'idle' | 'connecting' | 'synced' | 'disconnected' | 'error'
  message: string | null
}

interface CollabDocParams {
  projectId: string | null
  fileId: string | null
  onFileCreated?: (payload: CollabFileCreatedPayload) => void
  onFileUpdated?: (payload: CollabFileUpdatedPayload) => void
  onFileDeleted?: (payload: CollabFileDeletedPayload) => void
  onDirtyStateChanged?: (payload: CollabDocDirtyStatePayload) => void
  onProjectActivityChanged?: (payload: CollabProjectActivityPayload) => void
  resolveCollaboratorName?: (subject: string) => string
}

interface CollabDocModelBinding {
  editor: MonacoEditorTypes.IStandaloneCodeEditor | null
  model: MonacoEditorTypes.ITextModel | null
  monaco: typeof import('monaco-editor') | null
}

interface CollabDocTimelineState {
  entries: CollabDocTimelineEntry[]
  rewindEdges: CollabDocRewindEdge[]
  headSequence: number
  isLoading: boolean
  error: string | null
}

interface CollabDocPreviewState {
  isActive: boolean
  sequence: number | null
  headSequence: number | null
  isLoading: boolean
  error: string | null
}

interface CollabDocTimelineState {
  entries: CollabDocTimelineEntry[]
  rewindEdges: CollabDocRewindEdge[]
  headSequence: number
  isLoading: boolean
  error: string | null
}

interface CollabDocPreviewState {
  isActive: boolean
  sequence: number | null
  headSequence: number | null
  isLoading: boolean
  error: string | null
}

interface MonacoBindingInstance {
  destroy: () => void
}

interface CollabDocSessionState {
  projectId: string
  fileId: string
  doc: import('yjs').Doc
}

interface RemoteCursorWidget {
  update: (lineNumber: number, column: number) => void
  setLabel: (label: string) => void
  dispose: () => void
}

export function useCollabDoc({
  projectId,
  fileId,
  onFileCreated,
  onFileUpdated,
  onFileDeleted,
  onDirtyStateChanged,
  onProjectActivityChanged,
  resolveCollaboratorName,
}: CollabDocParams) {
  const { getAccessTokenSilently } = useAuth0()
  const [bindingTargets, setBindingTargets] = useState<CollabDocModelBinding>({
    editor: null,
    model: null,
    monaco: null,
  })

  const bindingRef = useRef<MonacoBindingInstance | null>(null)
  const collabDocRef = useRef<YDoc | null>(null)
  const sessionDestroyRef = useRef<(() => void) | null>(null)
  const projectWatchDestroyRef = useRef<(() => void) | null>(null)
  const timelineRequestIdRef = useRef(0)
  const previewRequestIdRef = useRef(0)
  const activeDocKeyRef = useRef('')
  const sessionStateRef = useRef<CollabDocSessionState | null>(null)
  const remoteCursorEntriesRef = useRef<Map<string, CollabDocCursorPayload>>(new Map())
  const remoteCursorDecorationIdsRef = useRef<string[]>([])
  const cursorStylesByClassRef = useRef<Map<string, HTMLStyleElement>>(new Map())
  const cursorWidgetsBySocketIdRef = useRef<Map<string, RemoteCursorWidget>>(new Map())
  const bindingTargetsRef = useRef<CollabDocModelBinding>({ editor: null, model: null, monaco: null })
  const projectIdRef = useRef<string | null>(projectId)
  const fileIdRef = useRef<string | null>(fileId)
  const lastCursorSentAtRef = useRef(0)
  const lastCursorSignatureRef = useRef('')
  const joinAttemptIdRef = useRef(0)

  const [state, setState] = useState<CollabDocState>({
    connectionState: 'idle',
    message: null,
  })
  const [timelineState, setTimelineState] = useState<CollabDocTimelineState>({
    entries: [],
    rewindEdges: [],
    headSequence: 0,
    isLoading: false,
    error: null,
  })
  const [previewState, setPreviewState] = useState<CollabDocPreviewState>({
    isActive: false,
    sequence: null,
    headSequence: null,
    isLoading: false,
    error: null,
  })

  const destroyBinding = useMemo(() => {
    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
    }
  }, [])

  const bindEditorToLiveDoc = useCallback(async () => {
    const editor = bindingTargetsRef.current.editor
    const model = bindingTargetsRef.current.model
    const doc = collabDocRef.current
    if (!editor || !model || !doc) {
      return
    }

    destroyBinding()

    const module = await import('y-monaco')
    const yText = doc.getText('content')
    const binding = new module.MonacoBinding(
      yText,
      model,
      new Set([editor]),
    ) as MonacoBindingInstance
    bindingRef.current = binding
  }, [destroyBinding])

  const collabClient = useMemo(() => {
    return new CollabClient({
      getToken: async () => {
        return getAccessTokenSilently({
          authorizationParams: {
            audience: auth0Config.audience,
          },
        }).catch(() => null)
      },
      onStatus: (status) => {
        setState({
          connectionState: status.state,
          message: status.message ?? null,
        })
      },
    })
  }, [getAccessTokenSilently])

  useEffect(() => {
    bindingTargetsRef.current = bindingTargets
  }, [bindingTargets])

  useEffect(() => {
    projectIdRef.current = projectId
    fileIdRef.current = fileId
  }, [fileId, projectId])

  const clearRemoteCursorVisuals = useCallback(() => {
    const editor = bindingTargetsRef.current.editor

    if (editor && remoteCursorDecorationIdsRef.current.length > 0) {
      remoteCursorDecorationIdsRef.current = editor.deltaDecorations(remoteCursorDecorationIdsRef.current, [])
    }

    cursorWidgetsBySocketIdRef.current.forEach((widget) => widget.dispose())
    cursorWidgetsBySocketIdRef.current.clear()
  }, [])

  const ensureRemoteCursorWidget = useCallback((socketId: string, collaboratorName: string, color: string): RemoteCursorWidget => {
    const existing = cursorWidgetsBySocketIdRef.current.get(socketId)
    if (existing) {
      return existing
    }

    const editor = bindingTargetsRef.current.editor
    const monaco = bindingTargetsRef.current.monaco

    if (!editor || !monaco) {
      return {
        update: () => undefined,
        setLabel: () => undefined,
        dispose: () => undefined,
      }
    }

    const classSuffix = getCollaboratorClassSuffix(socketId)
    const widgetId = `remote-cursor-widget-${socketId}`
    const node = document.createElement('div')
    node.className = `collab-remote-cursor-widget-${classSuffix}`
    node.style.position = 'relative'
    node.style.pointerEvents = 'none'

    const caret = document.createElement('span')
    caret.style.display = 'block'
    caret.style.width = '2px'
    caret.style.height = '1.2em'
    caret.style.background = color
    caret.style.boxShadow = `0 0 0 1px color-mix(in oklab, ${color} 40%, white 60%)`
    caret.style.borderRadius = '2px'
    node.appendChild(caret)

    const labelNode = document.createElement('span')
    labelNode.textContent = collaboratorName
    labelNode.style.position = 'absolute'
    labelNode.style.left = '3px'
    labelNode.style.top = '-1.2em'
    labelNode.style.fontSize = '9px'
    labelNode.style.fontWeight = '700'
    labelNode.style.padding = '0 4px'
    labelNode.style.borderRadius = '6px'
    labelNode.style.background = color
    labelNode.style.color = '#ffffff'
    labelNode.style.whiteSpace = 'nowrap'
    node.appendChild(labelNode)

    const position = { lineNumber: 1, column: 1 }

    const widget: MonacoEditorTypes.IContentWidget = {
      getId: () => widgetId,
      getDomNode: () => node,
      getPosition: () => ({
        position,
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
      }),
    }

    editor.addContentWidget(widget)

    const wrapper: RemoteCursorWidget = {
      update: (lineNumber, column) => {
        position.lineNumber = Math.max(1, lineNumber)
        position.column = Math.max(1, column)
        editor.layoutContentWidget(widget)
      },
      setLabel: (label) => {
        labelNode.textContent = label
      },
      dispose: () => {
        editor.removeContentWidget(widget)
      },
    }

    cursorWidgetsBySocketIdRef.current.set(socketId, wrapper)
    return wrapper
  }, [])

  useEffect(() => {
    return () => {
      if (sessionDestroyRef.current) {
        sessionDestroyRef.current()
        sessionDestroyRef.current = null
      }

      collabDocRef.current = null

      sessionStateRef.current = null

      if (bindingRef.current) {
        destroyBinding()
      }

      if (projectWatchDestroyRef.current) {
        projectWatchDestroyRef.current()
        projectWatchDestroyRef.current = null
      }

      collabClient.disconnect()
    }
  }, [collabClient])

  const applyRemoteCursorDecorations = useCallback(() => {
    const editor = bindingTargetsRef.current.editor
    const model = bindingTargetsRef.current.model
    const monaco = bindingTargetsRef.current.monaco
    const currentProjectId = projectIdRef.current
    const currentFileId = fileIdRef.current
    const currentSocketId = collabClient.getCurrentSocketId()

    if (!editor || !model || !monaco || !currentProjectId || !currentFileId) {
      return
    }

    const activeEntries = [...remoteCursorEntriesRef.current.values()]
      .filter((entry) => {
        if (entry.projectId !== currentProjectId || entry.fileId !== currentFileId || entry.cleared) {
          return false
        }

        if (currentSocketId && entry.socketId === currentSocketId) {
          return false
        }

        return true
      })

    const activeSocketIds = new Set(activeEntries.map((entry) => entry.socketId))
    cursorWidgetsBySocketIdRef.current.forEach((widget, socketId) => {
      if (!activeSocketIds.has(socketId)) {
        widget.dispose()
        cursorWidgetsBySocketIdRef.current.delete(socketId)
      }
    })

    const decorations = activeEntries.flatMap((entry) => {
      const color = getCollaboratorColor(entry.subject)
      const classSuffix = getCollaboratorClassSuffix(entry.subject)
      const selectionClassName = `collab-remote-selection-${classSuffix}`
      const styleKey = `${selectionClassName}`

      if (!cursorStylesByClassRef.current.has(styleKey)) {
        const style = document.createElement('style')
        style.dataset.collabCursorStyle = styleKey
        style.textContent = `
.${selectionClassName} {
  background: color-mix(in oklab, ${color} 26%, transparent);
  outline: 1px solid color-mix(in oklab, ${color} 54%, white 46%);
  border-radius: 2px;
}
`
        document.head.appendChild(style)
        cursorStylesByClassRef.current.set(styleKey, style)
      }

      const displayLabel = resolveCollaboratorName?.(entry.subject) ?? 'Collaborator'
      const widget = ensureRemoteCursorWidget(entry.socketId, displayLabel, color)
      widget.setLabel(displayLabel)
      widget.update(entry.lineNumber, entry.column)

      const hasSelection = Boolean(
        entry.selectionStartLineNumber
          && entry.selectionStartColumn
          && entry.selectionEndLineNumber
          && entry.selectionEndColumn,
      )

      if (!hasSelection) {
        return []
      }

      return [{
        range: new monaco.Range(
          entry.selectionStartLineNumber!,
          entry.selectionStartColumn!,
          entry.selectionEndLineNumber!,
          entry.selectionEndColumn!,
        ),
        options: {
          inlineClassName: selectionClassName,
          hoverMessage: { value: entry.subject },
        },
      }]
    })

    remoteCursorDecorationIdsRef.current = editor.deltaDecorations(
      remoteCursorDecorationIdsRef.current,
      decorations,
    )
  }, [collabClient, ensureRemoteCursorWidget, resolveCollaboratorName])

  const watchCallbacks = useMemo<WatchProjectCallbacks>(() => {
    return {
      onFileCreated,
      onFileUpdated,
      onFileDeleted,
      onDirtyStateChanged,
      onProjectActivityChanged,
      onDocCursorChanged: (payload) => {
        const now = Date.now()
        const staleAfterMs = 10_000

        remoteCursorEntriesRef.current.forEach((entry, key) => {
          if (now - Date.parse(entry.updatedAt) > staleAfterMs) {
            remoteCursorEntriesRef.current.delete(key)
          }
        })

        if (payload.cleared) {
          remoteCursorEntriesRef.current.delete(payload.socketId)
        } else {
          remoteCursorEntriesRef.current.set(payload.socketId, payload)
        }

        applyRemoteCursorDecorations()
      },
    }
  }, [applyRemoteCursorDecorations, onDirtyStateChanged, onFileCreated, onFileDeleted, onFileUpdated, onProjectActivityChanged])

  useEffect(() => {
    if (projectWatchDestroyRef.current) {
      projectWatchDestroyRef.current()
      projectWatchDestroyRef.current = null
    }

    if (!projectId) {
      return
    }

    let cancelled = false

    void collabClient
      .watchProject(projectId, watchCallbacks)
      .then((destroyWatch) => {
        if (cancelled) {
          destroyWatch()
          return
        }

        projectWatchDestroyRef.current = destroyWatch
      })
      .catch(() => {
        projectWatchDestroyRef.current = null
      })

    return () => {
      cancelled = true

      if (projectWatchDestroyRef.current) {
        projectWatchDestroyRef.current()
        projectWatchDestroyRef.current = null
      }
    }
  }, [collabClient, projectId, watchCallbacks])

  useEffect(() => {
    if (!projectId) {
      return
    }

    void collabClient.sendProjectActivity(projectId, fileId)

    return () => {
      void collabClient.sendProjectActivity(projectId, null)
    }
  }, [collabClient, fileId, projectId])

  useEffect(() => {
    activeDocKeyRef.current =
      projectId && fileId ? `${projectId}:${fileId}` : ''

    setBindingTargets({
      editor: null,
      model: null,
      monaco: null,
      // monaco: null,
    })

    setTimelineState({
      entries: [],
      rewindEdges: [],
      headSequence: 0,
      isLoading: false,
      error: null,
    })
    setPreviewState({
      isActive: false,
      sequence: null,
      headSequence: null,
      isLoading: false,
      error: null,
    })

    setTimelineState({
      entries: [],
      rewindEdges: [],
      headSequence: 0,
      isLoading: false,
      error: null,
    })
    setPreviewState({
      isActive: false,
      sequence: null,
      headSequence: null,
      isLoading: false,
      error: null,
    })
  }, [fileId, projectId])

  const previewSnapshot = useMemo(() => {
    return async (sequence: number): Promise<CollabDocSnapshotPreview> => {
      if (!projectId || !fileId) {
        throw new Error('Select a file to preview')
      }

      const requestId = previewRequestIdRef.current + 1
      previewRequestIdRef.current = requestId
      const expectedDocKey = `${projectId}:${fileId}`

      setPreviewState((previous) => ({
        ...previous,
        isLoading: true,
        error: null,
      }))

      try {
        const preview = await collabClient.getSnapshotPreview(
          projectId,
          fileId,
          sequence,
        )
        if (
          requestId !== previewRequestIdRef.current ||
          activeDocKeyRef.current !== expectedDocKey
        ) {
          return preview
        }

        const model = bindingTargets.model
        if (!model) {
          throw new Error('Editor model is not ready for preview')
        }

        destroyBinding()
        model.setValue(preview.content)
        setPreviewState({
          isActive: true,
          sequence: preview.sequence,
          headSequence: preview.headSequence,
          isLoading: false,
          error: null,
        })
        return preview
      } catch (error) {
        if (
          requestId !== previewRequestIdRef.current ||
          activeDocKeyRef.current !== expectedDocKey
        ) {
          throw error
        }

        setPreviewState((previous) => ({
          ...previous,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load snapshot preview',
        }))
        throw error
      }
    }
  }, [bindingTargets.model, collabClient, destroyBinding, fileId, projectId])

  const cancelPreviewRequests = useMemo(() => {
    return () => {
      previewRequestIdRef.current += 1
      setPreviewState((previous) => ({
        ...previous,
        isLoading: false,
      }))
    }
  }, [])

  const clearPreviewAndRestoreHead = useMemo(() => {
    return async () => {
      if (!projectId || !fileId) {
        setPreviewState({
          isActive: false,
          sequence: null,
          headSequence: null,
          isLoading: false,
          error: null,
        })
        return
      }

      if (!previewState.isActive) {
        return
      }

      setPreviewState((previous) => ({
        ...previous,
        isLoading: true,
        error: null,
      }))

      try {
        const model = bindingTargets.model
        const doc = collabDocRef.current
        if (!model || !doc) {
          throw new Error('Document is not ready')
        }

        model.setValue(doc.getText('content').toString())
        await bindEditorToLiveDoc()
        setPreviewState({
          isActive: false,
          sequence: null,
          headSequence: null,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        setPreviewState((previous) => ({
          ...previous,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Could not restore latest state',
        }))
        throw error
      }
    }
  }, [
    bindEditorToLiveDoc,
    bindingTargets.model,
    fileId,
    previewState.isActive,
    projectId,
  ])

  const clearPreviewState = useMemo(() => {
    return () => {
      setPreviewState({
        isActive: false,
        sequence: null,
        headSequence: null,
        isLoading: false,
        error: null,
      })
    }
  }, [])

  const clearPreviewAfterRewind = useMemo(() => {
    return async () => {
      if (!previewState.isActive) {
        return
      }

      const model = bindingTargets.model
      const doc = collabDocRef.current
      if (!model || !doc) {
        clearPreviewState()
        return
      }

      model.setValue(doc.getText('content').toString())
      await bindEditorToLiveDoc()
      clearPreviewState()
    }
  }, [
    bindEditorToLiveDoc,
    bindingTargets.model,
    clearPreviewState,
    previewState.isActive,
  ])

  const loadTimeline = useMemo(() => {
    return async (options?: { limit?: number; beforeSequence?: number }) => {
      if (!projectId || !fileId) {
        setTimelineState({
          entries: [],
          rewindEdges: [],
          headSequence: 0,
          isLoading: false,
          error: null,
        })
        return
      }

      setTimelineState((previous) => ({
        ...previous,
        isLoading: true,
        error: null,
      }))

      const requestId = timelineRequestIdRef.current + 1
      timelineRequestIdRef.current = requestId
      const expectedDocKey = `${projectId}:${fileId}`

      try {
        const timeline = await collabClient.getDocumentTimeline(
          projectId,
          fileId,
          options,
        )
        if (
          requestId !== timelineRequestIdRef.current ||
          activeDocKeyRef.current !== expectedDocKey
        ) {
          return
        }

        setTimelineState({
          entries: timeline.entries,
          rewindEdges: timeline.rewindEdges,
          headSequence: timeline.headSequence,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        if (
          requestId !== timelineRequestIdRef.current ||
          activeDocKeyRef.current !== expectedDocKey
        ) {
          return
        }

        setTimelineState((previous) => ({
          ...previous,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Could not load timeline',
        }))
      }
    }
  }, [collabClient, fileId, projectId])

  const rewindToSequence = useMemo(() => {
    return async (
      targetSequence: number,
      expectedHeadSequence?: number,
    ): Promise<CollabDocRewindResult> => {
      if (!projectId || !fileId) {
        throw new Error('Select a file to rewind')
      }

      const result = await collabClient.rewindDocument(
        projectId,
        fileId,
        targetSequence,
        expectedHeadSequence,
      )
      await loadTimeline()
      return result
    }
  }, [collabClient, fileId, loadTimeline, projectId])

  useEffect(() => {
    const joinAttemptId = joinAttemptIdRef.current + 1
    joinAttemptIdRef.current = joinAttemptId

    if (!projectId || !fileId) {
      if (sessionDestroyRef.current) {
        sessionDestroyRef.current()
        sessionDestroyRef.current = null
      }

      collabDocRef.current = null
      sessionStateRef.current = null

      if (bindingRef.current) {
        destroyBinding()
      }

      clearRemoteCursorVisuals()

      setState({
        connectionState: 'idle',
        message: null,
      })
      return
    }

    let cancelled = false

    if (sessionDestroyRef.current) {
      sessionDestroyRef.current()
      sessionDestroyRef.current = null
    }

    collabDocRef.current = null
    sessionStateRef.current = null

    if (bindingRef.current) {
      destroyBinding()
    }

    void collabClient
      .joinDocument(projectId, fileId)
      .then(async (session) => {
        if (cancelled || joinAttemptIdRef.current !== joinAttemptId) {
          session.destroy()
          return
        }

        collabDocRef.current = session.doc
        sessionStateRef.current = {
          projectId,
          fileId,
          doc: session.doc,
        }
        sessionDestroyRef.current = () => {
          sessionStateRef.current = null
          session.destroy()
        }

        await bindEditorToLiveDoc()
      })
      .catch((error: unknown) => {
        if (cancelled || joinAttemptIdRef.current !== joinAttemptId) {
          return
        }

        setState({
          connectionState: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not join collaboration session',
        })
        sessionStateRef.current = null
      })

    return () => {
      cancelled = true

      remoteCursorEntriesRef.current.clear()
      clearRemoteCursorVisuals()

      if (sessionDestroyRef.current) {
        sessionDestroyRef.current()
        sessionDestroyRef.current = null
      }

      collabDocRef.current = null
      sessionStateRef.current = null

      if (bindingRef.current) {
        destroyBinding()
      }
    }
  }, [bindEditorToLiveDoc, clearRemoteCursorVisuals, collabClient, destroyBinding, fileId, projectId])

  useEffect(() => {
    const model = bindingTargets.model
    const editor = bindingTargets.editor
    const monaco = bindingTargets.monaco
    const session = sessionStateRef.current
    const hasMatchingSession = Boolean(
      session
      && projectId
      && fileId
      && session.projectId === projectId
      && session.fileId === fileId,
    )

    if (!model || !editor || !monaco || !hasMatchingSession) {
      if (bindingRef.current) {
        destroyBinding()
      }
      return
    }

    void bindEditorToLiveDoc()
  }, [bindEditorToLiveDoc, bindingTargets.editor, bindingTargets.model, bindingTargets.monaco, destroyBinding, fileId, projectId])

  useEffect(() => {
    const editor = bindingTargets.editor
    if (!editor || !projectId || !fileId) {
      return
    }

    const cursorDisposable = editor.onDidChangeCursorSelection((event) => {
      const now = Date.now()
      if (now - lastCursorSentAtRef.current < 70) {
        return
      }

      const selection = event.selection
      const signature = `${selection.startLineNumber}:${selection.startColumn}:${selection.endLineNumber}:${selection.endColumn}`
      if (signature === lastCursorSignatureRef.current) {
        return
      }

      lastCursorSignatureRef.current = signature
      lastCursorSentAtRef.current = now

      void collabClient.sendDocCursor(projectId, fileId, {
        lineNumber: selection.positionLineNumber,
        column: selection.positionColumn,
        selectionStartLineNumber: selection.startLineNumber,
        selectionStartColumn: selection.startColumn,
        selectionEndLineNumber: selection.endLineNumber,
        selectionEndColumn: selection.endColumn,
      })
    })

    return () => {
      cursorDisposable.dispose()
    }
  }, [bindingTargets.editor, collabClient, fileId, projectId])

  useEffect(() => {
    return () => {
      cursorStylesByClassRef.current.forEach((styleElement) => {
        styleElement.remove()
      })
      cursorStylesByClassRef.current.clear()
      clearRemoteCursorVisuals()
    }
  }, [clearRemoteCursorVisuals])

  function onEditorMount(editor: MonacoEditorTypes.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) {
    setBindingTargets({
      editor,
      model: editor.getModel(),
      monaco,
    })
  }

  function applyEditorContent(nextContent: string) {
    const sessionState = sessionStateRef.current
    const hasActiveSession = Boolean(
      sessionState
      && sessionState.projectId === projectId
      && sessionState.fileId === fileId,
    )

    const model = bindingTargets.model
    const modelReady = Boolean(
      model
      && typeof model.getValue === 'function'
      && !(typeof model.isDisposed === 'function' && model.isDisposed()),
    )

    const yText = hasActiveSession ? sessionState.doc.getText('content') : null

    const currentContent = modelReady
      ? model.getValue()
      : (yText ? yText.toString() : null)

    if (currentContent === null) {
      return {
        ok: false as const,
        reason: 'Neither editor model nor active collaboration document is ready.',
      }
    }

    if (nextContent === currentContent) {
      return {
        ok: true as const,
        content: nextContent,
      }
    }

    let changeStart = 0
    while (
      changeStart < currentContent.length
      && changeStart < nextContent.length
      && currentContent[changeStart] === nextContent[changeStart]
    ) {
      changeStart += 1
    }

    let currentEnd = currentContent.length - 1
    let nextEnd = nextContent.length - 1
    while (
      currentEnd >= changeStart
      && nextEnd >= changeStart
      && currentContent[currentEnd] === nextContent[nextEnd]
    ) {
      currentEnd -= 1
      nextEnd -= 1
    }

    const deleteLength = currentEnd >= changeStart ? (currentEnd - changeStart + 1) : 0
    const insertText = nextContent.slice(changeStart, nextEnd + 1)

    if (modelReady && model) {
      const startPosition = model.getPositionAt(changeStart)
      const endPosition = model.getPositionAt(changeStart + deleteLength)

      const editOperation = {
        range: {
          startLineNumber: startPosition.lineNumber,
          startColumn: startPosition.column,
          endLineNumber: endPosition.lineNumber,
          endColumn: endPosition.column,
        },
        text: insertText,
        forceMoveMarkers: true,
      }

      if (bindingTargets.editor) {
        bindingTargets.editor.pushUndoStop()
        bindingTargets.editor.executeEdits('ai-suggestion-accept', [editOperation])
        bindingTargets.editor.pushUndoStop()
      } else {
        model.applyEdits([editOperation])
      }
    } else if (yText) {
      sessionState.doc.transact(() => {
        const currentLength = yText.length
        if (currentLength > 0) {
          yText.delete(0, currentLength)
        }
        if (nextContent.length > 0) {
          yText.insert(0, nextContent)
        }
      }, 'ai-diff-accept')
    } else {
      return {
        ok: false as const,
        reason: 'Could not apply AI edits because no target editor model is available.',
      }
    }

    if (!hasActiveSession) {
      return {
        ok: true as const,
        content: nextContent,
        warning: 'Applied locally while collaboration session was reconnecting.',
      }
    }

    return {
      ok: true as const,
      content: nextContent,
    }
  }


  return {
    collabState: state,
    onEditorMount,
    timelineState,
    previewState,
    loadTimeline,
    previewSnapshot,
    clearPreviewAndRestoreHead,
    clearPreviewAfterRewind,
    cancelPreviewRequests,
    clearPreviewState,
    rewindToSequence,
    applyAiContentToYjs: (nextContent: string) => {
      return applyEditorContent(nextContent)
    },
    applyAiHunkToYjs: (hunk: StructuredDiffHunk) => {
      const model = bindingTargets.model
      if (!model) {
        return {
          ok: false as const,
          reason: 'Editor model is not ready for this file.',
        }
      }

      const currentContent = model.getValue()
      const applied = applySingleHunk(currentContent, hunk)
      if (!applied.ok) {
        return {
          ok: false as const,
          reason: applied.reason,
        }
      }

      return applyEditorContent(applied.content)
    },
    markSaved: (nextProjectId: string, nextFileId: string) => {
      void collabClient.markDocumentSaved(nextProjectId, nextFileId)
    },
  }
}
