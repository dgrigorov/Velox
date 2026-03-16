import type {
  DateRange,
  EconomicEvent,
  MarketBuzzItem,
  FilterSignal,
  FilterAssetClass,
  VeloxApiConfig,
} from './types.js'

// ─── Economic Calendar ────────────────────────────────────────────────────────

interface EventsResponse {
  events: EconomicEvent[]
  count: number
}

export async function fetchEvents(
  config: VeloxApiConfig,
  range: DateRange,
): Promise<EconomicEvent[]> {
  const params = new URLSearchParams({ from: range.from, to: range.to })
  const res = await fetch(`${config.baseUrl}/v1/economic-calendar?${params}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const data = (await res.json()) as EventsResponse
  return data.events
}

// ─── Market Buzz ──────────────────────────────────────────────────────────────

interface MarketBuzzResponse {
  updatedAt: string | null
  fromCache: boolean
  totalCount: number
  instruments: MarketBuzzItem[]
}

export async function fetchMarketBuzz(
  config: VeloxApiConfig,
  opts: {
    assetClass?: FilterAssetClass
    signal?: FilterSignal
    limit?: number
  } = {},
): Promise<{ instruments: MarketBuzzItem[]; updatedAt: string | null }> {
  const params = new URLSearchParams()
  if (opts.assetClass && opts.assetClass !== 'all') params.set('assetClass', opts.assetClass)
  if (opts.signal && opts.signal !== 'all') params.set('signal', opts.signal)
  if (opts.limit) params.set('limit', String(opts.limit))

  const res = await fetch(`${config.baseUrl}/v1/market-buzz?${params}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const data = (await res.json()) as MarketBuzzResponse
  return { instruments: data.instruments, updatedAt: data.updatedAt }
}
