import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import { TICKER_SUGGESTIONS } from "@/lib/mockData";
import { useNavigate } from "react-router-dom";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const filtered = query.length > 0
    ? TICKER_SUGGESTIONS.filter(s =>
        s.ticker.toLowerCase().includes(query.toLowerCase()) ||
        s.name.toLowerCase().includes(query.toLowerCase())
      )
    : [];

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
    navigate(`/company/${ticker}`);
  };

  return (
    <div ref={ref} className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Pesquisar empresa ou ticker..."
          className="w-full rounded-lg border border-border bg-secondary pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl overflow-hidden">
          {filtered.map(s => (
            <button
              key={s.ticker}
              onClick={() => handleSelect(s.ticker)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
            >
              <span className="font-mono font-semibold text-primary">{s.ticker}</span>
              <span className="text-foreground">{s.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{s.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
