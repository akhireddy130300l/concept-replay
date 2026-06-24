import { supabase } from "@/integrations/supabase/client";
import type { HoldingInput } from "./schema";

export interface SubmitPayload {
  holdings: Array<{
    ticker: string;
    shares: number;
    average_cost: number | null;
    purchase_date?: string | null;
  }>;
  cash_balance?: number | null;
  account_total_declared?: boolean;
  save_holdings?: boolean;
  trigger_type?: "web_form";
}

export interface SubmitResult {
  ok: boolean;
  status: number;
  request_id?: string;
  error?: string;
  retry_after_seconds?: number;
}

export async function submitPortfolioResearch(payload: SubmitPayload): Promise<SubmitResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, status: 401, error: "not_authenticated" };

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-portfolio-research`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    request_id: body.request_id,
    error: body.error,
    retry_after_seconds: body.retry_after_seconds,
  };
}

export function payloadFromHoldings(
  holdings: HoldingInput[],
  cashBalance: number | null,
  accountTotalDeclared: boolean,
  saveHoldings: boolean,
): SubmitPayload {
  return {
    holdings: holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      average_cost: h.average_cost_unknown ? null : h.average_cost,
      purchase_date: h.purchase_date ?? null,
    })),
    cash_balance: accountTotalDeclared ? cashBalance ?? 0 : cashBalance,
    account_total_declared: accountTotalDeclared,
    save_holdings: saveHoldings,
    trigger_type: "web_form",
  };
}
