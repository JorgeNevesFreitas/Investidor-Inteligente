import { useState, useEffect } from "react";
import { Bell, BellOff, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  PriceAlert,
  fetchAlertsForTicker,
  createPriceAlert,
  upsertAutoAlert,
  togglePriceAlert,
  deletePriceAlert,
} from "@/lib/priceAlertService";

interface Props {
  ticker: string;
  companyId: string | null;
  companyName: string | null;
  currency: string;
}

const AUTO_CATEGORIES: {
  key: 'auto_invest' | 'auto_atento' | 'auto_aguardar';
  label: string;
  colorClass: string;
}[] = [
  { key: 'auto_invest',   label: 'Para Investir', colorClass: 'text-positive' },
  { key: 'auto_atento',   label: 'Atento',        colorClass: 'text-amber-400' },
  { key: 'auto_aguardar', label: 'Aguardar',      colorClass: 'text-negative' },
];

export function PriceAlerts({ ticker, companyId, companyName, currency }: Props) {
  const { toast } = useToast();
  const { canEdit } = useAuth();
  const [loading, setLoading] = useState(true);
  const [autoAlerts, setAutoAlerts] = useState<Map<string, PriceAlert>>(new Map());
  const [manualAlerts, setManualAlerts] = useState<PriceAlert[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [alertType, setAlertType] = useState<"above" | "below">("below");
  const [targetPrice, setTargetPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchAlertsForTicker(ticker)
      .then(async alerts => {
        const autoMap = new Map<string, PriceAlert>();
        const manual: PriceAlert[] = [];
        for (const a of alerts) {
          if (a.alert_category !== 'manual') {
            autoMap.set(a.alert_category, a);
          } else {
            manual.push(a);
          }
        }
        // Auto-create missing auto alerts as active on first visit (viewers can't write, so skip)
        if (canEdit) {
          const ALL_AUTO: ('auto_invest' | 'auto_atento' | 'auto_aguardar')[] =
            ['auto_invest', 'auto_atento', 'auto_aguardar'];
          for (const category of ALL_AUTO) {
            if (!autoMap.has(category)) {
              try {
                const created = await upsertAutoAlert({ ticker, companyId, companyName, category, isActive: true });
                autoMap.set(category, created);
              } catch { /* silently skip if DB not yet migrated */ }
            }
          }
        }
        setAutoAlerts(autoMap);
        setManualAlerts(manual);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticker, canEdit, companyId, companyName]);

  const handleAutoToggle = async (category: 'auto_invest' | 'auto_atento' | 'auto_aguardar') => {
    const existing = autoAlerts.get(category);
    const newActive = !(existing?.is_active ?? false);
    setTogglingAuto(category);
    try {
      const updated = await upsertAutoAlert({ ticker, companyId, companyName, category, isActive: newActive });
      setAutoAlerts(prev => new Map(prev).set(category, updated));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao actualizar alerta", description: msg, variant: "destructive" });
    } finally {
      setTogglingAuto(null);
    }
  };

  const handleCreate = async () => {
    const price = parseFloat(targetPrice.replace(",", "."));
    if (isNaN(price) || price <= 0) {
      toast({ title: "Preço inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const alert = await createPriceAlert({ ticker, companyId, companyName, alertType, targetPrice: price, currency });
      setManualAlerts(prev => [alert, ...prev]);
      setShowForm(false);
      setTargetPrice("");
      toast({ title: "Alerta criado" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao criar alerta", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (alert: PriceAlert) => {
    const next = !alert.is_active;
    setManualAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_active: next } : a));
    try {
      await togglePriceAlert(alert.id, next);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setManualAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_active: alert.is_active } : a));
      toast({ title: "Erro ao actualizar alerta", description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    setManualAlerts(prev => prev.filter(a => a.id !== id));
    try {
      await deletePriceAlert(id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro ao eliminar alerta", description: msg, variant: "destructive" });
      fetchAlertsForTicker(ticker)
        .then(alerts => setManualAlerts(alerts.filter(a => a.alert_category === 'manual')))
        .catch(() => {});
    }
  };

  const activeAutoCount = AUTO_CATEGORIES.filter(c => autoAlerts.get(c.key)?.is_active).length;
  const activeManual    = manualAlerts.filter(a => !a.triggered);
  const triggeredManual = manualAlerts.filter(a => a.triggered);
  const totalActive     = activeAutoCount + activeManual.length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Alertas</h3>
          {totalActive > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {totalActive}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-4 text-xs text-muted-foreground animate-pulse">A carregar...</div>
      ) : (
        <>
          {/* ── Automatic alerts ─────────────────────────────── */}
          <div className="px-4 pt-3 pb-2.5 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
              Automáticos — mudança de estado
            </p>
            <div className="space-y-2">
              {AUTO_CATEGORIES.map(cat => {
                const alert    = autoAlerts.get(cat.key);
                const isActive = alert?.is_active ?? false;
                const isToggling = togglingAuto === cat.key;
                return (
                  <div key={cat.key} className="flex items-center justify-between">
                    <span className="text-xs text-foreground">
                      Mudança para{" "}
                      <span className={`font-semibold ${cat.colorClass}`}>{cat.label}</span>
                    </span>
                    <button
                      onClick={() => handleAutoToggle(cat.key)}
                      disabled={isToggling || !canEdit}
                      aria-label={isActive ? "Desactivar" : "Activar"}
                      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${isActive ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${isActive ? 'translate-x-3' : 'translate-x-0'}`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Manual alerts ─────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Manuais
              </p>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => { setShowForm(v => !v); setTargetPrice(""); }}
                >
                  {showForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                </Button>
              )}
            </div>

            {/* Add form */}
            {showForm && canEdit && (
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
            {manualAlerts.length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                {canEdit
                  ? <>Sem alertas manuais. Clica em <Plus className="h-3 w-3 inline" /> para adicionar.</>
                  : "Sem alertas manuais."}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {activeManual.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-mono font-semibold ${alert.is_active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                        {alert.alert_type === "above" ? "↑" : "↓"} {alert.currency} {alert.target_price?.toFixed(2)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${alert.is_active ? "bg-positive/10 text-positive" : "bg-muted text-muted-foreground"}`}>
                        {alert.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    {canEdit && (
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
                    )}
                  </div>
                ))}
                {triggeredManual.map(alert => (
                  <div key={alert.id} className="flex items-center justify-between px-4 py-2.5 opacity-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground line-through">
                        {alert.alert_type === "above" ? "↑" : "↓"} {alert.currency} {alert.target_price?.toFixed(2)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Disparado</span>
                      {alert.triggered_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(alert.triggered_at).toLocaleDateString("pt-PT")}
                        </span>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
