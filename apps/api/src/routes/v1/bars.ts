import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getBars } from '../../services/massive.js'
import { withCache, TTL } from '../../cache/index.js'
import { Errors, sendError } from '../../lib/errors.js'

const paramsSchema = z.object({ ticker: z.string().min(1).max(20).toUpperCase() })

const querySchema = z.object({
  from:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  multiplier: z.coerce.number().int().min(1).max(1000).default(1),
  timespan:   z.enum(['minute', 'hour', 'day', 'week', 'month']).default('day'),
  limit:      z.coerce.number().int().min(1).max(50_000).default(365),
  adjusted:   z.enum(['true', 'false']).default('true'),
})

const barsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /v1/bars/:ticker
   * OHLCV bars — stocks, crypto, forex, indices.
   *
   * ?timespan=day&multiplier=1&from=2024-01-01&to=2024-12-31
   */
  fastify.get<{
    Params: z.infer<typeof paramsSchema>
    Querystring: z.infer<typeof querySchema>
  }>(
    '/bars/:ticker',
    async (request, reply) => {
      const paramsParse = paramsSchema.safeParse(request.params)
      const queryParse  = querySchema.safeParse(request.query)

      if (!paramsParse.success || !queryParse.success) {
        return sendError(reply, Errors.internal('Invalid parameters'))
      }

      const { ticker } = paramsParse.data
      const { from, to, multiplier, timespan, limit, adjusted } = queryParse.data

      const today = new Date().toISOString().slice(0, 10)
      const defaultFrom = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)

      const resolvedFrom = from ?? defaultFrom
      const resolvedTo   = to   ?? today

      const ttl = timespan === 'minute' ? TTL.bars : TTL.bars_daily
      const cacheKey = `bars:${ticker}:${multiplier}:${timespan}:${resolvedFrom}:${resolvedTo}`

      const data = await withCache(cacheKey, ttl, () =>
        getBars(ticker, multiplier, timespan, resolvedFrom, resolvedTo, {
          limit: String(limit),
          adjusted,
        }),
      )

      return reply.send({
        ticker,
        resultsCount: data.resultsCount,
        results: data.results,
      })
    },
  )
}

export default barsRoutes
