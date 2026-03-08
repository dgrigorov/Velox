/**
 * Batch sentiment analysis via Claude.
 *
 * Sends up to 15 articles per Claude call to minimize API costs.
 * Each article result is cached in Redis for 24 hours by article ID.
 */

import Anthropic from '@anthropic-ai/sdk'
import { env } from '../types/env.js'
import { redis } from '../cache/index.js'
import type { RawArticle } from './news.js'
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
  sentimentScore: number          // -100 to +100
  sentimentSignal: 'bullish' | 'bearish' | 'neutral'
  mentionCount: number
  articles: Array<{
    id: string
    title: string
    url: string
    source: string
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

const SENTIMENT_SCORE: Record<ArticleSentiment['sentiment'], number> = {
  positive: 1,
  neutral:  0,
  negative: -1,
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
    // Match articles to this ticker (stocks: exact match; crypto: strip USD suffix)
    const tickerKey = item.assetClass === 'crypto'
      ? item.ticker.replace('USD', '')
      : item.ticker

    const itemArticles = tickerArticles.get(tickerKey) ?? []
    if (itemArticles.length === 0) continue

    // Compute sentiment score
    let scoreSum = 0
    const enrichedArticles = []

    for (const article of itemArticles.slice(0, 10)) {
      const s = sentimentMap.get(article.id) ?? { sentiment: 'neutral' as const, oneLiner: '' }
      scoreSum += SENTIMENT_SCORE[s.sentiment]
      enrichedArticles.push({
        id:          article.id,
        title:       article.title,
        url:         article.url,
        source:      article.source,
        publishedAt: article.publishedAt,
        sentiment:   s.sentiment,
        oneLiner:    s.oneLiner,
      })
    }

    // Normalize to -100…+100
    const rawScore     = itemArticles.length > 0 ? scoreSum / itemArticles.length : 0
    const sentimentScore = Math.round(rawScore * 100)

    results.push({
      ticker:         item.ticker,
      name:           item.name,
      assetClass:     item.assetClass,
      sentimentScore,
      sentimentSignal: signalFromScore(sentimentScore),
      mentionCount:   itemArticles.length,
      articles:       enrichedArticles,
      updatedAt:      now,
    })
  }

  // Sort by mention count descending (most talked about first)
  results.sort((a, b) => b.mentionCount - a.mentionCount)

  return results
}
