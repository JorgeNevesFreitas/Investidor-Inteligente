import { useState, useRef, useEffect, useCallback } from "react";
import { Search, Loader2, Star, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { importFromSEC, importFromStockAnalysis } from "@/lib/financialDataService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type?: string;
}

type ImportSource = 'sec' | 'stockanalysis';

const US_EXCHANGE_PATTERNS = ['Nasdaq', 'NYSE', 'OTC', 'BATS', 'Cboe'];

function isUSExchange(exchange: string): boolean {
  return US_EXCHANGE_PATTERNS.some(p => exchange.includes(p));
}

function buildSAUrl(ticker: string): string {
  const base = ticker.replace(/\.[A-Z0-9]{1,4}$/, '');
  return `https://stockanalysis.com/stocks/${base.toLowerCase()}/`;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canEdit } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [pendingImport, setPendingImport] = useState<SearchResult | null>(null);
  const [importSource, setImportSource] = useState<ImportSource>('stockanalysis');
  const [saUrl, setSaUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const searchTickers = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
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

  const handleItemSelect = async (item: SearchResult) => {
    setQuery("");
    setOpen(false);
    setResults([]);

    // Check if company already exists in DB
    try {
      const { data } = await supabase
        .from('companies').select('id').eq('ticker', item.ticker).maybeSingle();
      if (data) {
        navigate(`/company/${item.ticker}`);
        return;
      }
    } catch {
      navigate(`/company/${item.ticker}`);
      return;
    }

    // Not in DB → show import confirmation modal
    const source: ImportSource = isUSExchange(item.exchange) ? 'sec' : 'stockanalysis';
    setImportSource(source);
    setSaUrl(buildSAUrl(item.ticker));
    setPendingImport(item);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      const ticker = query.trim().toUpperCase();
      const match = results.find(r => r.ticker.toUpperCase() === ticker);
      handleItemSelect(match ?? { ticker, name: ticker, exchange: '', type: 'EQUITY' });
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const result = importSource === 'sec'
        ? await importFromSEC(pendingImport.ticker, { is_incremental: false })
        : await importFromStockAnalysis({
            ticker: pendingImport.ticker,
            url: saUrl,
            company_name: pendingImport.name,
            exchange: pendingImport.exchange,
            is_incremental: false,
          });

      if (result.success) {
        if (result.warnings?.length) {
          toast({ title: "Dados possivelmente incompletos", description: result.warnings.join(" "), variant: "destructive" });
        }
        setPendingImport(null);
        navigate(`/company/${pendingImport.ticker}`);
      } else if (result.suggest_alternative_source === 'stockanalysis' && importSource === 'sec') {
        // SEC can't serve this company (e.g. foreign private issuer filing IFRS 20-F) —
        // switch the pre-selected source so the user can just confirm again.
        setImportSource('stockanalysis');
        toast({
          title: 'SEC sem dados compatíveis',
          description: `${result.error} A fonte foi alterada para StockAnalysis — confirma novamente para importar.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Erro na importação', description: result.error || 'Falha', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
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
                onClick={() => handleItemSelect(s)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <span className="font-mono font-semibold text-primary">{s.ticker}</span>
                <span className="text-foreground truncate">{s.name}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{s.exchange}</span>
              </button>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); handleItemSelect(s); }}
                  title="Analisar / Adicionar ao Dashboard"
                  className="rounded p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                {canEdit && (
                  <button
                    onClick={e => handleAddToWishlist(e, s)}
                    title="Adicionar à Wishlist"
                    className="rounded p-1.5 text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
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

      {/* Import confirmation modal */}
      <Dialog
        open={!!pendingImport}
        onOpenChange={open => { if (!open && !importing) setPendingImport(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Importar empresa</DialogTitle>
          </DialogHeader>

          {pendingImport && (
            <div className="space-y-4 py-1">
              {/* Company info */}
              <div className="rounded-lg bg-muted/40 border border-border px-4 py-3 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary">{pendingImport.ticker}</span>
                  {pendingImport.exchange && (
                    <span className="text-xs text-muted-foreground">{pendingImport.exchange}</span>
                  )}
                </div>
                {pendingImport.name !== pendingImport.ticker && (
                  <p className="text-xs text-foreground">{pendingImport.name}</p>
                )}
              </div>

              {/* Source selector */}
              <div>
                <label className="text-xs text-muted-foreground block mb-2">Fonte de dados</label>
                <div className="space-y-2">
                  {([
                    { value: 'stockanalysis' as ImportSource, label: 'StockAnalysis', desc: 'Via Firecrawl — bolsas internacionais e empresas não-americanas' },
                    { value: 'sec' as ImportSource, label: 'SEC (XBRL)', desc: 'Dados oficiais da SEC — empresas americanas cotadas em bolsa US' },
                  ] as const).map(opt => (
                    <label key={opt.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      importSource === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'
                    }`}>
                      <input
                        type="radio"
                        name="confirm-import-source"
                        value={opt.value}
                        checked={importSource === opt.value}
                        onChange={() => setImportSource(opt.value)}
                        className="mt-0.5 accent-primary"
                      />
                      <div>
                        <div className="text-xs font-medium text-foreground">{opt.label}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* StockAnalysis URL — editable */}
              {importSource === 'stockanalysis' && (
                <div>
                  <label className="text-xs text-muted-foreground">URL do StockAnalysis</label>
                  <Input
                    value={saUrl}
                    onChange={e => setSaUrl(e.target.value)}
                    className="mt-1 h-8 text-xs font-mono"
                    placeholder="https://stockanalysis.com/stocks/..."
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Verifica e corrige o URL antes de importar.
                  </p>
                </div>
              )}
            </div>
          )}

          {!canEdit && (
            <p className="text-[11px] text-muted-foreground">
              Esta empresa ainda não está na aplicação. Apenas administradores e investidores podem importar novas empresas.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline" size="sm" className="text-xs h-8"
              onClick={() => setPendingImport(null)}
              disabled={importing}
            >
              {canEdit ? "Cancelar" : "Fechar"}
            </Button>
            {canEdit && (
              <Button
                size="sm" className="text-xs h-8"
                onClick={handleConfirmImport}
                disabled={importing || (importSource === 'stockanalysis' && !saUrl.trim())}
              >
                {importing
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />A importar...</>
                  : 'Confirmar importação'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
