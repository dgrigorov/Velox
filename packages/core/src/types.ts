// ─── Economic Calendar ────────────────────────────────────────────────────────

export type Importance = 'HIGH' | 'MEDIUM' | 'LOW'
export type DataSource = 'fmp' | 'massive' | 'forexfactory' | 'fed'
export type Theme = 'dark' | 'light'

export interface EconomicEvent {
  id: string
  date: string       // ISO 8601 UTC e.g. "2026-03-13T14:30:00.000Z"
  country: string    // ISO 3166-1 alpha-2 e.g. "US"
  currency: string   // e.g. "USD"
  event: string
  importance: Importance
  actual: number | null
  forecast: number | null
  previous: number | null
  unit: string
  source: DataSource
  isHoliday?: boolean
}

export interface DateRange {
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
}

export type FilterImportance = 'ALL' | Importance

// ─── Market Buzz ──────────────────────────────────────────────────────────────

export type SentimentSignal = 'bullish' | 'bearish' | 'neutral'
export type AssetClass = 'stock' | 'crypto'
export type FilterSignal = 'all' | SentimentSignal
export type FilterAssetClass = 'all' | AssetClass

export interface MarketBuzzArticle {
  id: string
  title: string
  url: string
  source: string
  sourceType: string
  publishedAt: string
  sentiment: 'positive' | 'negative' | 'neutral'
  oneLiner: string
}

export interface MarketBuzzItem {
  ticker: string
  name: string
  assetClass: AssetClass
  sentimentScore: number // -100..+100
  sentimentSignal: SentimentSignal
  mentionCount: number
  sources: {
    news: number
    social: number
    gnews: number
  }
  articles: MarketBuzzArticle[]
  updatedAt: string
}

// ─── API config ───────────────────────────────────────────────────────────────

export interface VeloxApiConfig {
  baseUrl: string
  apiKey: string
}
