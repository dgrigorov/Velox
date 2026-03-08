/**
 * massive.com REST API client
 *
 * Identical interface to Polygon.io (same endpoint paths, same response shapes).
 * Base URL: https://api.massive.com  (verify on massive.com/docs)
 */

import { env } from '../types/env.js'
import { Errors } from '../lib/errors.js'

const BASE = 'https://api.massive.com'

async function massiveFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('apiKey', env.MASSIVE_API_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString())
  if (!res.ok) throw Errors.upstream('massive.com', res.status)
  return res.json() as Promise<T>
}

// ─── Bars (OHLCV) ─────────────────────────────────────────────────────────────

export interface MassiveBar {
  t: number; o: number; h: number; l: number; c: number; v: number; vw?: number
}

export interface MassiveBarsResponse {
  results: MassiveBar[]
  resultsCount: number
  ticker: string
  status: string
}

export async function getBars(
  ticker: string,
  multiplier: number,
  timespan: 'minute' | 'hour' | 'day' | 'week' | 'month',
  from: string,
  to: string,
  params: Record<string, string> = {},
): Promise<MassiveBarsResponse> {
  return massiveFetch<MassiveBarsResponse>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${from}/${to}`,
    { adjusted: 'true', sort: 'asc', limit: '5000', ...params },
  )
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export interface MassiveSnapshot {
  ticker: string
  day: { o: number; h: number; l: number; c: number; v: number; vw: number } | null
  prevDay: { c: number } | null
  lastTrade: { p: number; s: number; t: number } | null
  todaysChangePerc: number | null
  todaysChange: number | null
}

export async function getSnapshot(ticker: string): Promise<MassiveSnapshot | null> {
  // Use last 2 daily bars as snapshot (free plan workaround — same as DanioDashboard)
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const data = await getBars(ticker, 1, 'day', from, to, { limit: '2' })
  const bars = data.results ?? []
  if (!bars.length) return null

  const last = bars[bars.length - 1]!
  const prev = bars.length > 1 ? bars[bars.length - 2]! : null

  return {
    ticker,
    day: { o: last.o, h: last.h, l: last.l, c: last.c, v: last.v, vw: last.vw ?? last.c },
    prevDay: prev ? { c: prev.c } : null,
    lastTrade: { p: last.c, s: last.v, t: last.t },
    todaysChangePerc: prev ? ((last.c - prev.c) / prev.c) * 100 : null,
    todaysChange: prev ? last.c - prev.c : null,
  }
}

// ─── Tickers ─────────────────────────────────────────────────────────────────

export interface MassiveTicker {
  ticker: string
  name: string
  market: string
  locale: string
  primary_exchange: string
  type: string
  active: boolean
  currency_name: string
  description?: string
  homepage_url?: string
  list_date?: string
  market_cap?: number
  employees?: number
  sic_code?: string
  sic_description?: string
}

export async function getTicker(ticker: string): Promise<MassiveTicker | null> {
  type R = { results: MassiveTicker }
  const data = await massiveFetch<R>(`/v3/reference/tickers/${encodeURIComponent(ticker)}`)
  return data.results ?? null
}

// ─── Technical indicators ─────────────────────────────────────────────────────

export type IndicatorType = 'sma' | 'ema' | 'macd' | 'rsi'

export interface IndicatorResult {
  timestamp: number
  value: number
  histogram?: number
  signal?: number
}

export async function getIndicator(
  ticker: string,
  indicator: IndicatorType,
  params: Record<string, string> = {},
): Promise<IndicatorResult[]> {
  type R = { results: { values: IndicatorResult[] } }
  const data = await massiveFetch<R>(
    `/v1/indicators/${indicator}/${encodeURIComponent(ticker)}`,
    params,
  )
  return data.results?.values ?? []
}

// ─── News ─────────────────────────────────────────────────────────────────────

export interface MassiveNewsItem {
  id: string
  title: string
  author: string
  published_utc: string
  article_url: string
  tickers: string[]
  description?: string
  image_url?: string
  keywords?: string[]
  insights?: Array<{ ticker: string; sentiment: string; sentiment_reasoning: string }>
}

export async function getNews(
  ticker: string,
  limit = 10,
): Promise<MassiveNewsItem[]> {
  type R = { results: MassiveNewsItem[] }
  const data = await massiveFetch<R>('/v2/reference/news', {
    ticker,
    limit: String(limit),
    sort: 'published_utc',
    order: 'desc',
  })
  return data.results ?? []
}
