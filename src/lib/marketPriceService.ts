export interface MarketPriceResult {
  price: number;
  currency: string;
  source: string;
  timestamp: string;
  status: 'loading' | 'success' | 'error' | 'unavailable';
}

export interface QuoteData {
  price: number;
  currency: string;
  pe: number | null;
  marketCap: number | null; // in millions, matches app convention
  exchange: string | null;
  sector: string | null;
  timestamp: string;
  status: 'success' | 'error' | 'unavailable';
}

// In-memory cache: 5-minute TTL for price-only, 30-minute TTL for full quotes
const priceCache = new Map<string, { data: MarketPriceResult; fetchedAt: number }>();
const quoteCache = new Map<string, { data: QuoteData; fetchedAt: number }>();
const PRICE_TTL_MS = 5 * 60 * 1000;
const QUOTE_TTL_MS = 30 * 60 * 1000;

function edgeUrl(path: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`;
}

function edgeHeaders(): HeadersInit {
  return {
    'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
}

// Price-only fetch (fast, used for 30s polling)
export async function fetchMarketPrice(ticker: string): Promise<MarketPriceResult> {
  const key = ticker.toUpperCase();
  const cached = priceCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < PRICE_TTL_MS) return cached.data;

  try {
    const response = await fetch(
      edgeUrl(`market-price?ticker=${encodeURIComponent(key)}&mode=price`),
      { headers: edgeHeaders() }
    );
    const data = await response.json();

    if (data.success && data.price > 0) {
      const result: MarketPriceResult = {
        price: data.price,
        currency: data.currency || 'USD',
        source: data.source || 'unknown',
        timestamp: data.timestamp || new Date().toISOString(),
        status: 'success',
      };
      priceCache.set(key, { data: result, fetchedAt: Date.now() });
      return result;
    }

    return { price: 0, currency: 'USD', source: '', timestamp: new Date().toISOString(), status: 'unavailable' };
  } catch {
    return { price: 0, currency: 'USD', source: '', timestamp: new Date().toISOString(), status: 'error' };
  }
}

// Full quote fetch: price + P/E + Market Cap + Exchange + Sector (used once on load)
export async function fetchQuoteData(ticker: string): Promise<QuoteData> {
  const key = ticker.toUpperCase();
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < QUOTE_TTL_MS) return cached.data;

  try {
    const response = await fetch(
      edgeUrl(`market-price?ticker=${encodeURIComponent(key)}&mode=full`),
      { headers: edgeHeaders() }
    );
    const data = await response.json();

    if (data.success && data.price > 0) {
      const result: QuoteData = {
        price: data.price,
        currency: data.currency || 'USD',
        pe: data.pe ?? null,
        marketCap: data.marketCap ?? null,
        exchange: data.exchange ?? null,
        sector: data.sector ?? null,
        timestamp: data.timestamp || new Date().toISOString(),
        status: 'success',
      };
      quoteCache.set(key, { data: result, fetchedAt: Date.now() });
      // Also update price cache so polling starts with a fresh value
      priceCache.set(key, {
        data: { price: result.price, currency: result.currency, source: 'yahoo_finance', timestamp: result.timestamp, status: 'success' },
        fetchedAt: Date.now(),
      });
      return result;
    }

    return { price: 0, currency: 'USD', pe: null, marketCap: null, exchange: null, sector: null, timestamp: new Date().toISOString(), status: data.status || 'unavailable' };
  } catch {
    return { price: 0, currency: 'USD', pe: null, marketCap: null, exchange: null, sector: null, timestamp: new Date().toISOString(), status: 'error' };
  }
}

export function clearPriceCache(ticker?: string) {
  if (ticker) {
    priceCache.delete(ticker.toUpperCase());
    quoteCache.delete(ticker.toUpperCase());
  } else {
    priceCache.clear();
    quoteCache.clear();
  }
}
