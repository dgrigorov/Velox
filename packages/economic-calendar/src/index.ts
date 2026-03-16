if (!customElements.get('economic-calendar')) {
  void import('./economic-calendar.js')
}

export { EconomicCalendar } from './economic-calendar.js'
