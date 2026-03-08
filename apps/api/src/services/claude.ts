/**
 * Anthropic Claude — AI enrichment layer
 *
 * Used when ?ai=true is passed on supported endpoints.
 * Results are cached in Redis for 24h to minimize API costs.
 */

import Anthropic from '@anthropic-ai/sdk'
import { env } from '../types/env.js'
import { withCache, TTL } from '../cache/index.js'
import type { AiSummary } from '../types/api.js'

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

// ─── Filing summary ───────────────────────────────────────────────────────────

export async function summarizeFiling(
  ticker: string,
  formType: string,
  filedAt: string,
  text: string,
): Promise<AiSummary> {
  const cacheKey = `ai:filing:${ticker}:${formType}:${filedAt}`
  return withCache<AiSummary>(cacheKey, TTL.ai_summary, async () => {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are a financial analyst. Summarize this SEC ${formType} filing for ${ticker}.

Respond in JSON with this exact shape:
{
  "summary": "2-3 sentence summary of what happened",
  "sentiment": "positive" | "negative" | "neutral",
  "impact": "1 sentence on the likely market impact"
}

Filing text:
${text.slice(0, 8000)}`,
        },
      ],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
    const parsed = JSON.parse(raw) as Omit<AiSummary, 'cachedAt'>
    return { ...parsed, cachedAt: new Date().toISOString() }
  })
}

// ─── Earnings transcript highlights ──────────────────────────────────────────

export async function highlightTranscript(
  ticker: string,
  quarter: number,
  year: number,
  transcript: string,
): Promise<string[]> {
  const cacheKey = `ai:transcript:${ticker}:Q${quarter}${year}`
  return withCache<string[]>(cacheKey, TTL.ai_summary, async () => {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are a financial analyst. Extract 4-5 key highlights from this earnings call transcript for ${ticker} Q${quarter} ${year}.

Return a JSON array of strings. Each string is one highlight bullet point (max 2 sentences each).

Transcript:
${transcript.slice(0, 8000)}`,
        },
      ],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '[]'
    return JSON.parse(raw) as string[]
  })
}

// ─── News sentiment ───────────────────────────────────────────────────────────

export async function enrichNewsSentiment(
  articleId: string,
  title: string,
  text: string,
): Promise<{ sentiment: 'positive' | 'negative' | 'neutral'; oneLiner: string }> {
  const cacheKey = `ai:news:${articleId}`
  return withCache(cacheKey, TTL.ai_summary, async () => {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Classify sentiment and write a 1-line summary of this financial news article.

Return JSON: { "sentiment": "positive"|"negative"|"neutral", "oneLiner": "..." }

Title: ${title}
Text: ${text.slice(0, 2000)}`,
        },
      ],
    })

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
    return JSON.parse(raw) as { sentiment: 'positive' | 'negative' | 'neutral'; oneLiner: string }
  })
}
