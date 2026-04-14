import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2, Plus, Star, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
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

  const handleAddToWishlist = async (e: React.MouseEvent, item: SearchResult) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('wishlist').upsert(
        { ticker: item.ticker, name: item.name, exchange: item.exchange },
        { onConflict: 'ticker' }
      );
      if (error) throw error;
      toast({ title: "Adicionada à Wishlist", description: `${item.name} (${item.ticker})` });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Não foi possível adicionar", variant: "destructive" });
    }
  };

  const handleAddToDashboard = (e: React.MouseEvent, ticker: string) => {
    e.stopPropagation();
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
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl overflow-hidden max-h-96 overflow-y-auto">
          {results.map(s => (
            <div
              key={`${s.ticker}-${s.exchange}`}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent transition-colors group"
            >
              <button
                onClick={() => handleSelect(s.ticker)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <span className="font-mono font-semibold text-primary">{s.ticker}</span>
                <span className="text-foreground truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{s.exchange}</span>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleAddToDashboard(e, s.ticker)}
                  title="Analisar / Adicionar ao Dashboard"
                  className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => handleAddToWishlist(e, s)}
                  title="Adicionar à Wishlist"
                  className="rounded p-1.5 text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
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
