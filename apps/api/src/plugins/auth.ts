import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { Unkey } from '@unkey/api'
import { env } from '../types/env.js'
import { Errors, sendError } from '../lib/errors.js'
import type { Plan, VeloxContext } from '../types/api.js'

declare module 'fastify' {
  interface FastifyRequest {
    velox: VeloxContext
  }
}

const unkey = new Unkey({ rootKey: env.UNKEY_ROOT_KEY })

// Routes that skip auth entirely
const PUBLIC_PREFIXES = ['/', '/health', '/docs', '/openapi.json', '/widget/']

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Initialize with a placeholder — will be overwritten in the hook
  fastify.decorateRequest('velox', {
    getter() {
      return { keyId: '', ownerId: '', plan: 'free' as Plan }
    },
  })

  fastify.addHook('onRequest', async (request: FastifyRequest, reply) => {
    if (PUBLIC_PREFIXES.some((p) => request.url === p || request.url.startsWith(p))) return

    const header = request.headers['authorization']
    const apiKey = header?.startsWith('Bearer ') ? header.slice(7) : header

    if (!apiKey) return sendError(reply, Errors.unauthorized())

    // ── Dev keys: bypass Unkey for local development ──────────────────────────
    if (apiKey.startsWith('vx_dev_')) {
      request.velox = { keyId: 'dev', ownerId: 'dev', plan: 'business' }
      return
    }

    // ── Production: validate via Unkey ────────────────────────────────────────
    try {
      const res = await unkey.keys.verifyKey({ key: apiKey })

      if (!res.data.valid) return sendError(reply, Errors.unauthorized())

      request.velox = {
        keyId:   res.data.keyId   ?? apiKey,
        ownerId: res.data.identity?.externalId ?? 'unknown',
        plan:    (res.data.meta?.['plan'] as Plan | undefined) ?? 'free',
      }
    } catch {
      return sendError(reply, Errors.unauthorized())
    }
  })
}

export default fp(authPlugin, { name: 'velox-auth' })
