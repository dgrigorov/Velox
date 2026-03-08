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

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorateRequest('velox', null)

  fastify.addHook('onRequest', async (request: FastifyRequest, reply) => {
    // Skip health + docs
    const skip = ['/', '/health', '/docs', '/openapi.json']
    if (skip.some((p) => request.url.startsWith(p))) return

    const header = request.headers['authorization']
    const apiKey = header?.startsWith('Bearer ') ? header.slice(7) : header

    if (!apiKey) {
      return sendError(reply, Errors.unauthorized())
    }

    const { result, error } = await unkey.keys.verify({
      apiId: env.UNKEY_API_ID,
      key: apiKey,
    })

    if (error || !result?.valid) {
      return sendError(reply, Errors.unauthorized())
    }

    request.velox = {
      keyId: result.keyId,
      ownerId: result.ownerId ?? 'anonymous',
      plan: (result.meta?.['plan'] as Plan | undefined) ?? 'free',
    }
  })
}

export default fp(authPlugin, { name: 'velox-auth' })
