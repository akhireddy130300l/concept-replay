import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import {
  buildStartTodayEmailHtml,
  normalizeTopicKey,
  selectDailyFields,
  type OpportunityEmailItem,
} from "../_shared/start-today.ts";
import { searchWebSignals, synthesizeOpportunity } from "../_shared/start-today-research.ts";

function getEasternDateIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

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
  const todayEt = getEasternDateIso();
  const lockName = `start-today-daily-${todayEt}`;

  const { data: acquired } = await supabase.rpc("try_acquire_run_lock", {
    _name: lockName,
    _seconds: 300,
  });
  if (!acquired) {
    return new Response(JSON.stringify({ ok: true, skipped: "lock_busy" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: recipients } = await supabase
      .from("portfolio_feature_access")
      .select("user_id, report_email")
      .eq("enabled", true)
      .limit(10);

    if (!recipients?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no_recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    for (const recipient of recipients) {
      const { data: existingToday } = await supabase
        .from("opportunity_ideas")
        .select("id")
        .eq("user_id", recipient.user_id)
        .eq("sent_for", todayEt)
        .eq("is_ask_anything", false)
        .is("deleted_at", null)
        .limit(1);

      if (existingToday && existingToday.length > 0) continue;

      const { data: priorRows } = await supabase
        .from("opportunity_ideas")
        .select("topic, topic_key")
        .eq("user_id", recipient.user_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(120);

      const existingKeys = new Set((priorRows ?? []).map((r) => r.topic_key));
      const avoidTopics = (priorRows ?? []).map((r) => r.topic);

      const { data: startedActions } = await supabase
        .from("opportunity_actions")
        .select("opportunity_ideas(field)")
        .eq("user_id", recipient.user_id)
        .eq("status", "started")
        .is("deleted_at", null)
        .limit(20);

      const preferredFields = (startedActions ?? [])
        .map((row: { opportunity_ideas?: { field?: string } | null }) => row.opportunity_ideas?.field)
        .filter((v): v is string => typeof v === "string");

      const dailyPicks = selectDailyFields(todayEt, preferredFields);
      const createdIdeas: OpportunityEmailItem[] = [];

      for (const pick of dailyPicks) {
        const sources = await searchWebSignals(pick.field.searchPrompt, 5);
        const idea = await synthesizeOpportunity({
          fieldLabel: pick.field.label,
          focusPrompt: pick.field.searchPrompt,
          sources,
          avoidTopics,
          isWildcard: pick.isWildcard,
        });
        const topicKey = normalizeTopicKey(idea.topic);
        if (!topicKey || existingKeys.has(topicKey)) continue;
        existingKeys.add(topicKey);
        avoidTopics.push(idea.topic);

        const { error: insertErr } = await supabase.from("opportunity_ideas").insert({
          user_id: recipient.user_id,
          field: idea.field,
          topic: idea.topic,
          topic_key: topicKey,
          why_rising: idea.why_rising,
          five_year_vision: idea.five_year_vision,
          real_examples: idea.real_examples,
          first_step: idea.first_step,
          difficulty: idea.difficulty,
          cost_estimate: idea.cost_estimate,
          time_estimate: idea.time_estimate,
          signals: idea.signals,
          sources: idea.sources,
          is_wildcard: pick.isWildcard,
          is_ask_anything: false,
          sent_for: todayEt,
          sent_at: new Date().toISOString(),
        });

        if (!insertErr) {
          createdIdeas.push({ ...idea, is_wildcard: pick.isWildcard });
        }
      }

      if (createdIdeas.length > 0 && resendKey && recipient.report_email) {
        const html = buildStartTodayEmailHtml(createdIdeas, appUrl, todayEt);
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `start-today-${recipient.user_id}-${todayEt}`,
          },
          body: JSON.stringify({
            from: "Concept Replay <onboarding@resend.dev>",
            to: [recipient.report_email],
            subject: `Start Today (${todayEt}): ${createdIdeas.map((i) => i.field).join(" · ")}`,
            html,
          }),
        });
        if (emailRes.ok) sentCount += 1;
      }
    }

    return new Response(JSON.stringify({ ok: true, date: todayEt, sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await supabase.rpc("release_run_lock", { _name: lockName });
  }
});