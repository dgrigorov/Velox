import { LitElement, html, css, type TemplateResult } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import * as d3 from 'd3'
import {
  fetchMarketBuzz,
  timeAgo,
  getMarketSnapshot,
  type MarketBuzzItem,
  type MarketBuzzArticle,
  type FilterSignal,
  type FilterAssetClass,
  type Theme,
  type MarketSnapshot,
} from '@velox/core'

interface BubbleNode {
  item: MarketBuzzItem
  r: number
  x: number
  y: number
  vx?: number
  vy?: number
  index?: number
}

// ── SVG gauge helpers ────────────────────────────────────────────────────────

// Coordinate system: semicircle arc, left=(cx-r,cy), right=(cx+r,cy), top=(cx,cy-r)
// angle=0 → left, angle=90 → top, angle=180 → right
// Point on arc: x = cx - r*cos(deg*π/180), y = cy - r*sin(deg*π/180)

function arcPt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180
  return [cx - r * Math.cos(rad), cy - r * Math.sin(rad)]
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const [x1, y1] = arcPt(cx, cy, r, a1)
  const [x2, y2] = arcPt(cx, cy, r, a2)
  const large = a2 - a1 > 180 ? 1 : 0
  return `M ${x1.toFixed(2)},${y1.toFixed(2)} A ${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`
}

// Donut segment (full-circle donut, angles in degrees from positive x-axis, clockwise)
function donutArc(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
): string {
  const toRad = (d: number) => (d * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(startDeg))
  const y1 = cy + r * Math.sin(toRad(startDeg))
  const x2 = cx + r * Math.cos(toRad(endDeg))
  const y2 = cy + r * Math.sin(toRad(endDeg))
  const large = (endDeg - startDeg) > 180 ? 1 : 0
  return `M ${x1.toFixed(2)},${y1.toFixed(2)} A ${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)}`
}

@customElement('market-buzz')
export class MarketBuzz extends LitElement {
  @property({ attribute: 'api-url' }) apiUrl = 'http://localhost:4000'
  @property({ attribute: 'api-key' }) apiKey = ''
  @property() theme: Theme = 'dark'
  @property() limit = 60

  @state() private _instruments: MarketBuzzItem[] = []
  @state() private _loading = false
  @state() private _error: string | null = null
  @state() private _updatedAt: string | null = null
  @state() private _signalFilter: FilterSignal = 'all'
  @state() private _assetFilter: FilterAssetClass = 'all'
  @state() private _selectedItem: MarketBuzzItem | null = null
  @state() private _activeTab: 'analytics' | 'sentiment' | 'news' = 'analytics'
  @state() private _market: MarketSnapshot = getMarketSnapshot()

  private _refreshTimer: ReturnType<typeof setInterval> | null = null
  private _marketTimer: ReturnType<typeof setInterval> | null = null
  private _resizeObserver: ResizeObserver | null = null

  override connectedCallback(): void {
    super.connectedCallback()
    void this._load()
    this._refreshTimer = setInterval(() => void this._load(), 5 * 60_000)
    // Update market status every minute
    this._marketTimer = setInterval(() => { this._market = getMarketSnapshot() }, 60_000)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    if (this._refreshTimer !== null) clearInterval(this._refreshTimer)
    if (this._marketTimer  !== null) clearInterval(this._marketTimer)
    this._resizeObserver?.disconnect()
  }

  override firstUpdated(): void {
    const container = this.renderRoot.querySelector('.chart-area')
    if (container) {
      this._resizeObserver = new ResizeObserver(() => this._renderBubbles())
      this._resizeObserver.observe(container)
    }
  }

  override updated(changed: Map<string, unknown>): void {
    const needsRedraw =
      changed.has('_instruments') ||
      changed.has('_signalFilter') ||
      changed.has('_assetFilter') ||
      changed.has('_selectedItem')
    if (needsRedraw) {
      requestAnimationFrame(() => this._renderBubbles())
    }
  }

  private async _load(): Promise<void> {
    if (!this.apiKey) { this._error = 'no_key'; return }
    this._loading = this._instruments.length === 0
    this._error = null
    try {
      const { instruments, updatedAt } = await fetchMarketBuzz(
        { baseUrl: this.apiUrl, apiKey: this.apiKey },
        { limit: this.limit },
      )
      this._instruments = instruments
      this._updatedAt = updatedAt
    } catch (e) {
      this._error = e instanceof Error ? e.message : 'Failed to load'
    } finally {
      this._loading = false
    }
  }

  private get _filtered(): MarketBuzzItem[] {
    return this._instruments.filter((i) => {
      if (this._signalFilter !== 'all' && i.sentimentSignal !== this._signalFilter) return false
      if (this._assetFilter !== 'all' && i.assetClass !== this._assetFilter) return false
      return true
    })
  }

  private get _stats(): { bullish: number; bearish: number; neutral: number } {
    let bullish = 0; let bearish = 0; let neutral = 0
    for (const i of this._instruments) {
      if (i.sentimentSignal === 'bullish') bullish++
      else if (i.sentimentSignal === 'bearish') bearish++
      else neutral++
    }
    return { bullish, bearish, neutral }
  }

  // ── D3 Bubble Chart ──────────────────────────────────────────────────────────

  private _scoreColor(score: number): string {
    if (score >= 20)  return '#10b981'
    if (score <= -20) return '#ef4444'
    return '#475569'
  }

  private _sym(item: MarketBuzzItem): string {
    return item.assetClass === 'crypto' ? item.ticker.replace('USD', '') : item.ticker
  }

  private _renderBubbles(): void {
    const root = this.renderRoot as ShadowRoot
    const container = root.querySelector<HTMLElement>('.chart-area')
    const svgEl = root.querySelector<SVGSVGElement>('#bubble-svg')
    if (!container || !svgEl) return

    const data = this._filtered
    const W = container.clientWidth
    const H = container.clientHeight
    if (W < 10 || H < 10 || data.length === 0) {
      d3.select(svgEl).selectAll('*').remove()
      return
    }

    // ── Size scale ─────────────────────────────────────────────────────────
    const maxM  = d3.max(data, (d) => d.mentionCount) ?? 1
    const totalArea = W * H * 0.52
    const maxR  = Math.sqrt(totalArea / (data.length * Math.PI)) * 1.1
    const minR  = Math.max(20, maxR * 0.35)
    const scale = d3.scaleSqrt().domain([0, maxM]).range([minR, maxR])

    const strokeW  = (r: number) => Math.max(2.5, r * 0.13)
    const outerR   = (r: number) => r + strokeW(r) / 2
    const packR    = (r: number) => outerR(r) + 5   // collision/packing radius with padding

    // Sort largest first — pack layout works best that way
    const sorted = [...data].sort((a, b) => b.mentionCount - a.mentionCount)
    const nodes: BubbleNode[] = sorted.map((d) => ({
      item: d,
      r: scale(d.mentionCount),
      x: 0, y: 0,
    }))

    // ── Initial placement: pack siblings so zero overlap from the start ───
    type PackNode = { r: number; x: number; y: number }
    const packItems: PackNode[] = nodes.map((n) => ({ r: packR(n.r), x: 0, y: 0 }))
    d3.packSiblings(packItems as d3.PackCircle[])

    // Centre the packed cluster on the viewport
    const enclosing = d3.packEnclose(packItems as d3.PackCircle[])
    const offX = W / 2 - (enclosing?.x ?? 0)
    const offY = H / 2 - (enclosing?.y ?? 0)
    nodes.forEach((n, i) => {
      n.x = ((packItems[i] as PackNode).x) + offX
      n.y = ((packItems[i] as PackNode).y) + offY
    })

    // ── Light force sim: spread & breathe, collide enforces no-overlap ────
    const sim = d3.forceSimulation<BubbleNode>(nodes)
      .force('center',  d3.forceCenter(W / 2, H / 2).strength(0.4))
      .force('charge',  d3.forceManyBody<BubbleNode>().strength(-8))
      .force('collide', d3.forceCollide<BubbleNode>()
        .radius((d: BubbleNode) => packR(d.r))
        .strength(1).iterations(4))
      .force('x', d3.forceX<BubbleNode>(W / 2).strength(0.04))
      .force('y', d3.forceY<BubbleNode>(H / 2).strength(0.04))

    for (let i = 0; i < 120; i++) sim.tick()
    sim.stop()

    const PAD = 8
    for (const n of nodes) {
      n.x = Math.max(outerR(n.r) + PAD, Math.min(W - outerR(n.r) - PAD, n.x ?? W / 2))
      n.y = Math.max(outerR(n.r) + PAD, Math.min(H - outerR(n.r) - PAD, n.y ?? H / 2))
    }

    const svg = d3.select(svgEl).attr('width', W).attr('height', H)
    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    const filt = defs.append('filter').attr('id', 'glow')
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    filt.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur')
    filt.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic']).enter().append('feMergeNode').attr('in', (d) => d)

    const g = svg.append('g')

    type D3Sel = d3.Selection<SVGCircleElement, BubbleNode, SVGGElement, unknown>

    ;(g.selectAll('.glow-ring').data(nodes).enter().append('circle') as D3Sel)
      .attr('class', 'glow-ring')
      .attr('cx', (d: BubbleNode) => d.x)
      .attr('cy', (d: BubbleNode) => d.y)
      .attr('r',  (d: BubbleNode) => d.r + 7)
      .attr('fill', 'none')
      .attr('stroke', (d: BubbleNode) => this._scoreColor(d.item.sentimentScore))
      .attr('stroke-width', 1)
      .attr('opacity', 0.25)
      .attr('filter', 'url(#glow)')

    ;(g.selectAll('.bubble').data(nodes).enter().append('circle') as D3Sel)
      .attr('class', 'bubble')
      .attr('cx', (d: BubbleNode) => d.x)
      .attr('cy', (d: BubbleNode) => d.y)
      .attr('r',  (d: BubbleNode) => d.r)
      .attr('fill', (d: BubbleNode) => `${this._scoreColor(d.item.sentimentScore)}26`)
      .attr('stroke', (d: BubbleNode) => this._scoreColor(d.item.sentimentScore))
      .attr('stroke-width', (d: BubbleNode) => strokeW(d.r))
      .style('cursor', 'pointer')
      .on('click', (_event: MouseEvent, d: BubbleNode) => {
        this._selectedItem = this._selectedItem?.ticker === d.item.ticker ? null : d.item
        this._activeTab = 'analytics'
      })

    nodes.forEach((n) => {
      const isSelected = this._selectedItem?.ticker === n.item.ticker
      const lg = g.append('g').style('cursor', 'pointer').style('pointer-events', 'none')

      const sym = this._sym(n.item)
      const showName = n.r > 38
      const showMentions = n.r > 30

      if (showName) {
        lg.append('text')
          .attr('x', n.x ?? 0).attr('y', (n.y ?? 0) - (showMentions ? 12 : 6))
          .attr('text-anchor', 'middle')
          .attr('fill', isSelected ? '#fff' : '#e2e8f0')
          .attr('font-size', Math.min(15, n.r * 0.38)).attr('font-weight', '700')
          .attr('font-family', 'DM Mono, monospace').text(sym)

        lg.append('text')
          .attr('x', n.x ?? 0).attr('y', (n.y ?? 0) + (showMentions ? 4 : 8))
          .attr('text-anchor', 'middle').attr('fill', '#94a3b8')
          .attr('font-size', Math.min(9, n.r * 0.22))
          .attr('font-family', 'DM Sans, system-ui, sans-serif')
          .text(n.item.name.length > 12 ? n.item.name.slice(0, 10) + '…' : n.item.name)

        if (showMentions) {
          lg.append('text')
            .attr('x', n.x ?? 0).attr('y', (n.y ?? 0) + 18)
            .attr('text-anchor', 'middle').attr('fill', '#64748b')
            .attr('font-size', Math.min(9, n.r * 0.22))
            .attr('font-family', 'DM Sans, system-ui, sans-serif')
            .text(`${n.item.mentionCount} mentions`)
        }
      } else {
        lg.append('text')
          .attr('x', n.x ?? 0).attr('y', (n.y ?? 0) + 5)
          .attr('text-anchor', 'middle').attr('fill', '#e2e8f0')
          .attr('font-size', Math.min(13, n.r * 0.45)).attr('font-weight', '700')
          .attr('font-family', 'DM Mono, monospace').text(sym)
      }
    })
  }

  // ── Gauge ────────────────────────────────────────────────────────────────────

  private _renderGauge(score: number): TemplateResult {
    // Layout constants
    const W = 260, H = 155
    const cx = 130, cy = 130   // arc center (near bottom)
    const r = 95               // arc radius
    const sw = 14              // stroke width of arc track

    // Score → gauge angle (0°=left, 90°=top, 180°=right)
    const clampedScore = Math.max(-100, Math.min(100, score))
    const angleDeg = ((clampedScore + 100) / 200) * 180
    // Needle rotation: pointer is drawn pointing up (=90°=score 0),
    // rotate by (angleDeg - 90) to reach actual score position
    const rotDeg = angleDeg - 90

    // Needle tip at clampedScore position
    const [tipX, tipY] = arcPt(cx, cy, r - sw / 2 - 4, angleDeg)

    // Score color
    const scoreClr = clampedScore >= 20 ? '#10b981' : clampedScore <= -20 ? '#ef4444' : '#f59e0b'
    const signStr = clampedScore > 0 ? `+${clampedScore}` : `${clampedScore}`

    // Colored arc segments
    const redArc    = arcPath(cx, cy, r, 0, 60)
    const amberArc  = arcPath(cx, cy, r, 60, 120)
    const greenArc  = arcPath(cx, cy, r, 120, 180)
    const trackArc  = arcPath(cx, cy, r, 0, 180)

    // Label positions (just outside the arc)
    const rLabel = r + 16

    return html`
      <div class="gauge-wrap">
        <svg class="gauge-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
          <!-- Background track -->
          <path d="${trackArc}" fill="none" stroke="var(--surface3)" stroke-width="${sw}"
            stroke-linecap="round"/>

          <!-- Colored segments -->
          <path d="${redArc}"   fill="none" stroke="#ef4444" stroke-width="${sw}" opacity="0.85"/>
          <path d="${amberArc}" fill="none" stroke="#f59e0b" stroke-width="${sw}" opacity="0.85"/>
          <path d="${greenArc}" fill="none" stroke="#10b981" stroke-width="${sw}" opacity="0.85"/>

          <!-- Segment dividers -->
          <line
            x1="${arcPt(cx, cy, r - sw / 2, 60)[0].toFixed(1)}"
            y1="${arcPt(cx, cy, r - sw / 2, 60)[1].toFixed(1)}"
            x2="${arcPt(cx, cy, r + sw / 2, 60)[0].toFixed(1)}"
            y2="${arcPt(cx, cy, r + sw / 2, 60)[1].toFixed(1)}"
            stroke="var(--surface)" stroke-width="2"/>
          <line
            x1="${arcPt(cx, cy, r - sw / 2, 120)[0].toFixed(1)}"
            y1="${arcPt(cx, cy, r - sw / 2, 120)[1].toFixed(1)}"
            x2="${arcPt(cx, cy, r + sw / 2, 120)[0].toFixed(1)}"
            y2="${arcPt(cx, cy, r + sw / 2, 120)[1].toFixed(1)}"
            stroke="var(--surface)" stroke-width="2"/>

          <!-- Needle (drawn pointing up from center, then rotated) -->
          <g class="needle-arm" style="--rot:${rotDeg}deg; transform-origin:${cx}px ${cy}px">
            <!-- Needle shadow/glow -->
            <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + sw / 2 + 6}"
              stroke="${scoreClr}" stroke-width="6" stroke-linecap="round" opacity="0.18"/>
            <!-- Needle line -->
            <line x1="${cx}" y1="${cy + 10}" x2="${cx}" y2="${cy - r + sw / 2 + 6}"
              stroke="var(--text)" stroke-width="2.5" stroke-linecap="round"/>
            <!-- Needle tip dot -->
            <circle cx="${cx}" cy="${cy - r + sw / 2 + 6}" r="3.5" fill="${scoreClr}"/>
          </g>

          <!-- Center pivot -->
          <circle cx="${cx}" cy="${cy}" r="8" fill="var(--surface2)" stroke="var(--border)" stroke-width="1.5"/>
          <circle cx="${cx}" cy="${cy}" r="4" fill="${scoreClr}"/>

          <!-- Score value -->
          <text x="${cx}" y="${cy - 30}" text-anchor="middle"
            font-size="30" font-weight="700" font-family="DM Mono, monospace"
            fill="${scoreClr}">${signStr}</text>
          <text x="${cx}" y="${cy - 12}" text-anchor="middle"
            font-size="9" letter-spacing="0.08em" font-family="DM Sans, system-ui, sans-serif"
            fill="var(--text-muted)" text-transform="uppercase">SENTIMENT SCORE</text>

          <!-- BEARISH / BULLISH labels -->
          <text x="${arcPt(cx, cy, rLabel, 10)[0].toFixed(1)}"
                y="${(arcPt(cx, cy, rLabel, 10)[1] + 4).toFixed(1)}"
                text-anchor="middle" font-size="8" font-weight="600" letter-spacing="0.06em"
                font-family="DM Sans, system-ui, sans-serif" fill="#ef4444" opacity="0.7">
            BEARISH
          </text>
          <text x="${arcPt(cx, cy, rLabel, 170)[0].toFixed(1)}"
                y="${(arcPt(cx, cy, rLabel, 170)[1] + 4).toFixed(1)}"
                text-anchor="middle" font-size="8" font-weight="600" letter-spacing="0.06em"
                font-family="DM Sans, system-ui, sans-serif" fill="#10b981" opacity="0.7">
            BULLISH
          </text>
        </svg>
      </div>
    `
  }

  // ── Sources Donut ────────────────────────────────────────────────────────────

  private _renderSourcesDonut(articles: MarketBuzzArticle[]): TemplateResult {
    let news = 0, social = 0, gnews = 0
    for (const a of articles) {
      const s = a.source.toLowerCase()
      if (s.includes('reddit')) social++
      else if (s.includes('gnews') || s.includes('google')) gnews++
      else news++
    }
    const total = news + social + gnews || 1

    // Donut SVG (80×80)
    const cx = 40, cy = 40, r = 28, ir = 18
    const cats = [
      { count: news,   color: '#6366f1', label: 'News' },
      { count: social, color: '#f59e0b', label: 'Social' },
      { count: gnews,  color: '#10b981', label: 'Google' },
    ].filter((c) => c.count > 0)

    let cursor = -90 // start at top
    const segments: TemplateResult[] = cats.map((c) => {
      const span = (c.count / total) * 360
      const end = cursor + span
      const path = donutArc(cx, cy, r, cursor, end)
      cursor = end
      return html`
        <path d="${path}" fill="none" stroke="${c.color}" stroke-width="10" stroke-linecap="butt"/>
      `
    })

    return html`
      <div class="donut-wrap">
        <svg viewBox="0 0 80 80" class="donut-svg">
          <!-- Inner circle background -->
          <circle cx="${cx}" cy="${cy}" r="${ir}" fill="var(--surface2)"/>
          ${segments}
          <!-- Inner punch-out -->
          <circle cx="${cx}" cy="${cy}" r="${ir}" fill="var(--surface2)"/>
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9"
            font-weight="600" font-family="DM Mono, monospace" fill="var(--text-muted)">
            ${articles.length}
          </text>
        </svg>
        <div class="donut-legend">
          ${cats.map((c) => html`
            <div class="legend-item">
              <span class="legend-dot" style="background:${c.color}"></span>
              <span class="legend-label">${c.label}</span>
              <span class="legend-count">${Math.round((c.count / total) * 100)}%</span>
            </div>
          `)}
        </div>
      </div>
    `
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  override render(): TemplateResult {
    return html`
      <div class="buzz-root" data-theme=${this.theme}>
        ${this._renderHeader()}
        ${this._renderFilters()}
        <div class="main-area">
          <div class="chart-area">
            ${this._loading
              ? this._renderLoading()
              : this._error
                ? this._renderError()
                : this._instruments.length === 0
                  ? this._renderEmpty()
                  : html`<svg id="bubble-svg"></svg>`}
          </div>
          ${this._selectedItem ? this._renderPanel(this._selectedItem) : ''}
        </div>
        ${this._renderFooter()}
      </div>
    `
  }

  private _renderHeader(): TemplateResult {
    const { bullish, bearish, neutral } = this._stats
    const mk = this._market
    return html`
      <header class="buzz-header">
        <div class="header-left">
          <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
          <span class="header-title">Market Buzz</span>
          ${!this._loading && this._instruments.length > 0 ? html`
            <div class="stats-row">
              <span class="stat bullish">● ${bullish} Bullish</span>
              <span class="stat bearish">● ${bearish} Bearish</span>
              <span class="stat neutral">● ${neutral} Neutral</span>
            </div>
          ` : ''}
        </div>
        <div class="header-right">
          <!-- Market status badge -->
          <div class="market-status" title="${mk.detail}">
            <span class="ms-dot" style="background:${mk.color}"></span>
            <span class="ms-label" style="color:${mk.color}">${mk.label}</span>
            <span class="ms-sep">·</span>
            <span class="ms-time">${mk.etTime}</span>
            <span class="ms-detail">${mk.detail}</span>
          </div>
          ${this._updatedAt ? html`<span class="updated-at">Updated ${timeAgo(this._updatedAt)}</span>` : ''}
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

  private _renderFilters(): TemplateResult {
    const signals: { label: string; value: FilterSignal }[] = [
      { label: 'All', value: 'all' },
      { label: 'Bullish', value: 'bullish' },
      { label: 'Bearish', value: 'bearish' },
      { label: 'Neutral', value: 'neutral' },
    ]
    const assets: { label: string; value: FilterAssetClass }[] = [
      { label: 'All assets', value: 'all' },
      { label: 'Stocks', value: 'stock' },
      { label: 'Crypto', value: 'crypto' },
    ]
    return html`
      <div class="filters">
        <div class="filter-group">
          ${signals.map((s) => html`
            <button
              class="filter-btn ${this._signalFilter === s.value ? 'active' : ''} signal-${s.value}"
              @click=${() => { this._signalFilter = s.value }}
            >${s.label}</button>
          `)}
        </div>
        <div class="filter-group">
          ${assets.map((a) => html`
            <button
              class="filter-btn ${this._assetFilter === a.value ? 'active' : ''}"
              @click=${() => { this._assetFilter = a.value }}
            >${a.label}</button>
          `)}
        </div>
      </div>
    `
  }

  private _renderPanel(item: MarketBuzzItem): TemplateResult {
    const pos   = item.articles.filter((a) => a.sentiment === 'positive').length
    const neg   = item.articles.filter((a) => a.sentiment === 'negative').length
    const neu   = item.articles.filter((a) => a.sentiment === 'neutral').length
    const total = item.articles.length || 1

    return html`
      <div class="panel">
        <div class="panel-header">
          <div class="ph-left">
            <span class="ph-ticker">${this._sym(item)}</span>
            <span class="ph-name">${item.name}</span>
            <span class="ph-signal signal-${item.sentimentSignal}">${item.sentimentSignal.toUpperCase()}</span>
          </div>
          <button class="ph-close" @click=${() => { this._selectedItem = null }}>✕</button>
        </div>

        <div class="panel-tabs">
          <button
            class="ptab ${this._activeTab === 'analytics' ? 'active' : ''}"
            @click=${() => { this._activeTab = 'analytics' }}
          >News Analytics</button>
          <button
            class="ptab ${this._activeTab === 'sentiment' ? 'active' : ''}"
            @click=${() => { this._activeTab = 'sentiment' }}
          >Sentiment</button>
          <button
            class="ptab ${this._activeTab === 'news' ? 'active' : ''}"
            @click=${() => { this._activeTab = 'news' }}
          >News Feed</button>
        </div>

        <div class="panel-body">
          ${this._activeTab === 'analytics'
            ? this._renderAnalyticsTab(item, pos, neg, neu, total)
            : this._activeTab === 'sentiment'
              ? this._renderSentimentTab(item, pos, neg, neu, total)
              : this._renderNewsTab(item.articles)}
        </div>
      </div>
    `
  }

  private _renderAnalyticsTab(
    item: MarketBuzzItem,
    pos: number, neg: number, neu: number, total: number,
  ): TemplateResult {
    const articles24h = item.articles.filter((a) => {
      const ms = Date.now() - new Date(a.publishedAt).getTime()
      return ms < 24 * 60 * 60 * 1000
    }).length

    // Trend: compare recent vs older articles
    const recent = item.articles.slice(0, Math.ceil(item.articles.length / 2))
    const older  = item.articles.slice(Math.ceil(item.articles.length / 2))
    const recentPos = recent.filter((a) => a.sentiment === 'positive').length / (recent.length || 1)
    const olderPos  = older.filter((a)  => a.sentiment === 'positive').length / (older.length || 1)
    const trend: 'improving' | 'declining' | 'stable' =
      recentPos - olderPos > 0.1 ? 'improving' :
      olderPos - recentPos > 0.1 ? 'declining' : 'stable'

    const trendColor = trend === 'improving' ? 'var(--up)' : trend === 'declining' ? 'var(--down)' : 'var(--text-muted)'
    const trendIcon  = trend === 'improving' ? '↑' : trend === 'declining' ? '↓' : '→'
    const trendLabel = trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable'

    return html`
      <!-- Sentiment Gauge -->
      <div class="analytics-gauge">
        ${this._renderGauge(item.sentimentScore)}
      </div>

      <!-- Stats row -->
      <div class="analytics-stats">
        <div class="astat">
          <div class="astat-value">${item.mentionCount}</div>
          <div class="astat-label">TOTAL MENTIONS</div>
        </div>
        <div class="astat">
          <div class="astat-value">${articles24h}</div>
          <div class="astat-label">NEWS VOLUME 24H</div>
        </div>
        <div class="astat">
          <div class="astat-value" style="color:${trendColor}">${trendIcon} ${trendLabel}</div>
          <div class="astat-label">TREND</div>
        </div>
      </div>

      <!-- Sources split -->
      <div class="section-label">SOURCES SPLIT</div>
      ${this._renderSourcesDonut(item.articles)}

      <!-- Quick sentiment breakdown -->
      <div class="section-label">SENTIMENT BREAKDOWN</div>
      ${this._renderBar('Positive', pos, total, 'up')}
      ${this._renderBar('Neutral',  neu, total, 'neutral')}
      ${this._renderBar('Negative', neg, total, 'down')}
    `
  }

  private _renderSentimentTab(
    item: MarketBuzzItem,
    pos: number, neg: number, neu: number, total: number,
  ): TemplateResult {
    return html`
      <div class="sentiment-section">
        <div class="section-label">SENTIMENT BREAKDOWN</div>
        ${this._renderBar('Positive', pos, total, 'up')}
        ${this._renderBar('Neutral',  neu, total, 'neutral')}
        ${this._renderBar('Negative', neg, total, 'down')}
      </div>

      <div class="sentiment-section">
        <div class="section-label">AI SUMMARIES</div>
        ${item.articles.filter((a) => a.oneLiner).slice(0, 8).map((a) => html`
          <div class="ai-summary">
            <span class="ai-dot dot-${a.sentiment}">●</span>
            <span class="ai-text">${a.oneLiner}</span>
          </div>
        `)}
      </div>
    `
  }

  private _renderBar(label: string, count: number, total: number, cls: string): TemplateResult {
    const pct = Math.round((count / total) * 100)
    return html`
      <div class="breakdown-row">
        <span class="brow-label ${cls}">${label}</span>
        <div class="brow-bar-bg">
          <div class="brow-bar-fill ${cls}" style="width:${pct}%"></div>
        </div>
        <span class="brow-pct">${count} (${pct}%)</span>
      </div>
    `
  }

  private _renderNewsTab(articles: MarketBuzzArticle[]): TemplateResult {
    return html`
      <div class="news-list">
        ${articles.slice(0, 20).map((a) => html`
          <a class="news-item" href=${a.url} target="_blank" rel="noopener noreferrer">
            <div class="news-meta">
              <span class="news-dot dot-${a.sentiment}">●</span>
              <span class="news-source">${a.source}</span>
              <span class="news-time">${timeAgo(a.publishedAt)}</span>
            </div>
            <div class="news-title">${a.title}</div>
            ${a.oneLiner ? html`<div class="news-summary">${a.oneLiner}</div>` : ''}
          </a>
        `)}
      </div>
    `
  }

  private _renderLoading(): TemplateResult {
    return html`
      <div class="state-center">
        <div class="spinner"></div>
        <span class="state-text">Analysing market sentiment…</span>
        <span class="state-sub">This may take a few minutes on first load</span>
      </div>
    `
  }

  private _renderError(): TemplateResult {
    if (this._error === 'no_key') {
      return html`
        <div class="state-center">
          <svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M15 7a2 2 0 0 1 2 2m4 0a6 6 0 0 1-7.743 5.743L11 17H9v2H7v2H4a1 1 0 0 1-1-1v-2.586a1 1 0 0 1 .293-.707l5.964-5.964A6 6 0 1 1 21 9z"/>
          </svg>
          <span class="state-text">Configure your API key to load live data.</span>
        </div>
      `
    }
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
        <div class="spinner"></div>
        <span class="state-text">Aggregating news & running sentiment analysis…</span>
        <span class="state-sub">First run takes 2–5 minutes. Refreshing automatically.</span>
        <button class="retry-btn" @click=${() => void this._load()}>Check now</button>
      </div>
    `
  }

  private _renderFooter(): TemplateResult {
    return html`
      <footer class="buzz-footer">
        <span>AI-powered sentiment · ${this._instruments.length} instruments tracked</span>
        <span>${this._filtered.length} shown</span>
      </footer>
    `
  }

  static override styles = css`
    :host { display: block; font-family: 'DM Sans', system-ui, sans-serif; height: 100%; }

    /* ── Themes ── */
    [data-theme='dark'] {
      --bg: #0a0f1e; --surface: #111827; --surface2: #1a2235; --surface3: #1e2a40;
      --border: #1f2d45; --text: #e2e8f0; --text-muted: #64748b; --text-dim: #2d3748;
      --accent: #6366f1; --accent-glow: rgba(99,102,241,.15);
      --up: #10b981; --up-bg: rgba(16,185,129,.15);
      --down: #ef4444; --down-bg: rgba(239,68,68,.15);
      --neutral-bg: rgba(100,116,139,.12);
    }
    [data-theme='light'] {
      --bg: #f8fafc; --surface: #ffffff; --surface2: #f1f5f9; --surface3: #e2e8f0;
      --border: #e2e8f0; --text: #0f172a; --text-muted: #64748b; --text-dim: #94a3b8;
      --accent: #6366f1; --accent-glow: rgba(99,102,241,.10);
      --up: #059669; --up-bg: rgba(5,150,105,.10);
      --down: #dc2626; --down-bg: rgba(220,38,38,.10);
      --neutral-bg: rgba(100,116,139,.08);
    }

    /* ── Layout ── */
    .buzz-root { background: var(--bg); color: var(--text); height: 100%; display: flex; flex-direction: column; overflow: hidden; }

    /* ── Header ── */
    .buzz-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--border); flex-shrink: 0; gap: 12px; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-icon { width: 18px; height: 18px; color: var(--accent); }
    .header-title { font-size: 14px; font-weight: 600; }
    .stats-row { display: flex; gap: 10px; }
    .stat { font-size: 12px; font-weight: 500; }
    .stat.bullish { color: var(--up); }
    .stat.bearish { color: var(--down); }
    .stat.neutral { color: var(--text-muted); }
    .header-right { display: flex; align-items: center; gap: 10px; }
    .updated-at { font-size: 11px; color: var(--text-muted); }

    /* ── Market status badge ── */
    .market-status { display: flex; align-items: center; gap: 5px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px; font-size: 11px; white-space: nowrap; }
    .ms-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; animation: msPulse 2s ease-in-out infinite; }
    @keyframes msPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
    .ms-label { font-weight: 700; letter-spacing: .04em; font-size: 10px; }
    .ms-sep { color: var(--text-dim); }
    .ms-time { color: var(--text-muted); font-family: 'DM Mono', monospace; }
    .ms-detail { color: var(--text-muted); font-size: 10px; }
    .refresh-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 5px 7px; cursor: pointer; color: var(--text-muted); display: flex; transition: color .15s, border-color .15s; }
    .refresh-btn:hover { color: var(--accent); border-color: var(--accent); }
    .refresh-btn svg { width: 13px; height: 13px; }

    /* ── Filters ── */
    .filters { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 20px; background: var(--surface2); border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; }
    .filter-group { display: flex; gap: 4px; }
    .filter-btn { background: none; border: 1px solid var(--border); border-radius: 5px; padding: 4px 11px; font-size: 12px; font-weight: 500; cursor: pointer; color: var(--text-muted); transition: all .15s; font-family: inherit; }
    .filter-btn:hover { border-color: var(--accent); color: var(--accent); }
    .filter-btn.active { background: var(--accent-glow); border-color: var(--accent); color: var(--accent); }
    .filter-btn.signal-bullish.active { background: var(--up-bg); border-color: var(--up); color: var(--up); }
    .filter-btn.signal-bearish.active { background: var(--down-bg); border-color: var(--down); color: var(--down); }

    /* ── Main area ── */
    .main-area { flex: 1; display: flex; overflow: hidden; min-height: 0; }
    .chart-area { flex: 1; position: relative; overflow: hidden; }
    #bubble-svg { position: absolute; inset: 0; width: 100%; height: 100%; }

    /* ── Detail panel ── */
    .panel { width: 600px; flex-shrink: 0; background: var(--surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
    .panel-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .ph-left { display: flex; align-items: center; gap: 8px; }
    .ph-ticker { font-family: 'DM Mono', monospace; font-size: 18px; font-weight: 700; }
    .ph-name { font-size: 13px; color: var(--text-muted); }
    .ph-signal { font-size: 10px; font-weight: 700; letter-spacing: .05em; padding: 2px 8px; border-radius: 4px; }
    .ph-signal.signal-bullish { background: var(--up-bg); color: var(--up); }
    .ph-signal.signal-bearish { background: var(--down-bg); color: var(--down); }
    .ph-signal.signal-neutral { background: var(--neutral-bg); color: var(--text-muted); }
    .ph-close { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 16px; padding: 4px 8px; transition: color .15s; }
    .ph-close:hover { color: var(--text); }

    .panel-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .ptab { flex: 1; background: none; border: none; padding: 10px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text-muted); border-bottom: 2px solid transparent; transition: all .15s; font-family: inherit; }
    .ptab.active { color: var(--accent); border-bottom-color: var(--accent); }

    .panel-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }

    /* ── Analytics tab ── */
    .analytics-gauge { display: flex; justify-content: center; }
    .gauge-wrap { display: flex; justify-content: center; }
    .gauge-svg { width: 260px; height: 155px; overflow: visible; }

    /* Needle animation — sweeps from -90deg (pointing left) to the target */
    @keyframes needleSweep {
      from { transform: rotate(-90deg); }
      to   { transform: rotate(var(--rot)); }
    }
    .needle-arm {
      animation: needleSweep 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    .analytics-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .astat { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; text-align: center; }
    .astat-value { font-size: 16px; font-weight: 700; font-family: 'DM Mono', monospace; color: var(--text); }
    .astat-label { font-size: 9px; font-weight: 600; letter-spacing: .07em; color: var(--text-muted); text-transform: uppercase; margin-top: 3px; }

    /* ── Donut ── */
    .donut-wrap { display: flex; align-items: center; gap: 16px; }
    .donut-svg { width: 80px; height: 80px; flex-shrink: 0; }
    .donut-legend { display: flex; flex-direction: column; gap: 6px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .legend-label { color: var(--text-muted); flex: 1; }
    .legend-count { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text); font-weight: 600; }

    /* ── Sentiment tab ── */
    .sentiment-section { display: flex; flex-direction: column; gap: 10px; }
    .section-label { font-size: 10px; font-weight: 700; letter-spacing: .07em; color: var(--text-muted); text-transform: uppercase; }
    .breakdown-row { display: flex; align-items: center; gap: 8px; }
    .brow-label { width: 70px; font-size: 12px; font-weight: 500; flex-shrink: 0; }
    .brow-label.up { color: var(--up); }
    .brow-label.down { color: var(--down); }
    .brow-label.neutral { color: var(--text-muted); }
    .brow-bar-bg { flex: 1; height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
    .brow-bar-fill { height: 100%; border-radius: 3px; transition: width .4s; }
    .brow-bar-fill.up { background: var(--up); }
    .brow-bar-fill.down { background: var(--down); }
    .brow-bar-fill.neutral { background: var(--text-muted); }
    .brow-pct { width: 60px; font-size: 11px; color: var(--text-muted); text-align: right; font-family: 'DM Mono', monospace; }
    .ai-summary { display: flex; gap: 8px; font-size: 12px; line-height: 1.5; color: var(--text-muted); }
    .ai-dot { flex-shrink: 0; font-size: 10px; }
    .ai-text { flex: 1; }

    /* ── News tab ── */
    .news-list { display: flex; flex-direction: column; gap: 12px; }
    .news-item { display: flex; flex-direction: column; gap: 4px; text-decoration: none; padding: 10px; background: var(--surface2); border-radius: 8px; border: 1px solid var(--border); transition: border-color .15s; }
    .news-item:hover { border-color: var(--accent); }
    .news-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; }
    .news-source { color: var(--accent); font-weight: 500; }
    .news-time { color: var(--text-muted); margin-left: auto; }
    .news-title { font-size: 13px; font-weight: 500; color: var(--text); line-height: 1.4; }
    .news-summary { font-size: 11px; color: var(--text-muted); line-height: 1.4; }

    /* ── Sentiment dots ── */
    .dot-positive { color: var(--up); }
    .dot-negative { color: var(--down); }
    .dot-neutral { color: var(--text-muted); }

    /* ── States ── */
    .state-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted); }
    .state-icon { width: 40px; height: 40px; color: var(--text-dim); }
    .state-text { font-size: 14px; font-weight: 500; text-align: center; }
    .state-sub { font-size: 12px; color: var(--text-muted); text-align: center; max-width: 300px; }
    .spinner { width: 28px; height: 28px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .retry-btn { background: none; border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 6px 16px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .retry-btn:hover { background: var(--accent-glow); }

    /* ── Footer ── */
    .buzz-footer { display: flex; justify-content: space-between; padding: 7px 20px; background: var(--surface); border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
  `
}

declare global {
  interface HTMLElementTagNameMap {
    'market-buzz': MarketBuzz
  }
}
