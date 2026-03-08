import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Plan } from '../types/api.js'
import { Errors, sendError } from '../lib/errors.js'

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
  enterprise: 4,
}

/**
 * Returns a preHandler that blocks the request if the key's plan is below `required`.
 * Usage: { preHandler: requirePlan('pro') }
 */
export function requirePlan(required: Plan) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userPlan = request.velox?.plan ?? 'free'
    if (PLAN_RANK[userPlan] < PLAN_RANK[required]) {
      return sendError(reply, Errors.forbidden(userPlan, required))
    }
  }
}
