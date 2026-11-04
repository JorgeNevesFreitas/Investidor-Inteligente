import { supabase } from "@/integrations/supabase/client";
import { fetchTransactions, PortfolioTransaction } from "@/lib/portfolioService";

export type WatchStatus = 'following' | 'discarded';

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  following: 'A seguir',
  discarded: 'Descartada',
};

// Tickers (em maiúsculas) com quantidade atual maior que zero no Portfolio.
export function computeOpenPositionTickers(
  transactions: Pick<PortfolioTransaction, 'ticker' | 'type' | 'quantity'>[],
): Set<string> {
  const qtyMap = new Map<string, number>();
  for (const tx of transactions) {
    const key = tx.ticker.toUpperCase();
    const cur = qtyMap.get(key) ?? 0;
    qtyMap.set(key, tx.type === 'buy' ? cur + tx.quantity : cur - tx.quantity);
  }
  const open = new Set<string>();
  for (const [ticker, qty] of qtyMap) if (qty > 0) open.add(ticker);
  return open;
}

// Depois de uma compra, uma empresa descartada volta a 'following'. A condição no próprio update
// usa o valor atual da base de dados. Nunca lança erro: a compra já foi gravada e não pode falhar por isto.
export async function restoreFollowingAfterBuy(ticker: string): Promise<'restored' | 'unchanged' | 'failed'> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .update({ watch_status: 'following' })
      .eq('ticker', ticker)
      .eq('watch_status', 'discarded')
      .select('id');
    if (error) throw error;
    return data && data.length > 0 ? 'restored' : 'unchanged';
  } catch (err) {
    console.warn(`[watchStatus] Não foi possível atualizar o estado de ${ticker} após a compra:`, err);
    return 'failed';
  }
}

export type WatchStatusChangeResult =
  | { success: true }
  | { success: false; title: string; description: string };

// Altera o estado de uma empresa. As transações são lidas no momento da alteração: se não
// for possível confirmar que não há posição aberta, a empresa não é descartada.
export async function changeWatchStatus(
  company: { id: string; ticker: string },
  status: WatchStatus,
): Promise<WatchStatusChangeResult> {
  try {
    if (status === 'discarded') {
      const open = computeOpenPositionTickers(await fetchTransactions());
      if (open.has(company.ticker.toUpperCase())) {
        return {
          success: false,
          title: 'Não é possível descartar',
          description: `${company.ticker} tem uma posição aberta no Portfolio. Só podes descartar uma empresa quando a quantidade atual for zero.`,
        };
      }
    }

    const { error } = await supabase.from('companies').update({ watch_status: status }).eq('id', company.id);
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return {
      success: false,
      title: 'Erro',
      description: err instanceof Error ? err.message : 'Não foi possível alterar o estado da empresa',
    };
  }
}
