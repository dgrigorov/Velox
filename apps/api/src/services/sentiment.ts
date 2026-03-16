/**
 * Batch sentiment analysis via Claude.
 *
 * Sends up to 15 articles per Claude call to minimize API costs.
 * Each article result is cached in Redis for 24 hours by article ID.
 */

import Anthropic from '@anthropic-ai/sdk'
import { env } from '../types/env.js'
import { redis } from '../cache/index.js'
import type { RawArticle, ArticleSource } from './news.js'
import type { UniverseItem } from '../data/universe.js'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const MODEL = 'claude-haiku-4-5-20251001' // Haiku — cheapest, fast enough for batch sentiment

const CACHE_PREFIX = 'sentiment:article:'
const CACHE_TTL    = 86_400 // 24 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArticleSentiment {
  sentiment: 'positive' | 'neutral' | 'negative'
  oneLiner: string
}

export interface MarketBuzzItem {
  ticker: string
  name: string
  assetClass: 'stock' | 'crypto'
  sentimentScore: number          // -100 to +100 (time-weighted net ratio)
  sentimentSignal: 'bullish' | 'bearish' | 'neutral'
  mentionCount: number
  // Source breakdown for UI
  sources: {
    news: number     // FMP + RSS
    social: number   // Reddit
    gnews: number    // Google News (per-ticker)
  }
  articles: Array<{
    id: string
    title: string
    url: string
    source: string
    sourceType: ArticleSource
    publishedAt: string
    sentiment: 'positive' | 'neutral' | 'negative'
    oneLiner: string
  }>
  updatedAt: string
}

// ─── Article-level sentiment (batched, cached) ────────────────────────────────

async function getCachedSentiment(id: string): Promise<ArticleSentiment | null> {
  const raw = await redis.get(`${CACHE_PREFIX}${id}`)
  return raw ? (JSON.parse(raw) as ArticleSentiment) : null
}

async function setCachedSentiment(id: string, s: ArticleSentiment): Promise<void> {
  await redis.set(`${CACHE_PREFIX}${id}`, JSON.stringify(s), 'EX', CACHE_TTL)
}

async function batchAnalyze(articles: RawArticle[]): Promise<Map<string, ArticleSentiment>> {
  const results = new Map<string, ArticleSentiment>()

  // Check cache first
  const uncached: RawArticle[] = []
  for (const article of articles) {
    const cached = await getCachedSentiment(article.id)
    if (cached) {
      results.set(article.id, cached)
    } else {
      uncached.push(article)
    }
  }

  if (uncached.length === 0) return results

  // Process uncached in batches of 15
  const BATCH_SIZE = 15
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE)

    try {
      const prompt = `You are a financial news sentiment analyzer.

Analyze the sentiment of these ${batch.length} financial news headlines/articles.
For each, return: sentiment (positive/neutral/negative) and a 1-sentence plain-English summary.

Articles:
${batch.map((a, idx) => `[${idx + 1}] Title: "${a.title}"
Text: ${a.text.slice(0, 300) || '(no body)'}`).join('\n\n')}

Return ONLY a JSON array with ${batch.length} objects in the same order:
[{"sentiment":"positive|neutral|negative","oneLiner":"..."},...]`

      const message = await client.messages.create({
        model:      MODEL,
        max_tokens: 1024,
        messages:   [{ role: 'user', content: prompt }],
      })

      const raw = message.content[0]?.type === 'text' ? message.content[0].text : '[]'

      // Extract JSON array even if surrounded by prose
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue

      const parsed = JSON.parse(jsonMatch[0]) as ArticleSentiment[]

      for (let j = 0; j < batch.length; j++) {
        const article  = batch[j]!
        const result   = parsed[j]
        if (!article || !result?.sentiment) continue

        const s: ArticleSentiment = {
          sentiment: (['positive', 'neutral', 'negative'] as const).includes(result.sentiment)
            ? result.sentiment
            : 'neutral',
          oneLiner: result.oneLiner ?? '',
        }
        results.set(article.id, s)
        await setCachedSentiment(article.id, s)
      }
    } catch {
      // Non-fatal: articles in this batch get neutral fallback
      for (const article of batch) {
        if (!results.has(article.id)) {
          results.set(article.id, { sentiment: 'neutral', oneLiner: '' })
        }
      }
    }
  }

  return results
}

// ─── Score aggregation per ticker ────────────────────────────────────────────

/**
 * Time-weighted net sentiment — matches Trading Central's approach.
 *
 * Formula: (weightedPositive - weightedNegative) / (weightedPositive + weightedNegative) × 100
 *
 * - Neutral articles don't dilute the score (only pos/neg count in denominator)
 * - Exponential time decay: articles from 12h ago have half the weight of fresh ones
 * - Result: clean -100…+100 signal reflecting directional conviction
 */
const DECAY_HOURS = 12  // half-life for recency weighting

function computeScore(
  articles: RawArticle[],
  sentimentMap: Map<string, ArticleSentiment>,
): number {
  let weightedPos = 0
  let weightedNeg = 0

  for (const article of articles) {
    const ageHours = (Date.now() - new Date(article.publishedAt).getTime()) / 3_600_000
    const weight   = Math.exp(-ageHours / DECAY_HOURS)
    const s        = sentimentMap.get(article.id)?.sentiment ?? 'neutral'

    if (s === 'positive') weightedPos += weight
    if (s === 'negative') weightedNeg += weight
  }

  const denom = weightedPos + weightedNeg
  if (denom === 0) return 0
  return Math.round((weightedPos - weightedNeg) / denom * 100)
}

function signalFromScore(score: number): MarketBuzzItem['sentimentSignal'] {
  if (score >= 20) return 'bullish'
  if (score <= -20) return 'bearish'
  return 'neutral'
}

// ─── Public: build full Market Buzz snapshot ──────────────────────────────────

export async function buildMarketBuzz(
  universe: UniverseItem[],
  articles: RawArticle[],
): Promise<MarketBuzzItem[]> {
  // Analyze all articles in one pass
  const sentimentMap = await batchAnalyze(articles)

  // Group articles by ticker
  const tickerArticles = new Map<string, RawArticle[]>()
  for (const article of articles) {
    for (const ticker of article.tickers) {
      if (!tickerArticles.has(ticker)) tickerArticles.set(ticker, [])
      tickerArticles.get(ticker)!.push(article)
    }
  }

  const now = new Date().toISOString()
  const results: MarketBuzzItem[] = []

  for (const item of universe) {
    // Crypto tickers stored as BTCUSD but articles tagged as BTC; try both
    const primaryKey  = item.ticker
    const shortKey    = item.ticker.replace('USD', '')
    const itemArticles = [
      ...(tickerArticles.get(primaryKey) ?? []),
      ...(tickerArticles.get(shortKey)   ?? []),
    ].filter((a, i, arr) => arr.findIndex(b => b.id === a.id) === i)  // dedup

      // Source breakdown
    const sources = { news: 0, social: 0, gnews: 0 }
    for (const a of itemArticles) {
      if (a.sourceType === 'gnews')               sources.gnews++
      else if (a.sourceType === 'reddit')         sources.social++
      else                                        sources.news++
    }

    // Enrich with sentiment (max 15 per ticker shown in UI)
    const enrichedArticles = itemArticles.slice(0, 15).map((article) => {
      const s = sentimentMap.get(article.id) ?? { sentiment: 'neutral' as const, oneLiner: '' }
      return {
        id:          article.id,
        title:       article.title,
        url:         article.url,
        source:      article.source,
        sourceType:  article.sourceType,
        publishedAt: article.publishedAt,
        sentiment:   s.sentiment,
        oneLiner:    s.oneLiner,
      }
    })

    // Time-weighted net sentiment score
    const sentimentScore    = computeScore(itemArticles, sentimentMap)

    results.push({
      ticker:          item.ticker,
      name:            item.name,
      assetClass:      item.assetClass,
      sentimentScore,
      sentimentSignal: signalFromScore(sentimentScore),
      mentionCount:    itemArticles.length,
      sources,
      articles:        enrichedArticles,
      updatedAt:       now,
    })
  }

  // Sort: items with mentions first (by count desc), then zero-mention items
  results.sort((a, b) => b.mentionCount - a.mentionCount)

  return results
}
