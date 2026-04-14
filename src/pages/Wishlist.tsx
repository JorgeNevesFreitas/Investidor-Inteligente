import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Star, Trash2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface WishlistRow {
  id: string;
  ticker: string;
  name: string;
  exchange: string | null;
  notes: string | null;
  added_at: string;
}

export default function Wishlist() {
  const [items, setItems] = useState<WishlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadWishlist();
  }, []);

  const loadWishlist = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('wishlist')
      .select('*')
      .order('added_at', { ascending: false });
    if (!error && data) {
      setItems(data as WishlistRow[]);
    }
    setLoading(false);
  };

  const handleDelete = async (item: WishlistRow) => {
    const { error } = await supabase.from('wishlist').delete().eq('id', item.id);
    if (!error) {
      setItems(prev => prev.filter(i => i.id !== item.id));
      toast({ title: "Removida", description: `${item.name} (${item.ticker}) removida da wishlist.` });
    } else {
      toast({ title: "Erro", description: "Não foi possível remover", variant: "destructive" });
    }
  };

  const handleUpdateNotes = async (id: string, notes: string) => {
    await supabase.from('wishlist').update({ notes }).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Wishlist</h1>
          <p className="text-sm text-muted-foreground">Empresas a analisar futuramente — adiciona via pesquisa com ★</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Star className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Wishlist vazia. Pesquisa uma empresa e clica ★ para adicionar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(item => (
              <div key={item.id} className="rounded-lg border border-border bg-card p-4 space-y-3 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-warning fill-warning" />
                      <span className="font-mono text-sm font-semibold text-primary">{item.ticker}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-foreground">{item.name}</p>
                    {item.exchange && <p className="text-xs text-muted-foreground">{item.exchange}</p>}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover da wishlist?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remover <strong>{item.name} ({item.ticker})</strong> da wishlist?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(item)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <textarea
                  value={item.notes || ''}
                  onChange={(e) => handleUpdateNotes(item.id, e.target.value)}
                  placeholder="Notas..."
                  className="w-full text-xs text-muted-foreground bg-transparent border-none resize-none outline-none placeholder:text-muted-foreground/50 min-h-[2rem]"
                  rows={2}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.added_at).toLocaleDateString('pt-PT')}
                  </span>
                  <Link
                    to={`/company/${item.ticker}`}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Analisar <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
