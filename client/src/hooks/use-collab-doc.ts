import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import {
  CollabClient,
  type CollabDocRewindResult,
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
  const sessionDestroyRef = useRef<(() => void) | null>(null)
  const projectWatchDestroyRef = useRef<(() => void) | null>(null)
  const timelineRequestIdRef = useRef(0)
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

      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
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
  }, [fileId, projectId])

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
        bindingRef.current.destroy()
        bindingRef.current = null
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
      bindingRef.current.destroy()
      bindingRef.current = null
    }

    void collabClient
      .joinDocument(projectId, fileId)
      .then(async (session) => {
        if (cancelled) {
          session.destroy()
          return
        }

        const module = await import('y-monaco')
        if (cancelled) {
          session.destroy()
          return
        }

        const yText = session.doc.getText('content')
        const binding = new module.MonacoBinding(yText, model, new Set([editor])) as MonacoBindingInstance
        bindingRef.current = binding
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

      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
    }
  }, [bindingTargets.editor, bindingTargets.model, collabClient, fileId, projectId])

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
    loadTimeline,
    rewindToSequence,
    markSaved: (nextProjectId: string, nextFileId: string) => {
      void collabClient.markDocumentSaved(nextProjectId, nextFileId)
    },
  }
}
