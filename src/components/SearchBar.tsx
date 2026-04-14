import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type?: string;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchTickers = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ticker-search?q=${encodeURIComponent(q)}`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTickers(value), 300);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (ticker: string) => {
    setQuery("");
    setOpen(false);
    setResults([]);
    navigate(`/company/${ticker}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      handleSelect(query.trim().toUpperCase());
    }
  };

  return (
    <div ref={ref} className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => { if (query.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Pesquisar empresa ou ticker..."
          className="w-full rounded-lg border border-border bg-secondary pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>
      {open && (results.length > 0 || (query.length > 0 && !loading)) && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.map(s => (
            <button
              key={`${s.ticker}-${s.exchange}`}
              onClick={() => handleSelect(s.ticker)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
            >
              <span className="font-mono font-semibold text-primary">{s.ticker}</span>
              <span className="text-foreground truncate">{s.name}</span>
              <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{s.exchange}</span>
            </button>
          ))}
          {results.length === 0 && query.length > 0 && !loading && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Sem resultados. Pressiona <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Enter</kbd> para ir direto a <span className="font-mono text-primary">{query.toUpperCase()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
