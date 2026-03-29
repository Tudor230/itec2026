import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import type { Doc as YDoc } from 'yjs'
import {
  CollabClient,
  type CollabDocRewindResult,
  type CollabDocSnapshotPreview,
  type CollabDocTimelineEntry,
  type CollabDocDirtyStatePayload,
  type CollabFileCreatedPayload,
  type CollabFileDeletedPayload,
  type CollabFileUpdatedPayload,
  type WatchProjectCallbacks,
} from '../lib/collab-client'
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

  const [state, setState] = useState<CollabDocState>({
    connectionState: 'idle',
    message: null,
  })
  const [timelineState, setTimelineState] = useState<CollabDocTimelineState>({
    entries: [],
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
      const binding = new module.MonacoBinding(yText, model, new Set([editor])) as MonacoBindingInstance
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

    void collabClient.watchProject(projectId, watchCallbacks).then((destroyWatch) => {
      if (cancelled) {
        destroyWatch()
        return
      }

      projectWatchDestroyRef.current = destroyWatch
    }).catch(() => {
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
    activeDocKeyRef.current = projectId && fileId ? `${projectId}:${fileId}` : ''

    setBindingTargets({
      editor: null,
      model: null,
    })

    setTimelineState({
      entries: [],
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
        const preview = await collabClient.getSnapshotPreview(projectId, fileId, sequence)
        if (requestId !== previewRequestIdRef.current || activeDocKeyRef.current !== expectedDocKey) {
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
        if (requestId !== previewRequestIdRef.current || activeDocKeyRef.current !== expectedDocKey) {
          throw error
        }

        setPreviewState((previous) => ({
          ...previous,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Could not load snapshot preview',
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
          error: error instanceof Error ? error.message : 'Could not restore latest state',
        }))
        throw error
      }
    }
  }, [bindEditorToLiveDoc, bindingTargets.model, fileId, previewState.isActive, projectId])

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
  }, [bindEditorToLiveDoc, bindingTargets.model, clearPreviewState, previewState.isActive])

  const loadTimeline = useMemo(() => {
    return async (options?: { limit?: number; beforeSequence?: number }) => {
      if (!projectId || !fileId) {
        setTimelineState({
          entries: [],
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
        const timeline = await collabClient.getDocumentTimeline(projectId, fileId, options)
        if (requestId !== timelineRequestIdRef.current || activeDocKeyRef.current !== expectedDocKey) {
          return
        }

        setTimelineState({
          entries: timeline.entries,
          headSequence: timeline.headSequence,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        if (requestId !== timelineRequestIdRef.current || activeDocKeyRef.current !== expectedDocKey) {
          return
        }

        setTimelineState((previous) => ({
          ...previous,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Could not load timeline',
        }))
      }
    }
  }, [collabClient, fileId, projectId])

  const rewindToSequence = useMemo(() => {
    return async (targetSequence: number, expectedHeadSequence?: number): Promise<CollabDocRewindResult> => {
      if (!projectId || !fileId) {
        throw new Error('Select a file to rewind')
      }

      const result = await collabClient.rewindDocument(projectId, fileId, targetSequence, expectedHeadSequence)
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
        if (cancelled) {
          session.destroy()
          return
        }

        sessionDestroyRef.current = session.destroy
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setState({
          connectionState: 'error',
          message: error instanceof Error ? error.message : 'Could not join collaboration session',
        })
      })

    return () => {
      cancelled = true

      if (sessionDestroyRef.current) {
        sessionDestroyRef.current()
        sessionDestroyRef.current = null
      }

      collabDocRef.current = null

      if (bindingRef.current) {
        destroyBinding()
      }
    }
  }, [bindEditorToLiveDoc, bindingTargets.editor, bindingTargets.model, collabClient, destroyBinding, fileId, projectId])

  function onEditorMount(editor: MonacoEditorTypes.IStandaloneCodeEditor) {
    setBindingTargets({
      editor,
      model: editor.getModel(),
    })
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
    markSaved: (nextProjectId: string, nextFileId: string) => {
      void collabClient.markDocumentSaved(nextProjectId, nextFileId)
    },
  }
}
