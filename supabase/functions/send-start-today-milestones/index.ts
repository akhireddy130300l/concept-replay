import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import {
  buildMilestoneEmailHtml,
  getDueMilestone,
  type MilestoneEmailItem,
} from "../_shared/start-today.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronFailure = authenticateCronRequest(req);
  if (cronFailure) return cronFailure;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const appUrl = (Deno.env.get("APP_BASE_URL") || "https://concept-replay.lovable.app").replace(/\/$/, "");
  const supabase = createClient(supabaseUrl, serviceKey);
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const lockName = `start-today-milestones-${todayIso}`;

  const { data: acquired } = await supabase.rpc("try_acquire_run_lock", {
    _name: lockName,
    _seconds: 180,
  });
  if (!acquired) {
    return new Response(JSON.stringify({ ok: true, skipped: "lock_busy" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: actions } = await supabase
      .from("opportunity_actions")
      .select("id, user_id, started_at, last_milestone_sent, check_ins, opportunity_ideas(topic, field)")
      .eq("status", "started")
      .is("deleted_at", null)
      .not("started_at", "is", null)
      .limit(200);

    const byUser = new Map<string, Array<{ actionId: string; item: MilestoneEmailItem }>>();
    for (const row of actions ?? []) {
      const due = getDueMilestone(row.started_at, now, row.last_milestone_sent ?? 0);
      if (!due) continue;
      const idea = (row as { opportunity_ideas?: { topic?: string; field?: string } | null }).opportunity_ideas;
      if (!idea?.topic) continue;
      const checkIns = Array.isArray(row.check_ins) ? row.check_ins.length : 0;
      const list = byUser.get(row.user_id) ?? [];
      list.push({
        actionId: row.id,
        item: {
          topic: idea.topic,
          field: idea.field ?? "General",
          milestoneDays: due,
          checkInCount: checkIns,
        },
      });
      byUser.set(row.user_id, list);
    }

    let emailsSent = 0;
    for (const [userId, entries] of byUser.entries()) {
      const { data: access } = await supabase
        .from("portfolio_feature_access")
        .select("report_email")
        .eq("user_id", userId)
        .eq("enabled", true)
        .maybeSingle();

      if (!access?.report_email || !resendKey) continue;

      const html = buildMilestoneEmailHtml(entries.map((e) => e.item), appUrl);
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `start-today-milestone-${userId}-${todayIso}`,
        },
        body: JSON.stringify({
          from: "Concept Replay <onboarding@resend.dev>",
          to: [access.report_email],
          subject: `Look how far you came: ${entries[0].item.milestoneDays}-day milestone`,
          html,
        }),
      });

      if (emailRes.ok) {
        emailsSent += 1;
        for (const entry of entries) {
          await supabase
            .from("opportunity_actions")
            .update({ last_milestone_sent: entry.item.milestoneDays })
            .eq("id", entry.actionId);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, emailsSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await supabase.rpc("release_run_lock", { _name: lockName });
  }
});