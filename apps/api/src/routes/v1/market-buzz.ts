import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getMarketBuzz } from '../../jobs/marketBuzz.js'
import { Errors, sendError } from '../../lib/errors.js'

const querySchema = z.object({
  signal:     z.enum(['bullish', 'bearish', 'neutral', 'all']).default('all'),
  assetClass: z.enum(['stock', 'crypto', 'all']).default('all'),
  limit:      z.coerce.number().int().min(1).max(100).default(50),
})

const tickerParamSchema = z.object({
  ticker: z.string().min(1).max(20).toUpperCase(),
})

const marketBuzzRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /v1/market-buzz
   *
   * Returns AI-powered news sentiment for all tracked instruments.
   * Results are cached — refreshed every 60 minutes in the background.
   *
   * @query signal      - Filter by sentiment signal: bullish | bearish | neutral | all
   * @query assetClass  - Filter by asset class: stock | crypto | all
   * @query limit       - Max instruments to return (default 50, max 100)
   */
  fastify.get<{ Querystring: z.infer<typeof querySchema> }>(
    '/market-buzz',
    {
      schema: {
        description: 'AI-powered news sentiment for tracked instruments (Market Buzz)',
        tags: ['Market Buzz'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            signal:     { type: 'string', enum: ['bullish', 'bearish', 'neutral', 'all'], default: 'all' },
            assetClass: { type: 'string', enum: ['stock', 'crypto', 'all'], default: 'all' },
            limit:      { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              updatedAt:   { type: 'string', nullable: true },
              fromCache:   { type: 'boolean' },
              totalCount:  { type: 'integer' },
              instruments: { type: 'array' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parse = querySchema.safeParse(request.query)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid parameters'))

      const { signal, assetClass, limit } = parse.data
      const { items, fromCache, updatedAt } = await getMarketBuzz()

      let filtered = items
      if (signal !== 'all')     filtered = filtered.filter((i) => i.sentimentSignal === signal)
      if (assetClass !== 'all') filtered = filtered.filter((i) => i.assetClass === assetClass)

      return reply.send({
        updatedAt,
        fromCache,
        totalCount:  filtered.length,
        instruments: filtered.slice(0, limit),
      })
    },
  )

  /**
   * GET /v1/market-buzz/:ticker
   *
   * Returns detailed sentiment data for a single instrument.
   * Includes all recent articles with individual sentiment scores.
   */
  fastify.get<{ Params: z.infer<typeof tickerParamSchema> }>(
    '/market-buzz/:ticker',
    {
      schema: {
        description: 'Detailed Market Buzz sentiment for a single instrument',
        tags: ['Market Buzz'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            ticker: { type: 'string', description: 'Instrument ticker (e.g. AAPL, BTCUSD)' },
          },
          required: ['ticker'],
        },
      },
    },
    async (request, reply) => {
      const parse = tickerParamSchema.safeParse(request.params)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid ticker'))

      const { ticker } = parse.data
      const { items, updatedAt } = await getMarketBuzz()

      const item = items.find((i) => i.ticker === ticker)
      if (!item) return sendError(reply, Errors.notFound(ticker))

      return reply.send({ updatedAt, ...item })
    },
  )

  /**
   * POST /v1/market-buzz/refresh
   *
   * Manually trigger a Market Buzz refresh (admin use).
   * Returns immediately — refresh runs in background.
   */
  fastify.post(
    '/market-buzz/refresh',
    {
      schema: {
        description: 'Manually trigger a Market Buzz data refresh',
        tags: ['Market Buzz'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const { refreshMarketBuzz } = await import('../../jobs/marketBuzz.js')
      void refreshMarketBuzz()
      return reply.status(202).send({ message: 'Refresh triggered' })
    },
  )
}

export default marketBuzzRoutes
