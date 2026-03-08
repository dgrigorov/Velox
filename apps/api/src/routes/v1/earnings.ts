import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getEarnings, getEarningsTranscript } from '../../services/fmp.js'
import { highlightTranscript } from '../../services/claude.js'
import { withCache, TTL } from '../../cache/index.js'
import { Errors, sendError } from '../../lib/errors.js'
import { requirePlan } from '../../plugins/plan-guard.js'

const paramsSchema = z.object({ ticker: z.string().min(1).max(20).toUpperCase() })
const querySchema  = z.object({
  limit: z.coerce.number().int().min(1).max(5).default(5),
  ai:    z.enum(['true', 'false']).optional(),
})
const transcriptParams = z.object({
  ticker:  z.string().min(1).max(20).toUpperCase(),
  quarter: z.coerce.number().int().min(1).max(4),
  year:    z.coerce.number().int().min(2000).max(2100),
})

const earningsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /v1/earnings/:ticker
   * Earnings history + upcoming. ?ai=true adds highlights (requires starter).
   */
  fastify.get<{
    Params:      z.infer<typeof paramsSchema>
    Querystring: z.infer<typeof querySchema>
  }>(
    '/earnings/:ticker',
    async (request, reply) => {
      const paramsParse = paramsSchema.safeParse(request.params)
      const queryParse  = querySchema.safeParse(request.query)
      if (!paramsParse.success || !queryParse.success) {
        return sendError(reply, Errors.internal('Invalid parameters'))
      }

      const { ticker } = paramsParse.data
      const { limit }  = queryParse.data

      const data = await withCache(
        `earnings:${ticker}:${limit}`,
        TTL.earnings,
        () => getEarnings(ticker, limit),
      )

      return reply.send({ ticker, results: data })
    },
  )

  /**
   * GET /v1/earnings/:ticker/:quarter/:year/transcript
   * Full earnings call transcript. Requires starter plan.
   */
  fastify.get<{ Params: z.infer<typeof transcriptParams> }>(
    '/earnings/:ticker/:quarter/:year/transcript',
    { preHandler: requirePlan('starter') },
    async (request, reply) => {
      const parse = transcriptParams.safeParse(request.params)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid parameters'))

      const { ticker, quarter, year } = parse.data

      const data = await withCache(
        `transcript:${ticker}:Q${quarter}:${year}`,
        TTL.earnings,
        () => getEarningsTranscript(ticker, quarter, year),
      )
      if (!data) return sendError(reply, Errors.notFound(`transcript for ${ticker} Q${quarter} ${year}`))
      return reply.send(data)
    },
  )

  /**
   * GET /v1/earnings/:ticker/:quarter/:year/highlights
   * AI-generated bullet highlights from the transcript. Requires pro plan.
   */
  fastify.get<{ Params: z.infer<typeof transcriptParams> }>(
    '/earnings/:ticker/:quarter/:year/highlights',
    { preHandler: requirePlan('pro') },
    async (request, reply) => {
      const parse = transcriptParams.safeParse(request.params)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid parameters'))

      const { ticker, quarter, year } = parse.data

      const transcript = await getEarningsTranscript(ticker, quarter, year)
      if (!transcript) {
        return sendError(reply, Errors.notFound(`transcript for ${ticker} Q${quarter} ${year}`))
      }

      const highlights = await highlightTranscript(ticker, quarter, year, transcript.content)
      return reply.send({ ticker, quarter, year, highlights })
    },
  )
}

export default earningsRoutes
