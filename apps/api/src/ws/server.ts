/**
 * WebSocket server — proxies massive.com streams to authenticated clients.
 *
 * Protocol:
 *  1. Client connects
 *  2. Client sends: { action: "auth", key: "vx_live_..." }
 *  3. Server validates key via Unkey, assigns plan
 *  4. Client subscribes: { action: "subscribe", channel: "trades", assetClass: "stocks", tickers: ["AAPL"] }
 *  5. Server forwards relevant events from massive.com upstream connection
 */

import WebSocket, { WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Server } from 'node:http'
import { Unkey } from '@unkey/api'
import { env } from '../types/env.js'
import type { Plan, WsClientMessage, WsChannel, WsAssetClass } from '../types/api.js'
import { PLAN_LIMITS } from '../types/api.js'

const unkey = new Unkey({ rootKey: env.UNKEY_ROOT_KEY })

// ─── Plan → allowed channels ──────────────────────────────────────────────────

const PLAN_CHANNELS: Record<Plan, Set<WsChannel>> = {
  free:       new Set(),
  starter:    new Set(),
  pro:        new Set(['trades', 'quotes', 'aggs.minute', 'aggs.second', 'fmv']),
  business:   new Set(['trades', 'quotes', 'aggs.minute', 'aggs.second', 'fmv', 'noi', 'luld']),
  enterprise: new Set(['trades', 'quotes', 'aggs.minute', 'aggs.second', 'fmv', 'noi', 'luld']),
}

// ─── Client state ─────────────────────────────────────────────────────────────

interface VeloxClient {
  ws: WebSocket
  authenticated: boolean
  plan: Plan
  keyId: string
  subscriptions: Map<string, Set<string>> // `${channel}:${assetClass}` → Set<ticker>
}

// ─── Upstream connections (one per asset class) ───────────────────────────────

const upstreams = new Map<WsAssetClass, WebSocket>()

function getUpstreamKey(channel: WsChannel, assetClass: WsAssetClass, ticker: string): string {
  // massive.com subscription prefix format (same as Polygon.io)
  const prefix = {
    'trades':      'T',
    'quotes':      'Q',
    'aggs.minute': 'AM',
    'aggs.second': 'A',
    'fmv':         'FMV',
    'noi':         'NOI',
    'luld':        'LULD',
  }[channel] ?? channel

  return `${prefix}.${ticker}`
}

// ─── WebSocket server factory ─────────────────────────────────────────────────

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/stream' })
  const clients = new Set<VeloxClient>()

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const client: VeloxClient = {
      ws,
      authenticated: false,
      plan: 'free',
      keyId: '',
      subscriptions: new Map(),
    }
    clients.add(client)

    send(ws, { type: 'connected', message: 'Velox WebSocket. Send { action: "auth", key: "..." } to authenticate.' })

    ws.on('message', (raw) => {
      void handleMessage(client, raw.toString())
    })

    ws.on('close', () => {
      clients.delete(client)
    })
  })

  return wss
}

// ─── Message handler ──────────────────────────────────────────────────────────

async function handleMessage(client: VeloxClient, raw: string): Promise<void> {
  let msg: WsClientMessage
  try {
    msg = JSON.parse(raw) as WsClientMessage
  } catch {
    send(client.ws, { type: 'error', message: 'Invalid JSON' })
    return
  }

  if (msg.action === 'auth') {
    await handleAuth(client, msg.key)
    return
  }

  if (!client.authenticated) {
    send(client.ws, { type: 'error', message: 'Not authenticated. Send auth first.' })
    return
  }

  if (msg.action === 'subscribe' || msg.action === 'unsubscribe') {
    handleSubscription(client, msg.action, msg.channel, msg.assetClass, msg.tickers)
  }
}

async function handleAuth(client: VeloxClient, key: string): Promise<void> {
  const res = await unkey.keys.verifyKey({ key }).catch(() => null)

  if (!res?.data.valid) {
    send(client.ws, { type: 'auth_error', message: 'Invalid API key' })
    client.ws.close(4001, 'Unauthorized')
    return
  }

  client.authenticated = true
  client.plan = (res.data.meta?.['plan'] as Plan | undefined) ?? 'free'
  client.keyId = res.data.keyId ?? key

  if (PLAN_LIMITS[client.plan].reqPerDay === 0 || client.plan === 'free' || client.plan === 'starter') {
    send(client.ws, { type: 'auth_error', message: `WebSocket requires Pro plan or higher. Current plan: ${client.plan}` })
    client.ws.close(4003, 'Upgrade required')
    return
  }

  send(client.ws, { type: 'auth_success', plan: client.plan })
}

function handleSubscription(
  client: VeloxClient,
  action: 'subscribe' | 'unsubscribe',
  channel: WsChannel,
  assetClass: WsAssetClass,
  tickers: string[],
): void {
  const allowedChannels = PLAN_CHANNELS[client.plan]
  if (!allowedChannels.has(channel)) {
    send(client.ws, {
      type: 'error',
      message: `Channel "${channel}" is not available on ${client.plan} plan`,
    })
    return
  }

  const key = `${channel}:${assetClass}`
  if (action === 'subscribe') {
    if (!client.subscriptions.has(key)) client.subscriptions.set(key, new Set())
    const sub = client.subscriptions.get(key)!
    for (const t of tickers) sub.add(t.toUpperCase())

    // TODO: ensure upstream connection for this assetClass is active
    send(client.ws, { type: 'subscribed', channel, assetClass, tickers })
  } else {
    const sub = client.subscriptions.get(key)
    if (sub) for (const t of tickers) sub.delete(t.toUpperCase())
    send(client.ws, { type: 'unsubscribed', channel, assetClass, tickers })
  }
}

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

// Suppress unused warning for now — will be wired up in upstream connection logic
void upstreams
void getUpstreamKey
