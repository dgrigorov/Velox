# Claude Code Prompt — fintech-widgets MVP

You are building **fintech-widgets** — a production-ready monorepo of embeddable financial market widgets built as Lit Web Components. The end goal is a product that can be sold to a CFD broker (ActivTrades) as a replacement for their existing Trading Central subscription.

---

## Business Context

ActivTrades currently pays significant annual licensing fees to Trading Central for widgets like Economic Calendar, Market Buzz, and Crowd Insight — embedded as iframes on their website. We are building functional equivalents using free-tier public APIs, delivered as Lit Web Components that can be dropped in as a 1:1 iframe replacement.

---

## Phase 1 — MVP: `<economic-calendar>` Web Component

Build a fully working MVP focused only on the Economic Calendar widget.

---

## Tech Stack (non-negotiable)

| Layer | Technology |
|---|---|
| Web Components | Lit 3.x |
| Language | TypeScript 5.x — strict mode |
| Build tool | Vite 5.x (library mode for widget, app mode for demo) |
| Monorepo | pnpm workspaces |
| API Gateway | Fastify 4.x (Node.js) |
| Cache | Redis |

---

## Monorepo Structure

```
fintech-widgets/
├── packages/
│   ├── core/                    # Shared types, normalizers, API client, date utils
│   └── economic-calendar/       # <economic-calendar> Lit Web Component
├── apps/
│   └── demo/                    # Vite SPA — demo page for the widget
├── services/
│   └── api-gateway/             # Fastify proxy + Redis cache (production use)
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Data Sources & API Keys

### Primary: Financial Modeling Prep (FMP)

- **API Key:** `5TgTXHCFlzDgwqvr7wFbUeP39kT0G8gm`
- **Endpoint:** `GET https://financialmodelingprep.com/stable/economic-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&apikey=KEY`
- **Returns:** `[{ event, date, country, actual, previous, estimate, impact, currency, unit }]`
- **`impact` values:** `"High"`, `"Medium"`, `"Low"`

### Secondary: Massive.com (Fed macro indicators)

- **API Key:** `VNzOMq2SJxttMkR9_jsjcG90_cBqT_gp`
- **Auth:** `Authorization: Bearer KEY` header
- **Endpoints:**
  - `GET https://massive.com/fed/v1/inflation?date.gte=YYYY-MM-DD&limit=10&sort=date.desc`
  - `GET https://massive.com/fed/v1/labor-market?date.gte=YYYY-MM-DD&limit=10&sort=date.desc`
  - `GET https://massive.com/fed/v1/treasury-yields?date.gte=YYYY-MM-DD&limit=10&sort=date.desc`
- **Returns:** `{ results: [...], status: "OK" }`

Both APIs are called from the browser directly in the MVP. The API gateway (Fastify) is for production use only — it proxies and caches to hide keys server-side.

---

## Package: `@fintech-widgets/core`

### Types — `src/types.ts`

```typescript
export type Importance = 'HIGH' | 'MEDIUM' | 'LOW';
export type DataSource = 'fmp' | 'massive';
export type Theme = 'dark' | 'light';

export interface EconomicEvent {
  id: string;           // "{source}-{date}-{slugifiedEvent}"
  date: string;         // ISO 8601 e.g. "2026-03-13T14:30:00"
  country: string;      // ISO 3166-1 alpha-2 e.g. "US"
  currency: string;     // e.g. "USD"
  event: string;        // Human-readable name
  importance: Importance;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  unit: string;         // e.g. "%" or "B" or "K"
  source: DataSource;
}

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export type FilterImportance = 'ALL' | Importance;
```

### Normalizers — `src/normalizers.ts`

- **`normaliseFMP(raw)`** → maps FMP response shape to `EconomicEvent`
- **`normaliseMassiveInflation(raw)`** → maps to `EconomicEvent[]`:
  - `cpi_year_over_year` → event `"CPI Year-over-Year"` (HIGH)
  - `pce_core` → event `"Core PCE Price Index"` (HIGH)
- **`normaliseMassiveLabor(raw)`** → maps to `EconomicEvent[]`:
  - `unemployment_rate` → event `"Unemployment Rate"` (HIGH)
  - `job_openings` → event `"Job Openings (JOLTS)"` (MEDIUM)
  - `avg_hourly_earnings` → event `"Average Hourly Earnings"` (MEDIUM)

### ApiClient — `src/api-client.ts`

- `fetchEvents(range: DateRange): Promise<EconomicEvent[]>`
- Calls FMP and Massive in parallel via `Promise.allSettled` — one failing must not break the other
- Deduplicates by `id`, sorts ascending by `date`
- Logs warnings to console if a source fails, never throws to the caller

### Date utils — `src/dates.ts`

Export: `today()`, `addDays(base, n)`, `dateKey(iso)`, `formatTime(iso)`, `formatDateHeader(dateStr)`, `isPast(dateStr)`, `isToday(dateStr)`

### Country metadata — `src/countries.ts`

Map of ~25 country codes → `{ flag: string, currency: string, name: string }` with `getCountryMeta(code)` helper. Include at minimum: US, GB, EU, DE, FR, JP, CN, CA, AU, CH, NZ, MX, IT, ES, SE, NO, DK, BR, IN, KR, SG, HK, ZA, PL, CZ.

---

## Package: `@fintech-widgets/economic-calendar`

A single `LitElement` class registered as `<economic-calendar>`.

### HTML Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `fmp-key` | string | `''` | FMP API key |
| `massive-key` | string | `''` | Massive.com API key |
| `theme` | `'dark' \| 'light'` | `'dark'` | Color theme |
| `lang` | string | `'en'` | Language (future i18n) |
| `default-from` | string | today | Start date YYYY-MM-DD |
| `default-to` | string | today+6 | End date YYYY-MM-DD |

### Reactive State (private)

```typescript
_events: EconomicEvent[]
_loading: boolean
_error: string | null
_filter: FilterImportance   // default 'ALL'
_fromDate: string
_toDate: string
_searchTerm: string
```

### UI Structure

```
<div class="calendar-root" data-theme="dark|light">
  <header>
    Logo icon + "Economic Calendar" title + event count + refresh button

  <div class="controls">
    Date range pickers (from / to inputs) + Apply button
    Importance filter buttons: ALL | HIGH | MEDIUM | LOW
    Search input (filters by event name or country code)

  <div class="table-wrap">
    <table class="events-table">
      <thead>
        Time | Country | Event | Impact | Actual | Forecast | Previous
      <tbody class="date-group">   (repeating per calendar day)
        <tr class="date-header-row">
          Full date label + "Past" badge if date < today + event count
        <tr class="event-row">     (repeating per event)
          One row per EconomicEvent

  <footer>
    "Data: FMP · Massive.com" | "Times in local timezone"
```

### Event Row Details

- **Time:** `HH:MM` formatted from ISO date in local timezone
- **Country:** emoji flag + country code (e.g. 🇺🇸 US)
- **Importance badge:** colored pill — `HIGH` red, `MEDIUM` amber, `LOW` cyan
- **Actual value:** green text if `actual > forecast`, red if `actual < forecast`, neutral otherwise
- **Units:** appended as small muted suffix after the number
- **Null values:** display `—` (em dash)

### Filtering Logic

- Importance buttons toggle `_filter` — only matching events shown
- Search filters by `event` name OR `country` code, case-insensitive, as user types
- Date range: two `<input type="date">` + Apply button triggers new `fetchEvents()` call

### Loading & Error States

| State | UI |
|---|---|
| Loading | Centered spinner animation |
| Error, zero results | Icon + error message + "Check API keys or try a different date range." + Retry button |
| Empty after filter | "No events match your filters." |
| No keys configured | "Configure your API keys to load live data." |

### CSS Theming via Custom Properties

**Dark theme:**

```css
--bg: #0a0c10;
--surface: #10141c;
--surface2: #161b26;
--border: #1e2535;
--border2: #252d40;
--text: #e2e8f0;
--text-muted: #4a5568;
--text-dim: #2d3748;
--accent: #3b82f6;
--accent-glow: rgba(59, 130, 246, 0.15);
--high: #ef4444;
--high-bg: rgba(239, 68, 68, 0.12);
--med: #f59e0b;
--med-bg: rgba(245, 158, 11, 0.12);
--low: #22d3ee;
--low-bg: rgba(34, 211, 238, 0.10);
--up: #10b981;
--down: #ef4444;
--row-hover: rgba(59, 130, 246, 0.06);
```

**Light theme:** implement appropriate light equivalents for all variables above.

**Typography:** `'DM Mono'` for times and numeric values, `'DM Sans'` for labels and headings, with system font fallbacks.

### Build Output

Vite library mode produces:

- `dist/economic-calendar.js` — ES module, Lit externalised (small, for use with import maps)
- `dist/economic-calendar.standalone.js` — ES module, Lit bundled (zero deps, for simple iframe embeds)

Guard registration: `if (!customElements.get('economic-calendar')) { customElements.define(...) }`

---

## App: `apps/demo`

Standard Vite + TypeScript SPA. No framework — vanilla HTML/JS.

### Requirements

- Imports `@fintech-widgets/economic-calendar` as a workspace module
- Renders `<economic-calendar>` filling the full viewport below a top bar
- **Top bar (sticky):** ActivTrades "AT" logo placeholder + widget name + dark/light theme toggle
- **Config panel (collapsible, bottom):** inputs for FMP key, Massive key, Apply button — so demo reviewers can enter their own keys without touching code
- Loads `DM Sans` and `DM Mono` from Google Fonts
- **Visually polished** — this is a sales demo, it must look professional

---

## Service: `services/api-gateway`

Fastify Node.js service for production use. Not required for the MVP demo to work, but must be present and functional.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/events` | Query params: `from`, `to`, `countries`, `importance`. Returns normalised `EconomicEvent[]` |
| `GET` | `/api/v1/health` | Returns `{ status: "ok", timestamp }` |

### Features

- Redis cache with **5-minute TTL** per `{from}-{to}-{countries}-{importance}` cache key
- API keys read from env vars `FMP_API_KEY` and `MASSIVE_API_KEY` — never exposed to clients
- CORS restricted to `ALLOWED_ORIGINS` env var (comma-separated)
- Rate limiting: **60 requests/min per IP**
- Structured JSON logging via Pino (built into Fastify)

### Docker

Include `Dockerfile` and `docker-compose.yml` that spin up:

- `api-gateway` service (Node.js)
- `redis` service (official `redis:7-alpine` image)

---

## Environment Variables

```bash
# .env.example

# Financial Modeling Prep
FMP_API_KEY=your_fmp_key_here

# Massive.com
MASSIVE_API_KEY=your_massive_key_here

# API Gateway
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
REDIS_URL=redis://localhost:6379
PORT=3000
```

---

## README.md

Must include:

1. Project overview and business context
2. Prerequisites: Node ≥ 20, pnpm ≥ 9
3. Quick start:
   ```bash
   pnpm install
   cp .env.example .env.local
   # fill in API keys
   pnpm dev
   ```
4. Embed snippet:
   ```html
   <script type="module" src="https://your-cdn.com/economic-calendar.standalone.js"></script>
   <economic-calendar fmp-key="YOUR_KEY" massive-key="YOUR_KEY" theme="dark"></economic-calendar>
   ```
5. All available HTML attributes (table)
6. How to run the API gateway with Docker
7. Roadmap: Market Pulse widget (Market Buzz equivalent), Sentiment Meter widget (Crowd Insight equivalent)

---

## Quality Requirements

- TypeScript strict mode — zero `any`, zero `@ts-ignore`
- All async operations use `try/catch` or `Promise.allSettled`
- One data source failing must never crash the widget — graceful degradation always
- No `alert()` anywhere; no `console.error` in production paths
- Widget works with zero configuration — shows helpful empty state
- All CSS lives inside Lit `static styles` — full Shadow DOM isolation
- `customElements.define` guarded against double-registration

---

## Definition of Done

- [ ] `pnpm install` completes with no errors
- [ ] `pnpm dev` launches the demo app at `http://localhost:5173`
- [ ] Demo app loads real economic calendar data from FMP and Massive APIs
- [ ] `pnpm build` produces artefacts in all `dist/` folders
- [ ] TypeScript compiles with zero errors (`pnpm typecheck`)
- [ ] Widget is embeddable as a standalone custom element in any HTML page
- [ ] Both dark and light themes render correctly
- [ ] Filters (importance + search + date range) work correctly
- [ ] API gateway starts with `docker-compose up` and `/api/v1/health` returns 200
