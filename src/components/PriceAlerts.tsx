import { useState, useEffect } from "react";
import { Bell, BellOff, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  PriceAlert,
  fetchAlertsForTicker,
  createPriceAlert,
  togglePriceAlert,
  deletePriceAlert,
} from "@/lib/priceAlertService";

interface Props {
  ticker: string;
  companyId: string | null;
  companyName: string | null;
  currency: string;
}

export function PriceAlerts({ ticker, companyId, companyName, currency }: Props) {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [alertType, setAlertType] = useState<"above" | "below">("below");
  const [targetPrice, setTargetPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchAlertsForTicker(ticker)
      .then(setAlerts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker]);

  const handleCreate = async () => {
    const price = parseFloat(targetPrice.replace(",", "."));
    if (isNaN(price) || price <= 0) {
      toast({ title: "Preço inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const alert = await createPriceAlert({
        ticker,
        companyId,
        companyName,
        alertType,
        targetPrice: price,
        currency,
      });
      setAlerts(prev => [alert, ...prev]);
      setShowForm(false);
      setTargetPrice("");
      toast({ title: "Alerta criado" });
    } catch (e: any) {
      toast({ title: "Erro ao criar alerta", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (alert: PriceAlert) => {
    const next = !alert.is_active;
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_active: next } : a));
    try {
      await togglePriceAlert(alert.id, next);
    } catch (e: any) {
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_active: alert.is_active } : a));
      toast({ title: "Erro ao actualizar alerta", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
    try {
      await deletePriceAlert(id);
    } catch (e: any) {
      toast({ title: "Erro ao eliminar alerta", description: e.message, variant: "destructive" });
      fetchAlertsForTicker(ticker).then(setAlerts).catch(() => {});
    }
  };

  const activeAlerts   = alerts.filter(a => !a.triggered);
  const triggeredAlerts = alerts.filter(a => a.triggered);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Alertas de Preço</h3>
          {activeAlerts.length > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {activeAlerts.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => { setShowForm(v => !v); setTargetPrice(""); }}
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="px-4 py-3 border-b border-border bg-accent/10 flex flex-wrap items-end gap-2">
          <div className="flex rounded-md overflow-hidden border border-border text-xs">
            <button
              onClick={() => setAlertType("below")}
              className={`px-3 py-1.5 transition-colors ${alertType === "below" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent/40"}`}
            >
              ↓ Abaixo de
            </button>
            <button
              onClick={() => setAlertType("above")}
              className={`px-3 py-1.5 transition-colors ${alertType === "above" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent/40"}`}
            >
              ↑ Acima de
            </button>
          </div>
          <Input
            type="number"
            placeholder={`Preço em ${currency}`}
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="h-8 text-xs w-36"
            min={0}
            step="0.01"
            autoFocus
          />
          <Button size="sm" className="h-8 text-xs" onClick={handleCreate} disabled={saving || !targetPrice}>
            Guardar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowForm(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Alert list */}
      {loading ? (
        <div className="px-4 py-4 text-xs text-muted-foreground animate-pulse">A carregar...</div>
      ) : alerts.length === 0 ? (
        <div className="px-4 py-4 text-xs text-muted-foreground">
          Sem alertas definidos. Clica em <Plus className="h-3 w-3 inline" /> para adicionar.
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {activeAlerts.map(alert => (
            <div key={alert.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-mono font-semibold ${alert.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                  {alert.alert_type === "above" ? "↑" : "↓"} {alert.currency} {alert.target_price.toFixed(2)}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${alert.is_active ? "bg-positive/10 text-positive" : "bg-muted text-muted-foreground"}`}>
                  {alert.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(alert)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title={alert.is_active ? "Desactivar" : "Activar"}
                >
                  {alert.is_active
                    ? <Bell className="h-3.5 w-3.5" />
                    : <BellOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(alert.id)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {triggeredAlerts.map(alert => (
            <div key={alert.id} className="flex items-center justify-between px-4 py-2.5 opacity-50">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-muted-foreground line-through">
                  {alert.alert_type === "above" ? "↑" : "↓"} {alert.currency} {alert.target_price.toFixed(2)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Disparado</span>
                {alert.triggered_at && (
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(alert.triggered_at).toLocaleDateString("pt-PT")}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDelete(alert.id)}
                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
