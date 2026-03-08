import Redis from 'ioredis'
import { env } from '../types/env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message)
})

// ─── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Get a cached value. Returns null on miss.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key)
  if (!raw) return null
  return JSON.parse(raw) as T
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
}

/**
 * Wrap an async function with caching.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key)
  if (cached !== null) return cached
  const result = await fn()
  await cacheSet(key, result, ttlSeconds)
  return result
}

// ─── TTL constants (seconds) ──────────────────────────────────────────────────

export const TTL = {
  quote:       15,          // 15s — real-time prices
  snapshot:    15,
  bars:        60,          // 1min bars
  bars_daily:  3_600,       // EOD bars — 1 hour
  tickers:     86_400,      // reference data — 24h
  earnings:    3_600,
  news:        300,         // 5min
  filings:     3_600,
  fundamentals: 3_600 * 12, // 12h
  technicals:  60,
  macro:       3_600,
  ai_summary:  86_400,      // AI summaries — 24h (expensive to regenerate)
} as const
