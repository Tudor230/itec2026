import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type { editor as MonacoEditorTypes } from 'monaco-editor'
import {
  CollabClient,
  type CollabDocExternalChangePayload,
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
  onExternalDocChange?: (payload: CollabDocExternalChangePayload) => void
}

interface CollabDocModelBinding {
  editor: MonacoEditorTypes.IStandaloneCodeEditor | null
  model: MonacoEditorTypes.ITextModel | null
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
  onExternalDocChange,
}: CollabDocParams) {
  const { getAccessTokenSilently } = useAuth0()
  const [bindingTargets, setBindingTargets] = useState<CollabDocModelBinding>({
    editor: null,
    model: null,
  })

  const bindingRef = useRef<MonacoBindingInstance | null>(null)
  const sessionDestroyRef = useRef<(() => void) | null>(null)
  const projectWatchDestroyRef = useRef<(() => void) | null>(null)

  const [state, setState] = useState<CollabDocState>({
    connectionState: 'idle',
    message: null,
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
      onExternalDocChange,
    }
  }, [onDirtyStateChanged, onExternalDocChange, onFileCreated, onFileDeleted, onFileUpdated])

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
    setBindingTargets({
      editor: null,
      model: null,
    })
  }, [fileId, projectId])

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
    markSaved: (nextProjectId: string, nextFileId: string) => {
      void collabClient.markDocumentSaved(nextProjectId, nextFileId)
    },
  }
}
