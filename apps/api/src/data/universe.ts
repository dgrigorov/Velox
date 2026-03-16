/**
 * Instrument universe for Market Buzz.
 * Top 50 S&P 500 stocks by market cap + top 10 crypto pairs.
 */

export interface UniverseItem {
  ticker: string            // FMP/massive ticker (e.g. "AAPL")
  name: string              // Display name
  assetClass: 'stock' | 'crypto'
  fmpNewsTicker: string     // Ticker format for FMP news endpoint
  aliases: string[]         // Company name aliases for text extraction
}

export const UNIVERSE: UniverseItem[] = [
  // ─── Top 50 S&P 500 (by market cap) ─────────────────────────────────────────
  { ticker: 'AAPL',  name: 'Apple',              assetClass: 'stock', fmpNewsTicker: 'AAPL',  aliases: ['apple', 'iphone', 'ipad', 'macbook', 'tim cook'] },
  { ticker: 'MSFT',  name: 'Microsoft',          assetClass: 'stock', fmpNewsTicker: 'MSFT',  aliases: ['microsoft', 'azure', 'windows', 'satya nadella', 'copilot'] },
  { ticker: 'NVDA',  name: 'Nvidia',             assetClass: 'stock', fmpNewsTicker: 'NVDA',  aliases: ['nvidia', 'geforce', 'jensen huang', 'blackwell', 'cuda'] },
  { ticker: 'AMZN',  name: 'Amazon',             assetClass: 'stock', fmpNewsTicker: 'AMZN',  aliases: ['amazon', 'aws', 'prime', 'andy jassy', 'alexa'] },
  { ticker: 'GOOGL', name: 'Alphabet',           assetClass: 'stock', fmpNewsTicker: 'GOOGL', aliases: ['alphabet', 'google', 'youtube', 'gemini', 'sundar pichai', 'waymo'] },
  { ticker: 'META',  name: 'Meta',               assetClass: 'stock', fmpNewsTicker: 'META',  aliases: ['meta', 'facebook', 'instagram', 'whatsapp', 'zuckerberg', 'mark zuckerberg'] },
  { ticker: 'TSLA',  name: 'Tesla',              assetClass: 'stock', fmpNewsTicker: 'TSLA',  aliases: ['tesla', 'elon musk', 'cybertruck', 'model 3', 'model y', 'supercharger'] },
  { ticker: 'LLY',   name: 'Eli Lilly',          assetClass: 'stock', fmpNewsTicker: 'LLY',   aliases: ['eli lilly', 'lilly', 'ozempic', 'mounjaro', 'tirzepatide'] },
  { ticker: 'AVGO',  name: 'Broadcom',           assetClass: 'stock', fmpNewsTicker: 'AVGO',  aliases: ['broadcom', 'hock tan'] },
  { ticker: 'JPM',   name: 'JPMorgan Chase',     assetClass: 'stock', fmpNewsTicker: 'JPM',   aliases: ['jpmorgan', 'jp morgan', 'chase', 'jamie dimon'] },
  { ticker: 'V',     name: 'Visa',               assetClass: 'stock', fmpNewsTicker: 'V',     aliases: ['visa'] },
  { ticker: 'UNH',   name: 'UnitedHealth',       assetClass: 'stock', fmpNewsTicker: 'UNH',   aliases: ['unitedhealth', 'united health', 'unitedhealthcare'] },
  { ticker: 'XOM',   name: 'ExxonMobil',         assetClass: 'stock', fmpNewsTicker: 'XOM',   aliases: ['exxon', 'exxonmobil', 'exxon mobil'] },
  { ticker: 'MA',    name: 'Mastercard',         assetClass: 'stock', fmpNewsTicker: 'MA',    aliases: ['mastercard', 'master card'] },
  { ticker: 'COST',  name: 'Costco',             assetClass: 'stock', fmpNewsTicker: 'COST',  aliases: ['costco'] },
  { ticker: 'PG',    name: 'Procter & Gamble',   assetClass: 'stock', fmpNewsTicker: 'PG',    aliases: ['procter', 'procter gamble', 'p&g'] },
  { ticker: 'JNJ',   name: 'Johnson & Johnson',  assetClass: 'stock', fmpNewsTicker: 'JNJ',   aliases: ['johnson johnson', 'johnson & johnson', 'j&j'] },
  { ticker: 'HD',    name: 'Home Depot',         assetClass: 'stock', fmpNewsTicker: 'HD',    aliases: ['home depot'] },
  { ticker: 'ABBV',  name: 'AbbVie',             assetClass: 'stock', fmpNewsTicker: 'ABBV',  aliases: ['abbvie', 'humira', 'skyrizi'] },
  { ticker: 'MRK',   name: 'Merck',              assetClass: 'stock', fmpNewsTicker: 'MRK',   aliases: ['merck', 'keytruda'] },
  { ticker: 'AMD',   name: 'AMD',                assetClass: 'stock', fmpNewsTicker: 'AMD',   aliases: ['amd', 'advanced micro devices', 'radeon', 'lisa su'] },
  { ticker: 'CVX',   name: 'Chevron',            assetClass: 'stock', fmpNewsTicker: 'CVX',   aliases: ['chevron'] },
  { ticker: 'BAC',   name: 'Bank of America',    assetClass: 'stock', fmpNewsTicker: 'BAC',   aliases: ['bank of america', 'bofa', 'bankofamerica'] },
  { ticker: 'NFLX',  name: 'Netflix',            assetClass: 'stock', fmpNewsTicker: 'NFLX',  aliases: ['netflix'] },
  { ticker: 'CRM',   name: 'Salesforce',         assetClass: 'stock', fmpNewsTicker: 'CRM',   aliases: ['salesforce', 'marc benioff'] },
  { ticker: 'KO',    name: 'Coca-Cola',          assetClass: 'stock', fmpNewsTicker: 'KO',    aliases: ['coca-cola', 'coca cola', 'coke'] },
  { ticker: 'WMT',   name: 'Walmart',            assetClass: 'stock', fmpNewsTicker: 'WMT',   aliases: ['walmart', 'wal-mart'] },
  { ticker: 'MCD',   name: "McDonald's",         assetClass: 'stock', fmpNewsTicker: 'MCD',   aliases: ["mcdonald's", 'mcdonalds', 'mcdonald'] },
  { ticker: 'ADBE',  name: 'Adobe',              assetClass: 'stock', fmpNewsTicker: 'ADBE',  aliases: ['adobe', 'photoshop', 'illustrator', 'firefly'] },
  { ticker: 'TMO',   name: 'Thermo Fisher',      assetClass: 'stock', fmpNewsTicker: 'TMO',   aliases: ['thermo fisher', 'thermofisher'] },
  { ticker: 'WFC',   name: 'Wells Fargo',        assetClass: 'stock', fmpNewsTicker: 'WFC',   aliases: ['wells fargo', 'wellsfargo'] },
  { ticker: 'ACN',   name: 'Accenture',          assetClass: 'stock', fmpNewsTicker: 'ACN',   aliases: ['accenture'] },
  { ticker: 'PM',    name: 'Philip Morris',      assetClass: 'stock', fmpNewsTicker: 'PM',    aliases: ['philip morris', 'philipmorris', 'iqos'] },
  { ticker: 'CSCO',  name: 'Cisco',              assetClass: 'stock', fmpNewsTicker: 'CSCO',  aliases: ['cisco'] },
  { ticker: 'IBM',   name: 'IBM',                assetClass: 'stock', fmpNewsTicker: 'IBM',   aliases: ['ibm', 'international business machines', 'watsonx'] },
  { ticker: 'GE',    name: 'GE Aerospace',       assetClass: 'stock', fmpNewsTicker: 'GE',    aliases: ['ge aerospace', 'general electric'] },
  { ticker: 'ABT',   name: 'Abbott',             assetClass: 'stock', fmpNewsTicker: 'ABT',   aliases: ['abbott', 'abbott laboratories'] },
  { ticker: 'ORCL',  name: 'Oracle',             assetClass: 'stock', fmpNewsTicker: 'ORCL',  aliases: ['oracle', 'larry ellison'] },
  { ticker: 'INTC',  name: 'Intel',              assetClass: 'stock', fmpNewsTicker: 'INTC',  aliases: ['intel', 'core ultra', 'pat gelsinger'] },
  { ticker: 'TXN',   name: 'Texas Instruments',  assetClass: 'stock', fmpNewsTicker: 'TXN',   aliases: ['texas instruments'] },
  { ticker: 'QCOM',  name: 'Qualcomm',           assetClass: 'stock', fmpNewsTicker: 'QCOM',  aliases: ['qualcomm', 'snapdragon'] },
  { ticker: 'GS',    name: 'Goldman Sachs',      assetClass: 'stock', fmpNewsTicker: 'GS',    aliases: ['goldman sachs', 'goldman', 'david solomon'] },
  { ticker: 'CAT',   name: 'Caterpillar',        assetClass: 'stock', fmpNewsTicker: 'CAT',   aliases: ['caterpillar'] },
  { ticker: 'SBUX',  name: 'Starbucks',          assetClass: 'stock', fmpNewsTicker: 'SBUX',  aliases: ['starbucks', 'brian niccol'] },
  { ticker: 'NOW',   name: 'ServiceNow',         assetClass: 'stock', fmpNewsTicker: 'NOW',   aliases: ['servicenow', 'service now'] },
  { ticker: 'PANW',  name: 'Palo Alto Networks', assetClass: 'stock', fmpNewsTicker: 'PANW',  aliases: ['palo alto', 'palo alto networks'] },
  { ticker: 'UNP',   name: 'Union Pacific',      assetClass: 'stock', fmpNewsTicker: 'UNP',   aliases: ['union pacific'] },
  { ticker: 'PYPL',  name: 'PayPal',             assetClass: 'stock', fmpNewsTicker: 'PYPL',  aliases: ['paypal', 'venmo'] },
  { ticker: 'ISRG',  name: 'Intuitive Surgical', assetClass: 'stock', fmpNewsTicker: 'ISRG',  aliases: ['intuitive surgical', 'da vinci'] },
  { ticker: 'AMGN',  name: 'Amgen',              assetClass: 'stock', fmpNewsTicker: 'AMGN',  aliases: ['amgen'] },
  { ticker: 'DIS',   name: 'Disney',             assetClass: 'stock', fmpNewsTicker: 'DIS',   aliases: ['disney', 'walt disney', 'bob iger', 'espn', 'marvel', 'pixar'] },

  // ─── Top crypto ──────────────────────────────────────────────────────────────
  { ticker: 'BTCUSD',  name: 'Bitcoin',   assetClass: 'crypto', fmpNewsTicker: 'BTCUSD',  aliases: ['bitcoin', 'btc', 'satoshi'] },
  { ticker: 'ETHUSD',  name: 'Ethereum',  assetClass: 'crypto', fmpNewsTicker: 'ETHUSD',  aliases: ['ethereum', 'eth', 'vitalik', 'vitalik buterin'] },
  { ticker: 'SOLUSD',  name: 'Solana',    assetClass: 'crypto', fmpNewsTicker: 'SOLUSD',  aliases: ['solana', 'sol'] },
  { ticker: 'XRPUSD',  name: 'XRP',       assetClass: 'crypto', fmpNewsTicker: 'XRPUSD',  aliases: ['xrp', 'ripple'] },
  { ticker: 'BNBUSD',  name: 'BNB',       assetClass: 'crypto', fmpNewsTicker: 'BNBUSD',  aliases: ['bnb', 'binance coin', 'binance'] },
  { ticker: 'DOGEUSD', name: 'Dogecoin',  assetClass: 'crypto', fmpNewsTicker: 'DOGEUSD', aliases: ['dogecoin', 'doge'] },
  { ticker: 'ADAUSD',  name: 'Cardano',   assetClass: 'crypto', fmpNewsTicker: 'ADAUSD',  aliases: ['cardano', 'ada'] },
  { ticker: 'LINKUSD', name: 'Chainlink', assetClass: 'crypto', fmpNewsTicker: 'LINKUSD', aliases: ['chainlink', 'link'] },
  { ticker: 'AVAXUSD', name: 'Avalanche', assetClass: 'crypto', fmpNewsTicker: 'AVAXUSD', aliases: ['avalanche', 'avax'] },
  { ticker: 'MATICUSD',name: 'Polygon',   assetClass: 'crypto', fmpNewsTicker: 'MATICUSD',aliases: ['polygon', 'matic'] },
]

/** All tickers as a Set for fast $TICKER / TICKER lookup */
export const TICKER_SET = new Set(UNIVERSE.map((u) => u.ticker.replace('USD', '')))

/** Map from lowercase alias → ticker */
export const ALIAS_TO_TICKER: Map<string, string> = new Map()
for (const item of UNIVERSE) {
  for (const alias of item.aliases) {
    ALIAS_TO_TICKER.set(alias.toLowerCase(), item.ticker)
  }
}

/** Map from ticker → name */
export const TICKER_NAMES = new Map(UNIVERSE.map((u) => [u.ticker, u.name]))
