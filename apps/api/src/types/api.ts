// ─── Subscription plans ───────────────────────────────────────────────────────

export type Plan = 'free' | 'starter' | 'pro' | 'business' | 'enterprise'

export const PLAN_LIMITS: Record<Plan, { reqPerDay: number; reqPerMin: number }> = {
  free:       { reqPerDay:     250, reqPerMin:     5 },
  starter:    { reqPerDay:   3_000, reqPerMin:    30 },
  pro:        { reqPerDay:  30_000, reqPerMin:   150 },
  business:   { reqPerDay: 300_000, reqPerMin: 1_000 },
  enterprise: { reqPerDay: Infinity, reqPerMin: Infinity },
}

// ─── Authenticated request context ────────────────────────────────────────────

export interface VeloxContext {
  keyId: string
  ownerId: string
  plan: Plan
}

// ─── Unified snapshot shape ───────────────────────────────────────────────────

export interface Snapshot {
  ticker: string
  assetClass: 'stock' | 'crypto' | 'forex' | 'index' | 'option' | 'future'
  price: number
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  vwap: number | null
  prevClose: number | null
  change: number | null
  changePercent: number | null
  updatedAt: string // ISO
}

// ─── OHLCV bar ────────────────────────────────────────────────────────────────

export interface Bar {
  t: number  // Unix ms timestamp
  o: number  // open
  h: number  // high
  l: number  // low
  c: number  // close
  v: number  // volume
  vw?: number // VWAP
}

// ─── AI enrichment ────────────────────────────────────────────────────────────

export interface AiSummary {
  summary: string
  sentiment: 'positive' | 'negative' | 'neutral'
  impact: string
  cachedAt: string
}

// ─── Error response ───────────────────────────────────────────────────────────

export interface VeloxError {
  error: string
  code: string
  statusCode: number
}

// ─── WebSocket message types ──────────────────────────────────────────────────

export type WsChannel =
  | 'trades'
  | 'quotes'
  | 'aggs.minute'
  | 'aggs.second'
  | 'fmv'
  | 'noi'
  | 'luld'

export type WsAssetClass = 'stocks' | 'crypto' | 'forex' | 'indices' | 'options' | 'futures'

export interface WsSubscribeMessage {
  action: 'subscribe' | 'unsubscribe'
  channel: WsChannel
  assetClass: WsAssetClass
  tickers: string[]
}

export interface WsAuthMessage {
  action: 'auth'
  key: string
}

export type WsClientMessage = WsAuthMessage | WsSubscribeMessage
