export interface CountryMeta {
  flag: string
  currency: string
  name: string
}

const COUNTRY_MAP: Record<string, CountryMeta> = {
  US: { flag: '🇺🇸', currency: 'USD', name: 'United States' },
  GB: { flag: '🇬🇧', currency: 'GBP', name: 'United Kingdom' },
  EU: { flag: '🇪🇺', currency: 'EUR', name: 'Euro Area' },
  DE: { flag: '🇩🇪', currency: 'EUR', name: 'Germany' },
  FR: { flag: '🇫🇷', currency: 'EUR', name: 'France' },
  JP: { flag: '🇯🇵', currency: 'JPY', name: 'Japan' },
  CN: { flag: '🇨🇳', currency: 'CNY', name: 'China' },
  CA: { flag: '🇨🇦', currency: 'CAD', name: 'Canada' },
  AU: { flag: '🇦🇺', currency: 'AUD', name: 'Australia' },
  CH: { flag: '🇨🇭', currency: 'CHF', name: 'Switzerland' },
  NZ: { flag: '🇳🇿', currency: 'NZD', name: 'New Zealand' },
  MX: { flag: '🇲🇽', currency: 'MXN', name: 'Mexico' },
  IT: { flag: '🇮🇹', currency: 'EUR', name: 'Italy' },
  ES: { flag: '🇪🇸', currency: 'EUR', name: 'Spain' },
  SE: { flag: '🇸🇪', currency: 'SEK', name: 'Sweden' },
  NO: { flag: '🇳🇴', currency: 'NOK', name: 'Norway' },
  DK: { flag: '🇩🇰', currency: 'DKK', name: 'Denmark' },
  BR: { flag: '🇧🇷', currency: 'BRL', name: 'Brazil' },
  IN: { flag: '🇮🇳', currency: 'INR', name: 'India' },
  KR: { flag: '🇰🇷', currency: 'KRW', name: 'South Korea' },
  SG: { flag: '🇸🇬', currency: 'SGD', name: 'Singapore' },
  HK: { flag: '🇭🇰', currency: 'HKD', name: 'Hong Kong' },
  ZA: { flag: '🇿🇦', currency: 'ZAR', name: 'South Africa' },
  PL: { flag: '🇵🇱', currency: 'PLN', name: 'Poland' },
  CZ: { flag: '🇨🇿', currency: 'CZK', name: 'Czech Republic' },
}

export function getCountryMeta(code: string): CountryMeta {
  return (
    COUNTRY_MAP[code.toUpperCase()] ?? { flag: '🌐', currency: code, name: code }
  )
}
