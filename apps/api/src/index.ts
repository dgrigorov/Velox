import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { createWsServer } from './ws/server.js'
import authPlugin from './plugins/auth.js'
import { redis } from './cache/index.js'
import { env } from './types/env.js'
import { startMarketBuzzJob } from './jobs/marketBuzz.js'

// Routes
import snapshotRoutes   from './routes/v1/snapshot.js'
import quoteRoutes      from './routes/v1/quote.js'
import barsRoutes       from './routes/v1/bars.js'
import earningsRoutes   from './routes/v1/earnings.js'
import marketBuzzRoutes from './routes/v1/market-buzz.js'
import widgetRoutes     from './routes/widget.js'

const fastify = Fastify({
  logger: {
    transport: env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

// ─── OpenAPI / SwaggerUI ──────────────────────────────────────────────────────

await fastify.register(swagger, {
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'Velox API',
      description: `
**Velox** — unified financial data API with AI layer.

Combines FMP + massive.com data across stocks, crypto, forex, indices, options and futures.
Every endpoint supports \`?ai=true\` for Claude-powered enrichment.

## Authentication
All endpoints require a Bearer API key in the \`Authorization\` header:
\`\`\`
Authorization: Bearer vx_live_your_key_here
\`\`\`
      `.trim(),
      version: '1.0.0',
      contact: { name: 'Velox Support', email: 'support@veloxapi.com' },
    },
    servers: [
      { url: `http://localhost:${env.PORT}`, description: 'Local development' },
      { url: 'https://api.veloxapi.com',      description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API Key' },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Market Buzz',  description: 'AI-powered news sentiment for 60 instruments' },
      { name: 'Market Data',  description: 'Quotes, snapshots, OHLCV bars' },
      { name: 'Earnings',     description: 'Earnings history, transcripts, AI highlights' },
    ],
  },
})

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion:  'list',
    deepLinking:   true,
    tryItOutEnabled: true,
  },
  staticCSP: true,
})

// ─── Global plugins ───────────────────────────────────────────────────────────

await fastify.register(cors, {
  origin: true,
  // Allow widget iframes to be embedded anywhere
  allowedHeaders: ['Authorization', 'Content-Type'],
})

await fastify.register(helmet, {
  // Allow iframe embedding for widgets
  contentSecurityPolicy: false,
  frameguard: false,
})

await fastify.register(rateLimit, {
  redis,
  max:            100,
  timeWindow:     '1 minute',
  keyGenerator:   (request) => request.headers['authorization'] ?? request.ip,
})

await fastify.register(authPlugin)

// ─── Health ───────────────────────────────────────────────────────────────────

fastify.get('/health', {
  schema: {
    description: 'Health check',
    tags: ['System'],
    response: { 200: { type: 'object', properties: { status: { type: 'string' }, ts: { type: 'string' } } } },
  },
}, async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ─── V1 routes ────────────────────────────────────────────────────────────────

await fastify.register(snapshotRoutes,   { prefix: '/v1' })
await fastify.register(quoteRoutes,      { prefix: '/v1' })
await fastify.register(barsRoutes,       { prefix: '/v1' })
await fastify.register(earningsRoutes,   { prefix: '/v1' })
await fastify.register(marketBuzzRoutes, { prefix: '/v1' })

// ─── Widget routes (no auth required — key passed as query param) ─────────────

await fastify.register(widgetRoutes)

// ─── Start ────────────────────────────────────────────────────────────────────

await redis.connect()

const address = await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
fastify.log.info(`Velox API      → ${address}`)
fastify.log.info(`SwaggerUI docs → ${address}/docs`)
fastify.log.info(`Market Buzz widget → ${address}/widget/market-buzz`)

// WebSocket server (shares the same HTTP server)
createWsServer(fastify.server)
fastify.log.info(`WebSocket      → ws://0.0.0.0:${env.PORT}/stream`)

// Background jobs
startMarketBuzzJob()
