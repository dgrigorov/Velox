# Velox Widget Suite

Embeddable financial data widgets built as **Lit 3 Web Components** with a **Fastify 5** API backend.

| Widget | Description |
|---|---|
| `<economic-calendar>` | Economic events feed — ForexFactory + Fed macro data |
| `<market-buzz>` | AI-powered news sentiment with D3 force-directed bubble chart |

---

## Architecture

```
velox/
├── apps/
│   ├── api/          Fastify 5 API — data fetching, AI sentiment, caching
│   └── demo/         Vite dev app — live preview of both widgets
└── packages/
    ├── core/         Shared types, API client, date utils, market-hours
    ├── economic-calendar/  Lit component + Vite build
    └── market-buzz/        Lit component + D3 bubble chart + Vite build
```

**Data flow:** `api` fetches from ForexFactory, FMP, Reddit, 10+ news RSS feeds → Anthropic Claude for AI sentiment scoring → Redis cache → Lit widget via `fetch`.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 |
| Docker | any recent version (for Redis) |
| [FMP API key](https://site.financialmodelingprep.com/) | Free plan works for some endpoints |
| [Anthropic API key](https://console.anthropic.com/) | Required for AI sentiment |
| [Unkey root key](https://unkey.dev/) | Required for API key management |

---

## Quick Start

### 1. Clone & install

```bash
git clone <your-repo-url> velox
cd velox
npm install
```

### 2. Environment variables

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

`.env` contents:

```env
# Server
PORT=4000
NODE_ENV=development

# Financial Modeling Prep — https://site.financialmodelingprep.com/
FMP_API_KEY=your_fmp_key_here

# Anthropic — https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...

# Unkey — https://unkey.dev/
UNKEY_ROOT_KEY=unkey_...

# Redis (matches the Docker command below)
REDIS_URL=redis://localhost:6379

# Massive.com (optional — leave blank if you don't have a subscription)
MASSIVE_API_KEY=
MASSIVE_WS_URL=wss://socket.massive.com
```

> **Dev shortcut:** API keys that start with `vx_dev_` bypass Unkey validation and get `business` plan access. The demo is pre-configured with `vx_dev_demo`.

### 3. Start Redis

```bash
docker run -d --name velox-redis -p 6379:6379 redis:7-alpine
```

To start it again after a reboot:

```bash
docker start velox-redis
```

### 4. Run the development server

```bash
npm run dev
```

This starts both the API (port **4000**) and the demo app (port **5174**) concurrently.

| URL | Description |
|---|---|
| `http://localhost:5174` | Widget demo with live preview |
| `http://localhost:4000/docs` | Swagger UI — all API endpoints |
| `http://localhost:4000/health` | API health check |

The **Market Buzz** background job runs on first startup — it scrapes 10+ news sources and runs AI sentiment analysis. **The first run takes 2–5 minutes.** Subsequent runs use the Redis cache (5-minute TTL).

---

## Embedding as an iframe

Both widgets can be embedded in any web page as iframes. The API serves standalone HTML pages at:

| Endpoint | Widget |
|---|---|
| `GET /widget/market-buzz?key=YOUR_KEY&theme=dark` | Market Buzz bubble chart |
| `GET /widget/economic-calendar?key=YOUR_KEY&theme=dark` | Economic Calendar |

Query parameters:

| Param | Values | Default |
|---|---|---|
| `key` | Your Velox API key | — (required) |
| `theme` | `dark` \| `light` | `dark` |

### Basic iframe

```html
<iframe
  src="https://api.yourdomain.com/widget/market-buzz?key=YOUR_KEY&theme=dark"
  width="100%"
  height="600"
  frameborder="0"
  allowfullscreen="true"
></iframe>
```

### Vue component (dynamic token)

If your backend generates a signed URL or short-lived token, use this pattern (matches the existing TradingCentral integration style):

```vue
<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  height: { type: String, default: '600' },
  userId: { type: [Number, Boolean], default: false },
})

const link = ref(null)

onMounted(async () => {
  // Exchange your session for a Velox API key / signed URL
  const res = await fetch(`/api/velox-widget-token?userId=${props.userId}`)
  const data = await res.json()
  link.value = data.url   // e.g. "https://api.yourdomain.com/widget/market-buzz?key=vx_live_..."
})
</script>

<template>
  <iframe
    v-if="link"
    id="velox-market-buzz"
    :src="link"
    :class="`w-full h-[${height === '100%' ? height : height + 'px'}]`"
    allowfullscreen="true"
    frameborder="0"
    width="100%"
    :height="height"
  ></iframe>
</template>
```

### React component

```tsx
import { useEffect, useState } from 'react'

export function MarketBuzzWidget({ height = 600, apiKey }: { height?: number; apiKey: string }) {
  const src = `https://api.yourdomain.com/widget/market-buzz?key=${apiKey}&theme=dark`
  return (
    <iframe
      src={src}
      width="100%"
      height={height}
      frameBorder="0"
      allowFullScreen
      style={{ border: 'none', display: 'block' }}
    />
  )
}
```

### Using the Lit Web Component directly (no iframe)

If your site already runs a bundler, you can import the component directly:

```bash
npm install @velox/market-buzz @velox/economic-calendar
```

```html
<script type="module">
  import '@velox/market-buzz'
  import '@velox/economic-calendar'
</script>

<market-buzz
  api-url="https://api.yourdomain.com"
  api-key="YOUR_KEY"
  theme="dark"
  style="width:100%; height:600px; display:block"
></market-buzz>

<economic-calendar
  api-url="https://api.yourdomain.com"
  api-key="YOUR_KEY"
  theme="dark"
  style="width:100%; height:600px; display:block"
></economic-calendar>
```

Widget attributes:

| Attribute | Default | Description |
|---|---|---|
| `api-url` | `http://localhost:4000` | Velox API base URL |
| `api-key` | — | Your API key |
| `theme` | `dark` | `dark` or `light` |
| `limit` *(market-buzz only)* | `60` | Max instruments to show |

---

## Production Deployment

### API

```bash
npm run build -w apps/api
node apps/api/dist/index.js
```

Requires all `.env` variables to be set in the production environment. Redis must be reachable at `REDIS_URL`.

### Widgets (standalone bundles)

Build self-contained JS bundles for CDN hosting:

```bash
npm run build:standalone -w packages/market-buzz
npm run build:standalone -w packages/economic-calendar
```

Output goes to `packages/*/dist/`. Host these on a CDN and reference them via `<script type="module" src="...">`.

---

## API Key Management

Velox uses [Unkey](https://unkey.dev/) for API key issuance and validation.

- Keys starting with `vx_dev_` are development keys — they bypass Unkey and always get `business` plan access
- Production keys are validated against Unkey on every request
- Rate limit: 100 requests / minute per key (backed by Redis)

Create a key via the Unkey dashboard, then pass it as a `Bearer` token:

```
Authorization: Bearer vx_live_xxxxxxxxxxxxxxxx
```

---

## Useful Commands

```bash
# Start everything (API + demo)
npm run dev

# API only
npm run dev:api

# Demo only
npm run dev:demo

# Type-check all packages
npm run typecheck

# Build everything for production
npm run build

# Build standalone widget bundles
npm run build:standalone -w packages/market-buzz
npm run build:standalone -w packages/economic-calendar
```
