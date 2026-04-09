export interface FinancialYear {
  year: number;
  revenue: number;
  revenueGrowth: number | null;
  grossProfit: number;
  grossMargin: number;
  operatingIncome: number;
  ebitGrowth: number | null;
  netIncome: number;
  netIncomeGrowth: number | null;
  eps: number;
  epsGrowth: number | null;
  fcf: number;
  fcfGrowth: number | null;
  roe: number;
  netMargin: number;
  operatingMargin: number;
  sgaToRevenue: number;
  rdToRevenue: number;
  debtToEquity: number;
  currentRatio: number;
  bookValuePerShare: number;
  bookValueGrowth: number | null;
  sharesOutstanding: number;
  dividends: number;
  payoutRatio: number;
}

export interface Company {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  currency: string;
  currentPrice: number;
  marketCap: number;
  sharesOutstanding: number;
  pe: number;
  financials: FinancialYear[];
}

export const MOCK_APPLE: Company = {
  ticker: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  sector: "Technology",
  currency: "USD",
  currentPrice: 227.48,
  marketCap: 3480000,
  sharesOutstanding: 15300,
  pe: 37.5,
  financials: [
    { year: 2015, revenue: 233715, revenueGrowth: null, grossProfit: 93626, grossMargin: 40.06, operatingIncome: 71230, ebitGrowth: null, netIncome: 53394, netIncomeGrowth: null, eps: 9.22, epsGrowth: null, fcf: 70019, fcfGrowth: null, roe: 46.25, netMargin: 22.85, operatingMargin: 30.48, sgaToRevenue: 6.13, rdToRevenue: 3.45, debtToEquity: 0.54, currentRatio: 1.11, bookValuePerShare: 22.41, bookValueGrowth: null, sharesOutstanding: 5793, dividends: 1.98, payoutRatio: 21.5 },
    { year: 2016, revenue: 215639, revenueGrowth: -7.73, grossProfit: 84263, grossMargin: 39.08, operatingIncome: 60024, ebitGrowth: -15.73, netIncome: 45687, netIncomeGrowth: -14.43, eps: 8.31, epsGrowth: -9.87, fcf: 53090, fcfGrowth: -24.18, roe: 36.90, netMargin: 21.19, operatingMargin: 27.84, sgaToRevenue: 6.64, rdToRevenue: 4.66, debtToEquity: 0.68, currentRatio: 1.35, bookValuePerShare: 23.72, bookValueGrowth: 5.85, sharesOutstanding: 5500, dividends: 2.18, payoutRatio: 26.2 },
    { year: 2017, revenue: 229234, revenueGrowth: 6.30, grossProfit: 88186, grossMargin: 38.47, operatingIncome: 61344, ebitGrowth: 2.20, netIncome: 48351, netIncomeGrowth: 5.83, eps: 9.21, epsGrowth: 10.83, fcf: 51774, fcfGrowth: -2.48, roe: 36.07, netMargin: 21.09, operatingMargin: 26.76, sgaToRevenue: 6.58, rdToRevenue: 5.01, debtToEquity: 0.86, currentRatio: 1.28, bookValuePerShare: 25.83, bookValueGrowth: 8.89, sharesOutstanding: 5252, dividends: 2.40, payoutRatio: 26.1 },
    { year: 2018, revenue: 265595, revenueGrowth: 15.86, grossProfit: 101839, grossMargin: 38.34, operatingIncome: 70898, ebitGrowth: 15.58, netIncome: 59531, netIncomeGrowth: 23.12, eps: 11.91, epsGrowth: 29.32, fcf: 64121, fcfGrowth: 23.85, roe: 49.36, netMargin: 22.41, operatingMargin: 26.69, sgaToRevenue: 6.29, rdToRevenue: 5.36, debtToEquity: 1.07, currentRatio: 1.12, bookValuePerShare: 22.53, bookValueGrowth: -12.77, sharesOutstanding: 5000, dividends: 2.72, payoutRatio: 22.8 },
    { year: 2019, revenue: 260174, revenueGrowth: -2.04, grossProfit: 98392, grossMargin: 37.82, operatingIncome: 63930, ebitGrowth: -9.83, netIncome: 55256, netIncomeGrowth: -7.18, eps: 11.89, epsGrowth: -0.17, fcf: 58896, fcfGrowth: -8.14, roe: 55.92, netMargin: 21.24, operatingMargin: 24.57, sgaToRevenue: 6.63, rdToRevenue: 6.26, debtToEquity: 1.19, currentRatio: 1.54, bookValuePerShare: 20.44, bookValueGrowth: -9.28, sharesOutstanding: 4649, dividends: 3.00, payoutRatio: 25.2 },
    { year: 2020, revenue: 274515, revenueGrowth: 5.51, grossProfit: 104956, grossMargin: 38.23, operatingIncome: 66288, ebitGrowth: 3.69, netIncome: 57411, netIncomeGrowth: 3.90, eps: 3.28, epsGrowth: -72.41, fcf: 73365, fcfGrowth: 24.56, roe: 73.69, netMargin: 20.91, operatingMargin: 24.15, sgaToRevenue: 6.32, rdToRevenue: 6.78, debtToEquity: 1.73, currentRatio: 1.36, bookValuePerShare: 3.85, bookValueGrowth: -81.16, sharesOutstanding: 17528, dividends: 0.80, payoutRatio: 24.4 },
    { year: 2021, revenue: 365817, revenueGrowth: 33.26, grossProfit: 152836, grossMargin: 41.78, operatingIncome: 108949, ebitGrowth: 64.36, netIncome: 94680, netIncomeGrowth: 64.92, eps: 5.61, epsGrowth: 70.73, fcf: 92953, fcfGrowth: 26.69, roe: 147.44, netMargin: 25.88, operatingMargin: 29.78, sgaToRevenue: 5.89, rdToRevenue: 5.88, debtToEquity: 2.39, currentRatio: 1.07, bookValuePerShare: 3.84, bookValueGrowth: -0.26, sharesOutstanding: 16865, dividends: 0.85, payoutRatio: 15.2 },
    { year: 2022, revenue: 394328, revenueGrowth: 7.79, grossProfit: 170782, grossMargin: 43.31, operatingIncome: 119437, ebitGrowth: 9.63, netIncome: 99803, netIncomeGrowth: 5.41, eps: 6.11, epsGrowth: 8.91, fcf: 111443, fcfGrowth: 19.89, roe: 196.96, netMargin: 25.31, operatingMargin: 30.29, sgaToRevenue: 6.11, rdToRevenue: 6.68, debtToEquity: 2.39, currentRatio: 0.88, bookValuePerShare: 3.18, bookValueGrowth: -17.19, sharesOutstanding: 16326, dividends: 0.91, payoutRatio: 14.9 },
    { year: 2023, revenue: 383285, revenueGrowth: -2.80, grossProfit: 169148, grossMargin: 44.13, operatingIncome: 114301, ebitGrowth: -4.30, netIncome: 96995, netIncomeGrowth: -2.81, eps: 6.13, epsGrowth: 0.33, fcf: 99584, fcfGrowth: -10.64, roe: 156.08, netMargin: 25.31, operatingMargin: 29.82, sgaToRevenue: 6.33, rdToRevenue: 7.67, debtToEquity: 1.79, currentRatio: 0.99, bookValuePerShare: 3.99, bookValueGrowth: 25.47, sharesOutstanding: 15813, dividends: 0.95, payoutRatio: 15.5 },
    { year: 2024, revenue: 391035, revenueGrowth: 2.02, grossProfit: 180683, grossMargin: 46.21, operatingIncome: 123216, ebitGrowth: 7.80, netIncome: 93736, netIncomeGrowth: -3.36, eps: 6.08, epsGrowth: -0.82, fcf: 108807, fcfGrowth: 9.26, roe: 157.41, netMargin: 23.97, operatingMargin: 31.51, sgaToRevenue: 6.34, rdToRevenue: 8.35, debtToEquity: 1.87, currentRatio: 0.87, bookValuePerShare: 3.77, bookValueGrowth: -5.51, sharesOutstanding: 15408, dividends: 1.00, payoutRatio: 16.4 },
  ],
};

export const MOCK_MSFT: Company = {
  ticker: "MSFT",
  name: "Microsoft Corp.",
  exchange: "NASDAQ",
  sector: "Technology",
  currency: "USD",
  currentPrice: 467.56,
  marketCap: 3470000,
  sharesOutstanding: 7430,
  pe: 36.8,
  financials: [
    { year: 2020, revenue: 143015, revenueGrowth: null, grossProfit: 96937, grossMargin: 67.78, operatingIncome: 52959, ebitGrowth: null, netIncome: 44281, netIncomeGrowth: null, eps: 5.76, epsGrowth: null, fcf: 45234, fcfGrowth: null, roe: 37.43, netMargin: 30.96, operatingMargin: 37.03, sgaToRevenue: 16.98, rdToRevenue: 13.39, debtToEquity: 0.62, currentRatio: 2.52, bookValuePerShare: 15.48, bookValueGrowth: null, sharesOutstanding: 7683, dividends: 2.04, payoutRatio: 35.4 },
    { year: 2021, revenue: 168088, revenueGrowth: 17.53, grossProfit: 115856, grossMargin: 68.93, operatingIncome: 69916, ebitGrowth: 32.02, netIncome: 61271, netIncomeGrowth: 38.35, eps: 8.05, epsGrowth: 39.76, fcf: 56118, fcfGrowth: 24.06, roe: 43.15, netMargin: 36.45, operatingMargin: 41.59, sgaToRevenue: 14.62, rdToRevenue: 12.32, debtToEquity: 0.50, currentRatio: 2.08, bookValuePerShare: 18.90, bookValueGrowth: 22.09, sharesOutstanding: 7608, dividends: 2.24, payoutRatio: 27.8 },
    { year: 2022, revenue: 198270, revenueGrowth: 17.96, grossProfit: 135620, grossMargin: 68.40, operatingIncome: 83383, ebitGrowth: 19.26, netIncome: 72738, netIncomeGrowth: 18.71, eps: 9.65, epsGrowth: 19.88, fcf: 65149, fcfGrowth: 16.09, roe: 43.68, netMargin: 36.69, operatingMargin: 42.06, sgaToRevenue: 12.88, rdToRevenue: 12.65, debtToEquity: 0.39, currentRatio: 1.78, bookValuePerShare: 22.31, bookValueGrowth: 18.04, sharesOutstanding: 7540, dividends: 2.48, payoutRatio: 25.7 },
    { year: 2023, revenue: 211915, revenueGrowth: 6.88, grossProfit: 146052, grossMargin: 68.92, operatingIncome: 88523, ebitGrowth: 6.16, netIncome: 72361, netIncomeGrowth: -0.52, eps: 9.68, epsGrowth: 0.31, fcf: 59475, fcfGrowth: -8.71, roe: 35.09, netMargin: 34.15, operatingMargin: 41.77, sgaToRevenue: 13.35, rdToRevenue: 13.42, debtToEquity: 0.29, currentRatio: 1.77, bookValuePerShare: 27.88, bookValueGrowth: 24.97, sharesOutstanding: 7472, dividends: 2.72, payoutRatio: 28.1 },
    { year: 2024, revenue: 245122, revenueGrowth: 15.67, grossProfit: 171008, grossMargin: 69.76, operatingIncome: 109433, ebitGrowth: 23.62, netIncome: 88136, netIncomeGrowth: 21.80, eps: 11.86, epsGrowth: 22.52, fcf: 74071, fcfGrowth: 24.54, roe: 37.13, netMargin: 35.96, operatingMargin: 44.64, sgaToRevenue: 11.10, rdToRevenue: 13.09, debtToEquity: 0.21, currentRatio: 1.27, bookValuePerShare: 32.28, bookValueGrowth: 15.78, sharesOutstanding: 7432, dividends: 3.00, payoutRatio: 25.3 },
  ],
};

export const MOCK_COMPANIES: Company[] = [MOCK_APPLE, MOCK_MSFT];

export interface PortfolioPosition {
  id: string;
  ticker: string;
  name: string;
  buyDate: string;
  buyPrice: number;
  quantity: number;
  currentPrice: number;
}

export const MOCK_PORTFOLIO: PortfolioPosition[] = [
  { id: "1", ticker: "AAPL", name: "Apple Inc.", buyDate: "2022-06-15", buyPrice: 135.87, quantity: 50, currentPrice: 227.48 },
  { id: "2", ticker: "MSFT", name: "Microsoft Corp.", buyDate: "2023-01-10", buyPrice: 228.85, quantity: 20, currentPrice: 467.56 },
];

export interface WishlistItem {
  id: string;
  ticker: string;
  name: string;
  addedDate: string;
  notes: string;
}

export const MOCK_WISHLIST: WishlistItem[] = [
  { id: "1", ticker: "GOOG", name: "Alphabet Inc.", addedDate: "2024-12-01", notes: "Analisar após próximo earnings" },
  { id: "2", ticker: "JNJ", name: "Johnson & Johnson", addedDate: "2024-11-15", notes: "Empresa defensiva, bom dividendo" },
  { id: "3", ticker: "BRK.B", name: "Berkshire Hathaway", addedDate: "2025-01-05", notes: "Referência de value investing" },
];

export const TICKER_SUGGESTIONS = [
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { ticker: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ" },
  { ticker: "GOOG", name: "Alphabet Inc.", exchange: "NASDAQ" },
  { ticker: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ" },
  { ticker: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ" },
  { ticker: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ" },
  { ticker: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ" },
  { ticker: "JNJ", name: "Johnson & Johnson", exchange: "NYSE" },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE" },
  { ticker: "V", name: "Visa Inc.", exchange: "NYSE" },
  { ticker: "BRK.B", name: "Berkshire Hathaway", exchange: "NYSE" },
  { ticker: "KO", name: "Coca-Cola Co.", exchange: "NYSE" },
];
