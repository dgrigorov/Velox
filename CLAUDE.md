# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev          # Start API (port 4000) + Demo (port 5173) concurrently
npm run dev:api      # Start only the Velox API
npm run dev:demo     # Start only the demo app
```

### Build & Type Check
```bash
npm run build        # Build packages/types, apps/api, Lit widget packages
npm run typecheck    # Type-check API + both widget packages
npm run lint         # ESLint across apps/ and packages/
```

### Per-package (run from repo root with `-w`)
```bash
npm run dev -w apps/api                        # API watch mode
npm run dev -w apps/demo                       # Demo Vite dev server
npm run build -w packages/economic-calendar   # Build Lit widget
npm run typecheck -w packages/economic-calendar
npx tsc --noEmit -p packages/economic-calendar/tsconfig.json  # Quick typecheck
```

Dev mode loads env from `../../.env` (repo root) via `--env-file` flag — no dotenv import needed at runtime.

## Architecture

### Monorepo Layout
```
/apps/api                  — Fastify 5.x API (all widget backends + Velox market data)
/apps/demo                 — Vite SPA sales demo for all widgets (port 5173)
/apps/portal               — Nuxt 3 scaffold (unused)
/packages/core             — Shared widget types, normalizers, API client, date/country utils
/packages/economic-calendar — Lit 3.x <economic-calendar> web component
/packages/market-buzz      — Lit 3.x <market-buzz> web component
/packages/types            — Velox API TypeScript types
```

### Lit Widget Packages

**Tech stack**: Lit 3.x + TypeScript + Vite 5.x (library mode). Each package outputs both an externalized build (Lit external) and standalone build (Lit bundled).

**TypeScript config**: Uses `"moduleResolution": "bundler"` + `"experimentalDecorators": true` + `"useDefineForClassFields": false` (required for Lit decorators). `noEmit: true` — Vite handles compilation. Path aliases point `@velox/core` → `../core/src/index.ts`.

**`packages/core`** is the shared foundation: `types.ts`, `normalizers.ts` (FMP + Massive raw → `EconomicEvent`), `api-client.ts` (`fetchEvents`, `fetchMarketBuzz`), `dates.ts`, `countries.ts`.

**Component attributes** follow the `api-url` / `api-key` pattern — components call `apps/api` endpoints directly. Dev key `vx_dev_demo` gives business-tier access without Unkey.

**`apps/demo`** uses `resolve.alias` in `vite.config.ts` to resolve workspace packages directly from source (no pre-build needed for dev).

### Velox API (`apps/api/src/`)

**Entry point**: `index.ts` registers global plugins (CORS, Helmet, rate-limit, auth, WebSocket) and mounts routes under `/v1`.

**Plugin execution order matters**:
1. `authPlugin` (Unkey) — validates Bearer token, attaches `request.velox: VeloxContext` (`{ keyId, ownerId, plan }`)
2. `planGuard` — per-route decorator enforcing minimum plan tier
3. Public bypass — routes prefixed `/widget/` and paths `/`, `/health`, `/docs` skip auth entirely

**Route organization**: All authenticated routes live under `src/routes/v1/`. The widget route (`src/routes/widget.ts`) is public and serves embeddable HTML directly.

**Caching strategy** (`src/cache/index.ts`):
- Redis (ioredis) with typed TTL constants
- Short TTLs: quotes/snapshots (15s), minute bars (60s)
- Long TTLs: AI summaries (86400s = 24h), article sentiment (86400s)
- Market Buzz snapshot: 300s cache, 75min TTL with stale-while-revalidate

**Background jobs** (`src/jobs/`): `marketBuzz.ts` refreshes sentiment every 60 minutes, fires immediately on startup (non-blocking).

**Sentiment pipeline** (`src/services/`):
1. `news.ts` aggregates articles from FMP API, 12 RSS feeds, 6 Reddit subreddits, Google News RSS — extracts tickers via `$TICKER` regex + company name aliases
2. `sentiment.ts` batches up to 15 articles per Claude Haiku call, caches per-article results, computes time-weighted score with 12h exponential decay half-life

**Universe** (`src/data/universe.ts`): 50 S&P 500 stocks + 10 crypto instruments. The `aliases` field on each instrument drives ticker extraction from article text.

**WebSocket** (`src/ws/server.ts`): Auth-required streaming at `/stream`. Client must send `{ action: "auth", key: "..." }` after connect. Plan-gated channels: Pro+ gets trades/quotes/bars, Business+ adds noi/luld. Upstream Massive.com wire-up is not yet implemented.

### Plan Tiers
`free → starter → pro → business → enterprise`

Apply via `planGuard` decorator on route options. Earnings transcript (Starter+), AI highlights (Pro+), WebSocket streaming (Pro+).

### Error Handling
Use `VeloxError` class from `src/errors.ts` with typed codes: `UNAUTHORIZED`, `PLAN_REQUIRED`, `NOT_FOUND`, `RATE_LIMITED`, `UPSTREAM_ERROR`, `INTERNAL_ERROR`.

### TypeScript Config
- Strict mode + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` — handle `T | undefined` carefully on array/object access
- Module system: `NodeNext` (use `.js` extensions in import paths even for `.ts` source files)
- Path alias: `@velox/types` → `packages/types/src/index.ts`

**Routes** now include `GET /v1/economic-calendar?from&to&importance&countries` — 5-min cache, merges FMP calendar + Massive.com Fed macro (inflation, labor). `apps/api/src/services/fed.ts` handles Massive Fed endpoints; `apps/api/src/services/fmp.ts` exports `FmpEventRaw` interface.

## Required Environment Variables

| Variable | Purpose |
|---|---|
| `FMP_API_KEY` | Financial Modeling Prep (quotes, earnings) |
| `ANTHROPIC_API_KEY` | Claude API for sentiment analysis |
| `UNKEY_ROOT_KEY` | API key validation |
| `REDIS_URL` | Redis connection (Upstash or self-hosted) |

Optional: `MASSIVE_API_KEY`, `MASSIVE_WS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PORT` (default 4000).

Copy `.env.example` → `.env` at repo root before running.

## API Reference

SwaggerUI available at `http://localhost:4000/docs` when running in dev.
