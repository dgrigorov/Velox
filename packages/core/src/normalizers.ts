import type { EconomicEvent, Importance } from './types.js'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function mapImpact(impact: string): Importance {
  const u = impact.toUpperCase()
  if (u === 'HIGH') return 'HIGH'
  if (u === 'MEDIUM') return 'MEDIUM'
  return 'LOW'
}

// ─── FMP ──────────────────────────────────────────────────────────────────────

export interface FmpEventRaw {
  event: string
  date: string
  country: string
  actual: number | null
  previous: number | null
  estimate: number | null
  impact: string
  currency: string
  unit: string
}

export function normaliseFMP(raw: FmpEventRaw[]): EconomicEvent[] {
  return raw.map((r) => ({
    id: `fmp-${r.date.slice(0, 10)}-${slugify(r.event)}`,
    date: r.date,
    country: r.country ?? 'US',
    currency: r.currency ?? '',
    event: r.event,
    importance: mapImpact(r.impact ?? 'Low'),
    actual: r.actual ?? null,
    forecast: r.estimate ?? null,
    previous: r.previous ?? null,
    unit: r.unit ?? '',
    source: 'fmp' as const,
  }))
}

// ─── Massive.com — Inflation ──────────────────────────────────────────────────

export interface MassiveInflationRaw {
  date: string
  cpi_year_over_year?: number | null
  pce_core?: number | null
}

export function normaliseMassiveInflation(results: MassiveInflationRaw[]): EconomicEvent[] {
  const events: EconomicEvent[] = []
  for (const r of results) {
    if (r.cpi_year_over_year !== undefined) {
      events.push({
        id: `massive-${r.date}-cpi-yoy`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'CPI Year-over-Year',
        importance: 'HIGH',
        actual: r.cpi_year_over_year ?? null,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
    if (r.pce_core !== undefined) {
      events.push({
        id: `massive-${r.date}-pce-core`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Core PCE Price Index',
        importance: 'HIGH',
        actual: r.pce_core ?? null,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
  }
  return events
}

// ─── Massive.com — Labor Market ───────────────────────────────────────────────

export interface MassiveLaborRaw {
  date: string
  unemployment_rate?: number | null
  job_openings?: number | null
  avg_hourly_earnings?: number | null
}

export function normaliseMassiveLabor(results: MassiveLaborRaw[]): EconomicEvent[] {
  const events: EconomicEvent[] = []
  for (const r of results) {
    if (r.unemployment_rate !== undefined) {
      events.push({
        id: `massive-${r.date}-unemployment`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Unemployment Rate',
        importance: 'HIGH',
        actual: r.unemployment_rate ?? null,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
    if (r.job_openings !== undefined) {
      events.push({
        id: `massive-${r.date}-jolts`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Job Openings (JOLTS)',
        importance: 'MEDIUM',
        actual: r.job_openings ?? null,
        forecast: null,
        previous: null,
        unit: 'K',
        source: 'massive',
      })
    }
    if (r.avg_hourly_earnings !== undefined) {
      events.push({
        id: `massive-${r.date}-avg-hourly`,
        date: r.date,
        country: 'US',
        currency: 'USD',
        event: 'Average Hourly Earnings',
        importance: 'MEDIUM',
        actual: r.avg_hourly_earnings ?? null,
        forecast: null,
        previous: null,
        unit: '%',
        source: 'massive',
      })
    }
  }
  return events
}
