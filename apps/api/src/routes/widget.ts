import type { FastifyPluginAsync } from 'fastify'
import { env } from '../types/env.js'

const widgetRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /widget/market-buzz?key=...&theme=dark|light
   *
   * Serves a self-contained HTML page with a D3 bubble chart.
   * Brokers embed this as an iframe.
   */
  fastify.get<{ Querystring: { key?: string; theme?: string } }>(
    '/widget/market-buzz',
    async (request, reply) => {
      const theme = request.query.theme === 'light' ? 'light' : 'dark'
      const apiBase = `http://localhost:${env.PORT}`

      const html = buildWidgetHtml(apiBase, theme)
      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('X-Frame-Options', 'ALLOWALL')
        .send(html)
    },
  )
}

export default widgetRoutes

// ─── Widget HTML ──────────────────────────────────────────────────────────────

function buildWidgetHtml(apiBase: string, theme: 'dark' | 'light'): string {
  const colors = theme === 'dark'
    ? { bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8', accent: '#6366f1' }
    : { bg: '#f8fafc', surface: '#ffffff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', accent: '#6366f1' }

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Market Buzz — Velox</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; font-family: system-ui, -apple-system, sans-serif; }
    body { background: ${colors.bg}; color: ${colors.text}; display: flex; flex-direction: column; }

    /* ── Header ── */
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-bottom: 1px solid ${colors.border};
      background: ${colors.surface}; flex-shrink: 0;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .logo { font-weight: 700; font-size: 14px; color: ${colors.accent}; letter-spacing: -0.3px; }
    .title { font-size: 13px; color: ${colors.muted}; }
    .updated { font-size: 11px; color: ${colors.muted}; }

    /* ── Filters ── */
    .filters { display: flex; gap: 6px; padding: 8px 16px; flex-shrink: 0; flex-wrap: wrap; }
    .filter-btn {
      padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid ${colors.border}; background: transparent; color: ${colors.muted};
      cursor: pointer; transition: all 0.15s;
    }
    .filter-btn:hover { border-color: ${colors.accent}; color: ${colors.text}; }
    .filter-btn.active { background: ${colors.accent}; border-color: ${colors.accent}; color: #fff; }
    .filter-sep { width: 1px; background: ${colors.border}; margin: 0 2px; }

    /* ── Chart area ── */
    .chart-wrap { flex: 1; position: relative; overflow: hidden; }
    #chart { width: 100%; height: 100%; }
    circle { cursor: pointer; transition: opacity 0.2s; }
    circle:hover { opacity: 0.85; }
    .bubble-label { pointer-events: none; font-weight: 700; text-anchor: middle; dominant-baseline: middle; fill: #fff; }

    /* ── Tooltip ── */
    .tooltip {
      position: absolute; pointer-events: none; z-index: 100;
      background: ${colors.surface}; border: 1px solid ${colors.border};
      border-radius: 10px; padding: 10px 14px; font-size: 12px; max-width: 240px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3); transition: opacity 0.1s;
    }
    .tooltip.hidden { opacity: 0; }
    .tt-ticker { font-weight: 700; font-size: 14px; color: ${colors.text}; }
    .tt-name { color: ${colors.muted}; margin-bottom: 6px; }
    .tt-score { font-weight: 600; margin-bottom: 4px; }
    .tt-score.positive { color: #22c55e; }
    .tt-score.negative { color: #ef4444; }
    .tt-score.neutral  { color: ${colors.muted}; }
    .tt-mentions { color: ${colors.muted}; margin-bottom: 6px; }
    .tt-headline { color: ${colors.text}; line-height: 1.4; font-style: italic; border-top: 1px solid ${colors.border}; padding-top: 6px; margin-top: 6px; }

    /* ── Side panel ── */
    .side-panel {
      position: absolute; right: 0; top: 0; bottom: 0; width: 320px;
      background: ${colors.surface}; border-left: 1px solid ${colors.border};
      display: flex; flex-direction: column; transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); z-index: 50;
    }
    .side-panel.open { transform: translateX(0); }
    .panel-header {
      padding: 12px 16px; border-bottom: 1px solid ${colors.border};
      display: flex; align-items: center; justify-content: space-between;
    }
    .panel-ticker { font-weight: 700; font-size: 16px; }
    .panel-close { background: none; border: none; color: ${colors.muted}; cursor: pointer; font-size: 18px; padding: 0; }
    .panel-score { padding: 10px 16px; border-bottom: 1px solid ${colors.border}; }
    .score-row { display: flex; align-items: center; justify-content: space-between; }
    .score-badge {
      font-size: 20px; font-weight: 800;
    }
    .signal-chip {
      padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase;
    }
    .signal-bullish { background: rgba(34,197,94,0.15); color: #22c55e; }
    .signal-bearish { background: rgba(239,68,68,0.15); color: #ef4444; }
    .signal-neutral { background: rgba(100,116,139,0.15); color: ${colors.muted}; }
    .panel-articles { overflow-y: auto; flex: 1; padding: 8px 0; }
    .article-item {
      padding: 10px 16px; border-bottom: 1px solid ${colors.border};
      display: flex; flex-direction: column; gap: 4px;
      text-decoration: none; color: inherit;
    }
    .article-item:hover { background: ${colors.bg}; }
    .art-header { display: flex; align-items: center; gap: 6px; }
    .art-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .art-source { font-size: 10px; color: ${colors.muted}; margin-left: auto; flex-shrink: 0; }
    .art-title { font-size: 12px; font-weight: 500; line-height: 1.4; color: ${colors.text}; }
    .art-liner { font-size: 11px; color: ${colors.muted}; line-height: 1.4; }

    /* ── Loading / Empty ── */
    .overlay {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px; color: ${colors.muted};
    }
    .spinner {
      width: 32px; height: 32px; border: 3px solid ${colors.border};
      border-top-color: ${colors.accent}; border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <span class="logo">Velox</span>
      <span class="title">Market Buzz</span>
    </div>
    <span class="updated" id="updated-label">Loading…</span>
  </div>

  <div class="filters">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="bullish">🟢 Bullish</button>
    <button class="filter-btn" data-filter="bearish">🔴 Bearish</button>
    <button class="filter-btn" data-filter="neutral">⬜ Neutral</button>
    <div class="filter-sep"></div>
    <button class="filter-btn" data-asset="all">All assets</button>
    <button class="filter-btn" data-asset="stock">Stocks</button>
    <button class="filter-btn" data-asset="crypto">Crypto</button>
  </div>

  <div class="chart-wrap">
    <svg id="chart"></svg>
    <div class="tooltip hidden" id="tooltip"></div>
    <div class="overlay" id="overlay"><div class="spinner"></div><span>Fetching market sentiment…</span></div>

    <div class="side-panel" id="panel">
      <div class="panel-header">
        <div>
          <div class="panel-ticker" id="panel-ticker"></div>
          <div style="font-size:12px;color:${colors.muted}" id="panel-name"></div>
        </div>
        <button class="panel-close" id="panel-close">✕</button>
      </div>
      <div class="panel-score">
        <div class="score-row">
          <span class="score-badge" id="panel-score"></span>
          <span class="signal-chip" id="panel-signal"></span>
        </div>
        <div style="font-size:12px;color:${colors.muted};margin-top:4px" id="panel-mentions"></div>
      </div>
      <div class="panel-articles" id="panel-articles"></div>
    </div>
  </div>

<script>
const API_BASE = '${apiBase}'
const key = new URLSearchParams(location.search).get('key') ?? ''
const headers = key ? { 'Authorization': 'Bearer ' + key } : {}

let allData = []
let activeFilter = 'all'
let activeAsset  = 'all'
let simulation

// ─── Fetch data ───────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const params = new URLSearchParams({ limit: '100' })
    const res = await fetch(API_BASE + '/v1/market-buzz?' + params, { headers })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()

    allData = json.instruments ?? []

    const label = document.getElementById('updated-label')
    if (json.updatedAt) {
      const d = new Date(json.updatedAt)
      label.textContent = 'Updated ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    document.getElementById('overlay').style.display = 'none'
    renderChart()
  } catch (err) {
    const overlay = document.getElementById('overlay')
    overlay.innerHTML = '<span>Failed to load data</span><span style="font-size:11px">' + err.message + '</span>'
  }
}

// ─── Color scale ──────────────────────────────────────────────────────────────

function scoreToColor(score) {
  // -100 → red, 0 → gray, +100 → green
  if (score > 20)  return d3.interpolate('#16a34a', '#22c55e')((score - 20) / 80)
  if (score < -20) return d3.interpolate('#dc2626', '#ef4444')((-score - 20) / 80)
  return '#475569'
}

// ─── Chart rendering ──────────────────────────────────────────────────────────

function getFiltered() {
  return allData.filter(d => {
    const signalOk = activeFilter === 'all' || d.sentimentSignal === activeFilter
    const assetOk  = activeAsset  === 'all' || d.assetClass === activeAsset
    return signalOk && assetOk
  })
}

function renderChart() {
  const svg    = d3.select('#chart')
  const wrap   = document.querySelector('.chart-wrap')
  const W      = wrap.clientWidth
  const H      = wrap.clientHeight

  svg.attr('width', W).attr('height', H)
  svg.selectAll('*').remove()

  const data = getFiltered()
  if (data.length === 0) return

  const maxMentions = d3.max(data, d => d.mentionCount) ?? 1
  const rScale = d3.scaleSqrt().domain([0, maxMentions]).range([18, Math.min(W, H) / 8])

  const nodes = data.map(d => ({
    ...d,
    r: Math.max(18, rScale(d.mentionCount)),
    x: W / 2 + (Math.random() - 0.5) * 200,
    y: H / 2 + (Math.random() - 0.5) * 200,
  }))

  // Force simulation
  if (simulation) simulation.stop()
  simulation = d3.forceSimulation(nodes)
    .force('center',  d3.forceCenter(W / 2, H / 2))
    .force('charge',  d3.forceManyBody().strength(8))
    .force('collide', d3.forceCollide().radius(d => d.r + 3).strength(0.9))
    .force('x',       d3.forceX(W / 2).strength(0.04))
    .force('y',       d3.forceY(H / 2).strength(0.04))

  const g = svg.append('g')

  const circles = g.selectAll('circle')
    .data(nodes, d => d.ticker)
    .enter().append('circle')
    .attr('r', d => d.r)
    .attr('fill', d => scoreToColor(d.sentimentScore))
    .attr('stroke', 'rgba(255,255,255,0.15)')
    .attr('stroke-width', 1.5)
    .on('mouseover', (event, d) => showTooltip(event, d))
    .on('mousemove', (event)    => moveTooltip(event))
    .on('mouseout',  ()         => hideTooltip())
    .on('click',     (event, d) => openPanel(d))

  const labels = g.selectAll('text')
    .data(nodes, d => d.ticker)
    .enter().append('text')
    .attr('class', 'bubble-label')
    .style('font-size', d => Math.max(9, Math.min(d.r * 0.45, 16)) + 'px')
    .text(d => d.r > 22 ? (d.assetClass === 'crypto' ? d.ticker.replace('USD','') : d.ticker) : '')
    .on('click', (event, d) => openPanel(d))

  simulation.on('tick', () => {
    circles
      .attr('cx', d => Math.max(d.r, Math.min(W - d.r, d.x)))
      .attr('cy', d => Math.max(d.r, Math.min(H - d.r, d.y)))
    labels
      .attr('x', d => Math.max(d.r, Math.min(W - d.r, d.x)))
      .attr('y', d => Math.max(d.r, Math.min(H - d.r, d.y)))
  })
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function showTooltip(event, d) {
  const tt   = document.getElementById('tooltip')
  const scoreClass = d.sentimentScore > 20 ? 'positive' : d.sentimentScore < -20 ? 'negative' : 'neutral'
  const scoreLabel = d.sentimentScore > 0 ? '+' + d.sentimentScore : String(d.sentimentScore)
  const headline   = d.articles?.[0]?.oneLiner ?? d.articles?.[0]?.title ?? ''

  tt.innerHTML = \`
    <div class="tt-ticker">\${d.assetClass === 'crypto' ? d.ticker.replace('USD','') : d.ticker}</div>
    <div class="tt-name">\${d.name}</div>
    <div class="tt-score \${scoreClass}">Sentiment \${scoreLabel}</div>
    <div class="tt-mentions">\${d.mentionCount} article\${d.mentionCount !== 1 ? 's' : ''}</div>
    \${headline ? \`<div class="tt-headline">"\${headline}"</div>\` : ''}
  \`
  tt.classList.remove('hidden')
  moveTooltip(event)
}

function moveTooltip(event) {
  const tt = document.getElementById('tooltip')
  const x  = event.offsetX + 12
  const y  = event.offsetY + 12
  tt.style.left = x + 'px'
  tt.style.top  = y + 'px'
}

function hideTooltip() {
  document.getElementById('tooltip').classList.add('hidden')
}

// ─── Side panel ───────────────────────────────────────────────────────────────

const SENT_COLORS = { positive: '#22c55e', negative: '#ef4444', neutral: '#64748b' }

function openPanel(d) {
  const tickerLabel = d.assetClass === 'crypto' ? d.ticker.replace('USD','') : d.ticker
  const scoreNum    = d.sentimentScore > 0 ? '+' + d.sentimentScore : String(d.sentimentScore)
  const scoreColor  = d.sentimentScore > 20 ? '#22c55e' : d.sentimentScore < -20 ? '#ef4444' : '#64748b'

  document.getElementById('panel-ticker').textContent = tickerLabel
  document.getElementById('panel-name').textContent   = d.name
  document.getElementById('panel-score').textContent  = scoreNum
  document.getElementById('panel-score').style.color  = scoreColor
  document.getElementById('panel-mentions').textContent = d.mentionCount + ' articles tracked'

  const signalEl = document.getElementById('panel-signal')
  signalEl.textContent  = d.sentimentSignal.toUpperCase()
  signalEl.className    = 'signal-chip signal-' + d.sentimentSignal

  const articlesEl = document.getElementById('panel-articles')
  articlesEl.innerHTML = (d.articles ?? []).map(a => {
    const color = SENT_COLORS[a.sentiment] ?? '#64748b'
    return \`<a class="article-item" href="\${a.url}" target="_blank" rel="noopener">
      <div class="art-header">
        <div class="art-dot" style="background:\${color}"></div>
        <span class="art-source">\${a.source}</span>
      </div>
      <div class="art-title">\${a.title}</div>
      \${a.oneLiner ? \`<div class="art-liner">\${a.oneLiner}</div>\` : ''}
    </a>\`
  }).join('')

  document.getElementById('panel').classList.add('open')
}

document.getElementById('panel-close').addEventListener('click', () => {
  document.getElementById('panel').classList.remove('open')
})

// ─── Filters ──────────────────────────────────────────────────────────────────

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeFilter = btn.dataset.filter
    renderChart()
  })
})

document.querySelectorAll('[data-asset]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-asset]').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeAsset = btn.dataset.asset
    renderChart()
  })
})

// ─── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  if (allData.length) renderChart()
})

// ─── Init ─────────────────────────────────────────────────────────────────────

loadData()
setInterval(loadData, 5 * 60 * 1000) // refresh every 5 min
</script>
</body>
</html>`
}
