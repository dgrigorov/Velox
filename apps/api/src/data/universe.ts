/**
 * Instrument universe for Market Buzz.
 * Top 50 S&P 500 stocks by market cap + top 10 crypto pairs.
 */

export interface UniverseItem {
  ticker: string          // FMP/massive ticker (e.g. "AAPL")
  name: string            // Display name
  assetClass: 'stock' | 'crypto'
  fmpNewsTicker: string   // Ticker format for FMP news endpoint
}

export const UNIVERSE: UniverseItem[] = [
  // ─── Top 50 S&P 500 (by market cap) ────────────────────────────────────────
  { ticker: 'AAPL',  name: 'Apple',              assetClass: 'stock', fmpNewsTicker: 'AAPL'  },
  { ticker: 'MSFT',  name: 'Microsoft',          assetClass: 'stock', fmpNewsTicker: 'MSFT'  },
  { ticker: 'NVDA',  name: 'Nvidia',             assetClass: 'stock', fmpNewsTicker: 'NVDA'  },
  { ticker: 'AMZN',  name: 'Amazon',             assetClass: 'stock', fmpNewsTicker: 'AMZN'  },
  { ticker: 'GOOGL', name: 'Alphabet',           assetClass: 'stock', fmpNewsTicker: 'GOOGL' },
  { ticker: 'META',  name: 'Meta',               assetClass: 'stock', fmpNewsTicker: 'META'  },
  { ticker: 'TSLA',  name: 'Tesla',              assetClass: 'stock', fmpNewsTicker: 'TSLA'  },
  { ticker: 'LLY',   name: 'Eli Lilly',          assetClass: 'stock', fmpNewsTicker: 'LLY'   },
  { ticker: 'AVGO',  name: 'Broadcom',           assetClass: 'stock', fmpNewsTicker: 'AVGO'  },
  { ticker: 'JPM',   name: 'JPMorgan Chase',     assetClass: 'stock', fmpNewsTicker: 'JPM'   },
  { ticker: 'V',     name: 'Visa',               assetClass: 'stock', fmpNewsTicker: 'V'     },
  { ticker: 'UNH',   name: 'UnitedHealth',       assetClass: 'stock', fmpNewsTicker: 'UNH'   },
  { ticker: 'XOM',   name: 'ExxonMobil',         assetClass: 'stock', fmpNewsTicker: 'XOM'   },
  { ticker: 'MA',    name: 'Mastercard',         assetClass: 'stock', fmpNewsTicker: 'MA'    },
  { ticker: 'COST',  name: 'Costco',             assetClass: 'stock', fmpNewsTicker: 'COST'  },
  { ticker: 'PG',    name: 'Procter & Gamble',   assetClass: 'stock', fmpNewsTicker: 'PG'    },
  { ticker: 'JNJ',   name: 'Johnson & Johnson',  assetClass: 'stock', fmpNewsTicker: 'JNJ'   },
  { ticker: 'HD',    name: 'Home Depot',         assetClass: 'stock', fmpNewsTicker: 'HD'    },
  { ticker: 'ABBV',  name: 'AbbVie',             assetClass: 'stock', fmpNewsTicker: 'ABBV'  },
  { ticker: 'MRK',   name: 'Merck',              assetClass: 'stock', fmpNewsTicker: 'MRK'   },
  { ticker: 'AMD',   name: 'AMD',                assetClass: 'stock', fmpNewsTicker: 'AMD'   },
  { ticker: 'CVX',   name: 'Chevron',            assetClass: 'stock', fmpNewsTicker: 'CVX'   },
  { ticker: 'BAC',   name: 'Bank of America',    assetClass: 'stock', fmpNewsTicker: 'BAC'   },
  { ticker: 'NFLX',  name: 'Netflix',            assetClass: 'stock', fmpNewsTicker: 'NFLX'  },
  { ticker: 'CRM',   name: 'Salesforce',         assetClass: 'stock', fmpNewsTicker: 'CRM'   },
  { ticker: 'KO',    name: 'Coca-Cola',          assetClass: 'stock', fmpNewsTicker: 'KO'    },
  { ticker: 'WMT',   name: 'Walmart',            assetClass: 'stock', fmpNewsTicker: 'WMT'   },
  { ticker: 'MCD',   name: "McDonald's",         assetClass: 'stock', fmpNewsTicker: 'MCD'   },
  { ticker: 'ADBE',  name: 'Adobe',              assetClass: 'stock', fmpNewsTicker: 'ADBE'  },
  { ticker: 'TMO',   name: 'Thermo Fisher',      assetClass: 'stock', fmpNewsTicker: 'TMO'   },
  { ticker: 'WFC',   name: 'Wells Fargo',        assetClass: 'stock', fmpNewsTicker: 'WFC'   },
  { ticker: 'ACN',   name: 'Accenture',          assetClass: 'stock', fmpNewsTicker: 'ACN'   },
  { ticker: 'PM',    name: 'Philip Morris',      assetClass: 'stock', fmpNewsTicker: 'PM'    },
  { ticker: 'CSCO',  name: 'Cisco',              assetClass: 'stock', fmpNewsTicker: 'CSCO'  },
  { ticker: 'IBM',   name: 'IBM',                assetClass: 'stock', fmpNewsTicker: 'IBM'   },
  { ticker: 'GE',    name: 'GE Aerospace',       assetClass: 'stock', fmpNewsTicker: 'GE'    },
  { ticker: 'ABT',   name: 'Abbott',             assetClass: 'stock', fmpNewsTicker: 'ABT'   },
  { ticker: 'ORCL',  name: 'Oracle',             assetClass: 'stock', fmpNewsTicker: 'ORCL'  },
  { ticker: 'INTC',  name: 'Intel',              assetClass: 'stock', fmpNewsTicker: 'INTC'  },
  { ticker: 'TXN',   name: 'Texas Instruments',  assetClass: 'stock', fmpNewsTicker: 'TXN'   },
  { ticker: 'QCOM',  name: 'Qualcomm',           assetClass: 'stock', fmpNewsTicker: 'QCOM'  },
  { ticker: 'GS',    name: 'Goldman Sachs',      assetClass: 'stock', fmpNewsTicker: 'GS'    },
  { ticker: 'CAT',   name: 'Caterpillar',        assetClass: 'stock', fmpNewsTicker: 'CAT'   },
  { ticker: 'SBUX',  name: 'Starbucks',          assetClass: 'stock', fmpNewsTicker: 'SBUX'  },
  { ticker: 'NOW',   name: 'ServiceNow',         assetClass: 'stock', fmpNewsTicker: 'NOW'   },
  { ticker: 'PANW',  name: 'Palo Alto Networks', assetClass: 'stock', fmpNewsTicker: 'PANW'  },
  { ticker: 'UNP',   name: 'Union Pacific',      assetClass: 'stock', fmpNewsTicker: 'UNP'   },
  { ticker: 'PYPL',  name: 'PayPal',             assetClass: 'stock', fmpNewsTicker: 'PYPL'  },
  { ticker: 'ISRG',  name: 'Intuitive Surgical', assetClass: 'stock', fmpNewsTicker: 'ISRG'  },
  { ticker: 'AMGN',  name: 'Amgen',              assetClass: 'stock', fmpNewsTicker: 'AMGN'  },
  { ticker: 'DIS',   name: 'Disney',             assetClass: 'stock', fmpNewsTicker: 'DIS'   },

  // ─── Top crypto ─────────────────────────────────────────────────────────────
  { ticker: 'BTCUSD', name: 'Bitcoin',   assetClass: 'crypto', fmpNewsTicker: 'BTCUSD' },
  { ticker: 'ETHUSD', name: 'Ethereum',  assetClass: 'crypto', fmpNewsTicker: 'ETHUSD' },
  { ticker: 'SOLUSD', name: 'Solana',    assetClass: 'crypto', fmpNewsTicker: 'SOLUSD' },
  { ticker: 'XRPUSD', name: 'XRP',       assetClass: 'crypto', fmpNewsTicker: 'XRPUSD' },
  { ticker: 'BNBUSD', name: 'BNB',       assetClass: 'crypto', fmpNewsTicker: 'BNBUSD' },
  { ticker: 'DOGEUSD',name: 'Dogecoin',  assetClass: 'crypto', fmpNewsTicker: 'DOGEUSD'},
  { ticker: 'ADAUSD', name: 'Cardano',   assetClass: 'crypto', fmpNewsTicker: 'ADAUSD' },
  { ticker: 'LINKUSD', name: 'Chainlink',assetClass: 'crypto', fmpNewsTicker: 'LINKUSD'},
  { ticker: 'AVAXUSD', name: 'Avalanche',assetClass: 'crypto', fmpNewsTicker: 'AVAXUSD'},
  { ticker: 'MATICUSD',name: 'Polygon',  assetClass: 'crypto', fmpNewsTicker: 'MATICUSD'},
]

/** All tickers as a Set for fast lookup (used in Reddit mention extraction) */
export const TICKER_SET = new Set(UNIVERSE.map((u) => u.ticker.replace('USD', '')))

/** Map from ticker → name */
export const TICKER_NAMES = new Map(UNIVERSE.map((u) => [u.ticker, u.name]))
