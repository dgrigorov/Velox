import '@velox/economic-calendar'
import '@velox/market-buzz'

// ─── Widget elements ──────────────────────────────────────────────────────────

const ecWidget = document.getElementById('ec-widget') as HTMLElement & {
  apiUrl: string
  apiKey: string
  theme: string
}
const mbWidget = document.getElementById('mb-widget') as HTMLElement & {
  apiUrl: string
  apiKey: string
  theme: string
}

// ─── Tab switching ────────────────────────────────────────────────────────────

const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn')

function setActiveWidget(widgetName: string): void {
  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset['widget'] === widgetName)
  })
  ecWidget.style.display = widgetName === 'economic-calendar' ? '' : 'none'
  mbWidget.style.display = widgetName === 'market-buzz' ? '' : 'none'
}

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const widget = btn.dataset['widget']
    if (widget) setActiveWidget(widget)
  })
})

// ─── Theme toggle ─────────────────────────────────────────────────────────────

const html = document.documentElement
const themeToggle = document.getElementById('theme-toggle')!
const iconDark = document.getElementById('icon-dark') as HTMLElement
const iconLight = document.getElementById('icon-light') as HTMLElement

function applyTheme(theme: 'dark' | 'light'): void {
  html.dataset['theme'] = theme
  iconDark.style.display = theme === 'dark' ? '' : 'none'
  iconLight.style.display = theme === 'light' ? '' : 'none'
  ecWidget.setAttribute('theme', theme)
  mbWidget.setAttribute('theme', theme)
}

themeToggle.addEventListener('click', () => {
  const current = html.dataset['theme'] === 'dark' ? 'dark' : 'light'
  applyTheme(current === 'dark' ? 'light' : 'dark')
})

// ─── Config panel ─────────────────────────────────────────────────────────────

const configPanel = document.getElementById('config-panel')!
const configToggle = document.getElementById('config-toggle')!
const configApply = document.getElementById('config-apply')!
const inputApiUrl = document.getElementById('input-api-url') as HTMLInputElement
const inputApiKey = document.getElementById('input-api-key') as HTMLInputElement

configToggle.addEventListener('click', () => {
  configPanel.classList.toggle('collapsed')
})

configApply.addEventListener('click', () => {
  const url = inputApiUrl.value.trim() || 'http://localhost:4000'
  const key = inputApiKey.value.trim() || 'vx_dev_demo'
  ecWidget.setAttribute('api-url', url)
  ecWidget.setAttribute('api-key', key)
  mbWidget.setAttribute('api-url', url)
  mbWidget.setAttribute('api-key', key)
  configPanel.classList.add('collapsed')
})
