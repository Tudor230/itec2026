import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  CollabClient
  
  
  
  
  
} from '../lib/collab-client'
import type {CollabTerminalAccessDecisionPayload, CollabTerminalAccessRequestedPayload, CollabTerminalDescriptor, CollabTerminalOutputPayload, CollabTerminalStatePayload} from '../lib/collab-client';
import { auth0Config } from '../lib/auth0-config'

type AccessRequestStatus =
  | 'idle'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revoked'

interface UseCollabTerminalParams {
  projectId: string | null
}

const MAX_OUTPUT_LINES = 500

function appendOutput(
  previous: Record<string, CollabTerminalOutputPayload[]>,
  payload: CollabTerminalOutputPayload,
) {
  const current = previous[payload.ownerSubject] ?? []
  const next = [...current, payload]
  if (next.length > MAX_OUTPUT_LINES) {
    return {
      ...previous,
      [payload.ownerSubject]: next.slice(next.length - MAX_OUTPUT_LINES),
    }
  }

  return {
    ...previous,
    [payload.ownerSubject]: next,
  }
}

export function useCollabTerminal({ projectId }: UseCollabTerminalParams) {
  const { getAccessTokenSilently } = useAuth0()
  const watchDestroyRef = useRef<(() => void) | null>(null)

  const [connectionState, setConnectionState] = useState<
    'idle' | 'connecting' | 'synced' | 'disconnected' | 'error'
  >('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [currentSubject, setCurrentSubject] = useState<string | null>(null)
  const [terminals, setTerminals] = useState<CollabTerminalDescriptor[]>([])
  const [activeOwnerSubject, setActiveOwnerSubject] = useState<string | null>(
    null,
  )
  const [statesByOwner, setStatesByOwner] = useState<
    Record<string, CollabTerminalStatePayload>
  >({})
  const [outputsByOwner, setOutputsByOwner] = useState<
    Record<string, CollabTerminalOutputPayload[]>
  >({})
  const [requestStatusByOwner, setRequestStatusByOwner] = useState<
    Record<string, AccessRequestStatus>
  >({})

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
        setConnectionState(status.state)
        setMessage(status.message ?? null)
      },
    })
  }, [getAccessTokenSilently])

  const syncCurrentSubject = () => {
    const next = collabClient.getCurrentSubject()
    setCurrentSubject((previous) => (previous === next ? previous : next))
    return next
  }

  useEffect(() => {
    return () => {
      if (watchDestroyRef.current) {
        watchDestroyRef.current()
        watchDestroyRef.current = null
      }

      collabClient.disconnect()
    }
  }, [collabClient])

  useEffect(() => {
    if (watchDestroyRef.current) {
      watchDestroyRef.current()
      watchDestroyRef.current = null
    }

    setTerminals([])
    setStatesByOwner({})
    setOutputsByOwner({})
    setRequestStatusByOwner({})
    setActiveOwnerSubject(null)

    if (!projectId) {
      setConnectionState('idle')
      setMessage(null)
      return
    }

    let cancelled = false

    void collabClient
      .watchTerminals(projectId, {
        onTerminalList: (payload) => {
          if (cancelled) {
            return
          }

          syncCurrentSubject()
          const sorted = [...payload.terminals].sort((left, right) => {
            return left.ownerSubject.localeCompare(right.ownerSubject)
          })
          setTerminals(sorted)
          setActiveOwnerSubject((previous) => {
            if (
              previous &&
              sorted.some((candidate) => candidate.ownerSubject === previous)
            ) {
              return previous
            }

            const mine = sorted.find(
              (candidate) =>
                candidate.ownerSubject === collabClient.getCurrentSubject(),
            )
            if (mine) {
              return mine.ownerSubject
            }

            return sorted[0]?.ownerSubject ?? null
          })
        },
        onTerminalState: (payload) => {
          if (cancelled) {
            return
          }

          const subject = syncCurrentSubject()
          setStatesByOwner((previous) => {
            return {
              ...previous,
              [payload.ownerSubject]: payload,
            }
          })

          if (subject && payload.activeControllerSubject === subject) {
            setRequestStatusByOwner((previous) => {
              if (previous[payload.ownerSubject] === 'approved') {
                return previous
              }

              return {
                ...previous,
                [payload.ownerSubject]: 'approved',
              }
            })
          }
        },
        onTerminalOutput: (payload) => {
          if (cancelled) {
            return
          }

          setOutputsByOwner((previous) => appendOutput(previous, payload))
        },
        onTerminalAccessRequested: (
          payload: CollabTerminalAccessRequestedPayload,
        ) => {
          if (cancelled) {
            return
          }

          setStatesByOwner((previous) => {
            const existing = previous[payload.ownerSubject]
            if (!existing) {
              return previous
            }

            const alreadyExists = existing.pendingRequests.some((candidate) => {
              return candidate.requesterSubject === payload.requesterSubject
            })

            const pendingRequests = alreadyExists
              ? existing.pendingRequests
              : [
                  ...existing.pendingRequests,
                  {
                    requesterSubject: payload.requesterSubject,
                    requestedAt: payload.requestedAt,
                  },
                ]

            return {
              ...previous,
              [payload.ownerSubject]: {
                ...existing,
                pendingRequests,
              },
            }
          })
        },
        onTerminalAccessDecision: (
          payload: CollabTerminalAccessDecisionPayload,
        ) => {
          if (cancelled) {
            return
          }

          const subject = syncCurrentSubject()
          if (subject && payload.requesterSubject === subject) {
            setRequestStatusByOwner((previous) => {
              return {
                ...previous,
                [payload.ownerSubject]: payload.status,
              }
            })
          }
        },
        onError: (nextMessage) => {
          if (cancelled) {
            return
          }

          setMessage(nextMessage)
        },
      })
      .then((destroyWatch) => {
        if (cancelled) {
          destroyWatch()
          return
        }

        syncCurrentSubject()
        watchDestroyRef.current = destroyWatch
      })
      .catch(() => {
        watchDestroyRef.current = null
      })

    return () => {
      cancelled = true

      if (watchDestroyRef.current) {
        watchDestroyRef.current()
        watchDestroyRef.current = null
      }
    }
  }, [collabClient, projectId])

  useEffect(() => {
    if (!projectId || !activeOwnerSubject) {
      return
    }

    void collabClient.joinTerminal(projectId, activeOwnerSubject)

    return () => {
      void collabClient.leaveTerminal(projectId, activeOwnerSubject)
    }
  }, [activeOwnerSubject, collabClient, projectId])

  const activeTerminalState = activeOwnerSubject
    ? (statesByOwner[activeOwnerSubject] ?? null)
    : null
  const activeOutput = activeOwnerSubject
    ? (outputsByOwner[activeOwnerSubject] ?? [])
    : []
  const activeRequestStatus = activeOwnerSubject
    ? (requestStatusByOwner[activeOwnerSubject] ?? 'idle')
    : 'idle'
  const canWriteToActiveTerminal = Boolean(
    activeOwnerSubject &&
    currentSubject &&
    activeTerminalState &&
    (activeOwnerSubject === currentSubject ||
      activeTerminalState.activeControllerSubject === currentSubject),
  )

  useEffect(() => {
    if (
      !projectId ||
      !activeOwnerSubject ||
      !activeTerminalState ||
      !currentSubject
    ) {
      return
    }

    if (activeTerminalState.isSessionOpen) {
      return
    }

    if (!canWriteToActiveTerminal) {
      return
    }

    void collabClient.openTerminal(projectId, activeOwnerSubject, {
      cols: 120,
      rows: 36,
    })
  }, [
    activeOwnerSubject,
    activeTerminalState,
    canWriteToActiveTerminal,
    collabClient,
    projectId,
  ])

  return {
    connectionState,
    message,
    currentSubject,
    terminals,
    activeOwnerSubject,
    activeTerminalState,
    activeOutput,
    activeRequestStatus,
    setActiveOwnerSubject,
    clearActiveOutput: () => {
      if (!activeOwnerSubject) {
        return
      }

      setOutputsByOwner((previous) => {
        return {
          ...previous,
          [activeOwnerSubject]: [],
        }
      })
    },
    sendInput: (input: string) => {
      if (!projectId || !activeOwnerSubject) {
        return
      }

      void collabClient.sendTerminalInput(projectId, activeOwnerSubject, input)
    },
    resizeActiveTerminal: (cols: number, rows: number) => {
      if (!projectId || !activeOwnerSubject) {
        return
      }

      void collabClient.resizeTerminal(projectId, activeOwnerSubject, {
        cols,
        rows,
      })
    },
    openActiveTerminal: (cols: number, rows: number) => {
      if (!projectId || !activeOwnerSubject) {
        return
      }

      void collabClient.openTerminal(projectId, activeOwnerSubject, {
        cols,
        rows,
      })
    },
    requestAccess: () => {
      if (!projectId || !activeOwnerSubject) {
        return
      }

      setRequestStatusByOwner((previous) => {
        return {
          ...previous,
          [activeOwnerSubject]: 'pending',
        }
      })

      void collabClient.requestTerminalAccess(projectId, activeOwnerSubject)
    },
    decideAccess: (requesterSubject: string, approve: boolean) => {
      if (!projectId || !activeOwnerSubject) {
        return
      }

      void collabClient.decideTerminalAccess(
        projectId,
        activeOwnerSubject,
        requesterSubject,
        approve,
      )
    },
    revokeControl: () => {
      if (!projectId || !activeOwnerSubject) {
        return
      }

      void collabClient.revokeTerminalControl(projectId, activeOwnerSubject)
    },
  }
}
