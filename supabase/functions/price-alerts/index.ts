import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALERT_EMAIL = 'jorgefreitas100@hotmail.com';

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

async function fetchPrice(ticker: string): Promise<{ price: number; currency: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const resp = await fetch(url, { headers: YF_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return { price: meta.regularMarketPrice, currency: meta.currency || 'USD' };
  } catch {
    return null;
  }
}

function computeStatus(price: number, intrinsicValuePerShare: number, intrinsicWithMargin: number): 'invest' | 'watch' | 'wait' {
  if (price <= intrinsicWithMargin) return 'invest';
  if (price <= intrinsicValuePerShare) return 'watch';
  return 'wait';
}

function statusLabel(status: string): string {
  if (status === 'invest') return 'Para Investir';
  if (status === 'watch') return 'Atento';
  return 'Aguardar';
}

function statusColor(status: string): string {
  if (status === 'invest') return '#4ade80';
  if (status === 'watch') return '#fb923c';
  return '#f87171';
}

function fmtPrice(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function statusChangeEmail(opts: {
  ticker: string;
  name: string;
  oldStatus: string;
  newStatus: string;
  price: number;
  intrinsicValuePerShare: number;
  intrinsicWithMargin: number;
  currency: string;
}): string {
  const { ticker, name, oldStatus, newStatus, price, intrinsicValuePerShare, intrinsicWithMargin, currency } = opts;
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><title>Alerta Investidor Inteligente</title></head>
<body style="margin:0;padding:20px;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5;">
  <div style="max-width:480px;margin:0 auto;background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;">
    <div style="background:#0f0f0f;padding:20px 24px;border-bottom:1px solid #2a2a2a;">
      <p style="margin:0 0 4px;font-size:11px;color:#666;letter-spacing:.5px;text-transform:uppercase;">Investidor Inteligente · Alerta de Estado</p>
      <h1 style="margin:0;font-size:18px;color:#e5e5e5;font-weight:700;">${name} <span style="font-family:monospace;font-size:13px;background:#2a2a2a;padding:2px 8px;border-radius:4px;color:#a78bfa;">${ticker}</span></h1>
    </div>
    <div style="padding:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <span style="padding:5px 14px;border-radius:6px;font-size:13px;font-weight:600;background:#1f2937;color:${statusColor(oldStatus)};border:1px solid ${statusColor(oldStatus)}40;">${statusLabel(oldStatus)}</span>
        <span style="font-size:20px;color:#555;">→</span>
        <span style="padding:5px 14px;border-radius:6px;font-size:13px;font-weight:600;background:#1f2937;color:${statusColor(newStatus)};border:1px solid ${statusColor(newStatus)};">${statusLabel(newStatus)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #2a2a2a;">
          <td style="padding:10px 0;font-size:13px;color:#888;">Preço Atual</td>
          <td style="padding:10px 0;font-size:13px;font-family:monospace;font-weight:700;color:#e5e5e5;text-align:right;">${fmtPrice(price, currency)}</td>
        </tr>
        <tr style="border-bottom:1px solid #2a2a2a;">
          <td style="padding:10px 0;font-size:13px;color:#888;">Valor Intrínseco</td>
          <td style="padding:10px 0;font-size:13px;font-family:monospace;font-weight:700;color:#e5e5e5;text-align:right;">${fmtPrice(intrinsicValuePerShare, currency)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#888;">Valor c/ Margem</td>
          <td style="padding:10px 0;font-size:13px;font-family:monospace;font-weight:700;color:#e5e5e5;text-align:right;">${fmtPrice(intrinsicWithMargin, currency)}</td>
        </tr>
      </table>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #2a2a2a;font-size:11px;color:#555;">
      ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })} · Investidor Inteligente
    </div>
  </div>
</body>
</html>`;
}

function priceAlertEmail(opts: {
  ticker: string;
  companyName: string;
  alertType: 'above' | 'below';
  targetPrice: number;
  currentPrice: number;
  currency: string;
}): string {
  const { ticker, companyName, alertType, targetPrice, currentPrice, currency } = opts;
  const direction = alertType === 'above' ? 'subiu acima de' : 'desceu abaixo de';
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><title>Alerta de Preço</title></head>
<body style="margin:0;padding:20px;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e5e5e5;">
  <div style="max-width:480px;margin:0 auto;background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;overflow:hidden;">
    <div style="background:#0f0f0f;padding:20px 24px;border-bottom:1px solid #2a2a2a;">
      <p style="margin:0 0 4px;font-size:11px;color:#666;letter-spacing:.5px;text-transform:uppercase;">Investidor Inteligente · Alerta de Preço</p>
      <h1 style="margin:0;font-size:18px;color:#e5e5e5;font-weight:700;">${companyName} <span style="font-family:monospace;font-size:13px;background:#2a2a2a;padding:2px 8px;border-radius:4px;color:#a78bfa;">${ticker}</span></h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 20px;font-size:14px;color:#c4b5fd;">O preço ${direction} <strong style="color:#e5e5e5;font-family:monospace;">${fmtPrice(targetPrice, currency)}</strong></p>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="border-bottom:1px solid #2a2a2a;">
          <td style="padding:10px 0;font-size:13px;color:#888;">Preço Atual</td>
          <td style="padding:10px 0;font-size:13px;font-family:monospace;font-weight:700;color:#e5e5e5;text-align:right;">${fmtPrice(currentPrice, currency)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#888;">Alerta definido para</td>
          <td style="padding:10px 0;font-size:13px;font-family:monospace;font-weight:700;color:#c4b5fd;text-align:right;">${alertType === 'above' ? '↑' : '↓'} ${fmtPrice(targetPrice, currency)}</td>
        </tr>
      </table>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #2a2a2a;font-size:11px;color:#555;">
      ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })} · Investidor Inteligente
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(resendKey: string, to: string, subject: string, html: string): Promise<boolean> {
  // IMPORTANTE: actualiza o campo "from" para um endereço do teu domínio verificado no Resend.
  // Se ainda não tens um domínio verificado, usa onboarding@resend.dev (só funciona se
  // o email de destino for o mesmo com que te registaste no Resend).
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromEmail, to, subject, html }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error('Resend error:', err);
    }
    return resp.ok;
  } catch (e) {
    console.error('sendEmail error:', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY');

  if (!resendKey) {
    return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY not set' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const results = { checked: 0, statusChanges: 0, priceAlerts: 0, errors: 0 };

  // ── 1. Verificar mudanças de estado DCF ──────────────────────────────────────

  const { data: valuations, error: valErr } = await supabase
    .from('dcf_valuations')
    .select('ticker, company_id, result');

  if (valErr) console.error('dcf_valuations fetch error:', valErr);

  const { data: history } = await supabase
    .from('price_alert_history')
    .select('ticker, last_status');

  const historyMap = new Map<string, string | null>(
    (history ?? []).map((h: { ticker: string; last_status: string | null }) => [h.ticker, h.last_status])
  );

  for (const v of (valuations ?? [])) {
    const result = v.result as Record<string, number> | null;
    if (!result?.intrinsicValuePerShare || !result?.intrinsicWithMargin) continue;
    if (result.intrinsicValuePerShare <= 0) continue;

    try {
      // Small delay to avoid Yahoo Finance rate limiting
      await new Promise(r => setTimeout(r, 200));

      const quote = await fetchPrice(v.ticker);
      if (!quote || quote.price <= 0) continue;

      const newStatus = computeStatus(quote.price, result.intrinsicValuePerShare, result.intrinsicWithMargin);

      // Upsert history (always update price + checked_at)
      await supabase.from('price_alert_history').upsert({
        ticker:     v.ticker,
        company_id: v.company_id ?? null,
        last_status: newStatus,
        last_price:  quote.price,
        checked_at:  new Date().toISOString(),
      }, { onConflict: 'ticker' });

      results.checked++;

      const prevStatus = historyMap.get(v.ticker);

      // Send email only when status actually changed (skip first time — no previous status)
      if (prevStatus !== undefined && prevStatus !== null && prevStatus !== newStatus) {
        const { data: company } = await supabase
          .from('companies')
          .select('name, currency')
          .eq('ticker', v.ticker)
          .maybeSingle();

        const currency = company?.currency || quote.currency || 'USD';
        const name     = company?.name || v.ticker;

        const subject = `🔔 Alerta: ${v.ticker} passou para ${statusLabel(newStatus)}`;
        const html    = statusChangeEmail({
          ticker: v.ticker,
          name,
          oldStatus: prevStatus,
          newStatus,
          price: quote.price,
          intrinsicValuePerShare: result.intrinsicValuePerShare,
          intrinsicWithMargin:    result.intrinsicWithMargin,
          currency,
        });

        await sendEmail(resendKey, ALERT_EMAIL, subject, html);
        results.statusChanges++;
        console.log(`Status change: ${v.ticker} ${prevStatus} → ${newStatus}`);
      }
    } catch (e) {
      console.error(`Error processing ${v.ticker}:`, e);
      results.errors++;
    }
  }

  // ── 2. Verificar alertas manuais de preço ────────────────────────────────────

  const { data: alerts } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('is_active', true)
    .eq('triggered', false);

  // Group by ticker to avoid fetching the same price multiple times
  const alertsByTicker = new Map<string, typeof alerts>();
  for (const alert of (alerts ?? [])) {
    const list = alertsByTicker.get(alert.ticker) ?? [];
    list.push(alert);
    alertsByTicker.set(alert.ticker, list);
  }

  for (const [ticker, tickerAlerts] of alertsByTicker) {
    try {
      await new Promise(r => setTimeout(r, 200));
      const quote = await fetchPrice(ticker);
      if (!quote || quote.price <= 0) continue;

      for (const alert of tickerAlerts!) {
        const triggered =
          alert.alert_type === 'above'
            ? quote.price >= alert.target_price
            : quote.price <= alert.target_price;

        if (!triggered) continue;

        await supabase.from('price_alerts').update({
          triggered:    true,
          triggered_at: new Date().toISOString(),
          is_active:    false,
          updated_at:   new Date().toISOString(),
        }).eq('id', alert.id);

        const direction = alert.alert_type === 'above' ? 'subiu acima de' : 'desceu abaixo de';
        const subject   = `🔔 Alerta de preço: ${ticker} ${direction} ${fmtPrice(alert.target_price, alert.currency)}`;
        const html      = priceAlertEmail({
          ticker,
          companyName: alert.company_name || ticker,
          alertType:   alert.alert_type,
          targetPrice: alert.target_price,
          currentPrice: quote.price,
          currency:    alert.currency || quote.currency,
        });

        await sendEmail(resendKey, ALERT_EMAIL, subject, html);
        results.priceAlerts++;
        console.log(`Price alert triggered: ${ticker} ${alert.alert_type} ${alert.target_price}`);
      }
    } catch (e) {
      console.error(`Error processing price alerts for ${ticker}:`, e);
      results.errors++;
    }
  }

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
