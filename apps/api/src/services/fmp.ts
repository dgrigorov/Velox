/**
 * Financial Modeling Prep (FMP) API client
 *
 * Free plan: 250 req/day
 * Starter $19/mo: earnings transcripts + more
 */

import { env } from '../types/env.js'
import { Errors } from '../lib/errors.js'

const BASE_V3     = 'https://financialmodelingprep.com/api'
const BASE_STABLE = 'https://financialmodelingprep.com'

async function fmpFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const base = path.startsWith('/stable/') ? BASE_STABLE : BASE_V3
  const url = new URL(`${base}${path}`)
  url.searchParams.set('apikey', env.FMP_API_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString())
  if (!res.ok) throw Errors.upstream('fmp', res.status)

  const data = await res.json() as T & { 'Error Message'?: string }
  if (data?.['Error Message']) throw Errors.upstream('fmp', 400)
  return data
}

// ─── Quote ────────────────────────────────────────────────────────────────────

export interface FmpQuote {
  symbol: string
  name: string
  price: number
  open: number
  dayHigh: number
  dayLow: number
  previousClose: number
  change: number
  changesPercentage: number
  volume: number
  avgVolume: number
  marketCap: number
  pe: number | null
  eps: number | null
  earningsAnnouncement: string | null
  sharesOutstanding: number
  timestamp: number
}

export async function getQuote(ticker: string): Promise<FmpQuote | null> {
  const data = await fmpFetch<FmpQuote[]>(`/v3/quote/${encodeURIComponent(ticker)}`)
  return data[0] ?? null
}

export async function getQuoteBulk(tickers: string[]): Promise<FmpQuote[]> {
  return fmpFetch<FmpQuote[]>(`/v3/quote/${tickers.map(encodeURIComponent).join(',')}`)
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export interface FmpEarning {
  symbol: string
  date: string
  epsActual: number | null
  epsEstimated: number | null
  revenueActual: number | null
  revenueEstimated: number | null
}

export async function getEarnings(ticker: string, limit = 5): Promise<FmpEarning[]> {
  const data = await fmpFetch<FmpEarning[]>('/stable/earnings', {
    symbol: encodeURIComponent(ticker),
    limit: String(Math.min(limit, 5)), // free plan max 5
  })
  return Array.isArray(data) ? data : []
}

export async function getEarningsTranscript(
  ticker: string,
  quarter: number,
  year: number,
): Promise<{ symbol: string; quarter: number; year: number; date: string; content: string } | null> {
  type R = Array<{ symbol: string; quarter: number; year: number; date: string; content: string }>
  const data = await fmpFetch<R>('/stable/earning-call-transcript', {
    symbol: encodeURIComponent(ticker),
    quarter: String(quarter),
    year: String(year),
  })
  return Array.isArray(data) && data.length > 0 ? (data[0] ?? null) : null
}

// ─── Financials ───────────────────────────────────────────────────────────────

export async function getIncomeStatement(ticker: string, period: 'annual' | 'quarter' = 'annual', limit = 4) {
  return fmpFetch<unknown[]>(`/v3/income-statement/${encodeURIComponent(ticker)}`, {
    period,
    limit: String(limit),
  })
}

export async function getBalanceSheet(ticker: string, period: 'annual' | 'quarter' = 'annual', limit = 4) {
  return fmpFetch<unknown[]>(`/v3/balance-sheet-statement/${encodeURIComponent(ticker)}`, {
    period,
    limit: String(limit),
  })
}

export async function getCashFlow(ticker: string, period: 'annual' | 'quarter' = 'annual', limit = 4) {
  return fmpFetch<unknown[]>(`/v3/cash-flow-statement/${encodeURIComponent(ticker)}`, {
    period,
    limit: String(limit),
  })
}

// ─── Key metrics & ratios ─────────────────────────────────────────────────────

export async function getKeyMetrics(ticker: string, period: 'annual' | 'quarter' = 'annual', limit = 4) {
  return fmpFetch<unknown[]>(`/v3/key-metrics/${encodeURIComponent(ticker)}`, {
    period,
    limit: String(limit),
  })
}

export async function getRatios(ticker: string, period: 'annual' | 'quarter' = 'annual', limit = 4) {
  return fmpFetch<unknown[]>(`/v3/ratios/${encodeURIComponent(ticker)}`, {
    period,
    limit: String(limit),
  })
}

// ─── Analyst data ─────────────────────────────────────────────────────────────

export interface FmpPriceTarget {
  symbol: string
  publishedDate: string
  newsURL: string
  newsTitle: string
  analystName: string
  priceTarget: number
  adjPriceTarget: number
  priceWhenPosted: number
  newsPublisher: string
  newsBaseURL: string
  analystCompany: string
}

export async function getPriceTargets(ticker: string): Promise<FmpPriceTarget[]> {
  return fmpFetch<FmpPriceTarget[]>(`/v4/price-target?symbol=${encodeURIComponent(ticker)}`)
}

// ─── News ─────────────────────────────────────────────────────────────────────

export interface FmpNewsItem {
  symbol: string
  publishedDate: string
  title: string
  image: string
  site: string
  text: string
  url: string
}

export async function getStockNews(ticker: string, limit = 10): Promise<FmpNewsItem[]> {
  return fmpFetch<FmpNewsItem[]>(`/v3/stock_news`, {
    tickers: encodeURIComponent(ticker),
    limit: String(limit),
  })
}

// ─── Insider trading ─────────────────────────────────────────────────────────

export async function getInsiderTrading(ticker: string, limit = 20) {
  return fmpFetch<unknown[]>(`/v4/insider-trading?symbol=${encodeURIComponent(ticker)}&limit=${limit}`)
}

// ─── Movers ───────────────────────────────────────────────────────────────────

export async function getGainers() {
  return fmpFetch<FmpQuote[]>('/v3/stock_market/gainers')
}

export async function getLosers() {
  return fmpFetch<FmpQuote[]>('/v3/stock_market/losers')
}

export async function getMostActive() {
  return fmpFetch<FmpQuote[]>('/v3/stock_market/actives')
}

// ─── Macro / Economy ─────────────────────────────────────────────────────────

export async function getTreasuryRates() {
  return fmpFetch<unknown[]>('/v4/treasury')
}

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

export async function getEconomicCalendar(from: string, to: string): Promise<FmpEventRaw[]> {
  const data = await fmpFetch<FmpEventRaw[]>(`/v3/economic_calendar`, { from, to })
  return Array.isArray(data) ? data : []
}
