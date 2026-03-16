import type { FastifyPluginAsync } from 'fastify'
import { env } from '../types/env.js'

const widgetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { key?: string; theme?: string } }>(
    '/widget/market-buzz',
    async (request, reply) => {
      const theme = request.query.theme === 'light' ? 'light' : 'dark'
      const apiBase = `http://localhost:${env.PORT}`
      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('X-Frame-Options', 'ALLOWALL')
        .send(buildWidgetHtml(apiBase, theme))
    },
  )

  fastify.get<{ Querystring: { key?: string; theme?: string } }>(
    '/widget/economic-calendar',
    async (request, reply) => {
      const theme = request.query.theme === 'light' ? 'light' : 'dark'
      const apiBase = `http://localhost:${env.PORT}`
      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('X-Frame-Options', 'ALLOWALL')
        .send(buildCalendarWidgetHtml(apiBase, theme))
    },
  )
}

export default widgetRoutes

// ─── Widget HTML ──────────────────────────────────────────────────────────────

function buildWidgetHtml(apiBase: string, theme: 'dark' | 'light'): string {
  const c = theme === 'dark'
    ? { bg: '#0a0f1e', surface: '#111827', surface2: '#1a2235', surface3: '#1e2a40', border: '#1f2d45', text: '#e2e8f0', muted: '#64748b', accent: '#6366f1' }
    : { bg: '#f1f5f9', surface: '#ffffff', surface2: '#f8fafc', surface3: '#f1f5f9', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', accent: '#6366f1' }

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Market Buzz — Velox</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:13px}
body{background:${c.bg};color:${c.text};display:flex;flex-direction:column}

/* ── Header ── */
.hdr{display:flex;align-items:center;justify-content:space-between;padding:9px 16px;border-bottom:1px solid ${c.border};background:${c.surface};flex-shrink:0}
.hdr-l{display:flex;align-items:center;gap:8px}
.logo{font-weight:800;font-size:13px;color:${c.accent};letter-spacing:.3px}
.hdr-title{font-size:12px;color:${c.muted};font-weight:500}
.hdr-ts{font-size:11px;color:${c.muted}}

/* ── Market status modal ── */
.mmodal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
.mmodal-backdrop.hidden{display:none}
.mmodal{background:${c.surface};border:1px solid ${c.border};border-radius:14px;padding:28px 32px 22px;max-width:400px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:16px}
.mmodal-title{font-size:16px;font-weight:700;color:${c.text};line-height:1.4;text-align:center}
.mmodal-sub{font-size:12px;color:${c.muted};text-align:center;line-height:1.5}
.mmodal-status-row{display:flex;justify-content:center;gap:24px;padding:8px 0}
.mmodal-status-item{display:flex;flex-direction:column;align-items:center;gap:6px}
.mstatus-dot{width:14px;height:14px;border-radius:50%;flex-shrink:0}
.mstatus-dot.active{box-shadow:0 0 0 3px rgba(255,255,255,.15),0 0 12px currentColor}
.mstatus-label{font-size:10px;color:${c.muted};font-weight:500;white-space:nowrap}
.mmodal-current{text-align:center;font-size:12px;font-weight:600;padding:6px 14px;border-radius:6px;display:inline-block;margin:0 auto}
.mmodal-btn{width:100%;padding:11px;border-radius:8px;border:none;background:${c.accent};color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;letter-spacing:.2px}
.mmodal-btn:hover{opacity:.85}

/* ── Filters ── */
.filters{display:flex;gap:5px;padding:6px 16px;flex-shrink:0;flex-wrap:wrap;border-bottom:1px solid ${c.border};background:${c.surface}}
.fbtn{padding:3px 11px;border-radius:20px;font-size:11px;font-weight:500;border:1px solid ${c.border};background:transparent;color:${c.muted};cursor:pointer;transition:all .15s}
.fbtn:hover{border-color:${c.accent};color:${c.text}}
.fbtn.active{background:${c.accent};border-color:${c.accent};color:#fff}
.fsep{width:1px;background:${c.border};margin:0 2px;align-self:stretch}

/* ── Main layout ── */
.main{flex:1;display:flex;overflow:hidden;position:relative;min-height:0}
.chart-wrap{flex:1;position:relative;overflow:hidden}
#chart{width:100%;height:100%}

/* ── Tooltip ── */
.tooltip{position:absolute;pointer-events:none;z-index:100;background:${c.surface};border:1px solid ${c.border};border-radius:8px;padding:9px 13px;font-size:12px;max-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.35);opacity:0;transition:opacity .1s}
.tooltip.show{opacity:1}
.tt-ticker{font-weight:700;font-size:13px}
.tt-name{color:${c.muted};margin-bottom:5px;font-size:11px}
.tt-score{font-weight:600;margin-bottom:3px}
.pos{color:#22c55e}.neg{color:#ef4444}.neu{color:${c.muted}}

/* ── Detail panel ── */
.panel{position:absolute;right:0;top:0;bottom:0;width:640px;background:${c.surface};border-left:1px solid ${c.border};display:flex;flex-direction:column;transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);z-index:50}
.panel.open{transform:translateX(0)}

/* panel header */
.ph{padding:10px 14px;border-bottom:1px solid ${c.border};display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.ph-left{display:flex;align-items:center;gap:10px}
.ph-ticker{font-weight:800;font-size:19px}
.ph-name{font-size:12px;color:${c.muted};font-style:italic}
.ph-chip{padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.5px;margin-top:2px;display:inline-block}
.chip-bullish{background:rgba(34,197,94,.15);color:#22c55e}
.chip-bearish{background:rgba(239,68,68,.15);color:#ef4444}
.chip-neutral{background:rgba(100,116,139,.15);color:${c.muted}}
.ph-close{background:none;border:none;color:${c.muted};cursor:pointer;font-size:16px;padding:4px 8px;border-radius:4px;line-height:1}
.ph-close:hover{background:${c.surface2};color:${c.text}}

/* tabs */
.tabs{display:flex;border-bottom:1px solid ${c.border};flex-shrink:0;background:${c.surface}}
.tab{padding:8px 15px;font-size:12px;font-weight:500;color:${c.muted};cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all .15s}
.tab:hover{color:${c.text}}
.tab.active{color:${c.accent};border-bottom-color:${c.accent}}

/* panel body — 2-col grid */
.pbody{flex:1;overflow:hidden;display:grid;grid-template-columns:1fr 240px;min-height:0}
.p-left{overflow-y:auto;padding:12px 10px 12px 12px;display:flex;flex-direction:column;gap:10px}
.p-right{overflow-y:auto;border-left:1px solid ${c.border};padding:10px 12px;display:flex;flex-direction:column;gap:0}
.p-left::-webkit-scrollbar,.p-right::-webkit-scrollbar{width:3px}
.p-left::-webkit-scrollbar-thumb,.p-right::-webkit-scrollbar-thumb{background:${c.border};border-radius:2px}
.p-left::-webkit-scrollbar-track,.p-right::-webkit-scrollbar-track{background:transparent}

/* cards */
.pcard{background:${c.surface2};border:1px solid ${c.border};border-radius:8px;padding:10px 12px}
.pcard-title{font-size:10px;font-weight:600;color:${c.muted};text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px}

/* overview row: 3 mini-cards */
.ov-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.ov-card{background:${c.surface2};border:1px solid ${c.border};border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:4px}
.ov-card-title{font-size:9px;font-weight:600;color:${c.muted};text-transform:uppercase;letter-spacing:.6px}
.ov-card-val{font-size:18px;font-weight:800;line-height:1.1}
.ov-card-sub{font-size:10px;color:${c.muted};line-height:1.3}

/* gauge */
.gauge-wrap{display:flex;align-items:center;justify-content:center;padding:2px 0}
.gauge-svg{width:100%;max-width:210px;display:block;margin:0 auto;overflow:visible}
#gauge-needle-group{transform-origin:100px 96px;transform:rotate(-90deg);transition:transform 1.3s cubic-bezier(0.34,1.56,0.64,1)}

/* donut */
#ov-donut{display:block;margin:0 auto}

/* source bars */
.src-row{display:flex;align-items:center;gap:7px;margin-bottom:6px}
.src-label{font-size:11px;color:${c.muted};width:44px;flex-shrink:0}
.src-bar-bg{flex:1;height:5px;background:${c.border};border-radius:3px;overflow:hidden}
.src-bar-fill{height:100%;border-radius:3px;transition:width .4s}
.src-count{font-size:11px;color:${c.text};width:22px;text-align:right;flex-shrink:0}

/* trend card */
.trend-body{display:flex;align-items:center;gap:12px}
.trend-icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.trend-texts{display:flex;flex-direction:column;gap:2px}
.trend-label{font-size:13px;font-weight:700}
.trend-sub{font-size:11px;color:${c.muted};line-height:1.4}

/* topics */
.topic-row{display:flex;align-items:center;gap:7px;margin-bottom:5px}
.topic-num{font-size:10px;color:${c.muted};width:14px;text-align:right;flex-shrink:0}
.topic-name{font-size:11px;color:${c.text};width:62px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.topic-bar-bg{flex:1;height:5px;background:${c.border};border-radius:3px;overflow:hidden}
.topic-bar-fill{height:100%;border-radius:3px;background:#f59e0b}
.topic-cnt{font-size:10px;color:${c.muted};width:20px;text-align:right;flex-shrink:0}

/* history chart */
#ov-history{display:block;width:100%}

/* news feed (right col) */
.nf-header{font-size:10px;font-weight:600;color:${c.muted};text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;flex-shrink:0}
.news-item{display:flex;flex-direction:column;gap:3px;padding:8px 0;border-bottom:1px solid ${c.border};text-decoration:none;color:inherit}
.news-item:last-child{border-bottom:none}
.ni-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.ni-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.ni-source{font-size:10px;color:${c.muted}}
.ni-time{font-size:10px;color:${c.muted};margin-left:auto}
.ni-title{font-size:11px;font-weight:600;line-height:1.4;color:${c.text}}
.ni-liner{font-size:10px;color:${c.muted};line-height:1.4;font-style:italic}
.ni-tag{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:600;margin-top:2px;margin-right:3px}

/* sentiment breakdown tab */
.sent-bar-wrap{margin-bottom:10px}
.sent-bar-label{display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px}

/* empty */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${c.muted};padding:20px;text-align:center}

/* Loading overlay */
.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:${c.muted};background:${c.bg};z-index:200}
.spinner{width:28px;height:28px;border:3px solid ${c.border};border-top-color:${c.accent};border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>

<!-- ── Market Status Modal ── -->
<div class="mmodal-backdrop" id="market-modal">
  <div class="mmodal">
    <div class="mmodal-title" id="mmodal-title">Checking market status…</div>
    <div class="mmodal-sub">Below are the indicators for current market status on Velox</div>
    <div class="mmodal-status-row">
      <div class="mmodal-status-item">
        <div class="mstatus-dot" id="dot-early" style="background:#f59e0b;color:#f59e0b"></div>
        <span class="mstatus-label">Early Hours</span>
      </div>
      <div class="mmodal-status-item">
        <div class="mstatus-dot" id="dot-open" style="background:#22c55e;color:#22c55e"></div>
        <span class="mstatus-label">Open</span>
      </div>
      <div class="mmodal-status-item">
        <div class="mstatus-dot" id="dot-closed" style="background:#ef4444;color:#ef4444"></div>
        <span class="mstatus-label">Closed</span>
      </div>
      <div class="mmodal-status-item">
        <div class="mstatus-dot" id="dot-after" style="background:#3b82f6;color:#3b82f6"></div>
        <span class="mstatus-label">After Hours</span>
      </div>
    </div>
    <div id="mmodal-current" class="mmodal-current"></div>
    <button class="mmodal-btn" id="mmodal-continue">Continue</button>
  </div>
</div>

<div class="hdr">
  <div class="hdr-l">
    <span class="logo">Velox</span>
    <span class="hdr-title">Market Buzz</span>
  </div>
  <span class="hdr-ts" id="ts-label">Loading…</span>
</div>

<div class="filters">
  <button class="fbtn active" data-filter="all">All</button>
  <button class="fbtn" data-filter="bullish">🟢 Bullish</button>
  <button class="fbtn" data-filter="bearish">🔴 Bearish</button>
  <button class="fbtn" data-filter="neutral">⬜ Neutral</button>
  <div class="fsep"></div>
  <button class="fbtn active" data-asset="all">All assets</button>
  <button class="fbtn" data-asset="stock">Stocks</button>
  <button class="fbtn" data-asset="crypto">Crypto</button>
</div>

<div class="main">
  <div class="chart-wrap">
    <svg id="chart"></svg>
    <div class="tooltip" id="tooltip"></div>
    <div class="overlay" id="overlay"><div class="spinner"></div><span>Fetching market sentiment…</span></div>
  </div>

  <!-- ── Detail panel ── -->
  <div class="panel" id="panel">
    <div class="ph">
      <div class="ph-left">
        <div>
          <div style="display:flex;align-items:baseline;gap:8px">
            <span class="ph-ticker" id="p-ticker"></span>
            <span class="ph-name" id="p-name"></span>
          </div>
          <span class="ph-chip" id="p-chip"></span>
        </div>
      </div>
      <button class="ph-close" id="panel-close">✕</button>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="analytics">News Analytics</div>
      <div class="tab" data-tab="sentiment">Sentiment</div>
    </div>

    <div class="pbody" id="panel-body">
      <div class="p-left" id="p-left"></div>
      <div class="p-right" id="p-right"></div>
    </div>
  </div>
</div>

<script>
const API_BASE = '${apiBase}'
const key = new URLSearchParams(location.search).get('key') ?? ''
const headers = key ? { Authorization: 'Bearer ' + key } : {}

let allData      = []
let activeFilter = 'all'
let activeAsset  = 'all'
let activeTab    = 'analytics'
let simulation
let currentItem  = null
let selectedTicker = null

// ─── Market Status Modal ───────────────────────────────────────────────────

function getMarketStatus() {
  const etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et    = new Date(etStr)
  const day   = et.getDay()   // 0=Sun, 6=Sat
  const mins  = et.getHours() * 60 + et.getMinutes()

  if (day === 0 || day === 6)                return 'closed'
  if (mins >=  4*60 && mins <  9*60 + 30)   return 'early'
  if (mins >=  9*60 + 30 && mins < 16*60)   return 'open'
  if (mins >= 16*60 && mins < 20*60)        return 'afterhours'
  return 'closed'
}

function initMarketModal() {
  const status = getMarketStatus()

  const cfg = {
    early:      { dot: 'dot-early',  label: 'Early Hours', color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  title: 'The US Stock Market is in Early Hours.' },
    open:       { dot: 'dot-open',   label: 'Open',        color: '#22c55e', bg: 'rgba(34,197,94,.12)',   title: 'The US Stock Market is currently Open.' },
    closed:     { dot: 'dot-closed', label: 'Closed',      color: '#ef4444', bg: 'rgba(239,68,68,.12)',   title: 'The US Stock Market is currently Closed.' },
    afterhours: { dot: 'dot-after',  label: 'After Hours', color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  title: 'The US Stock Market is in After Hours.' },
  }

  const active = cfg[status]

  // Dim non-active dots
  ;['early','open','closed','afterhours'].forEach(s => {
    const id = cfg[s].dot
    const el = document.getElementById(id)
    if (!el) return
    if (s === status) {
      el.classList.add('active')
      el.style.opacity = '1'
    } else {
      el.style.opacity = '0.25'
    }
  })

  document.getElementById('mmodal-title').textContent = active.title

  const cur = document.getElementById('mmodal-current')
  cur.textContent  = '● ' + active.label
  cur.style.color  = active.color
  cur.style.background = active.bg

  document.getElementById('mmodal-continue').addEventListener('click', () => {
    document.getElementById('market-modal').classList.add('hidden')
    if (allData.length) renderChart()
  })
}

initMarketModal()

// ─── Fetch ─────────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const res = await fetch(API_BASE + '/v1/market-buzz?limit=100', { headers })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    allData = json.instruments ?? []
    if (json.updatedAt) {
      const d = new Date(json.updatedAt)
      document.getElementById('ts-label').textContent =
        'Updated ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    document.getElementById('overlay').style.display = 'none'
    renderChart()
    if (currentItem) {
      const fresh = allData.find(d => d.ticker === currentItem.ticker)
      if (fresh) { currentItem = fresh; renderPanel(fresh) }
    }
  } catch(err) {
    const o = document.getElementById('overlay')
    o.innerHTML = '<span>Failed to load data</span><span style="font-size:11px">' + err.message + '</span>'
  }
}

// ─── Color helpers ─────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score > 20)  return d3.interpolateRgb('#16a34a','#22c55e')((score-20)/80)
  if (score < -20) return d3.interpolateRgb('#dc2626','#ef4444')((-score-20)/80)
  return '#475569'
}

function sym(d) { return d.assetClass==='crypto' ? d.ticker.replace('USD','') : d.ticker }

// ─── Chart ─────────────────────────────────────────────────────────────────

function filtered() {
  return allData.filter(d => {
    if (d.mentionCount === 0) return false
    const sOk = activeFilter === 'all' || d.sentimentSignal === activeFilter
    const aOk = activeAsset  === 'all' || d.assetClass === activeAsset
    return sOk && aOk
  })
}

function renderChart() {
  const svg  = d3.select('#chart')
  const wrap = document.querySelector('.chart-wrap')
  const W    = wrap.clientWidth
  const H    = wrap.clientHeight
  svg.attr('width', W).attr('height', H).selectAll('*').remove()

  const data = filtered()
  if (!data.length) return

  const maxM = d3.max(data, d => d.mentionCount) || 1

  // Compute max radius so total bubble area ≤ 50% viewport → guarantees packability
  const rMaxArea = Math.sqrt(0.50 * W * H / (Math.PI * data.length))
  const rMax     = Math.min(rMaxArea, Math.min(W, H) / 10)
  const rScale   = d3.scaleSqrt().domain([0, maxM]).range([9, rMax])

  // outer visual radius (stroke extends outside r)
  const strokeW  = r => Math.max(2.5, r * 0.13)
  const outerR   = r => r + strokeW(r) / 2   // visual outer edge
  const collideR = r => outerR(r) + 4         // gap between bubbles

  const nodes = data.map(d => ({
    ...d,
    r: Math.max(10, rScale(d.mentionCount)),
    x: W/2 + (Math.random()-.5) * W * 0.4,
    y: H/2 + (Math.random()-.5) * H * 0.4,
  }))

  if (simulation) simulation.stop()

  simulation = d3.forceSimulation(nodes)
    .force('center',  d3.forceCenter(W/2, H/2).strength(1))
    .force('charge',  d3.forceManyBody().strength(-15))
    .force('collide', d3.forceCollide().radius(d => collideR(d.r)).strength(1).iterations(12))
    .force('x',       d3.forceX(W/2).strength(0.08))
    .force('y',       d3.forceY(H/2).strength(0.08))
    .stop()

  // Full convergence (~300 ticks)
  const nTicks = Math.ceil(Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()))
  for (let i = 0; i < nTicks; i++) simulation.tick()

  // Brute-force with integrated bounds: clamp → check overlaps → repeat until clean
  for (let pass = 0; pass < 40; pass++) {
    // 1. Clamp all nodes inside viewport (including stroke)
    nodes.forEach(n => {
      const cr = collideR(n.r)
      n.x = Math.max(cr, Math.min(W - cr, n.x))
      n.y = Math.max(cr, Math.min(H - cr, n.y))
    })
    // 2. Resolve pairwise overlaps
    let moved = false
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const na = nodes[a], nb = nodes[b]
        const dx   = (nb.x - na.x) || 0.01
        const dy   = (nb.y - na.y) || 0.01
        const dist = Math.sqrt(dx*dx + dy*dy)
        const minD = collideR(na.r) + collideR(nb.r)
        if (dist < minD) {
          const half = (minD - dist) / 2 / dist
          na.x -= dx * half;  na.y -= dy * half
          nb.x += dx * half;  nb.y += dy * half
          moved = true
        }
      }
    }
    if (!moved) break
  }

  // ── Paint final positions directly — no simulation restart ──
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  const defs = svg.append('defs')

  // Glow filter
  const filt = defs.append('filter').attr('id','bubble-glow').attr('x','-50%').attr('y','-50%').attr('width','200%').attr('height','200%')
  filt.append('feGaussianBlur').attr('in','SourceGraphic').attr('stdDeviation','5').attr('result','blur')
  filt.append('feMerge').selectAll('feMergeNode').data(['blur','SourceGraphic']).enter().append('feMergeNode').attr('in',d=>d)

  const g = svg.append('g')

  // Outer glow ring (for selected)
  const glowRings = g.selectAll('.glow-ring').data(nodes, d => d.ticker).enter().append('circle')
    .attr('class', 'glow-ring')
    .attr('r', d => d.r + 7)
    .attr('fill', 'none')
    .attr('stroke', d => scoreColor(d.sentimentScore))
    .attr('stroke-width', 3)
    .attr('opacity', 0)
    .attr('filter', 'url(#bubble-glow)')
    .style('pointer-events','none')

  // Dark interior circles with colored ring
  const circles = g.selectAll('circle.bubble').data(nodes, d => d.ticker).enter().append('circle')
    .attr('class','bubble')
    .attr('r', d => d.r)
    .attr('fill', 'rgba(10,15,30,0.85)')
    .attr('stroke', d => scoreColor(d.sentimentScore))
    .attr('stroke-width', d => strokeW(d.r))
    .style('cursor','pointer')
    .on('mouseover', (e, d) => showTip(e, d))
    .on('mousemove', (e)    => moveTip(e))
    .on('mouseout',  ()     => hideTip())
    .on('click',     (e, d) => openPanel(d))

  // Text labels — multi-line for large bubbles
  const labelG = g.selectAll('.bubble-g').data(nodes, d => d.ticker).enter().append('g')
    .attr('class','bubble-g')
    .style('pointer-events','none')

  labelG.each(function(d) {
    const el = d3.select(this)
    const s  = sym(d)
    const col = scoreColor(d.sentimentScore)
    if (d.r > 38) {
      // Large bubble: ticker + name + mentions
      el.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('dy', '-14').attr('font-size', Math.min(d.r * 0.38, 15)).attr('font-weight','800')
        .attr('fill','#fff').text(s)
      el.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('dy', '2').attr('font-size', Math.min(d.r * 0.22, 10)).attr('fill','rgba(255,255,255,0.55)')
        .text(d.name.length > 10 ? d.name.slice(0,10)+'…' : d.name).attr('font-style','italic')
      el.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('dy', '16').attr('font-size', Math.min(d.r * 0.22, 10)).attr('fill', col).attr('font-weight','700')
        .text(d.mentionCount + ' mentions')
    } else if (d.r > 18) {
      el.append('text').attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('font-size', Math.max(9, Math.min(d.r * 0.42, 14))).attr('font-weight','700')
        .attr('fill','#fff').text(s)
    }
  })

  circles.attr('cx',   d => clamp(d.x, d.r, W-d.r))
         .attr('cy',   d => clamp(d.y, d.r, H-d.r))
  glowRings.attr('cx', d => clamp(d.x, d.r, W-d.r))
            .attr('cy', d => clamp(d.y, d.r, H-d.r))
  labelG.attr('transform', d => \`translate(\${clamp(d.x,d.r,W-d.r)},\${clamp(d.y,d.r,H-d.r)})\`)

  // Highlight selected bubble
  if (selectedTicker) highlightBubble(selectedTicker)

  // Start float animation after render
  startFloatAnimation(nodes)
}

// ─── Float animation ───────────────────────────────────────────────────────

let floatAnimId = null

function startFloatAnimation(nodes) {
  if (floatAnimId) { cancelAnimationFrame(floatAnimId); floatAnimId = null }

  // Assign random float parameters per bubble (small amplitude to stay within gap)
  const phases = nodes.map(n => ({
    ticker: n.ticker,
    bx: n.x, by: n.y,       // base position
    ax: 1 + Math.random(),   // x amplitude 1–2px
    ay: 1 + Math.random(),   // y amplitude 1–2px
    px: Math.random() * Math.PI * 2,  // x phase offset
    py: Math.random() * Math.PI * 2,  // y phase offset
    sx: 0.25 + Math.random() * 0.2,   // x speed (rad/s)
    sy: 0.25 + Math.random() * 0.2,   // y speed (rad/s)
  }))

  const phaseMap = new Map(phases.map(p => [p.ticker, p]))

  function tick(t) {
    const ts = t * 0.001  // ms → seconds
    d3.selectAll('circle.bubble').attr('cx', d => {
      const p = phaseMap.get(d.ticker); return p ? p.bx + Math.sin(ts * p.sx + p.px) * p.ax : d.x
    }).attr('cy', d => {
      const p = phaseMap.get(d.ticker); return p ? p.by + Math.cos(ts * p.sy + p.py) * p.ay : d.y
    })
    d3.selectAll('.glow-ring').attr('cx', d => {
      const p = phaseMap.get(d.ticker); return p ? p.bx + Math.sin(ts * p.sx + p.px) * p.ax : d.x
    }).attr('cy', d => {
      const p = phaseMap.get(d.ticker); return p ? p.by + Math.cos(ts * p.sy + p.py) * p.ay : d.y
    })
    d3.selectAll('.bubble-g').attr('transform', d => {
      const p = phaseMap.get(d.ticker)
      if (!p) return \`translate(\${d.x},\${d.y})\`
      return \`translate(\${p.bx + Math.sin(ts * p.sx + p.px) * p.ax},\${p.by + Math.cos(ts * p.sy + p.py) * p.ay})\`
    })
    floatAnimId = requestAnimationFrame(tick)
  }

  floatAnimId = requestAnimationFrame(tick)
}

function highlightBubble(ticker) {
  d3.selectAll('circle.bubble').attr('stroke-width', d =>
    d.ticker === ticker ? Math.max(3.5, d.r*0.15+2) : Math.max(2.5, d.r*0.12))
  d3.selectAll('.glow-ring').attr('opacity', d => d.ticker === ticker ? 0.6 : 0)
}

// ─── Tooltip ──────────────────────────────────────────────────────────────

function showTip(e, d) {
  const tt  = document.getElementById('tooltip')
  const s   = sym(d)
  const sc  = d.sentimentScore > 20 ? 'pos' : d.sentimentScore < -20 ? 'neg' : 'neu'
  const sv  = d.sentimentScore > 0 ? '+'+d.sentimentScore : String(d.sentimentScore)
  tt.innerHTML = \`<div class="tt-ticker">\${s}</div>
    <div class="tt-name">\${d.name}</div>
    <div class="tt-score \${sc}">Sentiment \${sv}</div>
    <div style="font-size:11px;color:#64748b">\${d.mentionCount} mention\${d.mentionCount!==1?'s':''}</div>\`
  tt.classList.add('show')
  moveTip(e)
}
function moveTip(e) {
  const tt = document.getElementById('tooltip')
  tt.style.left = (e.offsetX+14)+'px'
  tt.style.top  = (e.offsetY+14)+'px'
}
function hideTip() { document.getElementById('tooltip').classList.remove('show') }

// ─── Panel ────────────────────────────────────────────────────────────────

function openPanel(d) {
  currentItem    = d
  selectedTicker = d.ticker
  activeTab      = 'analytics'
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab==='analytics'))
  document.getElementById('panel').classList.add('open')
  updatePanelHeader(d)
  renderPanel(d)
  highlightBubble(d.ticker)
}

function updatePanelHeader(d) {
  const s = sym(d)
  document.getElementById('p-ticker').textContent = s
  document.getElementById('p-name').textContent   = d.name
  const chip = document.getElementById('p-chip')
  chip.textContent = d.sentimentSignal.toUpperCase()
  chip.className   = 'ph-chip chip-' + d.sentimentSignal
}

function renderPanel(d) {
  if (activeTab === 'analytics') {
    document.getElementById('p-left').innerHTML  = renderLeftColumn(d)
    document.getElementById('p-right').innerHTML = renderRightColumn(d)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      animateGauge(d.sentimentScore)
      drawDonut(d)
      drawHistory(d)
    }))
  } else {
    document.getElementById('p-left').innerHTML  = renderSentimentTab(d)
    document.getElementById('p-right').innerHTML = renderRightColumn(d)
  }
}

function animateGauge(score) {
  const needle = document.getElementById('gauge-needle-group')
  if (!needle) return
  needle.style.transform = 'rotate(' + (score/100*90) + 'deg)'
}

// ─── Left column ──────────────────────────────────────────────────────────

function renderLeftColumn(d) {
  const score      = d.sentimentScore
  const sc         = score > 20 ? '#22c55e' : score < -20 ? '#ef4444' : '${c.muted}'
  const sv         = score > 0 ? '+'+score : String(score)
  const gaugeColor = score > 20 ? '#22c55e' : score < -20 ? '#ef4444' : '#f59e0b'
  const s          = sym(d)

  // gauge SVG
  const gauge = \`<svg class="gauge-svg" viewBox="0 0 200 106" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow-\${s}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#dc2626"/>
      <stop offset="35%" stop-color="#f59e0b"/>
      <stop offset="65%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#22c55e"/>
    </linearGradient>
  </defs>
  <path d="M 22 96 A 78 78 0 0 1 178 96" stroke="${c.surface3}" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M 22 96 A 78 78 0 0 1 61 28.5"  stroke="#ef4444" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/>
  <path d="M 61 28.5 A 78 78 0 0 1 139 28.5" stroke="#f59e0b" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/>
  <path d="M 139 28.5 A 78 78 0 0 1 178 96" stroke="#22c55e" stroke-width="12" fill="none" stroke-linecap="round" opacity=".85"/>
  <line x1="61"  y1="28.5" x2="57"  y2="22" stroke="${c.surface}" stroke-width="2"/>
  <line x1="139" y1="28.5" x2="143" y2="22" stroke="${c.surface}" stroke-width="2"/>
  <text x="10"  y="106" text-anchor="middle" font-size="9" fill="#ef4444" font-weight="600">−100</text>
  <text x="100" y="12"  text-anchor="middle" font-size="9" fill="${c.muted}">0</text>
  <text x="190" y="106" text-anchor="middle" font-size="9" fill="#22c55e" font-weight="600">+100</text>
  <text x="100" y="60" text-anchor="middle" font-size="20" font-weight="800" fill="\${gaugeColor}">\${sv}</text>
  <text x="100" y="72" text-anchor="middle" font-size="8" fill="${c.muted}" letter-spacing="1">SENTIMENT</text>
  <g id="gauge-needle-group">
    <line x1="100" y1="96" x2="100" y2="30"
          stroke="\${gaugeColor}" stroke-width="8" stroke-linecap="round" opacity=".15" filter="url(#glow-\${s})"/>
    <line x1="100" y1="96" x2="100" y2="32"
          stroke="${c.text}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="100" cy="32" r="5" fill="\${gaugeColor}" filter="url(#glow-\${s})"/>
    <circle cx="100" cy="32" r="2.5" fill="#fff"/>
  </g>
  <circle cx="100" cy="96" r="7"   fill="${c.surface}" stroke="\${gaugeColor}" stroke-width="2.5"/>
  <circle cx="100" cy="96" r="3.5" fill="\${gaugeColor}"/>
</svg>\`

  // overview cards
  const srcNews   = d.sources?.news   ?? 0
  const srcSocial = d.sources?.social ?? 0
  const srcGnews  = d.sources?.gnews  ?? 0
  const total     = d.mentionCount || 1

  const trendArrow = score > 20 ? '↑' : score < -20 ? '↓' : '→'
  const trendColor = score > 20 ? '#22c55e' : score < -20 ? '#ef4444' : '${c.muted}'
  const trendLabel = score > 20 ? 'Price May Rise' : score < -20 ? 'Price May Fall' : 'No Clear Trend'
  const trendSub   = score > 20 ? 'Bullish momentum detected across sources'
                   : score < -20 ? 'Bearish pressure from recent articles'
                   : 'Mixed signals — watch for breakout'
  const trendIconBg = score > 20 ? 'rgba(34,197,94,.15)' : score < -20 ? 'rgba(239,68,68,.15)' : 'rgba(100,116,139,.15)'

  // topics
  const words = {}
  const stop = new Set(['the','a','an','is','in','to','of','for','and','on','at','by','as','its','has','with','that','this','be','are','were','was','will','have','from'])
  for (const a of d.articles) {
    for (const w of (a.oneLiner||'').toLowerCase().split(/\W+/)) {
      if (w.length > 4 && !stop.has(w)) words[w] = (words[w]||0)+1
    }
  }
  const topics    = Object.entries(words).sort((a,b)=>b[1]-a[1]).slice(0,5)
  const maxTopic  = topics[0]?.[1]||1

  return \`
  <!-- Gauge card -->
  <div class="pcard">
    <div class="pcard-title">Sentiment Gauge</div>
    <div class="gauge-wrap">\${gauge}</div>
  </div>

  <!-- Overview row: 3 mini-cards -->
  <div class="ov-row">
    <div class="ov-card">
      <div class="ov-card-title">News Volume</div>
      <div class="ov-card-val" style="color:\${sc}">\${d.mentionCount}</div>
      <div class="ov-card-sub">article\${d.mentionCount!==1?'s':''} in 24h</div>
    </div>
    <div class="ov-card" style="align-items:center">
      <div class="ov-card-title" style="text-align:center">Sources Split</div>
      <svg id="ov-donut" width="70" height="70"></svg>
    </div>
    <div class="ov-card">
      <div class="ov-card-title">Trend Analysis</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
        <div class="trend-icon" style="background:\${trendIconBg};width:36px;height:36px;font-size:18px">
          <span style="color:\${trendColor}">\${trendArrow}</span>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:\${trendColor}">\${trendLabel}</div>
          <div style="font-size:10px;color:${c.muted};margin-top:1px;line-height:1.3">\${d.mentionCount} mentions</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Source breakdown -->
  <div class="pcard">
    <div class="pcard-title">Mention Sources (24h)</div>
    \${[
      { label:'News',    count: srcNews,   color:'#6366f1' },
      { label:'Social',  count: srcSocial, color:'#f59e0b' },
      { label:'G.News',  count: srcGnews,  color:'#4285f4' },
    ].map(s => \`<div class="src-row">
      <span class="src-label">\${s.label}</span>
      <div class="src-bar-bg"><div class="src-bar-fill" style="width:\${total>0?(s.count/total*100).toFixed(1):0}%;background:\${s.color}"></div></div>
      <span class="src-count">\${s.count}</span>
    </div>\`).join('')}
  </div>

  \${topics.length > 0 ? \`
  <!-- Topics -->
  <div class="pcard">
    <div class="pcard-title">Most Discussed Topics</div>
    \${topics.map(([word,cnt],i) => \`<div class="topic-row">
      <span class="topic-num">\${i+1}</span>
      <span class="topic-name" title="\${word}">\${word}</span>
      <div class="topic-bar-bg"><div class="topic-bar-fill" style="width:\${(cnt/maxTopic*100).toFixed(1)}%"></div></div>
      <span class="topic-cnt">\${cnt}</span>
    </div>\`).join('')}
  </div>\` : ''}

  <!-- News history chart -->
  <div class="pcard">
    <div class="pcard-title">News History (7 days)</div>
    <svg id="ov-history" height="80"></svg>
  </div>
  \`
}

// ─── D3 donut ─────────────────────────────────────────────────────────────

function drawDonut(d) {
  const el = document.getElementById('ov-donut')
  if (!el) return
  const srcNews   = d.sources?.news   ?? 0
  const srcSocial = d.sources?.social ?? 0
  const srcGnews  = d.sources?.gnews  ?? 0
  const total     = srcNews + srcSocial + srcGnews
  if (total === 0) return

  const data = [
    { label:'News',   value: srcNews,   color:'#6366f1' },
    { label:'Social', value: srcSocial, color:'#f59e0b' },
    { label:'G.News', value: srcGnews,  color:'#4285f4' },
  ].filter(x => x.value > 0)

  const W = 70, H = 70, r = 30, ir = 20
  const svg = d3.select('#ov-donut')
    .attr('width', W).attr('height', H)
    .append('g').attr('transform',\`translate(\${W/2},\${H/2})\`)

  const pie = d3.pie().value(x => x.value).sort(null)
  const arc = d3.arc().innerRadius(ir).outerRadius(r)

  svg.selectAll('path').data(pie(data)).enter().append('path')
    .attr('d', arc)
    .attr('fill', x => x.data.color)
    .attr('stroke', '${c.surface2}')
    .attr('stroke-width', 1.5)
}

// ─── D3 history bar chart ─────────────────────────────────────────────────

function drawHistory(d) {
  const el = document.getElementById('ov-history')
  if (!el) return
  const W = el.parentElement?.clientWidth - 24 || 200
  const H = 80
  d3.select('#ov-history').attr('width', W).attr('height', H)

  // Bucket articles by day (last 7 days)
  const now   = Date.now()
  const days  = 7
  const buckets = Array.from({length: days}, (_, i) => {
    const dayStart = now - (days - 1 - i) * 86400000
    return { day: i, ts: dayStart, pos: 0, neg: 0, neu: 0, total: 0 }
  })

  for (const a of d.articles) {
    const ts  = new Date(a.publishedAt).getTime()
    const idx = Math.floor((ts - (now - days*86400000)) / 86400000)
    if (idx >= 0 && idx < days) {
      buckets[idx].total++
      if (a.sentiment === 'positive') buckets[idx].pos++
      else if (a.sentiment === 'negative') buckets[idx].neg++
      else buckets[idx].neu++
    }
  }

  const maxVal = d3.max(buckets, b => b.total) || 1
  const pad    = { t:6, r:4, b:20, l:4 }
  const cW     = W - pad.l - pad.r
  const cH     = H - pad.t - pad.b
  const bW     = cW / days
  const yScale = d3.scaleLinear().domain([0, maxVal]).range([cH, 0])
  const dayLabels = ['Su','Mo','Tu','We','Th','Fr','Sa']

  const svg = d3.select('#ov-history').append('g').attr('transform',\`translate(\${pad.l},\${pad.t})\`)

  buckets.forEach((b, i) => {
    const x   = i * bW
    const bh  = cH - yScale(b.total)
    const col = b.pos > b.neg ? '#22c55e' : b.neg > b.pos ? '#ef4444' : '#f59e0b'
    if (bh > 0) {
      svg.append('rect')
        .attr('x', x + bW*0.15).attr('y', yScale(b.total))
        .attr('width', bW*0.7).attr('height', bh)
        .attr('rx', 2).attr('fill', col).attr('opacity', .85)
    }
    const d   = new Date(b.ts)
    svg.append('text').attr('x', x + bW/2).attr('y', cH+13)
      .attr('text-anchor','middle').attr('font-size','9').attr('fill','#64748b')
      .text(dayLabels[d.getDay()] ?? '')
  })
}

// ─── Right column (news feed) ──────────────────────────────────────────────

function renderRightColumn(d) {
  const tagColors = {
    positive: { bg:'rgba(34,197,94,.15)',  color:'#22c55e' },
    negative: { bg:'rgba(239,68,68,.15)', color:'#ef4444' },
    neutral:  { bg:'rgba(100,116,139,.15)', color:'#94a3b8' },
  }

  const items = d.articles.map(a => {
    const tc  = tagColors[a.sentiment] ?? tagColors.neutral
    const rel = timeSince(a.publishedAt)
    return \`<a class="news-item" href="\${a.url}" target="_blank" rel="noopener noreferrer">
      <div class="ni-meta">
        <div class="ni-dot" style="background:\${tc.color}"></div>
        <span class="ni-source">\${a.source}</span>
        <span class="ni-time">\${rel}</span>
      </div>
      <div class="ni-title">\${a.title}</div>
      \${a.oneLiner ? \`<div class="ni-liner">\${a.oneLiner}</div>\` : ''}
      <div><span class="ni-tag" style="background:\${tc.bg};color:\${tc.color}">\${a.sentiment}</span></div>
    </a>\`
  }).join('')

  return \`
    <div class="nf-header">News Feed</div>
    \${d.articles.length > 0 ? \`<div class="news-list">\${items}</div>\`
      : \`<div class="empty"><span style="font-size:11px">No articles found</span></div>\`}
  \`
}

// ─── Sentiment tab ────────────────────────────────────────────────────────

function renderSentimentTab(d) {
  const pos = d.articles.filter(a=>a.sentiment==='positive').length
  const neg = d.articles.filter(a=>a.sentiment==='negative').length
  const neu = d.articles.filter(a=>a.sentiment==='neutral').length
  const tot = d.articles.length || 1

  const bar = (label, count, color) => \`
    <div class="sent-bar-wrap">
      <div class="sent-bar-label">
        <span style="color:\${color};font-weight:600">\${label}</span>
        <span style="color:${c.muted}">\${count} (\${Math.round(count/tot*100)}%)</span>
      </div>
      <div class="src-bar-bg" style="height:7px">
        <div class="src-bar-fill" style="width:\${count/tot*100}%;background:\${color};height:100%"></div>
      </div>
    </div>\`

  return \`<div class="pcard">
    <div class="pcard-title">Sentiment Breakdown</div>
    \${bar('Positive', pos, '#22c55e')}
    \${bar('Neutral',  neu, '${c.muted}')}
    \${bar('Negative', neg, '#ef4444')}
  </div>
  <div class="pcard">
    <div class="pcard-title">AI Summaries</div>
    \${d.articles.filter(a=>a.oneLiner).slice(0,10).map(a => {
      const col = a.sentiment==='positive'?'#22c55e':a.sentiment==='negative'?'#ef4444':'${c.muted}'
      return \`<div class="news-item" style="cursor:default">
        <div class="ni-meta">
          <div class="ni-dot" style="background:\${col}"></div>
          <span class="ni-source" style="font-weight:600;color:\${col};text-transform:capitalize">\${a.sentiment}</span>
          <span class="ni-time">\${timeSince(a.publishedAt)}</span>
        </div>
        <div class="ni-liner" style="font-style:normal">\${a.oneLiner}</div>
      </div>\`
    }).join('')}
    \${d.articles.filter(a=>a.oneLiner).length===0?'<div class="empty"><span>No AI summaries yet</span></div>':''}
  </div>\`
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function timeSince(iso) {
  if (!iso) return ''
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return m+'m ago'
  const h = Math.floor(m/60)
  if (h < 24) return h+'h ago'
  return Math.floor(h/24)+'d ago'
}

// ─── Tabs ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    activeTab = tab.dataset.tab
    if (currentItem) renderPanel(currentItem)
  })
})

// ─── Filters ──────────────────────────────────────────────────────────────

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

document.getElementById('panel-close').addEventListener('click', () => {
  document.getElementById('panel').classList.remove('open')
  selectedTicker = null
  currentItem    = null
  d3.selectAll('circle.bubble').attr('stroke-width', d => Math.max(2.5, d.r*0.12))
  d3.selectAll('.glow-ring').attr('opacity', 0)
})

window.addEventListener('resize', () => { if (allData.length) renderChart() })

loadData()
setInterval(loadData, 5*60*1000)
</script>
</body>
</html>`
}

// ─── Economic Calendar Widget HTML ────────────────────────────────────────────

function buildCalendarWidgetHtml(apiBase: string, theme: 'dark' | 'light'): string {
  const apiKey = 'vx_dev_demo'
  // Bundle is built with: npm run build:standalone -w packages/economic-calendar
  // Output: packages/economic-calendar/dist/economic-calendar.standalone.js
  // Served at: /static/economic-calendar/dist/economic-calendar.standalone.js
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Economic Calendar — Velox</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
body{display:flex;flex-direction:column}
economic-calendar{width:100%;height:100%;display:block}
</style>
</head>
<body>
<economic-calendar
  api-url="${apiBase}"
  api-key="${apiKey}"
  theme="${theme}"
></economic-calendar>
<script type="module" src="${apiBase}/static/economic-calendar/dist/economic-calendar.standalone.js"></script>
</body>
</html>`
}
