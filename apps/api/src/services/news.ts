/**
 * News aggregator — combines FMP, RSS feeds, and Reddit.
 *
 * Sources:
 *  1. FMP /v3/stock_news  — batched ticker-specific news
 *  2. RSS feeds           — MarketWatch, Yahoo Finance, Benzinga
 *  3. Reddit JSON API     — r/wallstreetbets, r/stocks (no auth required)
 */

import { createHash } from 'node:crypto'
import Parser from 'rss-parser'
import { UNIVERSE, TICKER_SET } from '../data/universe.js'
import { env } from '../types/env.js'

const rss = new Parser({ timeout: 8_000 })

// ─── Shared article shape ─────────────────────────────────────────────────────

export interface RawArticle {
  id: string          // SHA256(url).slice(0,16)
  url: string
  title: string
  text: string        // description / selftext (first 500 chars)
  source: string
  publishedAt: string // ISO
  tickers: string[]   // which universe tickers this article mentions
}

function articleId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16)
}

function extractTickers(text: string): string[] {
  // Match $TICKER or bare TICKER (2-6 uppercase letters) against our universe
  const found = new Set<string>()
  const matches = text.matchAll(/\b([A-Z]{2,6})\b/g)
  for (const [, t] of matches) {
    if (TICKER_SET.has(t)) found.add(t)
  }
  return [...found]
}

// ─── 1. FMP news (ticker-specific, batched) ───────────────────────────────────

const FMP_BASE = 'https://financialmodelingprep.com/api'

async function fetchFmpNews(): Promise<RawArticle[]> {
  // Separate stocks and crypto — FMP handles them differently
  const stockTickers = UNIVERSE
    .filter((u) => u.assetClass === 'stock')
    .map((u) => u.fmpNewsTicker)

  // Batch into groups of 25 to limit API calls
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
      url.searchParams.set('limit', '5')

      const res = await fetch(url.toString())
      if (!res.ok) continue

      const data = await res.json() as Array<{
        symbol: string
        publishedDate: string
        title: string
        text: string
        url: string
        site: string
      }>

      for (const item of data) {
        if (!item.url || !item.title) continue
        articles.push({
          id:          articleId(item.url),
          url:         item.url,
          title:       item.title,
          text:        (item.text ?? '').slice(0, 500),
          source:      item.site ?? 'FMP',
          publishedAt: item.publishedDate ?? new Date().toISOString(),
          tickers:     [item.symbol, ...extractTickers(item.title)].filter(Boolean),
        })
      }

      // Small delay between batches to respect rate limits
      await new Promise((r) => setTimeout(r, 300))
    } catch {
      // Non-fatal: skip failed batch
    }
  }

  return articles
}

// ─── 2. RSS feeds ─────────────────────────────────────────────────────────────

const RSS_FEEDS = [
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch' },
  { url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/', source: 'MarketWatch' },
  { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?region=US&lang=en-US', source: 'Yahoo Finance' },
  { url: 'https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best', source: 'Reuters' },
]

async function fetchRssNews(): Promise<RawArticle[]> {
  const articles: RawArticle[] = []

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await rss.parseURL(url)
        for (const item of feed.items.slice(0, 15)) {
          const itemUrl = item.link ?? item.guid
          if (!itemUrl || !item.title) continue

          const text = item.contentSnippet ?? item.summary ?? item.content ?? ''
          const combined = `${item.title} ${text}`
          const tickers = extractTickers(combined)

          if (tickers.length === 0) continue // Only include articles mentioning our universe

          articles.push({
            id:          articleId(itemUrl),
            url:         itemUrl,
            title:       item.title,
            text:        text.slice(0, 500),
            source,
            publishedAt: item.isoDate ?? new Date().toISOString(),
            tickers,
          })
        }
      } catch {
        // Non-fatal: skip failed feed
      }
    }),
  )

  return articles
}

// ─── 3. Reddit ────────────────────────────────────────────────────────────────

const REDDIT_SUBS = ['wallstreetbets', 'stocks', 'investing', 'StockMarket']

async function fetchRedditNews(): Promise<RawArticle[]> {
  const articles: RawArticle[] = []

  await Promise.allSettled(
    REDDIT_SUBS.map(async (sub) => {
      try {
        const res = await fetch(
          `https://www.reddit.com/r/${sub}/hot.json?limit=25`,
          { headers: { 'User-Agent': 'Velox/1.0 (financial data aggregator)' } },
        )
        if (!res.ok) return

        const data = await res.json() as {
          data: { children: Array<{ data: { id: string; title: string; selftext: string; url: string; created_utc: number } }> }
        }

        for (const { data: post } of data.data.children) {
          const combined = `${post.title} ${post.selftext}`
          const tickers = extractTickers(combined)
          if (tickers.length === 0) continue

          const postUrl = `https://reddit.com/r/${sub}/comments/${post.id}/`
          articles.push({
            id:          articleId(postUrl),
            url:         postUrl,
            title:       post.title,
            text:        post.selftext.slice(0, 500),
            source:      `Reddit r/${sub}`,
            publishedAt: new Date(post.created_utc * 1000).toISOString(),
            tickers,
          })
        }
      } catch {
        // Non-fatal
      }
    }),
  )

  return articles
}

// ─── Aggregate & deduplicate ──────────────────────────────────────────────────

export async function aggregateNews(): Promise<RawArticle[]> {
  const [fmp, rssItems, reddit] = await Promise.all([
    fetchFmpNews(),
    fetchRssNews(),
    fetchRedditNews(),
  ])

  // Deduplicate by article id
  const seen = new Set<string>()
  const all: RawArticle[] = []
  for (const article of [...fmp, ...rssItems, ...reddit]) {
    if (!seen.has(article.id)) {
      seen.add(article.id)
      all.push(article)
    }
  }

  return all
}
