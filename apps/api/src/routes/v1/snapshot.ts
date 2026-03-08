import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getSnapshot } from '../../services/massive.js'
import { withCache, TTL } from '../../cache/index.js'
import { Errors, sendError } from '../../lib/errors.js'
import type { Snapshot } from '../../types/api.js'

const paramsSchema = z.object({ ticker: z.string().min(1).max(20).toUpperCase() })

const snapshotRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /v1/snapshot/:ticker
   * Latest price snapshot for any asset class.
   */
  fastify.get<{ Params: z.infer<typeof paramsSchema> }>(
    '/snapshot/:ticker',
    async (request, reply) => {
      const parse = paramsSchema.safeParse(request.params)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid ticker'))

      const { ticker } = parse.data

      const data = await withCache<Snapshot | null>(
        `snapshot:${ticker}`,
        TTL.snapshot,
        async () => {
          const raw = await getSnapshot(ticker)
          if (!raw) return null

          const day = raw.day
          const prev = raw.prevDay

          return {
            ticker,
            assetClass: 'stock',
            price: day?.c ?? raw.lastTrade?.p ?? 0,
            open:         day?.o ?? null,
            high:         day?.h ?? null,
            low:          day?.l ?? null,
            close:        day?.c ?? null,
            volume:       day?.v ?? null,
            vwap:         day?.vw ?? null,
            prevClose:    prev?.c ?? null,
            change:       raw.todaysChange,
            changePercent: raw.todaysChangePerc,
            updatedAt: new Date().toISOString(),
          } satisfies Snapshot
        },
      )

      if (!data) return sendError(reply, Errors.notFound(ticker))
      return reply.send(data)
    },
  )
}

export default snapshotRoutes
