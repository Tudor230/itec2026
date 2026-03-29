import type { PrismaClient } from '@prisma/client'
import { createId } from '../projects/id.js'

export interface YjsHydratedState {
  snapshot: Uint8Array | null
  updates: Uint8Array[]
  lastSequence: number
}

export interface YjsTimelineEntry {
  sequence: number
  kind: 'snapshot' | 'update'
  createdAt: Date
}

export interface YjsRewindEdge {
  appliedSequence: number
  targetSequence: number
  previousHeadSequence: number
  createdAt: Date
}

function encodeBytes(value: Uint8Array) {
  return Buffer.from(value).toString('base64')
}

function decodeBytes(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

export class YjsHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listTimelineEntries(fileId: string, options?: { limit?: number; beforeSequence?: number }) {
    const limit = Math.max(1, Math.min(options?.limit ?? 100, 300))
    const beforeSequence = options?.beforeSequence

    const [snapshots, updates] = await Promise.all([
      this.prisma.yjsSnapshot.findMany({
        where: {
          fileId,
          sequence: beforeSequence ? { lte: beforeSequence } : undefined,
        },
        orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: {
          sequence: true,
          createdAt: true,
        },
      }),
      this.prisma.yjsUpdate.findMany({
        where: {
          fileId,
          sequence: beforeSequence ? { lte: beforeSequence } : undefined,
        },
        orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: {
          sequence: true,
          createdAt: true,
        },
      }),
    ])

    const entries: YjsTimelineEntry[] = [
      ...snapshots.map((entry) => ({
        sequence: entry.sequence,
        kind: 'snapshot' as const,
        createdAt: entry.createdAt,
      })),
      ...updates.map((entry) => ({
        sequence: entry.sequence,
        kind: 'update' as const,
        createdAt: entry.createdAt,
      })),
    ]

    entries.sort((left, right) => {
      if (left.sequence !== right.sequence) {
        return right.sequence - left.sequence
      }

      if (left.createdAt.getTime() !== right.createdAt.getTime()) {
        return right.createdAt.getTime() - left.createdAt.getTime()
      }

      if (left.kind === right.kind) {
        return 0
      }

      return left.kind === 'snapshot' ? -1 : 1
    })

    return entries.slice(0, limit)
  }

  async listRewindEdges(fileId: string, options?: { limit?: number; beforeAppliedSequence?: number }) {
    const limit = Math.max(1, Math.min(options?.limit ?? 100, 300))
    const beforeAppliedSequence = options?.beforeAppliedSequence

    const rows = await this.prisma.yjsRewind.findMany({
      where: {
        fileId,
        appliedSequence: beforeAppliedSequence ? { lte: beforeAppliedSequence } : undefined,
      },
      orderBy: [{ appliedSequence: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        appliedSequence: true,
        targetSequence: true,
        previousHeadSequence: true,
        createdAt: true,
      },
    })

    return rows.map((row) => ({
      appliedSequence: row.appliedSequence,
      targetSequence: row.targetSequence,
      previousHeadSequence: row.previousHeadSequence,
      createdAt: row.createdAt,
    }) satisfies YjsRewindEdge)
  }

  async getHydratedStateAtSequence(fileId: string, sequence: number): Promise<YjsHydratedState | null> {
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return null
    }

    const latestSnapshot = await this.prisma.yjsSnapshot.findFirst({
      where: {
        fileId,
        sequence: {
          lte: sequence,
        },
      },
      orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
      select: {
        sequence: true,
        updateBase64: true,
      },
    })

    const updates = await this.prisma.yjsUpdate.findMany({
      where: {
        fileId,
        sequence: {
          gt: latestSnapshot?.sequence ?? 0,
          lte: sequence,
        },
      },
      orderBy: {
        sequence: 'asc',
      },
      select: {
        sequence: true,
        updateBase64: true,
      },
    })

    const lastSequence = updates.length > 0
      ? updates[updates.length - 1].sequence
      : (latestSnapshot?.sequence ?? 0)

    if (!latestSnapshot && updates.length === 0) {
      return null
    }

    if (lastSequence !== sequence) {
      return null
    }

    if (updates.length > 0) {
      const firstExpectedSequence = (latestSnapshot?.sequence ?? 0) + 1
      if (updates[0].sequence !== firstExpectedSequence) {
        return null
      }

      for (let index = 1; index < updates.length; index += 1) {
        if (updates[index].sequence !== updates[index - 1].sequence + 1) {
          return null
        }
      }
    }

    return {
      snapshot: latestSnapshot ? decodeBytes(latestSnapshot.updateBase64) : null,
      updates: updates.map((entry) => decodeBytes(entry.updateBase64)),
      lastSequence,
    }
  }

  async getHeadSequence(fileId: string) {
    const [latestUpdate, latestSnapshot] = await Promise.all([
      this.prisma.yjsUpdate.findFirst({
        where: { fileId },
        orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
        select: { sequence: true },
      }),
      this.prisma.yjsSnapshot.findFirst({
        where: { fileId },
        orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
        select: { sequence: true },
      }),
    ])

    return Math.max(latestUpdate?.sequence ?? 0, latestSnapshot?.sequence ?? 0)
  }

  async hasSnapshotAtSequence(fileId: string, sequence: number) {
    if (!Number.isInteger(sequence) || sequence <= 0) {
      return false
    }

    const snapshot = await this.prisma.yjsSnapshot.findFirst({
      where: {
        fileId,
        sequence,
      },
      select: {
        id: true,
      },
    })

    return Boolean(snapshot)
  }

  async getHydratedState(fileId: string): Promise<YjsHydratedState | null> {
    const latestSnapshot = await this.prisma.yjsSnapshot.findFirst({
      where: { fileId },
      orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
      select: {
        sequence: true,
        updateBase64: true,
      },
    })

    const updates = await this.prisma.yjsUpdate.findMany({
      where: {
        fileId,
        sequence: {
          gt: latestSnapshot?.sequence ?? 0,
        },
      },
      orderBy: {
        sequence: 'asc',
      },
      select: {
        sequence: true,
        updateBase64: true,
      },
    })

    const lastSequence = updates.length > 0
      ? updates[updates.length - 1].sequence
      : (latestSnapshot?.sequence ?? 0)

    if (!latestSnapshot && updates.length === 0) {
      return null
    }

    if (updates.length > 0) {
      const firstExpectedSequence = (latestSnapshot?.sequence ?? 0) + 1
      if (updates[0].sequence !== firstExpectedSequence) {
        return null
      }

      for (let index = 1; index < updates.length; index += 1) {
        if (updates[index].sequence !== updates[index - 1].sequence + 1) {
          return null
        }
      }
    }

    return {
      snapshot: latestSnapshot ? decodeBytes(latestSnapshot.updateBase64) : null,
      updates: updates.map((entry) => decodeBytes(entry.updateBase64)),
      lastSequence,
    }
  }

  async appendUpdate(fileId: string, update: Uint8Array) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const persisted = await this.prisma.$transaction(async (tx) => {
          const aggregate = await tx.yjsAggregate.findUnique({
            where: { fileId },
            select: { nextSequence: true },
          })

          let sequence = 0
          if (aggregate) {
            const updatedAggregate = await tx.yjsAggregate.update({
              where: { fileId },
              data: {
                nextSequence: {
                  increment: 1,
                },
              },
              select: {
                nextSequence: true,
              },
            })

            sequence = updatedAggregate.nextSequence
          } else {
            const latestUpdate = await tx.yjsUpdate.findFirst({
              where: { fileId },
              orderBy: { sequence: 'desc' },
              select: { sequence: true },
            })
            const latestSnapshot = await tx.yjsSnapshot.findFirst({
              where: { fileId },
              orderBy: { sequence: 'desc' },
              select: { sequence: true },
            })
            const baseline = Math.max(latestUpdate?.sequence ?? 0, latestSnapshot?.sequence ?? 0)
            sequence = baseline + 1

            await tx.yjsAggregate.create({
              data: {
                fileId,
                nextSequence: sequence,
              },
            })
          }

          await tx.yjsUpdate.create({
            data: {
              id: createId(),
              fileId,
              sequence,
              updateBase64: encodeBytes(update),
            },
          })

          return {
            sequence,
          }
        })

        return persisted
      } catch (error) {
        const errorLike = error as { code?: string }
        if (errorLike.code === 'P2002' && attempt === 0) {
          continue
        }

        throw error
      }
    }

    throw new Error('Failed to persist Yjs update')
  }

  async saveSnapshot(fileId: string, sequence: number, update: Uint8Array) {
    await this.prisma.yjsSnapshot.create({
      data: {
        id: createId(),
        fileId,
        sequence,
        updateBase64: encodeBytes(update),
      },
    })
  }

  async saveRewind(
    fileId: string,
    appliedSequence: number,
    targetSequence: number,
    previousHeadSequence: number,
  ) {
    await this.prisma.yjsRewind.create({
      data: {
        id: createId(),
        fileId,
        appliedSequence,
        targetSequence,
        previousHeadSequence,
      },
    })
  }
}
