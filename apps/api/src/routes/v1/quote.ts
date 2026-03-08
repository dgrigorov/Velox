import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getQuote, getQuoteBulk, getGainers, getLosers, getMostActive } from '../../services/fmp.js'
import { withCache, TTL } from '../../cache/index.js'
import { Errors, sendError } from '../../lib/errors.js'

const tickerParam = z.object({ ticker: z.string().min(1).max(20).toUpperCase() })
const bulkQuery = z.object({
  tickers: z.string().transform((s) => s.split(',').map((t) => t.trim().toUpperCase())),
})

const quoteRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /v1/quote/:ticker
   * Real-time quote — price, change, volume, market cap.
   */
  fastify.get<{ Params: z.infer<typeof tickerParam> }>(
    '/quote/:ticker',
    async (request, reply) => {
      const parse = tickerParam.safeParse(request.params)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid ticker'))
      const { ticker } = parse.data

      const data = await withCache(
        `quote:${ticker}`,
        TTL.quote,
        () => getQuote(ticker),
      )
      if (!data) return sendError(reply, Errors.notFound(ticker))
      return reply.send(data)
    },
  )

  /**
   * GET /v1/quote/bulk?tickers=AAPL,MSFT,TSLA
   * Batch quotes — up to 500 tickers.
   */
  fastify.get<{ Querystring: { tickers: string } }>(
    '/quote/bulk',
    async (request, reply) => {
      const parse = bulkQuery.safeParse(request.query)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid tickers'))
      const { tickers } = parse.data

      const data = await withCache(
        `quote:bulk:${tickers.sort().join(',')}`,
        TTL.quote,
        () => getQuoteBulk(tickers),
      )
      return reply.send(data)
    },
  )

  /**
   * GET /v1/movers/gainers
   * Top gainers today.
   */
  fastify.get('/movers/gainers', async (_request, reply) => {
    const data = await withCache('movers:gainers', TTL.quote, getGainers)
    return reply.send(data)
  })

  /**
   * GET /v1/movers/losers
   * Top losers today.
   */
  fastify.get('/movers/losers', async (_request, reply) => {
    const data = await withCache('movers:losers', TTL.quote, getLosers)
    return reply.send(data)
  })

  /**
   * GET /v1/movers/active
   * Most active by volume today.
   */
  fastify.get('/movers/active', async (_request, reply) => {
    const data = await withCache('movers:active', TTL.quote, getMostActive)
    return reply.send(data)
  })
}

export default quoteRoutes
