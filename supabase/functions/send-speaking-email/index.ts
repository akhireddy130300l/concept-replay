// Influence Speaking Gym — daily session email.
// Sends today's mode/scenario/warm-up OR a recovery email when the user is paused.
// Auth: requires CRON_SECRET header, OR a valid JWT (manual trigger by the user).
// Manual triggers always send the regular session email (never recovery) so the user can re-engage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { todaysMode, todaysScenario, todaysWarmups, MODE_DESCRIPTIONS } from "../_shared/speaking-content.ts";
import { classifyGate } from "../_shared/speaking-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderEmail(opts: {
  mode: string;
  scenarioTitle: string;
  scenarioPrompt: string;
  warmups: string[];
  ctaUrl: string;
}): string {
  const { mode, scenarioTitle, scenarioPrompt, warmups, ctaUrl } = opts;
  const warmupItems = warmups.map((w) => `<li style="margin:6px 0;color:#1f2937;">${esc(w)}</li>`).join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Your 10-Minute Influence Speaking Session</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;padding:28px;">
        <tr><td>
          <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">Influence Speaking Gym</div>
          <h1 style="margin:6px 0 6px 0;font-size:22px;color:#111827;">Your 10-Minute Influence Speaking Session</h1>
          <p style="font-size:14px;color:#374151;margin:0 0 18px 0;">Ten focused minutes today builds the kind of presence people remember. Show up, speak the warm-up, take the scenario, and ship the rep.</p>

          <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="font-size:12px;color:#4338ca;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Today's mode</div>
            <div style="font-size:17px;color:#111827;font-weight:700;margin-top:4px;">${esc(mode)}</div>
            <div style="font-size:13px;color:#374151;margin-top:4px;">${esc(MODE_DESCRIPTIONS[mode as keyof typeof MODE_DESCRIPTIONS] ?? "")}</div>
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Today's scenario</div>
            <div style="font-size:15px;color:#111827;font-weight:700;margin-top:4px;">${esc(scenarioTitle)}</div>
            <div style="font-size:14px;color:#1f2937;margin-top:6px;">${esc(scenarioPrompt)}</div>
          </div>

          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:18px;">
            <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Warm-up (speak aloud)</div>
            <ul style="margin:8px 0 0 18px;padding:0;font-size:14px;">${warmupItems}</ul>
          </div>

          <div style="text-align:center;margin:18px 0 6px 0;">
            <a href="${esc(ctaUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;">Start Speaking Session</a>
          </div>
          <div style="font-size:12px;color:#9ca3af;text-align:center;margin-top:6px;">10–15 minutes. One rep. That's the whole game.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: cron secret OR signed-in user.
    const cronHeader = req.headers.get("x-cron-secret");
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    let triggerUserId: string | null = null;
    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await anon.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      triggerUserId = userData.user.id;
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resend is in testing mode — only send to authorized recipients listed in portfolio_feature_access.
    let recipients: Array<{ user_id: string; report_email: string }> = [];
    if (isCron) {
      const { data, error } = await admin
        .from("portfolio_feature_access")
        .select("user_id, report_email");
      if (error) {
        return new Response(JSON.stringify({ error: "Recipient lookup failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipients = (data ?? []).filter((r) => !!r.report_email);
    } else if (triggerUserId) {
      const { data, error } = await admin
        .from("portfolio_feature_access")
        .select("user_id, report_email")
        .eq("user_id", triggerUserId)
        .maybeSingle();
      if (error || !data?.report_email) {
        return new Response(JSON.stringify({
          error: "Email sending is in testing mode and is only enabled for authorized accounts right now.",
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      recipients = [data];
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "No authorized recipients." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const mode = todaysMode(now);
    const scenario = todaysScenario(mode, now);
    const warmups = todaysWarmups(now);
    const ctaUrl = `${APP_BASE_URL || ""}/speaking-gym`;
    const sessionHtml = renderEmail({
      mode,
      scenarioTitle: scenario.title,
      scenarioPrompt: scenario.your_task,
      warmups,
      ctaUrl,
    });

    function renderRecoveryEmail(): string {
      return `<!doctype html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#fef2f2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:24px 0;">
    <tr><td align="center">
      <table width="600" style="max-width:600px;background:#ffffff;border-radius:16px;padding:28px;">
        <tr><td>
          <h1 style="margin:0 0 12px 0;color:#991b1b;font-size:20px;">Action Required: Complete Speaking Gym to Resume Emails</h1>
          <p style="color:#374151;font-size:14px;line-height:1.6;">
            Your scheduled emails are paused because your daily speaking session was not completed.
            Complete one good speaking session to resume all scheduled emails.
          </p>
          <div style="text-align:center;margin:22px 0 6px 0;">
            <a href="${ctaUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;">Open Speaking Gym</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    }

    const todayDate = new Date().toISOString().slice(0, 10);
    const results: Array<{ to: string; ok: boolean; status: number | null; reason?: string; kind: "session" | "recovery" | "skipped" }> = [];

    for (const r of recipients) {
      // Per-recipient gate check (only enforced on cron sends).
      let isPaused = false;
      let lastRecoveryDate: string | null = null;
      if (isCron) {
        const { data: st } = await admin
          .from("speaking_user_state")
          .select("last_completed_date, speaking_gate_started_at, last_recovery_email_date")
          .eq("user_id", r.user_id)
          .maybeSingle();
        const status = classifyGate({
          gateStartedAt: st?.speaking_gate_started_at ?? null,
          lastCompletedDate: st?.last_completed_date ?? null,
        });
        isPaused = status === "paused";
        lastRecoveryDate = st?.last_recovery_email_date ?? null;
      }

      let subject: string;
      let html: string;
      let kind: "session" | "recovery";
      if (isPaused) {
        if (lastRecoveryDate === todayDate) {
          results.push({ to: r.report_email, ok: true, status: 0, kind: "skipped", reason: "recovery_already_sent_today" });
          continue;
        }
        subject = "Action Required: Complete Speaking Gym to Resume Emails";
        html = renderRecoveryEmail();
        kind = "recovery";
      } else {
        subject = "Your 10-Minute Influence Speaking Session";
        html = sessionHtml;
        kind = "session";
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Influence Gym <onboarding@resend.dev>",
          to: [r.report_email],
          subject,
          html,
        }),
      });
      const ok = res.status >= 200 && res.status < 300;
      results.push({ to: r.report_email, ok, status: res.status, kind, reason: ok ? undefined : `resend_${res.status}` });
      if (ok && kind === "recovery") {
        await admin
          .from("speaking_user_state")
          .update({ last_recovery_email_date: todayDate })
          .eq("user_id", r.user_id);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: results.filter((x) => x.ok).length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.log(JSON.stringify({ phase: "send_speaking_email", failure_category: "uncaught", message: e instanceof Error ? e.message : "unknown" }));
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
