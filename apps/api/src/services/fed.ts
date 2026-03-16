/**
 * Massive.com Federal Reserve macro data
 * Endpoints: /fed/v1/inflation, /fed/v1/labor-market, /fed/v1/treasury-yields
 */

import { env } from '../types/env.js'

const BASE = 'https://massive.com'

interface MassiveResponse<T> {
  results: T[]
  status: string
}

async function massiveFedFetch<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  if (!env.MASSIVE_API_KEY) return []

  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${env.MASSIVE_API_KEY}` },
    })
    if (!res.ok) return []
    const data = (await res.json()) as MassiveResponse<T>
    return data.results ?? []
  } catch {
    return []
  }
}

// ─── Inflation (CPI, PCE) ─────────────────────────────────────────────────────

export interface FedInflationResult {
  date: string
  cpi_year_over_year: number | null
  pce_core: number | null
}

export async function getFedInflation(from: string): Promise<FedInflationResult[]> {
  return massiveFedFetch<FedInflationResult>('/fed/v1/inflation', {
    'date.gte': from,
    limit: '10',
    sort: 'date.desc',
  })
}

// ─── Labor market ─────────────────────────────────────────────────────────────

export interface FedLaborResult {
  date: string
  unemployment_rate: number | null
  job_openings: number | null
  avg_hourly_earnings: number | null
}

export async function getFedLabor(from: string): Promise<FedLaborResult[]> {
  return massiveFedFetch<FedLaborResult>('/fed/v1/labor-market', {
    'date.gte': from,
    limit: '10',
    sort: 'date.desc',
  })
}

// ─── Treasury yields ──────────────────────────────────────────────────────────

export interface FedTreasuryResult {
  date: string
  yield_2y: number | null
  yield_10y: number | null
  yield_30y: number | null
}

export async function getFedTreasury(from: string): Promise<FedTreasuryResult[]> {
  return massiveFedFetch<FedTreasuryResult>('/fed/v1/treasury-yields', {
    'date.gte': from,
    limit: '10',
    sort: 'date.desc',
  })
}
