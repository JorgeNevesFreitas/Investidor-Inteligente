import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { MOCK_WISHLIST, WishlistItem } from "@/lib/mockData";
import { Star, Trash2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function Wishlist() {
  const [items] = useState<WishlistItem[]>(MOCK_WISHLIST);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Wishlist</h1>
          <p className="text-sm text-muted-foreground">Empresas a analisar futuramente</p>
        </div>

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
                </div>
                <button className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{item.notes}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Adicionado: {item.addedDate}</span>
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
      </div>
    </AppLayout>
  );
}
