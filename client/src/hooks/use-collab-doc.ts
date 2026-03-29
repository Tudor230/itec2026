import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type {
  editor as MonacoEditorTypes,
  Monaco,
} from 'monaco-editor'
import {
  CollabClient
} from '../lib/collab-client'
import type {
  CollabDocCursorPayload,
  CollabDocDirtyStatePayload,
  CollabDocExternalChangePayload,
  CollabFileCreatedPayload,
  CollabFileDeletedPayload,
  CollabFileUpdatedPayload,
  CollabProjectActivityPayload,
  WatchProjectCallbacks,
} from '../lib/collab-client'
import { auth0Config } from '../lib/auth0-config'
import {
  getCollaboratorClassSuffix,
  getCollaboratorColor,
} from '../components/workspace/collab-colors'

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
  onExternalDocChange?: (payload: CollabDocExternalChangePayload) => void
  resolveCollaboratorName?: (subject: string) => string
}

interface CollabDocModelBinding {
  editor: MonacoEditorTypes.IStandaloneCodeEditor | null
  model: MonacoEditorTypes.ITextModel | null
  monaco: Monaco | null
}

interface MonacoBindingInstance {
  destroy: () => void
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
  onExternalDocChange,
  resolveCollaboratorName,
}: CollabDocParams) {
  const { getAccessTokenSilently } = useAuth0()
  const [bindingTargets, setBindingTargets] = useState<CollabDocModelBinding>({
    editor: null,
    model: null,
    monaco: null,
  })

  const bindingRef = useRef<MonacoBindingInstance | null>(null)
  const sessionDestroyRef = useRef<(() => void) | null>(null)
  const projectWatchDestroyRef = useRef<(() => void) | null>(null)
  const remoteCursorEntriesRef = useRef<Map<string, CollabDocCursorPayload>>(
    new Map(),
  )
  const remoteCursorDecorationIdsRef = useRef<string[]>([])
  const cursorStylesByClassRef = useRef<Map<string, HTMLStyleElement>>(
    new Map(),
  )
  const cursorWidgetsBySocketIdRef = useRef<Map<string, RemoteCursorWidget>>(
    new Map(),
  )
  const bindingTargetsRef = useRef<CollabDocModelBinding>({
    editor: null,
    model: null,
    monaco: null,
  })
  const projectIdRef = useRef<string | null>(projectId)
  const fileIdRef = useRef<string | null>(fileId)
  const lastCursorSentAtRef = useRef(0)
  const lastCursorSignatureRef = useRef('')

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
    bindingTargetsRef.current = bindingTargets
  }, [bindingTargets])

  useEffect(() => {
    projectIdRef.current = projectId
    fileIdRef.current = fileId
  }, [fileId, projectId])

  const clearRemoteCursorVisuals = useCallback(() => {
    const editor = bindingTargetsRef.current.editor

    if (editor && remoteCursorDecorationIdsRef.current.length > 0) {
      remoteCursorDecorationIdsRef.current = editor.deltaDecorations(
        remoteCursorDecorationIdsRef.current,
        [],
      )
    }

    cursorWidgetsBySocketIdRef.current.forEach((widget) => widget.dispose())
    cursorWidgetsBySocketIdRef.current.clear()
  }, [])

  const ensureRemoteCursorWidget = useCallback(
    (
      socketId: string,
      collaboratorName: string,
      color: string,
    ): RemoteCursorWidget => {
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
    },
    [],
  )

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

    const activeEntries = [...remoteCursorEntriesRef.current.values()].filter(
      (entry) => {
        if (
          entry.projectId !== currentProjectId ||
          entry.fileId !== currentFileId ||
          entry.cleared
        ) {
          return false
        }

        if (currentSocketId && entry.socketId === currentSocketId) {
          return false
        }

        return true
      },
    )

    const activeSocketIds = new Set(
      activeEntries.map((entry) => entry.socketId),
    )
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

      const displayLabel =
        resolveCollaboratorName?.(entry.subject) ?? 'Collaborator'
      const widget = ensureRemoteCursorWidget(
        entry.socketId,
        displayLabel,
        color,
      )
      widget.setLabel(displayLabel)
      widget.update(entry.lineNumber, entry.column)

      const hasSelection = Boolean(
        entry.selectionStartLineNumber &&
          entry.selectionStartColumn &&
          entry.selectionEndLineNumber &&
          entry.selectionEndColumn,
      )

      if (!hasSelection) {
        return []
      }

      return [
        {
          range: new monaco.Range(
            entry.selectionStartLineNumber,
            entry.selectionStartColumn,
            entry.selectionEndLineNumber,
            entry.selectionEndColumn,
          ),
          options: {
            inlineClassName: selectionClassName,
            hoverMessage: { value: entry.subject },
          },
        },
      ]
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
      onExternalDocChange,
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
  }, [
    applyRemoteCursorDecorations,
    onDirtyStateChanged,
    onExternalDocChange,
    onFileCreated,
    onFileDeleted,
    onFileUpdated,
    onProjectActivityChanged,
  ])

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
    setBindingTargets({
      editor: null,
      model: null,
      monaco: null,
    })
  }, [fileId, projectId])

  useEffect(() => {
    const model = bindingTargets.model
    const editor = bindingTargets.editor
    const monaco = bindingTargets.monaco

    if (!projectId || !fileId || !model || !editor || !monaco) {
      if (sessionDestroyRef.current) {
        sessionDestroyRef.current()
        sessionDestroyRef.current = null
      }

      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
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

    if (bindingRef.current) {
      bindingRef.current.destroy()
      bindingRef.current = null
    }

    void collabClient
      .joinDocument(projectId, fileId)
      .then(async (session) => {
        const module = await import('y-monaco')
        if (cancelled) {
          session.destroy()
          return
        }

        const yText = session.doc.getText('content')
        const binding = new module.MonacoBinding(
          yText,
          model,
          new Set([editor]),
        ) as MonacoBindingInstance
        bindingRef.current = binding
        sessionDestroyRef.current = session.destroy
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
      })

    return () => {
      cancelled = true

      remoteCursorEntriesRef.current.clear()
      clearRemoteCursorVisuals()

      if (sessionDestroyRef.current) {
        sessionDestroyRef.current()
        sessionDestroyRef.current = null
      }

      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
    }
  }, [
    bindingTargets.editor,
    bindingTargets.model,
    bindingTargets.monaco,
    clearRemoteCursorVisuals,
    collabClient,
    fileId,
    projectId,
  ])

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

  function onEditorMount(
    editor: MonacoEditorTypes.IStandaloneCodeEditor,
    monaco: Monaco,
  ) {
    setBindingTargets({
      editor,
      model: editor.getModel(),
      monaco,
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
