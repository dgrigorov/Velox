import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { fetchEvents, getCountryMeta, type EconomicEvent, type Theme } from '@velox/core'

// ── Constants ─────────────────────────────────────────────────────────────────

const SLIDER_LABELS = [
  'Recent & Next', 'Today', 'Tomorrow', 'This Week', 'Next Week', 'This Month', 'Next Month',
] as const

const G7 = new Set(['US', 'CA', 'GB', 'DE', 'FR', 'IT', 'JP'])
const EU  = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR',
  'DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
  'PL','PT','RO','SK','SI','ES','SE',
])
const ALL_CC = [
  'US','CA','GB','DE','FR','IT','JP','CN','AU','CH','NZ','MX','ES','SE','NO','DK',
  'BR','IN','KR','SG','HK','ZA','PL','CZ','AT','BE','BG','HR','CY','EE','FI','GR',
  'HU','IE','LV','LT','LU','MT','NL','PT','RO','SK','SI',
]

const TZONES: { iana: string; label: string }[] = [
  { iana: 'UTC',                    label: 'UTC' },
  { iana: 'Pacific/Honolulu',       label: 'Hawaii' },
  { iana: 'America/Anchorage',      label: 'Alaska' },
  { iana: 'America/Los_Angeles',    label: 'Los Angeles (PT)' },
  { iana: 'America/Denver',         label: 'Denver (MT)' },
  { iana: 'America/Chicago',        label: 'Chicago (CT)' },
  { iana: 'America/New_York',       label: 'New York (ET)' },
  { iana: 'America/Toronto',        label: 'Toronto' },
  { iana: 'America/Sao_Paulo',      label: 'São Paulo' },
  { iana: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { iana: 'Europe/London',          label: 'London (GMT/BST)' },
  { iana: 'Europe/Paris',           label: 'Paris / Berlin' },
  { iana: 'Europe/Rome',            label: 'Rome / Madrid' },
  { iana: 'Europe/Sofia',           label: 'Sofia / Athens' },
  { iana: 'Europe/Helsinki',        label: 'Helsinki / Tallinn' },
  { iana: 'Europe/Istanbul',        label: 'Istanbul' },
  { iana: 'Europe/Moscow',          label: 'Moscow' },
  { iana: 'Asia/Dubai',             label: 'Dubai (GST)' },
  { iana: 'Asia/Karachi',           label: 'Karachi (PKT)' },
  { iana: 'Asia/Kolkata',           label: 'Mumbai / Delhi (IST)' },
  { iana: 'Asia/Bangkok',           label: 'Bangkok / Jakarta' },
  { iana: 'Asia/Singapore',         label: 'Singapore / Hong Kong' },
  { iana: 'Asia/Shanghai',          label: 'Beijing / Shanghai' },
  { iana: 'Asia/Tokyo',             label: 'Tokyo (JST)' },
  { iana: 'Asia/Seoul',             label: 'Seoul (KST)' },
  { iana: 'Australia/Sydney',       label: 'Sydney (AEST)' },
  { iana: 'Pacific/Auckland',       label: 'Auckland (NZST)' },
]

const PAIRS: Record<string, string[]> = {
  USD: ['EUR/USD','GBP/USD','USD/JPY','USD/CAD','AUD/USD','USD/CHF','NZD/USD'],
  EUR: ['EUR/USD','EUR/GBP','EUR/JPY','EUR/CHF','EUR/AUD','EUR/CAD'],
  GBP: ['GBP/USD','EUR/GBP','GBP/JPY','GBP/CHF','GBP/AUD','GBP/CAD'],
  JPY: ['USD/JPY','EUR/JPY','GBP/JPY','AUD/JPY','NZD/JPY','CHF/JPY'],
  AUD: ['AUD/USD','EUR/AUD','GBP/AUD','AUD/JPY','AUD/NZD','AUD/CAD'],
  NZD: ['NZD/USD','EUR/NZD','GBP/NZD','AUD/NZD','NZD/JPY'],
  CAD: ['USD/CAD','EUR/CAD','GBP/CAD','AUD/CAD','CAD/JPY'],
  CHF: ['USD/CHF','EUR/CHF','GBP/CHF','CHF/JPY'],
}

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
const MON_SHORT   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const WEEKDAYS    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

type ModalTab = 'event-calendar' | 'price-chart' | 'volatility'

// ── Date helpers ─────────────────────────────────────────────────────────────

function pad2(n: number): string { return n.toString().padStart(2, '0') }

function todayISO(): string { return new Date().toISOString().slice(0, 10) }

function addDaysToISO(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function startOfWeek(dateStr: string): string {   // Sunday-first
  const d = new Date(dateStr + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=Sun
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

function endOfWeek(dateStr: string): string {
  return addDaysToISO(startOfWeek(dateStr), 6)
}

function startOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01'
}

function endOfMonth(dateStr: string): string {
  const [y, m] = dateStr.slice(0, 7).split('-').map(Number) as [number, number]
  const last = new Date(y, m, 0)  // day 0 of next month = last day of current
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`
}

function sliderRange(pos: number, customFrom: string, customTo: string): { from: string; to: string } {
  const t = todayISO()
  switch (pos) {
    case 0: return { from: addDaysToISO(t, -3), to: addDaysToISO(t, 3) }   // Recent & Next
    case 1: return { from: t, to: t }                                         // Today
    case 2: { const tm = addDaysToISO(t, 1); return { from: tm, to: tm } }   // Tomorrow
    case 3: return { from: startOfWeek(t), to: endOfWeek(t) }                // This Week
    case 4: { const nw = addDaysToISO(startOfWeek(t), 7); return { from: nw, to: endOfWeek(nw) } } // Next Week
    case 5: return { from: startOfMonth(t), to: endOfMonth(t) }              // This Month
    case 6: {                                                                  // Next Month
      const [y, mo] = t.slice(0, 7).split('-').map(Number) as [number, number]
      const next = mo === 12 ? `${y + 1}-01` : `${y}-${pad2(mo + 1)}`
      return { from: next + '-01', to: endOfMonth(next + '-01') }
    }
    default: return { from: customFrom, to: customTo }
  }
}

function getDateInTz(iso: string, tz: string): string {
  const p: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso))) p[part.type] = part.value
  return `${p['year'] ?? ''}-${p['month'] ?? ''}-${p['day'] ?? ''}`
}

function fmtTimeInTz(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso))
  } catch { return '—' }
}

function tzOffset(iana: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: iana, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    const raw = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT'
    const m = raw.match(/GMT([+-])(\d+)(?::(\d+))?/)
    if (!m) return 'UTC+00:00'
    const sign = m[1] ?? '+', h = pad2(parseInt(m[2] ?? '0')), min = pad2(parseInt(m[3] ?? '0'))
    return `UTC${sign}${h}:${min}`
  } catch { return 'UTC+00:00' }
}

function fmtDayHeader(dateStr: string): { date: string; weekday: string } {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = pad2(d.getUTCDate())
  const month = MON_SHORT[d.getUTCMonth()] ?? ''
  const year = d.getUTCFullYear()
  const weekday = WEEKDAYS[d.getUTCDay()] ?? ''
  return { date: `${day} ${month} ${year}`, weekday }
}

function getTodayInTz(tz: string): string {
  const p: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())) p[part.type] = part.value
  return `${p['year'] ?? ''}-${p['month'] ?? ''}-${p['day'] ?? ''}`
}

// ── Calendar grid ─────────────────────────────────────────────────────────────

interface CalCell { dateStr: string | null; inRange: boolean; isToday: boolean; isRangeStart: boolean; isRangeEnd: boolean }

function buildCalGrid(year: number, month: number, fromDate: string, toDate: string, todayStr: string): CalCell[][] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay  = new Date(Date.UTC(year, month, 0))
  const startDow = firstDay.getUTCDay()  // 0=Sun
  const totalDays = lastDay.getUTCDate()

  const cells: CalCell[] = []
  for (let i = 0; i < startDow; i++) cells.push({ dateStr: null, inRange: false, isToday: false, isRangeStart: false, isRangeEnd: false })
  for (let d = 1; d <= totalDays; d++) {
    const ds = `${year}-${pad2(month)}-${pad2(d)}`
    cells.push({
      dateStr: ds,
      inRange: ds >= fromDate && ds <= toDate,
      isToday: ds === todayStr,
      isRangeStart: ds === fromDate,
      isRangeEnd:   ds === toDate,
    })
  }
  while (cells.length % 7 !== 0) cells.push({ dateStr: null, inRange: false, isToday: false, isRangeStart: false, isRangeEnd: false })

  const rows: CalCell[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7) as CalCell[])
  return rows
}

// ── Calendar URLs & ICS ───────────────────────────────────────────────────────

function toCalDt(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
}

function googleCalUrl(e: EconomicEvent): string {
  const s = toCalDt(e.date)
  const end = toCalDt(new Date(new Date(e.date).getTime() + 3_600_000).toISOString())
  const title = encodeURIComponent(e.event)
  const desc  = encodeURIComponent(`${e.country} | Forecast: ${e.forecast ?? 'N/A'}${e.unit} | Prev: ${e.previous ?? 'N/A'}${e.unit}`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${s}/${end}&details=${desc}`
}

function outlookUrl(e: EconomicEvent): string {
  const s = e.date.slice(0, 19)
  const end = new Date(new Date(e.date).getTime() + 3_600_000).toISOString().slice(0, 19)
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(e.event)}&startdt=${s}&enddt=${end}&body=${encodeURIComponent(`Forecast: ${e.forecast ?? 'N/A'}${e.unit}`)}`
}

function icsContent(e: EconomicEvent): string {
  const s = toCalDt(e.date)
  const end = toCalDt(new Date(new Date(e.date).getTime() + 3_600_000).toISOString())
  const now = toCalDt(new Date().toISOString())
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Velox//Economic Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${e.id}@velox`,
    `DTSTAMP:${now}`, `DTSTART:${s}`, `DTEND:${end}`,
    `SUMMARY:${e.event}`,
    `DESCRIPTION:${e.country} · Forecast: ${e.forecast ?? 'N/A'}${e.unit} · Previous: ${e.previous ?? 'N/A'}${e.unit}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

function downloadIcs(e: EconomicEvent): void {
  const blob = new Blob([icsContent(e)], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${e.event.replace(/[^a-z0-9]/gi, '_')}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Mock chart data ────────────────────────────────────────────────────────────

function seededRand(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0xffffffff }
}

function mockHistory(e: EconomicEvent): { label: string; actual: number; forecast: number }[] {
  const base = Math.abs(e.actual ?? e.forecast ?? e.previous ?? 2.5) || 1
  let seed = 0
  for (let i = 0; i < e.id.length; i++) seed = seed * 31 + e.id.charCodeAt(i)
  const rand = seededRand(seed)
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const label = `${MON_SHORT[d.getMonth()] ?? ''} ${d.getFullYear().toString().slice(-2)}`
    const forecast = +(base + (rand() - 0.5) * base * 0.4).toFixed(2)
    const actual   = i === 5 && e.actual !== null ? e.actual : +(forecast + (rand() - 0.5) * base * 0.25).toFixed(2)
    return { label, actual, forecast }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

@customElement('economic-calendar')
export class EconomicCalendar extends LitElement {
  @property({ attribute: 'api-url' }) apiUrl  = 'http://localhost:4000'
  @property({ attribute: 'api-key' }) apiKey  = ''
  @property() theme: Theme = 'dark'

  // ── Data state ──────────────────────────────────────────────────────────────
  @state() private _events: EconomicEvent[]  = []
  @state() private _loading = false
  @state() private _error: string | null = null

  // ── Date range ──────────────────────────────────────────────────────────────
  @state() private _sliderPos = 0  // 0 = Recent & Next (default)
  @state() private _fromDate  = addDaysToISO(todayISO(), -3)
  @state() private _toDate    = addDaysToISO(todayISO(), 3)
  @state() private _customFrom = todayISO()
  @state() private _customTo   = addDaysToISO(todayISO(), 13)

  // ── Mini calendar ───────────────────────────────────────────────────────────
  @state() private _calYear  = new Date().getFullYear()
  @state() private _calMonth = new Date().getMonth() + 1  // 1–12

  // ── Timezone ────────────────────────────────────────────────────────────────
  @state() private _tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  // ── Filters ─────────────────────────────────────────────────────────────────
  @state() private _fImportance: Set<string> = new Set(['HIGH', 'MEDIUM', 'LOW'])
  @state() private _fEventType:  Set<string> = new Set(['economic', 'holiday'])
  @state() private _fGroup: 'all' | 'g7' | 'eu' | 'custom' = 'all'
  @state() private _fCountries: Set<string> = new Set()
  @state() private _accordionG7  = false
  @state() private _accordionEU  = false
  @state() private _accordionAll = false
  @state() private _searchTerm   = ''

  // ── Modal ───────────────────────────────────────────────────────────────────
  @state() private _modal: EconomicEvent | null = null
  @state() private _modalTab: ModalTab = 'event-calendar'
  @state() private _volPair    = 'EUR/USD'
  @state() private _volWindow: '4h' | '1h' | '30m' | '15m' = '1h'
  @state() private _volFilter: 'all' | 'above' | 'below' | 'matched' = 'all'

  // ── Add-to-calendar dropdown ─────────────────────────────────────────────────
  @state() private _atcId: string | null = null

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  private _docClick = () => { this._atcId = null }

  override connectedCallback(): void {
    super.connectedCallback()
    void this._load()
    document.addEventListener('click', this._docClick)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('click', this._docClick)
  }

  // ── Data loading ──────────────────────────────────────────────────────────────

  private async _load(): Promise<void> {
    if (!this.apiKey) { this._error = 'no_key'; return }
    this._loading = true
    this._error = null
    try {
      this._events = await fetchEvents(
        { baseUrl: this.apiUrl, apiKey: this.apiKey },
        { from: this._fromDate, to: this._toDate },
      )
    } catch (e) {
      this._error = e instanceof Error ? e.message : 'Failed to load events'
    } finally {
      this._loading = false
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────────

  private get _filtered(): EconomicEvent[] {
    return this._events.filter((e) => {
      if (!this._fImportance.has(e.importance)) return false
      if (e.isHoliday && !this._fEventType.has('holiday')) return false
      if (!e.isHoliday && !this._fEventType.has('economic')) return false
      if (this._fGroup === 'g7'  && !G7.has(e.country)) return false
      if (this._fGroup === 'eu'  && !EU.has(e.country)) return false
      if (this._fGroup === 'custom' && !this._fCountries.has(e.country)) return false
      if (this._searchTerm) {
        const q = this._searchTerm.toLowerCase()
        if (!e.event.toLowerCase().includes(q) && !e.country.toLowerCase().includes(q)) return false
      }
      return true
    })
  }

  private _groupedByDate(): Map<string, EconomicEvent[]> {
    const map = new Map<string, EconomicEvent[]>()
    for (const e of this._filtered) {
      const key = getDateInTz(e.date, this._tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  private _fmtValue(val: number | null, unit: string): TemplateResult {
    if (val === null) return html`<span class="null-val">—</span>`
    const s = unit === '%' ? `${val}%` : unit ? `${val}${unit}` : String(val)
    return html`${s}`
  }

  private _actualCls(e: EconomicEvent): string {
    if (e.actual === null || e.forecast === null) return ''
    return e.actual > e.forecast ? 'val-up' : e.actual < e.forecast ? 'val-down' : ''
  }

  private _pairsFor(e: EconomicEvent): string[] {
    return PAIRS[e.currency] ?? ['EUR/USD']
  }

  // ── Slider + date range ───────────────────────────────────────────────────────

  private _applySlider(pos: number): void {
    this._sliderPos = pos
    const { from, to } = sliderRange(pos, this._customFrom, this._customTo)
    this._fromDate = from
    this._toDate   = to
    // Navigate calendar to the from-date's month
    const d = new Date(from + 'T12:00:00Z')
    this._calYear  = d.getUTCFullYear()
    this._calMonth = d.getUTCMonth() + 1
    void this._load()
  }

  private _jumpToDate(dateStr: string): void {
    this._customFrom = dateStr
    this._customTo   = dateStr
    this._fromDate   = dateStr
    this._toDate     = dateStr
    void this._load()
  }

  // ── Toggle helpers ────────────────────────────────────────────────────────────

  private _toggleImportance(val: string): void {
    const s = new Set(this._fImportance)
    s.has(val) ? s.delete(val) : s.add(val)
    this._fImportance = s
  }

  private _toggleEventType(val: string): void {
    const s = new Set(this._fEventType)
    s.has(val) ? s.delete(val) : s.add(val)
    this._fEventType = s
  }

  private _toggleCountry(cc: string): void {
    const s = new Set(this._fCountries)
    s.has(cc) ? s.delete(cc) : s.add(cc)
    this._fCountries = s
    this._fGroup = s.size > 0 ? 'custom' : 'all'
  }

  private _toggleGroupAll(group: Set<string>): void {
    const all = [...group]
    const allSelected = all.every(cc => this._fCountries.has(cc))
    const s = new Set(this._fCountries)
    if (allSelected) all.forEach(cc => s.delete(cc))
    else all.forEach(cc => s.add(cc))
    this._fCountries = s
    this._fGroup = s.size > 0 ? 'custom' : 'all'
  }

  // ── Modal ──────────────────────────────────────────────────────────────────────

  private _openModal(e: EconomicEvent, tab: ModalTab): void {
    this._modal = e
    this._modalTab = tab
    this._volPair = this._pairsFor(e)[0] ?? 'EUR/USD'
  }

  // ── Render ─────────────────────────────────────────────────────────────────────

  override render(): TemplateResult {
    return html`
      <div class="cal-root" data-theme=${this.theme}>
        ${this._renderHeader()}
        <div class="cal-body">
          ${this._renderLeft()}
          ${this._renderRight()}
        </div>
        ${this._modal ? this._renderModal(this._modal) : ''}
      </div>
    `
  }

  private _renderHeader(): TemplateResult {
    const count = this._filtered.length
    return html`
      <header class="cal-header">
        <div class="header-left">
          <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <span class="header-title">Economic Calendar</span>
          ${count > 0 ? html`<span class="event-count">${count} events</span>` : ''}
        </div>
        <div class="header-right">
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input class="search-input" type="text" placeholder="Search events…"
              .value=${this._searchTerm}
              @input=${(e: Event) => { this._searchTerm = (e.target as HTMLInputElement).value }}/>
          </div>
          <button class="refresh-btn" @click=${() => void this._load()} title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 4v6h6M23 20v-6h-6"/>
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
            </svg>
          </button>
        </div>
      </header>
    `
  }

  // ── Left panel ──────────────────────────────────────────────────────────────

  private _renderLeft(): TemplateResult {
    return html`
      <aside class="left-panel">
        ${this._renderSlider()}
        ${this._renderMiniCal()}
        ${this._renderTimezone()}
        ${this._renderFilters()}
      </aside>
    `
  }

  private _renderSlider(): TemplateResult {
    const label = SLIDER_LABELS[this._sliderPos] ?? 'Recent & Next'
    return html`
      <div class="panel-section">
        <div class="slider-current-label">${label}</div>
        <input class="range-slider" type="range" min="0" max="6" step="1"
          .value=${String(this._sliderPos)}
          @input=${(e: Event) => this._applySlider(+(e.target as HTMLInputElement).value)}/>
        <div class="slider-ticks">
          ${SLIDER_LABELS.map((_, i) => html`
            <span class="tick ${i === this._sliderPos ? 'active' : ''}"></span>
          `)}
        </div>
      </div>
    `
  }

  private _renderMiniCal(): TemplateResult {
    const todayStr = getTodayInTz(this._tz)
    const grid     = buildCalGrid(this._calYear, this._calMonth, this._fromDate, this._toDate, todayStr)
    const prevMonth = () => {
      if (this._calMonth === 1) { this._calYear--; this._calMonth = 12 }
      else this._calMonth--
    }
    const nextMonth = () => {
      if (this._calMonth === 12) { this._calYear++; this._calMonth = 1 }
      else this._calMonth++
    }
    return html`
      <div class="panel-section mini-cal-wrap">
        <div class="mini-cal-header">
          <button class="cal-nav" @click=${prevMonth}>‹</button>
          <span class="cal-month-label">${(MONTH_NAMES[this._calMonth - 1] ?? '').toUpperCase().slice(0, 3)} ${this._calYear}</span>
          <button class="cal-nav" @click=${nextMonth}>›</button>
        </div>
        <div class="mini-cal-grid">
          ${'SMTWTFS'.split('').map(d => html`<div class="cal-dow">${d}</div>`)}
          ${grid.flat().map(cell => {
            if (!cell.dateStr) return html`<div class="cal-cell empty"></div>`
            const cls = [
              cell.inRange && !cell.isRangeStart && !cell.isRangeEnd ? 'in-range' : '',
              cell.isRangeStart && cell.isRangeEnd ? 'range-single' :
              cell.isRangeStart ? 'range-start' :
              cell.isRangeEnd   ? 'range-end' : '',
              cell.isToday ? 'is-today' : '',
            ].filter(Boolean).join(' ')
            return html`
              <div class="cal-cell ${cls}" @click=${() => this._jumpToDate(cell.dateStr!)}>
                ${cell.dateStr.slice(8)}
              </div>
            `
          })}
        </div>
      </div>
    `
  }

  private _renderTimezone(): TemplateResult {
    const currentOffset = tzOffset(this._tz)
    const currentTime = fmtTimeInTz(new Date().toISOString(), this._tz)
    return html`
      <div class="panel-section tz-section">
        <select class="tz-select" .value=${this._tz}
          @change=${(e: Event) => { this._tz = (e.target as HTMLSelectElement).value }}>
          ${TZONES.map(tz => html`
            <option value=${tz.iana} .selected=${tz.iana === this._tz}>
              (${tzOffset(tz.iana)}) ${tz.label}
            </option>
          `)}
        </select>
        <div class="tz-current">(${currentOffset}) ${currentTime}</div>
      </div>
    `
  }

  private _renderFilters(): TemplateResult {
    const g7All  = [...G7].every(cc => this._fCountries.has(cc))
    const euAll  = [...EU].every(cc => this._fCountries.has(cc))
    const allAll = ALL_CC.every(cc => this._fCountries.has(cc))

    return html`
      <div class="panel-section filters-section">
        <div class="section-title">Filters</div>

        <!-- Importance -->
        <div class="filter-label">Importance</div>
        <div class="filter-toggles">
          ${(['LOW','MEDIUM','HIGH'] as const).map(imp => html`
            <button
              class="imp-btn imp-${imp.toLowerCase()} ${this._fImportance.has(imp) ? 'active' : ''}"
              @click=${() => this._toggleImportance(imp)}>
              ${imp}
            </button>
          `)}
        </div>

        <!-- Event Type -->
        <div class="filter-label">Event Type</div>
        <div class="filter-toggles">
          ${([['holiday','Holidays'],['economic','Economic Events']] as const).map(([val, label]) => html`
            <button
              class="etype-btn ${this._fEventType.has(val) ? 'active' : ''}"
              @click=${() => this._toggleEventType(val)}>
              ${label}
            </button>
          `)}
        </div>

        <!-- Countries -->
        <div class="filter-label">Countries</div>
        <div class="countries-filter">

          <!-- G7 accordion -->
          <div class="accordion-item">
            <div class="accordion-head" @click=${() => { this._accordionG7 = !this._accordionG7 }}>
              <input type="checkbox" .checked=${g7All}
                @click=${(e: Event) => { e.stopPropagation(); this._toggleGroupAll(G7) }} />
              <span class="accordion-label">G7</span>
              <span class="accordion-arrow">${this._accordionG7 ? '▼' : '▶'}</span>
            </div>
            ${this._accordionG7 ? html`
              <div class="accordion-body">
                ${[...G7].map(cc => html`
                  <label class="cc-label">
                    <input type="checkbox" .checked=${this._fCountries.has(cc)}
                      @change=${() => this._toggleCountry(cc)}/>
                    ${getCountryMeta(cc).flag} ${cc}
                  </label>
                `)}
              </div>
            ` : ''}
          </div>

          <!-- EU accordion -->
          <div class="accordion-item">
            <div class="accordion-head" @click=${() => { this._accordionEU = !this._accordionEU }}>
              <input type="checkbox" .checked=${euAll}
                @click=${(e: Event) => { e.stopPropagation(); this._toggleGroupAll(EU) }} />
              <span class="accordion-label">European Union</span>
              <span class="accordion-arrow">${this._accordionEU ? '▼' : '▶'}</span>
            </div>
            ${this._accordionEU ? html`
              <div class="accordion-body">
                ${[...EU].sort().map(cc => html`
                  <label class="cc-label">
                    <input type="checkbox" .checked=${this._fCountries.has(cc)}
                      @change=${() => this._toggleCountry(cc)}/>
                    ${getCountryMeta(cc).flag} ${cc}
                  </label>
                `)}
              </div>
            ` : ''}
          </div>

          <!-- All Countries accordion -->
          <div class="accordion-item">
            <div class="accordion-head" @click=${() => { this._accordionAll = !this._accordionAll }}>
              <input type="checkbox" .checked=${allAll}
                @click=${(e: Event) => { e.stopPropagation(); this._toggleGroupAll(new Set(ALL_CC)) }} />
              <span class="accordion-label">All Countries</span>
              <span class="accordion-arrow">${this._accordionAll ? '▼' : '▶'}</span>
            </div>
            ${this._accordionAll ? html`
              <div class="accordion-body">
                ${ALL_CC.map(cc => html`
                  <label class="cc-label">
                    <input type="checkbox" .checked=${this._fCountries.has(cc)}
                      @change=${() => this._toggleCountry(cc)}/>
                    ${getCountryMeta(cc).flag} ${cc}
                  </label>
                `)}
              </div>
            ` : ''}
          </div>

        </div>
      </div>
    `
  }

  // ── Right panel ──────────────────────────────────────────────────────────────

  private _renderRight(): TemplateResult {
    return html`
      <div class="right-panel">
        ${this._loading ? this._renderLoading()
          : this._error ? this._renderError()
          : this._filtered.length === 0 ? this._renderEmpty()
          : this._renderTable()}
      </div>
    `
  }

  private _renderTable(): TemplateResult {
    const groups   = this._groupedByDate()
    const todayStr = getTodayInTz(this._tz)
    const nowMs    = Date.now()

    return html`
      <table class="events-table">
        <thead>
          <tr>
            <th class="col-time">Time</th>
            <th class="col-country">Country</th>
            <th class="col-event">Event</th>
            <th class="col-imp">Importance</th>
            <th class="col-num">Actual</th>
            <th class="col-num">Forecast</th>
            <th class="col-num">Previous</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          ${repeat(
            Array.from(groups.entries()),
            ([key]) => key,
            ([key, events]) => {
              const { date: dLabel, weekday } = fmtDayHeader(key)
              const isToday = key === todayStr
              const isPast  = key < todayStr

              // Find NOW split point for today's events
              let nowInsertIdx = -1
              if (isToday) {
                const sorted = [...events].sort((a, b) => a.date < b.date ? -1 : 1)
                nowInsertIdx = sorted.findIndex(ev => new Date(ev.date).getTime() > nowMs)
                if (nowInsertIdx === -1 && sorted.length > 0) nowInsertIdx = sorted.length
              }

              return html`
                <tr class="date-group-row">
                  <td colspan="8">
                    <div class="group-inner">
                      <span class="group-date">${dLabel}</span>
                      ${isToday ? html`<span class="badge today-badge">TODAY</span>` : ''}
                      ${isPast && !isToday ? html`<span class="badge past-badge">PAST</span>` : ''}
                      <span class="group-weekday">${weekday}</span>
                    </div>
                  </td>
                </tr>
                ${repeat(
                  [...events].sort((a, b) => a.date < b.date ? -1 : 1),
                  (e) => e.id,
                  (e, idx) => html`
                    ${isToday && idx === nowInsertIdx ? html`
                      <tr class="now-divider-row">
                        <td colspan="8">
                          <div class="now-line">
                            <span class="now-pill">▶ NOW</span>
                            <div class="now-bar"></div>
                          </div>
                        </td>
                      </tr>
                    ` : ''}
                    ${this._renderEventRow(e)}
                  `,
                )}
              `
            },
          )}
        </tbody>
      </table>
    `
  }

  private _renderEventRow(e: EconomicEvent): TemplateResult {
    return html`
      <tr class="event-row imp-${e.importance.toLowerCase()} ${e.isHoliday ? 'holiday-row' : ''}">
        <td class="col-time mono">${fmtTimeInTz(e.date, this._tz)}</td>
        <td class="col-country">
          <span class="flag">${getCountryMeta(e.country).flag}</span>
          <span class="cc">${e.country}</span>
        </td>
        <td class="col-event">
          <span>${e.event}</span>
          ${e.isHoliday ? html`<span class="holiday-tag">Holiday</span>` : ''}
        </td>
        <td class="col-imp">
          <span class="imp-badge imp-${e.importance.toLowerCase()}">${e.importance}</span>
        </td>
        <td class="col-num mono ${this._actualCls(e)}">${this._fmtValue(e.actual, e.unit)}</td>
        <td class="col-num mono muted">${this._fmtValue(e.forecast, e.unit)}</td>
        <td class="col-num mono muted">${this._fmtValue(e.previous, e.unit)}</td>
        <td class="col-actions">${this._renderRowActions(e)}</td>
      </tr>
    `
  }

  private _renderRowActions(e: EconomicEvent): TemplateResult {
    return html`
      <div class="row-actions" @click=${(ev: Event) => ev.stopPropagation()}>

        <!-- Add to Calendar -->
        <div class="atc-wrap">
          <button class="action-btn" title="Add to Calendar"
            @click=${() => { this._atcId = this._atcId === e.id ? null : e.id }}>
            <!-- calendar + pen icon -->
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="1" y="2.5" width="14" height="12" rx="1.5"/>
              <path d="M5 1v3M11 1v3M1 6.5h14"/>
              <path d="M5 10h2l4-4-2-2-4 4v2z" stroke-width="1.2"/>
            </svg>
          </button>
          ${this._atcId === e.id ? html`
            <div class="atc-dropdown">
              <a class="atc-item" href=${googleCalUrl(e)} target="_blank" rel="noopener">Google Calendar</a>
              <a class="atc-item" href=${outlookUrl(e)}   target="_blank" rel="noopener">Outlook</a>
              <a class="atc-item" href=${'https://calendar.yahoo.com/?v=60&title=' + encodeURIComponent(e.event) + '&st=' + toCalDt(e.date) + '&desc=' + encodeURIComponent(e.country)} target="_blank" rel="noopener">Yahoo Calendar</a>
              <button class="atc-item" @click=${() => downloadIcs(e)}>Download .ics</button>
            </div>
          ` : ''}
        </div>

        <!-- Event Calendar chart -->
        <button class="action-btn" title="Event Calendar"
          @click=${() => this._openModal(e, 'event-calendar')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M1 13h3V8H1v5zM6 13h3V4H6v9zM11 13h3V1h-3v12z"/>
          </svg>
        </button>

        <!-- Price Chart -->
        <button class="action-btn" title="Price Chart"
          @click=${() => this._openModal(e, 'price-chart')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M1 12l4-5 3 2 4-6 3 3"/>
          </svg>
        </button>

        <!-- Volatility -->
        <button class="action-btn" title="Volatility"
          @click=${() => this._openModal(e, 'volatility')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M1 8l2-4 2 8 2-6 2 4 2-2 2 4"/>
          </svg>
        </button>

      </div>
    `
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────

  private _renderModal(e: EconomicEvent): TemplateResult {
    const tabs: { id: ModalTab; label: string }[] = [
      { id: 'event-calendar', label: 'Event Calendar' },
      { id: 'price-chart',    label: 'Price Chart' },
      { id: 'volatility',     label: 'Volatility' },
    ]
    return html`
      <div class="modal-overlay" @click=${() => { this._modal = null }}>
        <div class="modal-box" @click=${(ev: Event) => ev.stopPropagation()}>
          <div class="modal-header">
            <div class="modal-title-row">
              <span class="flag">${getCountryMeta(e.country).flag}</span>
              <span class="modal-title">${e.event}</span>
              <span class="modal-meta">${e.country} · ${fmtTimeInTz(e.date, this._tz)}</span>
            </div>
            <div class="modal-badges">
              <span class="imp-badge imp-${e.importance.toLowerCase()}">${e.importance}</span>
              ${e.isHoliday ? html`<span class="holiday-tag">Holiday</span>` : ''}
            </div>
            <button class="modal-close" @click=${() => { this._modal = null }}>✕</button>
          </div>
          <div class="modal-tabs">
            ${tabs.map(t => html`
              <button class="modal-tab ${this._modalTab === t.id ? 'active' : ''}"
                @click=${() => { this._modalTab = t.id }}>
                ${t.label}
              </button>
            `)}
          </div>
          <div class="modal-body">
            ${this._modalTab === 'event-calendar' ? this._renderEventCalTab(e)  : ''}
            ${this._modalTab === 'price-chart'    ? this._renderPriceChartTab() : ''}
            ${this._modalTab === 'volatility'     ? this._renderVolTab(e)       : ''}
          </div>
        </div>
      </div>
    `
  }

  private _renderEventCalTab(e: EconomicEvent): TemplateResult {
    const data = mockHistory(e)
    const allVals = data.flatMap(d => [d.actual, d.forecast])
    const maxVal  = Math.max(...allVals, 0.01)
    const minVal  = Math.min(...allVals, 0)
    const range   = maxVal - minVal || 1
    const W = 460, H = 200, padL = 44, padB = 32, padT = 20, padR = 16
    const iW = W - padL - padR
    const iH = H - padT - padB
    const groupW = iW / data.length
    const barW = Math.min(22, groupW * 0.35)
    const gap = 4
    const yPct = (v: number) => ((v - minVal) / range) * iH

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(t => ({
      y: padT + iH - t * iH,
      label: (minVal + t * range).toFixed(1),
    }))

    return html`
      <div class="chart-tab">
        <div class="chart-legend">
          <span class="legend-dot" style="background:var(--accent)"></span><span>Forecast</span>
          <span class="legend-dot" style="background:var(--up);margin-left:12px"></span><span>Actual</span>
        </div>
        <svg class="bar-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
          <!-- Grid lines -->
          ${gridLines.map(g => html`
            <line x1="${padL}" y1="${g.y.toFixed(1)}" x2="${W - padR}" y2="${g.y.toFixed(1)}"
              stroke="var(--border2)" stroke-width="1" stroke-dasharray="3 3"/>
            <text x="${padL - 4}" y="${(g.y + 3).toFixed(1)}" text-anchor="end"
              font-size="9" fill="var(--text-muted)" font-family="DM Mono, monospace">
              ${g.label}
            </text>
          `)}
          <!-- Bars -->
          ${data.map((d, i) => {
            const cx = padL + i * groupW + groupW / 2
            const forecastH = Math.max(2, yPct(d.forecast))
            const actualH   = Math.max(2, yPct(d.actual))
            const actualColor = e.actual !== null && d.actual >= d.forecast ? 'var(--up)' : 'var(--down)'
            return html`
              <!-- Forecast bar -->
              <rect x="${(cx - barW - gap / 2).toFixed(1)}"
                    y="${(padT + iH - forecastH).toFixed(1)}"
                    width="${barW.toFixed(1)}" height="${forecastH.toFixed(1)}"
                    fill="var(--accent)" opacity="0.65" rx="2"/>
              <!-- Actual bar -->
              <rect x="${(cx + gap / 2).toFixed(1)}"
                    y="${(padT + iH - actualH).toFixed(1)}"
                    width="${barW.toFixed(1)}" height="${actualH.toFixed(1)}"
                    fill="${actualColor}" opacity="0.9" rx="2"/>
              <!-- Month label -->
              <text x="${cx.toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="middle"
                font-size="9" fill="var(--text-muted)" font-family="DM Sans, system-ui, sans-serif">
                ${d.label}
              </text>
            `
          })}
          <!-- X axis line -->
          <line x1="${padL}" y1="${(padT + iH).toFixed(1)}" x2="${W - padR}" y2="${(padT + iH).toFixed(1)}"
            stroke="var(--border2)" stroke-width="1"/>
        </svg>
        <div class="chart-data-row">
          <div class="chart-stat">
            <div class="cs-label">ACTUAL</div>
            <div class="cs-val ${e.actual !== null && e.forecast !== null && e.actual > e.forecast ? 'val-up' : e.actual !== null && e.forecast !== null && e.actual < e.forecast ? 'val-down' : ''}">
              ${this._fmtValue(e.actual, e.unit)}
            </div>
          </div>
          <div class="chart-stat">
            <div class="cs-label">FORECAST</div>
            <div class="cs-val muted">${this._fmtValue(e.forecast, e.unit)}</div>
          </div>
          <div class="chart-stat">
            <div class="cs-label">PREVIOUS</div>
            <div class="cs-val muted">${this._fmtValue(e.previous, e.unit)}</div>
          </div>
        </div>
      </div>
    `
  }

  private _renderPriceChartTab(): TemplateResult {
    return html`
      <div class="premium-tab">
        <svg class="premium-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <div class="premium-title">Price Chart</div>
        <div class="premium-desc">Real-time price impact around event releases is available on the Pro plan.</div>
        <button class="upgrade-btn">Upgrade to Pro</button>
      </div>
    `
  }

  private _renderVolTab(e: EconomicEvent): TemplateResult {
    const pairs = this._pairsFor(e)
    return html`
      <div class="vol-tab">
        <div class="vol-controls">
          <div class="vol-ctrl-label">Historical Impact</div>
          <div class="vol-dropdowns">
            <select class="vol-select" .value=${this._volPair}
              @change=${(ev: Event) => { this._volPair = (ev.target as HTMLSelectElement).value }}>
              ${pairs.map(p => html`<option value=${p}>${p}</option>`)}
            </select>
            <select class="vol-select" .value=${this._volWindow}
              @change=${(ev: Event) => { this._volWindow = (ev.target as HTMLSelectElement).value as typeof this._volWindow }}>
              <option value="4h">4 hours after event</option>
              <option value="1h">1 hour after event</option>
              <option value="30m">30 minutes after event</option>
              <option value="15m">15 minutes after event</option>
            </select>
            <select class="vol-select" .value=${this._volFilter}
              @change=${(ev: Event) => { this._volFilter = (ev.target as HTMLSelectElement).value as typeof this._volFilter }}>
              <option value="all">All Events</option>
              <option value="above">Actual above forecast</option>
              <option value="below">Actual below forecast</option>
              <option value="matched">Actual matched forecast</option>
            </select>
          </div>
        </div>
        <div class="vol-chart-placeholder">
          <svg class="premium-icon small" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <div class="premium-title">Volatility Analysis</div>
          <div class="premium-desc">Historical pips movement data for ${this._volPair} in the ${this._volWindow} after past ${e.event} releases.</div>
          <button class="upgrade-btn">Upgrade to Pro</button>
        </div>
      </div>
    `
  }

  // ── State views ───────────────────────────────────────────────────────────────

  private _renderLoading(): TemplateResult {
    return html`
      <div class="state-center">
        <div class="spinner"></div>
        <span class="state-text">Loading events…</span>
      </div>
    `
  }

  private _renderError(): TemplateResult {
    if (this._error === 'no_key') return html`
      <div class="state-center">
        <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M15 7a2 2 0 0 1 2 2m4 0a6 6 0 0 1-7.743 5.743L11 17H9v2H7v2H4a1 1 0 0 1-1-1v-2.586a1 1 0 0 1 .293-.707l5.964-5.964A6 6 0 1 1 21 9z"/>
        </svg>
        <span class="state-text">Configure your API key to load live data.</span>
      </div>
    `
    return html`
      <div class="state-center">
        <span class="state-text">${this._error}</span>
        <button class="retry-btn" @click=${() => void this._load()}>Retry</button>
      </div>
    `
  }

  private _renderEmpty(): TemplateResult {
    return html`
      <div class="state-center">
        <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
        </svg>
        <span class="state-text">No events match your filters.</span>
      </div>
    `
  }

  // ── Styles ─────────────────────────────────────────────────────────────────────

  static override styles = css`
    :host { display: block; font-family: 'DM Sans', system-ui, sans-serif; height: 100%; }

    /* ── Themes ── */
    [data-theme='dark'] {
      --bg: #0a0c10; --surface: #10141c; --surface2: #161b26; --surface3: #1e2535;
      --border: #1e2535; --border2: #252d40;
      --text: #e2e8f0; --text-muted: #4a5568; --text-dim: #2d3748;
      --accent: #3b82f6; --accent-glow: rgba(59,130,246,.15);
      --high: #ef4444; --high-bg: rgba(239,68,68,.12);
      --med: #f59e0b;  --med-bg: rgba(245,158,11,.12);
      --low: #22d3ee;  --low-bg: rgba(34,211,238,.10);
      --up: #10b981;   --down: #ef4444;
      --row-hover: rgba(59,130,246,.05);
    }
    [data-theme='light'] {
      --bg: #f8fafc; --surface: #ffffff; --surface2: #f1f5f9; --surface3: #e8eef6;
      --border: #e2e8f0; --border2: #cbd5e1;
      --text: #0f172a; --text-muted: #64748b; --text-dim: #94a3b8;
      --accent: #2563eb; --accent-glow: rgba(37,99,235,.10);
      --high: #dc2626; --high-bg: rgba(220,38,38,.08);
      --med: #d97706;  --med-bg: rgba(217,119,6,.08);
      --low: #0891b2;  --low-bg: rgba(8,145,178,.08);
      --up: #059669;   --down: #dc2626;
      --row-hover: rgba(37,99,235,.04);
    }

    /* ── Root ── */
    .cal-root { background: var(--bg); color: var(--text); height: 100%; display: flex; flex-direction: column; overflow: hidden; position: relative; }

    /* ── Header ── */
    .cal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--border); flex-shrink: 0; gap: 12px; }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .header-icon { width: 18px; height: 18px; color: var(--accent); flex-shrink: 0; }
    .header-title { font-size: 14px; font-weight: 600; }
    .event-count { background: var(--accent-glow); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 10px; padding: 1px 9px; font-size: 11px; font-weight: 600; }
    .header-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
    .search-wrap { position: relative; display: flex; align-items: center; }
    .search-icon { position: absolute; left: 8px; width: 12px; height: 12px; color: var(--text-muted); }
    .search-input { background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px 5px 26px; font-size: 12px; outline: none; width: 180px; font-family: inherit; }
    .search-input:focus { border-color: var(--accent); }
    .search-input::placeholder { color: var(--text-muted); }
    .refresh-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; transition: color .15s, border-color .15s; }
    .refresh-btn:hover { color: var(--accent); border-color: var(--accent); }
    .refresh-btn svg { width: 13px; height: 13px; }

    /* ── Body ── */
    .cal-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

    /* ── Left panel ── */
    .left-panel { width: 290px; flex-shrink: 0; border-right: 1px solid var(--border); overflow-y: auto; background: var(--surface); scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
    .panel-section { padding: 14px 16px; border-bottom: 1px solid var(--border); }

    /* ── Slider ── */
    .slider-current-label { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px; }
    .range-slider { width: 100%; accent-color: var(--up); cursor: pointer; margin: 0; height: 4px; }
    .slider-ticks { display: flex; justify-content: space-between; margin-top: 6px; }
    .tick { width: 6px; height: 6px; border-radius: 50%; background: var(--border2); transition: background .15s; }
    .tick.active { background: var(--up); }

    /* ── Mini calendar ── */
    .mini-cal-wrap { }
    .mini-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .cal-nav { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 16px; padding: 2px 6px; border-radius: 4px; transition: color .15s, background .15s; }
    .cal-nav:hover { color: var(--accent); background: var(--accent-glow); }
    .cal-month-label { font-size: 13px; font-weight: 600; color: var(--text); }
    .mini-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
    .cal-dow { text-align: center; font-size: 10px; font-weight: 600; color: var(--text-muted); padding: 3px 0; text-transform: uppercase; }
    .cal-cell { text-align: center; font-size: 11px; padding: 4px 2px; cursor: pointer; border-radius: 4px; position: relative; color: var(--text-muted); transition: background .1s; user-select: none; }
    .cal-cell:hover { background: var(--accent-glow); color: var(--accent); }
    .cal-cell.empty { cursor: default; }
    .cal-cell.empty:hover { background: none; }
    .cal-cell.in-range { background: var(--accent-glow); color: var(--accent); border-radius: 0; }
    .cal-cell.range-start { background: var(--accent); color: #fff; border-radius: 50% 0 0 50%; }
    .cal-cell.range-end   { background: var(--accent); color: #fff; border-radius: 0 50% 50% 0; }
    .cal-cell.range-single { background: var(--accent); color: #fff; border-radius: 50%; }
    .cal-cell.is-today { box-shadow: 0 0 0 1.5px var(--accent); border-radius: 50%; }
    .cal-cell.range-start.is-today, .cal-cell.range-end.is-today { box-shadow: none; }

    /* ── Timezone ── */
    .tz-section { display: flex; flex-direction: column; gap: 6px; }
    .tz-select { width: 100%; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: inherit; cursor: pointer; outline: none; }
    .tz-select:focus { border-color: var(--accent); }
    .tz-current { font-size: 11px; color: var(--text-muted); font-family: 'DM Mono', monospace; }

    /* ── Filters ── */
    .filters-section { flex: 1; }
    .section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
    .filter-label { font-size: 10px; font-weight: 700; letter-spacing: .06em; color: var(--text-muted); text-transform: uppercase; margin: 10px 0 6px; }
    .filter-toggles { display: flex; gap: 5px; flex-wrap: wrap; }
    .imp-btn { background: none; border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; color: var(--text-muted); transition: all .15s; font-family: inherit; letter-spacing: .04em; }
    .imp-btn.imp-high.active  { background: var(--high-bg); border-color: var(--high); color: var(--high); }
    .imp-btn.imp-medium.active { background: var(--med-bg); border-color: var(--med); color: var(--med); }
    .imp-btn.imp-low.active   { background: var(--low-bg); border-color: var(--low); color: var(--low); }
    .imp-btn.active { border-color: var(--text-muted); color: var(--text); }
    .etype-btn { background: none; border: 1px solid var(--border); border-radius: 4px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: var(--text-muted); transition: all .15s; font-family: inherit; }
    .etype-btn.active { background: var(--accent-glow); border-color: var(--accent); color: var(--accent); }

    /* ── Countries accordion ── */
    .countries-filter { display: flex; flex-direction: column; gap: 4px; }
    .accordion-item { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .accordion-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; background: var(--surface2); user-select: none; }
    .accordion-head:hover { background: var(--surface3); }
    .accordion-label { flex: 1; font-size: 12px; font-weight: 500; }
    .accordion-arrow { font-size: 9px; color: var(--text-muted); }
    .accordion-body { padding: 8px 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; border-top: 1px solid var(--border); }
    .cc-label { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); cursor: pointer; padding: 2px 0; }
    .cc-label:hover { color: var(--text); }
    .cc-label input { accent-color: var(--accent); cursor: pointer; }

    /* ── Right panel ── */
    .right-panel { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border2) transparent; }

    /* ── Events table ── */
    .events-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .events-table thead th { position: sticky; top: 0; z-index: 10; background: var(--surface); color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; padding: 8px 10px; border-bottom: 2px solid var(--border); text-align: left; white-space: nowrap; }
    .col-num { text-align: right !important; }
    .col-time { width: 52px; }
    .col-country { width: 80px; }
    .col-event { min-width: 160px; }
    .col-imp { width: 90px; }
    .col-num { width: 80px; }
    .col-actions { width: 100px; text-align: right !important; }

    /* ── Day group row ── */
    .date-group-row td { background: var(--surface2); padding: 6px 10px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
    .group-inner { display: flex; align-items: center; gap: 8px; }
    .group-date { font-size: 12px; font-weight: 700; color: var(--text); }
    .group-weekday { font-size: 11px; color: var(--text-muted); margin-left: auto; }
    .badge { font-size: 9px; font-weight: 700; letter-spacing: .05em; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; }
    .today-badge { background: var(--accent); color: #fff; }
    .past-badge  { background: var(--surface3); color: var(--text-muted); }

    /* ── NOW divider ── */
    .now-divider-row td { padding: 0; }
    .now-line { display: flex; align-items: center; padding: 0 10px; }
    .now-pill { background: var(--high); color: #fff; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 3px; white-space: nowrap; letter-spacing: .04em; flex-shrink: 0; }
    .now-bar { flex: 1; height: 1px; background: var(--high); margin-left: 8px; opacity: 0.6; }

    /* ── Event rows ── */
    .event-row td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .event-row:hover td { background: var(--row-hover); }
    .imp-high td:first-child   { border-left: 2px solid var(--high); }
    .imp-medium td:first-child { border-left: 2px solid var(--med); }
    .imp-low td:first-child    { border-left: 2px solid transparent; }
    .holiday-row td { opacity: 0.75; font-style: italic; }

    .flag { font-size: 14px; margin-right: 3px; }
    .cc { font-size: 11px; color: var(--text-muted); font-weight: 600; }
    .holiday-tag { background: var(--surface3); color: var(--text-muted); font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 5px; text-transform: uppercase; letter-spacing: .04em; }

    /* ── Importance badge ── */
    .imp-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .04em; padding: 2px 7px; border-radius: 3px; }
    .imp-badge.imp-high   { background: var(--high-bg); color: var(--high); }
    .imp-badge.imp-medium { background: var(--med-bg);  color: var(--med);  }
    .imp-badge.imp-low    { background: var(--low-bg);  color: var(--low);  }

    /* ── Values ── */
    .mono { font-family: 'DM Mono', monospace; }
    .null-val { color: var(--text-dim); }
    .muted { color: var(--text-muted); }
    .val-up   { color: var(--up);   font-weight: 600; }
    .val-down { color: var(--down); font-weight: 600; }

    /* ── Row actions ── */
    .row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
    .action-btn { background: none; border: none; cursor: pointer; color: var(--low); padding: 4px; border-radius: 4px; display: flex; align-items: center; transition: color .15s, background .15s; }
    .action-btn:hover { color: var(--accent); background: var(--accent-glow); }
    .action-btn svg { width: 14px; height: 14px; }

    /* ── Add-to-cal dropdown ── */
    .atc-wrap { position: relative; }
    .atc-dropdown { position: absolute; right: 0; top: calc(100% + 4px); z-index: 50; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; min-width: 170px; box-shadow: 0 8px 24px rgba(0,0,0,.3); overflow: hidden; }
    .atc-item { display: block; width: 100%; padding: 9px 14px; font-size: 12px; color: var(--text); background: none; border: none; cursor: pointer; text-align: left; text-decoration: none; font-family: inherit; transition: background .1s; }
    .atc-item:hover { background: var(--surface2); }
    .atc-item + .atc-item { border-top: 1px solid var(--border); }

    /* ── Modal ── */
    .modal-overlay { position: absolute; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
    .modal-box { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; width: 540px; max-width: 100%; max-height: 90%; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
    .modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 20px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0; gap: 12px; }
    .modal-title-row { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; flex-wrap: wrap; }
    .modal-title { font-size: 15px; font-weight: 700; }
    .modal-meta { font-size: 12px; color: var(--text-muted); }
    .modal-badges { display: flex; gap: 6px; align-items: center; }
    .modal-close { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 16px; padding: 2px 6px; flex-shrink: 0; transition: color .15s; }
    .modal-close:hover { color: var(--text); }
    .modal-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .modal-tab { flex: 1; background: none; border: none; padding: 11px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-muted); border-bottom: 2px solid transparent; transition: all .15s; font-family: inherit; }
    .modal-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    .modal-body { flex: 1; overflow-y: auto; padding: 20px; scrollbar-width: thin; scrollbar-color: var(--border2) transparent; }

    /* ── Event calendar tab ── */
    .chart-tab { display: flex; flex-direction: column; gap: 14px; }
    .chart-legend { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .bar-chart { width: 100%; height: auto; }
    .chart-data-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .chart-stat { background: var(--surface2); border-radius: 8px; padding: 10px 12px; text-align: center; }
    .cs-label { font-size: 9px; font-weight: 700; letter-spacing: .07em; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
    .cs-val { font-size: 15px; font-weight: 700; font-family: 'DM Mono', monospace; color: var(--text); }
    .cs-val.muted { color: var(--text-muted); }

    /* ── Premium tab ── */
    .premium-tab { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px 20px; text-align: center; min-height: 220px; }
    .premium-icon { width: 44px; height: 44px; color: var(--text-dim); }
    .premium-icon.small { width: 32px; height: 32px; }
    .premium-title { font-size: 16px; font-weight: 700; }
    .premium-desc { font-size: 13px; color: var(--text-muted); max-width: 320px; line-height: 1.5; }
    .upgrade-btn { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 9px 22px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity .15s; }
    .upgrade-btn:hover { opacity: 0.85; }

    /* ── Volatility tab ── */
    .vol-tab { display: flex; flex-direction: column; gap: 16px; }
    .vol-controls { display: flex; flex-direction: column; gap: 10px; }
    .vol-ctrl-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; color: var(--text-muted); text-transform: uppercase; }
    .vol-dropdowns { display: flex; flex-direction: column; gap: 8px; }
    .vol-select { background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: inherit; cursor: pointer; outline: none; width: 100%; }
    .vol-select:focus { border-color: var(--accent); }
    .vol-chart-placeholder { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; text-align: center; background: var(--surface2); border-radius: 10px; }

    /* ── State views ── */
    .state-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--text-muted); }
    .state-icon { width: 40px; height: 40px; color: var(--text-dim); }
    .state-text { font-size: 14px; font-weight: 500; text-align: center; }
    .spinner { width: 28px; height: 28px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .retry-btn { background: none; border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 6px 16px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .retry-btn:hover { background: var(--accent-glow); }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'economic-calendar': EconomicCalendar
  }
}
