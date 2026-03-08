/**
 * Market Buzz background job.
 *
 * - Full refresh every 60 minutes (configurable via MARKET_BUZZ_INTERVAL_MS env)
 * - Stale-while-revalidate: on cache miss → fetch sync; on stale → serve cache + refresh async
 * - Cache key: "market-buzz:snapshot" (TTL: 75 min — slightly longer than refresh interval)
 */

import { redis, cacheGet, cacheSet } from '../cache/index.js'
import { aggregateNews } from '../services/news.js'
import { buildMarketBuzz, type MarketBuzzItem } from '../services/sentiment.js'
import { UNIVERSE } from '../data/universe.js'

const CACHE_KEY      = 'market-buzz:snapshot'
const CACHE_TTL      = 75 * 60           // 75 min
const REFRESH_MS     = 60 * 60 * 1_000  // 60 min

let isRefreshing = false

// ─── Core refresh logic ───────────────────────────────────────────────────────

export async function refreshMarketBuzz(): Promise<MarketBuzzItem[]> {
  if (isRefreshing) {
    // Already in-flight — return cached (possibly stale) data
    const cached = await cacheGet<MarketBuzzItem[]>(CACHE_KEY)
    return cached ?? []
  }

  isRefreshing = true
  try {
    const articles = await aggregateNews()
    const items    = await buildMarketBuzz(UNIVERSE, articles)
    await cacheSet(CACHE_KEY, items, CACHE_TTL)
    return items
  } finally {
    isRefreshing = false
  }
}

// ─── Public: get snapshot (stale-while-revalidate) ───────────────────────────

export async function getMarketBuzz(): Promise<{
  items: MarketBuzzItem[]
  fromCache: boolean
  updatedAt: string | null
}> {
  const cached = await cacheGet<MarketBuzzItem[]>(CACHE_KEY)

  if (cached && cached.length > 0) {
    const updatedAt = cached[0]?.updatedAt ?? null

    // Trigger background revalidation if older than REFRESH_MS
    const age = updatedAt ? Date.now() - new Date(updatedAt).getTime() : Infinity
    if (age > REFRESH_MS) {
      void refreshMarketBuzz() // fire-and-forget
    }

    return { items: cached, fromCache: true, updatedAt }
  }

  // Cache empty — fetch synchronously (first load)
  const items = await refreshMarketBuzz()
  return { items, fromCache: false, updatedAt: items[0]?.updatedAt ?? null }
}

// ─── Background job ───────────────────────────────────────────────────────────

let jobTimer: ReturnType<typeof setInterval> | null = null

export function startMarketBuzzJob(): void {
  if (jobTimer) return // already running

  // Run once immediately on startup (non-blocking)
  void refreshMarketBuzz()

  jobTimer = setInterval(() => {
    void refreshMarketBuzz()
  }, REFRESH_MS)

  console.log(`[market-buzz] Background job started — refreshing every ${REFRESH_MS / 60_000} min`)
}

export function stopMarketBuzzJob(): void {
  if (jobTimer) {
    clearInterval(jobTimer)
    jobTimer = null
  }
}
