import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import type { Doc as YDoc } from 'yjs'
import type { StructuredDiffHunk } from '../services/ai-api'
import { applySingleHunk } from '../lib/apply-structured-diff'
import {
  CollabClient
  
  
  
  
  
  
  
  
  
} from '../lib/collab-client'
import type {CollabDocRewindResult, CollabDocRewindEdge, CollabDocSnapshotPreview, CollabDocTimelineEntry, CollabDocDirtyStatePayload, CollabFileCreatedPayload, CollabFileDeletedPayload, CollabFileUpdatedPayload, WatchProjectCallbacks} from '../lib/collab-client';
import { auth0Config } from '../lib/auth0-config'

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
}

interface CollabDocModelBinding {
  editor: MonacoEditorTypes.IStandaloneCodeEditor | null
  model: MonacoEditorTypes.ITextModel | null
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

export function useCollabDoc({
  projectId,
  fileId,
  onFileCreated,
  onFileUpdated,
  onFileDeleted,
  onDirtyStateChanged,
}: CollabDocParams) {
  const { getAccessTokenSilently } = useAuth0()
  const [bindingTargets, setBindingTargets] = useState<CollabDocModelBinding>({
    editor: null,
    model: null,
  })

  const bindingRef = useRef<MonacoBindingInstance | null>(null)
  const collabDocRef = useRef<YDoc | null>(null)
  const sessionDestroyRef = useRef<(() => void) | null>(null)
  const projectWatchDestroyRef = useRef<(() => void) | null>(null)
  const timelineRequestIdRef = useRef(0)
  const previewRequestIdRef = useRef(0)
  const activeDocKeyRef = useRef('')
  const sessionStateRef = useRef<CollabDocSessionState | null>(null)

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

  const bindEditorToLiveDoc = useMemo(() => {
    return async () => {
      const editor = bindingTargets.editor
      const model = bindingTargets.model
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
    }
  }, [bindingTargets.editor, bindingTargets.model, destroyBinding])

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

  const watchCallbacks = useMemo<WatchProjectCallbacks>(() => {
    return {
      onFileCreated,
      onFileUpdated,
      onFileDeleted,
      onDirtyStateChanged,
    }
  }, [onDirtyStateChanged, onFileCreated, onFileDeleted, onFileUpdated])

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
    activeDocKeyRef.current =
      projectId && fileId ? `${projectId}:${fileId}` : ''

    setBindingTargets({
      editor: null,
      model: null,
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
    const model = bindingTargets.model
    const editor = bindingTargets.editor

    if (!projectId || !fileId || !model || !editor) {
      if (sessionDestroyRef.current) {
        sessionDestroyRef.current()
        sessionDestroyRef.current = null
      }

      sessionStateRef.current = null

      if (bindingRef.current) {
        destroyBinding()
      }

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

    if (bindingRef.current) {
      destroyBinding()
    }

    void collabClient
      .joinDocument(projectId, fileId)
      .then(async (session) => {
        if (cancelled) {
          session.destroy()
          return
        }

        collabDocRef.current = session.doc

        await bindEditorToLiveDoc()
        sessionStateRef.current = {
          projectId,
          fileId,
          doc: session.doc,
        }
        sessionDestroyRef.current = () => {
          sessionStateRef.current = null
          session.destroy()
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
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
  }, [
    bindEditorToLiveDoc,
    bindingTargets.editor,
    bindingTargets.model,
    collabClient,
    destroyBinding,
    fileId,
    projectId,
  ])

  function onEditorMount(editor: MonacoEditorTypes.IStandaloneCodeEditor) {
    setBindingTargets({
      editor,
      model: editor.getModel(),
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
