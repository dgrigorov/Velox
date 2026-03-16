// NYSE market hours & status — all times in US/Eastern (America/New_York)

export type MarketStatus = 'open' | 'pre-market' | 'after-hours' | 'closed'

export interface MarketSnapshot {
  status:  MarketStatus
  label:   string   // "OPEN", "PRE-MARKET", "AFTER-HOURS", "CLOSED", "HOLIDAY"
  detail:  string   // "Closes in 1h 42m", "Opens Mon 9:30 AM ET", …
  etTime:  string   // "9:47 AM ET"
  color:   string   // CSS color
}

// ── NYSE holiday calendar 2025–2027 (YYYY-MM-DD ET) ──────────────────────────

const HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18',
  '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01',
  '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
  '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07',
  '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26',
  '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06',
  '2027-11-25', '2027-12-24',
])

// Early-close days: market closes 1:00 PM ET instead of 4:00 PM
const EARLY_CLOSE = new Set([
  '2025-07-03', '2025-11-28', '2025-12-24',
  '2026-11-27', '2026-12-24',
  '2027-11-26', '2027-12-23',
])

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number): string { return n.toString().padStart(2, '0') }

function getETNow(): { dateStr: string; min: number; dow: number; h: number; m: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value

  const dateStr = `${parts['year'] ?? ''}-${parts['month'] ?? ''}-${parts['day'] ?? ''}`
  const h = parseInt(parts['hour']   ?? '0', 10)
  const m = parseInt(parts['minute'] ?? '0', 10)
  // Use T12:00:00Z to avoid DST-day midnight edge cases for getDay()
  const dow = new Date(`${dateStr}T12:00:00Z`).getDay()
  return { dateStr, min: h * 60 + m, dow, h, m }
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function nextTradingDay(fromDate: string): string {
  const d = new Date(`${fromDate}T12:00:00Z`)
  for (let i = 1; i <= 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1)
    const y = d.getUTCFullYear()
    const mo = pad2(d.getUTCMonth() + 1)
    const da = pad2(d.getUTCDate())
    const s = `${y}-${mo}-${da}`
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(s)) {
      const weekdayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow]
      return `${weekdayName} ${mo}/${da}`
    }
  }
  return 'soon'
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getMarketSnapshot(): MarketSnapshot {
  const { dateStr, min, dow, h, m } = getETNow()

  // Format ET time as "9:47 AM ET"
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const ampm   = h < 12 ? 'AM' : 'PM'
  const etTime = `${hour12}:${pad2(m)} ${ampm} ET`

  // Market session boundaries (minutes from midnight)
  const PRE_OPEN    = 4  * 60        // 4:00 AM
  const MKT_OPEN    = 9  * 60 + 30   // 9:30 AM
  const MKT_CLOSE   = EARLY_CLOSE.has(dateStr) ? 13 * 60 : 16 * 60  // 1 PM or 4 PM
  const AH_END      = 20 * 60        // 8:00 PM

  const isWeekend   = dow === 0 || dow === 6
  const isHoliday   = HOLIDAYS.has(dateStr)
  const isTradingDay = !isWeekend && !isHoliday

  let status: MarketStatus
  let label:  string
  let detail: string
  let color:  string

  if (isTradingDay) {
    if (min >= PRE_OPEN && min < MKT_OPEN) {
      status = 'pre-market'
      label  = 'PRE-MARKET'
      color  = '#f59e0b'
      detail = `Opens in ${fmtDuration(MKT_OPEN - min)}`
    } else if (min >= MKT_OPEN && min < MKT_CLOSE) {
      status = 'open'
      label  = EARLY_CLOSE.has(dateStr) ? 'OPEN · EARLY CLOSE' : 'OPEN'
      color  = '#10b981'
      detail = `Closes in ${fmtDuration(MKT_CLOSE - min)}`
    } else if (min >= MKT_CLOSE && min < AH_END) {
      status = 'after-hours'
      label  = 'AFTER-HOURS'
      color  = '#818cf8'
      detail = `Ends in ${fmtDuration(AH_END - min)}`
    } else if (min < PRE_OPEN) {
      status = 'closed'
      label  = 'CLOSED'
      color  = '#64748b'
      detail = `Pre-market in ${fmtDuration(PRE_OPEN - min)}`
    } else {
      // After 8 PM on a trading day — overnight
      status = 'closed'
      label  = 'CLOSED'
      color  = '#64748b'
      detail = `Next open: ${nextTradingDay(dateStr)}`
    }
  } else {
    status = 'closed'
    label  = isHoliday ? 'HOLIDAY' : 'CLOSED'
    color  = '#64748b'
    detail = `Next open: ${nextTradingDay(dateStr)}`
  }

  return { status, label, detail, etTime, color }
}
