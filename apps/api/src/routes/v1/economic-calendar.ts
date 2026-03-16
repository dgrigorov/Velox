import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getForexFactoryCalendar, type FfEvent } from '../../services/forexfactory.js'
import { getFedInflation, getFedLabor } from '../../services/fed.js'
import { withCache, TTL } from '../../cache/index.js'
import { Errors, sendError } from '../../lib/errors.js'

// ─── Unified event type (matches @velox/core EconomicEvent) ──────────────────

interface EconomicEvent {
  id: string
  date: string
  country: string
  currency: string
  event: string
  importance: 'HIGH' | 'MEDIUM' | 'LOW'
  actual: number | null
  forecast: number | null
  previous: number | null
  unit: string
  source: string
}

// ─── Fed macro normalizers ────────────────────────────────────────────────────

function normaliseFedInflation(
  results: Awaited<ReturnType<typeof getFedInflation>>,
): EconomicEvent[] {
  const events: EconomicEvent[] = []
  for (const r of results) {
    if (r.cpi_year_over_year !== null) {
      events.push({
        id: `massive-${r.date}-cpi-yoy`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'CPI Year-over-Year',
        importance: 'HIGH',
        actual: r.cpi_year_over_year,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
    if (r.pce_core !== null) {
      events.push({
        id: `massive-${r.date}-pce-core`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Core PCE Price Index',
        importance: 'HIGH',
        actual: r.pce_core,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
  }
  return events
}

function normaliseFedLabor(
  results: Awaited<ReturnType<typeof getFedLabor>>,
): EconomicEvent[] {
  const events: EconomicEvent[] = []
  for (const r of results) {
    if (r.unemployment_rate !== null) {
      events.push({
        id: `massive-${r.date}-unemployment`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Unemployment Rate',
        importance: 'HIGH',
        actual: r.unemployment_rate,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
    if (r.job_openings !== null) {
      events.push({
        id: `massive-${r.date}-jolts`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Job Openings (JOLTS)',
        importance: 'MEDIUM',
        actual: r.job_openings,
        forecast: null,
        previous: null,
        unit: 'K',
        source: 'massive',
      })
    }
    if (r.avg_hourly_earnings !== null) {
      events.push({
        id: `massive-${r.date}-avg-hourly`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Average Hourly Earnings',
        importance: 'MEDIUM',
        actual: r.avg_hourly_earnings,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
  }
  return events
}

// ─── Query schema ─────────────────────────────────────────────────────────────

const querySchema = z.object({
  from:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  importance: z.enum(['HIGH', 'MEDIUM', 'LOW', 'ALL']).default('ALL'),
  countries:  z.string().optional(),
})

// ─── Route ────────────────────────────────────────────────────────────────────

const economicCalendarRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: z.infer<typeof querySchema> }>(
    '/economic-calendar',
    {
      schema: {
        description: 'Economic calendar events — ForexFactory + Massive.com Fed data',
        tags: ['Economic Calendar'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            from:       { type: 'string', description: 'Start date YYYY-MM-DD' },
            to:         { type: 'string', description: 'End date YYYY-MM-DD' },
            importance: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW', 'ALL'], default: 'ALL' },
            countries:  { type: 'string', description: 'Comma-separated country codes' },
          },
        },
      },
    },
    async (request, reply) => {
      const parse = querySchema.safeParse(request.query)
      if (!parse.success) return sendError(reply, Errors.internal('Invalid parameters'))

      const todayStr = new Date().toISOString().slice(0, 10)
      const addDays = (base: string, n: number) => {
        const d = new Date(base + 'T00:00:00Z')
        d.setUTCDate(d.getUTCDate() + n)
        return d.toISOString().slice(0, 10)
      }

      const from       = parse.data.from ?? todayStr
      const to         = parse.data.to   ?? addDays(todayStr, 6)
      const importance = parse.data.importance
      const countries  = parse.data.countries
        ? new Set(parse.data.countries.toUpperCase().split(',').map((c) => c.trim()))
        : null

      const cacheKey = `economic-calendar:${from}:${to}`

      const allEvents = await withCache<EconomicEvent[]>(cacheKey, TTL.economic_calendar, async () => {
        const [ffResult, inflationResult, laborResult] = await Promise.allSettled([
          getForexFactoryCalendar(from, to),
          getFedInflation(from),
          getFedLabor(from),
        ])

        const ffEvents: EconomicEvent[] = ffResult.status === 'fulfilled'
          ? (ffResult.value as FfEvent[])
          : []

        const inflationEvents = inflationResult.status === 'fulfilled'
          ? normaliseFedInflation(inflationResult.value)
          : []

        const laborEvents = laborResult.status === 'fulfilled'
          ? normaliseFedLabor(laborResult.value)
          : []

        const merged = [...ffEvents, ...inflationEvents, ...laborEvents]

        // Deduplicate by id
        const seen = new Set<string>()
        const unique = merged.filter((e) => {
          if (seen.has(e.id)) return false
          seen.add(e.id)
          return true
        })

        // Sort ascending by date
        unique.sort((a, b) => a.date.localeCompare(b.date))
        return unique
      })

      // Apply post-cache filters
      let filtered = allEvents
      if (importance !== 'ALL') filtered = filtered.filter((e) => e.importance === importance)
      if (countries !== null)   filtered = filtered.filter((e) => countries.has(e.country))

      return reply.send({ events: filtered, count: filtered.length, from, to })
    },
  )
}

export default economicCalendarRoutes
