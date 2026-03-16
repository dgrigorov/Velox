import { Redis } from 'ioredis'
import { env } from '../types/env.js'

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (err: Error) => {
  console.error('[redis] connection error:', err.message)
})

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key)
  if (!raw) return null
  return JSON.parse(raw) as T
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
}

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
  quote:              15,
  snapshot:           15,
  bars:               60,
  bars_daily:         3_600,
  tickers:            86_400,
  earnings:           3_600,
  news:               300,
  filings:            3_600,
  fundamentals:       3_600 * 12,
  technicals:         60,
  macro:              3_600,
  ai_summary:         86_400,
  economic_calendar:  300,
} as const
