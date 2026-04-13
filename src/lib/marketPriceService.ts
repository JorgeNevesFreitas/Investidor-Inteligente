export interface MarketPriceResult {
  price: number;
  currency: string;
  source: string;
  timestamp: string;
  status: 'loading' | 'success' | 'error' | 'unavailable';
}

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: MarketPriceResult; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchMarketPrice(ticker: string): Promise<MarketPriceResult> {
  const key = ticker.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-price?ticker=${encodeURIComponent(key)}`,
      {
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      }
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
      cache.set(key, { data: result, fetchedAt: Date.now() });
      return result;
    }

    return {
      price: 0,
      currency: 'USD',
      source: '',
      timestamp: new Date().toISOString(),
      status: 'unavailable',
    };
  } catch {
    return {
      price: 0,
      currency: 'USD',
      source: '',
      timestamp: new Date().toISOString(),
      status: 'error',
    };
  }
}

export function clearPriceCache(ticker?: string) {
  if (ticker) cache.delete(ticker.toUpperCase());
  else cache.clear();
}
