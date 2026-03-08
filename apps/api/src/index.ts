import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { createWsServer } from './ws/server.js'
import authPlugin from './plugins/auth.js'
import { redis } from './cache/index.js'
import { env } from './types/env.js'

// Routes
import snapshotRoutes from './routes/v1/snapshot.js'
import quoteRoutes    from './routes/v1/quote.js'
import barsRoutes     from './routes/v1/bars.js'
import earningsRoutes from './routes/v1/earnings.js'

const fastify = Fastify({
  logger: {
    transport: env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

// ─── Plugins ──────────────────────────────────────────────────────────────────

await fastify.register(cors, { origin: true })
await fastify.register(helmet)
await fastify.register(rateLimit, {
  redis,
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.headers['authorization'] ?? request.ip,
})
await fastify.register(authPlugin)

// ─── Health ───────────────────────────────────────────────────────────────────

fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ─── V1 routes ────────────────────────────────────────────────────────────────

await fastify.register(snapshotRoutes, { prefix: '/v1' })
await fastify.register(quoteRoutes,    { prefix: '/v1' })
await fastify.register(barsRoutes,     { prefix: '/v1' })
await fastify.register(earningsRoutes, { prefix: '/v1' })

// ─── Start ────────────────────────────────────────────────────────────────────

await redis.connect()

const address = await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
fastify.log.info(`Velox API listening at ${address}`)

// WebSocket server (shares the same HTTP server)
createWsServer(fastify.server)
fastify.log.info(`Velox WebSocket listening at ws://0.0.0.0:${env.PORT}/stream`)
