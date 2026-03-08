import type { FastifyReply } from 'fastify'

export class VeloxError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'VeloxError'
  }
}

export const Errors = {
  unauthorized: () =>
    new VeloxError(401, 'UNAUTHORIZED', 'Missing or invalid API key'),
  forbidden: (plan: string, required: string) =>
    new VeloxError(403, 'PLAN_REQUIRED', `This endpoint requires ${required} plan. Current plan: ${plan}`),
  notFound: (resource: string) =>
    new VeloxError(404, 'NOT_FOUND', `${resource} not found`),
  rateLimited: () =>
    new VeloxError(429, 'RATE_LIMITED', 'Rate limit exceeded. Check X-RateLimit-* headers.'),
  upstream: (source: string, status: number) =>
    new VeloxError(502, 'UPSTREAM_ERROR', `Upstream error from ${source}: HTTP ${status}`),
  internal: (msg = 'Internal server error') =>
    new VeloxError(500, 'INTERNAL_ERROR', msg),
} as const

export function sendError(reply: FastifyReply, err: VeloxError): void {
  void reply.status(err.statusCode).send({
    error: err.message,
    code: err.code,
    statusCode: err.statusCode,
  })
}
