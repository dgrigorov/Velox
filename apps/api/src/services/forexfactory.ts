/**
 * ForexFactory Economic Calendar — free JSON feed (no API key required)
 * https://nfs.faireconomy.media/ff_calendar_thisweek.json
 * https://nfs.faireconomy.media/ff_calendar_nextweek.json
 */

// ─── Currency → ISO 3166-1 alpha-2 mapping ───────────────────────────────────

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', AUD: 'AU',
  CAD: 'CA', CHF: 'CH', NZD: 'NZ', CNY: 'CN', SEK: 'SE',
  NOK: 'NO', DKK: 'DK', SGD: 'SG', MXN: 'MX', BRL: 'BR',
  PLN: 'PL', CZK: 'CZ', ZAR: 'ZA', INR: 'IN', KRW: 'KR',
  HKD: 'HK', TWD: 'TW', HUF: 'HU', TRY: 'TR', RUB: 'RU',
  IDR: 'ID', MYR: 'MY', THB: 'TH', PHP: 'PH', ILS: 'IL',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FfRaw {
  title: string
  country: string  // currency code e.g. "USD", "EUR"
  date: string     // ISO-8601 with TZ offset e.g. "2026-03-07T13:30:00-0500"
  impact: string   // "High" | "Medium" | "Low" | "Holiday"
  forecast: string
  previous: string
  actual: string
}

export interface FfEvent {
  id: string
  date: string      // ISO-8601 UTC
  country: string   // ISO alpha-2
  currency: string  // original currency code
  event: string
  importance: 'HIGH' | 'MEDIUM' | 'LOW'
  actual: number | null
  forecast: number | null
  previous: number | null
  unit: string
  source: 'forexfactory'
  isHoliday?: boolean
}

// ─── Value parser ─────────────────────────────────────────────────────────────

function parseValue(raw: string): { value: number | null; unit: string } {
  if (!raw || raw.trim() === '') return { value: null, unit: '' }
  const s = raw.trim()
  // Handle percentage: "0.3%" or "-1.2%"
  const pct = s.match(/^(-?\d+\.?\d*)%$/)
  if (pct) return { value: parseFloat(pct[1] ?? '0'), unit: '%' }
  // Handle K/M/B suffix: "275K", "1.2M"
  const km = s.match(/^(-?\d+\.?\d*)([KMBTkmbt])$/)
  if (km) return { value: parseFloat(km[1] ?? '0'), unit: (km[2] ?? '').toUpperCase() }
  // Plain number
  const num = parseFloat(s)
  if (!isNaN(num)) return { value: num, unit: '' }
  return { value: null, unit: '' }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function mapImpact(impact: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const u = impact.toUpperCase()
  if (u === 'HIGH') return 'HIGH'
  if (u === 'MEDIUM') return 'MEDIUM'
  return 'LOW'
}

function normalise(raw: FfRaw[]): FfEvent[] {
  const events: FfEvent[] = []
  for (const r of raw) {
    if (r.impact.toUpperCase() === 'HOLIDAY') {
      const country = CURRENCY_TO_COUNTRY[r.country.toUpperCase()] ?? r.country
      events.push({
        id: `ff-${r.date.slice(0, 10)}-holiday-${slugify(r.title)}`,
        date: new Date(r.date).toISOString(),
        country,
        currency: r.country,
        event: r.title,
        importance: 'LOW',
        actual: null, forecast: null, previous: null,
        unit: '',
        source: 'forexfactory',
        isHoliday: true,
      })
      continue
    }
    const country = CURRENCY_TO_COUNTRY[r.country.toUpperCase()] ?? r.country
    const actual   = parseValue(r.actual)
    const forecast = parseValue(r.forecast)
    const previous = parseValue(r.previous)
    // Use the unit from whichever value is available
    const unit = actual.unit || forecast.unit || previous.unit
    events.push({
      id: `ff-${r.date.slice(0, 10)}-${slugify(r.title)}`,
      date: new Date(r.date).toISOString(),
      country,
      currency: r.country,
      event: r.title,
      importance: mapImpact(r.impact),
      actual: actual.value,
      forecast: forecast.value,
      previous: previous.value,
      unit,
      source: 'forexfactory',
    })
  }
  return events
}

async function fetchFfFeed(url: string): Promise<FfEvent[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = (await res.json()) as FfRaw[]
    return normalise(Array.isArray(data) ? data : [])
  } catch {
    return []
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const FF_THISWEEK = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const FF_NEXTWEEK = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'

/**
 * Fetch ForexFactory calendar for a given date range.
 * Fetches this week and/or next week depending on requested range.
 */
export async function getForexFactoryCalendar(from: string, to: string): Promise<FfEvent[]> {
  const fromDate = new Date(from + 'T00:00:00Z')
  const toDate   = new Date(to   + 'T23:59:59Z')

  const today = new Date()
  const dayOfWeek = today.getUTCDay() // 0=Sun, 1=Mon ... 6=Sat
  // Start of this week (Monday)
  const thisMonday = new Date(today)
  thisMonday.setUTCDate(today.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  thisMonday.setUTCHours(0, 0, 0, 0)
  // Start of next week
  const nextMonday = new Date(thisMonday)
  nextMonday.setUTCDate(thisMonday.getUTCDate() + 7)
  // End of next week (Sunday)
  const nextSunday = new Date(nextMonday)
  nextSunday.setUTCDate(nextMonday.getUTCDate() + 6)
  nextSunday.setUTCHours(23, 59, 59, 999)

  // Decide which feeds to fetch
  const fetches: Promise<FfEvent[]>[] = []
  if (fromDate < nextMonday) fetches.push(fetchFfFeed(FF_THISWEEK))
  if (toDate   >= nextMonday) fetches.push(fetchFfFeed(FF_NEXTWEEK))
  if (fetches.length === 0)   fetches.push(fetchFfFeed(FF_THISWEEK)) // fallback

  const results = await Promise.all(fetches)
  const all = results.flat()

  // Filter by requested date range
  return all.filter((e) => {
    const d = new Date(e.date)
    return d >= fromDate && d <= toDate
  })
}
