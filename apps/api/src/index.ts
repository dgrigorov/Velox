import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import staticFiles from '@fastify/static'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { createWsServer } from './ws/server.js'
import authPlugin from './plugins/auth.js'
import { redis } from './cache/index.js'
import { env } from './types/env.js'
import { startMarketBuzzJob } from './jobs/marketBuzz.js'

// Routes
import snapshotRoutes          from './routes/v1/snapshot.js'
import quoteRoutes             from './routes/v1/quote.js'
import barsRoutes              from './routes/v1/bars.js'
import earningsRoutes          from './routes/v1/earnings.js'
import marketBuzzRoutes        from './routes/v1/market-buzz.js'
import economicCalendarRoutes  from './routes/v1/economic-calendar.js'
import widgetRoutes            from './routes/widget.js'

const fastify = Fastify({
  logger: env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : true,
})

// ─── OpenAPI / SwaggerUI ──────────────────────────────────────────────────────

await fastify.register(swagger, {
  openapi: {
    openapi: '3.0.3',
    info: {
      title:   'Velox API',
      description: '**Velox** — unified financial data API with AI layer.',
      version: '1.0.0',
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
      { name: 'Market Buzz', description: 'AI-powered news sentiment' },
      { name: 'Market Data', description: 'Quotes, snapshots, OHLCV bars' },
      { name: 'Earnings',    description: 'Earnings history and transcripts' },
    ],
  },
})

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true, tryItOutEnabled: true },
})

// ─── Global plugins ───────────────────────────────────────────────────────────

await fastify.register(cors, {
  origin: true,
  allowedHeaders: ['Authorization', 'Content-Type'],
})

await fastify.register(helmet, {
  contentSecurityPolicy: false,
  frameguard: false,
  hsts: false,
})

await fastify.register(rateLimit, {
  redis,
  max:          100,
  timeWindow:   '1 minute',
  keyGenerator: (request) => request.headers['authorization'] ?? request.ip,
})

await fastify.register(authPlugin)

// ─── Static widget bundles ────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '../../../packages')

await fastify.register(staticFiles, {
  root: pkgRoot,
  prefix: '/static/',
  decorateReply: false,
})

// ─── Health ───────────────────────────────────────────────────────────────────

fastify.get('/health', {
  schema: { description: 'Health check', tags: ['System'] },
}, async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ─── V1 routes ────────────────────────────────────────────────────────────────

await fastify.register(snapshotRoutes,         { prefix: '/v1' })
await fastify.register(quoteRoutes,            { prefix: '/v1' })
await fastify.register(barsRoutes,             { prefix: '/v1' })
await fastify.register(earningsRoutes,         { prefix: '/v1' })
await fastify.register(marketBuzzRoutes,       { prefix: '/v1' })
await fastify.register(economicCalendarRoutes, { prefix: '/v1' })

// ─── Widget routes (public — key passed as query param) ───────────────────────

await fastify.register(widgetRoutes)

// ─── Start ────────────────────────────────────────────────────────────────────

await redis.connect()

const address = await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
fastify.log.info(`Velox API      → ${address}`)
fastify.log.info(`SwaggerUI docs → ${address}/docs`)
fastify.log.info(`Economic Calendar  → ${address}/v1/economic-calendar`)
fastify.log.info(`Market Buzz widget → ${address}/widget/market-buzz`)

createWsServer(fastify.server as unknown as Server)
fastify.log.info(`WebSocket → ws://0.0.0.0:${env.PORT}/stream`)

startMarketBuzzJob()
