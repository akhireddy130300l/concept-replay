import { supabase } from "@/integrations/supabase/client";

export interface PortfolioAccess {
  enabled: boolean;
  reportEmail: string;
}

export async function fetchOwnPortfolioAccess(): Promise<PortfolioAccess | null> {
  const { data, error } = await supabase
    .from("portfolio_feature_access")
    .select("enabled, report_email")
    .maybeSingle();
  if (error || !data) return null;
  return { enabled: data.enabled, reportEmail: data.report_email };
}

export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "•••";
  const [local, domain] = email.split("@");
  if (local.length === 0) return `•••@${domain}`;
  const first = local[0];
  const last = local.length > 1 ? local[local.length - 1] : "";
  const stars = "*".repeat(Math.max(3, Math.max(0, local.length - 2)));
  return `${first}${stars}${last}@${domain}`;
}
