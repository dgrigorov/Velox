/**
 * News aggregator — FMP, RSS, Reddit, Google News (per-ticker).
 *
 * Sources:
 *  1. FMP /v3/stock_news       — batched ticker-specific news (10/ticker)
 *  2. RSS feeds                — 12 financial news sources (global)
 *  3. Reddit JSON API          — 6 subreddits
 *  4. Google News RSS          — per-ticker keyword search, 100 results/ticker
 *
 * X.com / Nitter / StockTwits: blocked or down as of 2026.
 * Google News RSS is the best free replacement for per-ticker social coverage.
 */

import { createHash } from 'node:crypto'
import Parser from 'rss-parser'
import { UNIVERSE, TICKER_SET, ALIAS_TO_TICKER } from '../data/universe.js'
import { env } from '../types/env.js'

const rss = new Parser({ timeout: 8_000 })

// ─── Shared article shape ─────────────────────────────────────────────────────

export type ArticleSource = 'fmp' | 'rss' | 'reddit' | 'gnews'

export interface RawArticle {
  id: string
  url: string
  title: string
  text: string
  source: string
  sourceType: ArticleSource
  publishedAt: string  // ISO
  tickers: string[]
}

function articleId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

// ─── Ticker extraction ────────────────────────────────────────────────────────
//
// Two passes:
//  1. $TICKER or bare TICKER (2-6 uppercase letters) — e.g. AAPL, $NVDA
//  2. Company name / alias — case-insensitive, e.g. "Apple", "Nvidia", "bitcoin"

export function extractTickers(text: string): string[] {
  const found = new Set<string>()
  const lower = text.toLowerCase()

  // Pass 1: uppercase ticker symbols + $TICKER cashtags
  const tickerRe = /\$([A-Z]{2,6})|(?<![a-z])([A-Z]{2,6})(?![a-z])/g
  for (const match of text.matchAll(tickerRe)) {
    const t = match[1] ?? match[2]
    if (t && TICKER_SET.has(t)) found.add(t)
  }

  // Pass 2: company names / aliases → resolve to full ticker
  for (const [alias, ticker] of ALIAS_TO_TICKER) {
    if (lower.includes(alias)) found.add(ticker)
  }

  return [...found]
}

// ─── 1. FMP news ─────────────────────────────────────────────────────────────

const FMP_BASE = 'https://financialmodelingprep.com/api'

async function fetchFmpNews(): Promise<RawArticle[]> {
  const stockTickers = UNIVERSE
    .filter((u) => u.assetClass === 'stock')
    .map((u) => u.fmpNewsTicker)

  const batches: string[][] = []
  for (let i = 0; i < stockTickers.length; i += 25) {
    batches.push(stockTickers.slice(i, i + 25))
  }

  const articles: RawArticle[] = []

  for (const batch of batches) {
    try {
      const url = new URL(`${FMP_BASE}/v3/stock_news`)
      url.searchParams.set('apikey', env.FMP_API_KEY)
      url.searchParams.set('tickers', batch.join(','))
      url.searchParams.set('limit', '10')

      const res = await fetch(url.toString())
      if (!res.ok) continue

      const data = await res.json() as Array<{
        symbol: string; publishedDate: string
        title: string; text: string; url: string; site: string
      }>

      for (const item of data) {
        if (!item.url || !item.title) continue
        const combined = `${item.title} ${item.text ?? ''}`
        articles.push({
          id:          articleId(item.url),
          url:         item.url,
          title:       item.title,
          text:        (item.text ?? '').slice(0, 500),
          source:      item.site ?? 'FMP',
          sourceType:  'fmp',
          publishedAt: item.publishedDate ?? new Date().toISOString(),
          tickers:     [...new Set([item.symbol, ...extractTickers(combined)].filter(Boolean))],
        })
      }

      await new Promise((r) => setTimeout(r, 300))
    } catch { /* skip failed batch */ }
  }

  return articles
}

// ─── 2. RSS feeds ─────────────────────────────────────────────────────────────

const RSS_FEEDS = [
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch' },
  { url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/', source: 'MarketWatch' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?region=US&lang=en-US', source: 'Yahoo Finance' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters' },
  { url: 'https://feeds.reuters.com/reuters/technologyNews', source: 'Reuters Tech' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362', source: 'CNBC' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', source: 'CNBC Tech' },
  { url: 'https://seekingalpha.com/feed.xml', source: 'Seeking Alpha' },
  { url: 'https://www.investing.com/rss/news.rss', source: 'Investing.com' },
  { url: 'https://www.fool.com/feeds/index.aspx', source: 'Motley Fool' },
  { url: 'https://www.benzinga.com/feeds/news', source: 'Benzinga' },
  { url: 'https://www.ft.com/rss/home/us', source: 'Financial Times' },
]

async function fetchRssNews(): Promise<RawArticle[]> {
  const articles: RawArticle[] = []

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await rss.parseURL(url)
        for (const item of feed.items.slice(0, 20)) {
          const rawUrl = item.link ?? item.guid
          if (!rawUrl || !item.title) continue
          const itemUrl: string = rawUrl
          const text    = item.contentSnippet ?? item.summary ?? item.content ?? ''
          const tickers = extractTickers(`${item.title} ${text}`)
          if (tickers.length === 0) continue

          articles.push({
            id:          articleId(itemUrl),
            url:         itemUrl,
            title:       item.title,
            text:        text.slice(0, 500),
            source,
            sourceType:  'rss',
            publishedAt: item.isoDate ?? new Date().toISOString(),
            tickers,
          })
        }
      } catch { /* skip failed feed */ }
    }),
  )

  return articles
}

// ─── 3. Reddit ────────────────────────────────────────────────────────────────

const REDDIT_SUBS = ['wallstreetbets', 'stocks', 'investing', 'StockMarket', 'options', 'dividends']

async function fetchRedditNews(): Promise<RawArticle[]> {
  const articles: RawArticle[] = []

  await Promise.allSettled(
    REDDIT_SUBS.map(async (sub) => {
      try {
        const res = await fetch(
          `https://www.reddit.com/r/${sub}/hot.json?limit=30`,
          { headers: { 'User-Agent': 'Velox/1.0 (financial data aggregator)' } },
        )
        if (!res.ok) return

        const data = await res.json() as {
          data: { children: Array<{ data: { id: string; title: string; selftext: string; created_utc: number } }> }
        }

        for (const { data: post } of data.data.children) {
          const combined = `${post.title} ${post.selftext}`
          const tickers  = extractTickers(combined)
          if (tickers.length === 0) continue

          const postUrl = `https://reddit.com/r/${sub}/comments/${post.id}/`
          articles.push({
            id:          articleId(postUrl),
            url:         postUrl,
            title:       post.title,
            text:        post.selftext.slice(0, 500),
            source:      `Reddit r/${sub}`,
            sourceType:  'reddit',
            publishedAt: new Date(post.created_utc * 1000).toISOString(),
            tickers,
          })
        }
      } catch { /* skip */ }
    }),
  )

  return articles
}

// ─── 4. Google News RSS (per-ticker) ─────────────────────────────────────────
//
// Google News exposes a free, unauthenticated RSS feed for keyword searches.
// We query "{TICKER} stock" or "{NAME}" to get ticker-targeted articles.
// Up to 100 results per query, completely free, no rate limits documented.
// Fetched for top 25 tickers only (by Phase-1 mention count) to keep refresh
// time reasonable (~10-15s for 25 tickers with 400ms delay each).

const GNEWS_BASE = 'https://news.google.com/rss/search'

async function fetchGoogleNewsForTicker(ticker: string, name: string): Promise<RawArticle[]> {
  const isStock  = !ticker.endsWith('USD')
  // Stock: "AAPL stock"  |  Crypto: "Bitcoin" (name is more specific than ticker)
  const query    = isStock ? `${ticker} stock` : name
  const url      = `${GNEWS_BASE}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`

  try {
    const feed = await rss.parseURL(url)
    const articles: RawArticle[] = []

    for (const item of feed.items.slice(0, 30)) {
      const rawUrl = item.link ?? item.guid
      if (!rawUrl || !item.title) continue
      const itemUrl: string = rawUrl

      // Google News wraps URLs — use title-based dedup anyway via articleId
      articles.push({
        id:          articleId(item.title + ticker),  // title+ticker for stability
        url:         itemUrl,
        title:       item.title,
        text:        (item.contentSnippet ?? '').slice(0, 500),
        source:      'Google News',
        sourceType:  'gnews',
        publishedAt: item.isoDate ?? new Date().toISOString(),
        tickers:     [ticker],   // guaranteed relevant — it's a targeted search
      })
    }

    return articles
  } catch {
    return []
  }
}

async function fetchGoogleNews(topTickers: string[]): Promise<RawArticle[]> {
  const TOP_N   = 25
  const targets = topTickers.slice(0, TOP_N)
  const articles: RawArticle[] = []

  for (const ticker of targets) {
    const item = UNIVERSE.find(u => u.ticker === ticker)
    if (!item) continue

    const items = await fetchGoogleNewsForTicker(ticker, item.name)
    articles.push(...items)
    await new Promise((r) => setTimeout(r, 400))  // polite delay
  }

  return articles
}

// ─── Aggregate & deduplicate ──────────────────────────────────────────────────

export async function aggregateNews(): Promise<RawArticle[]> {
  // Phase 1: broad sources in parallel
  const [fmp, rssItems, reddit] = await Promise.all([
    fetchFmpNews(),
    fetchRssNews(),
    fetchRedditNews(),
  ])

  // Rank tickers by Phase-1 mention count to prioritise Google News queries
  const mentionCount = new Map<string, number>()
  for (const article of [...fmp, ...rssItems, ...reddit]) {
    for (const t of article.tickers) {
      mentionCount.set(t, (mentionCount.get(t) ?? 0) + 1)
    }
  }

  // Always include the full universe so every ticker appears in the bubble chart
  const universeOrder = UNIVERSE.map(u => u.ticker)
  const ranked = [
    ...universeOrder.filter(t => (mentionCount.get(t) ?? 0) > 0)
                    .sort((a, b) => (mentionCount.get(b) ?? 0) - (mentionCount.get(a) ?? 0)),
    ...universeOrder.filter(t => (mentionCount.get(t) ?? 0) === 0),
  ]

  // Phase 2: targeted Google News for top 25
  const gnews = await fetchGoogleNews(ranked)

  // Deduplicate by article id
  const seen = new Set<string>()
  const all: RawArticle[] = []
  for (const article of [...fmp, ...rssItems, ...reddit, ...gnews]) {
    if (!seen.has(article.id)) {
      seen.add(article.id)
      all.push(article)
    }
  }

  return all
}
