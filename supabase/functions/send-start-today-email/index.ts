import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import {
  buildStartTodayEmailHtml,
  buildSundayFocusEmailHtml,
  classifyPriorTopics,
  normalizeTopicKey,
  selectDailyFields,
  selectFieldSearchQuery,
  signStartTodayActionToken,
  type KickstartStep,
  type OpportunityEmailItem,
  type SundayFocusItem,
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronFailure = authenticateCronRequest(req);
  let callerUserId: string | null = null;

  if (cronFailure) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return cronFailure;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return cronFailure;
    callerUserId = userData.user.id;
  }
  const signingSecret = Deno.env.get("START_TODAY_ACTION_SECRET") || serviceKey;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const appUrl = (Deno.env.get("APP_BASE_URL") || "https://concept-replay.lovable.app").replace(/\/$/, "");
  const actionEndpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/start-today-action`;

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
    let recipientQuery = supabase
      .from("portfolio_feature_access")
      .select("user_id, report_email")
      .eq("enabled", true);
    if (callerUserId) {
      recipientQuery = recipientQuery.eq("user_id", callerUserId);
    }
    const { data: recipients } = await recipientQuery.limit(10);

    if (!recipients?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no_recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    const isSundayEt = new Date(`${todayEt}T12:00:00Z`).getUTCDay() === 0;
    for (const recipient of recipients) {
      if (isSundayEt && resendKey && recipient.report_email) {
        const { data: activeRows } = await supabase
          .from("opportunity_actions")
          .select("idea_id, weekly_steps, check_ins, is_weekly_focus, opportunity_ideas(id, topic, field)")
          .eq("user_id", recipient.user_id)
          .eq("status", "started")
          .is("deleted_at", null)
          .order("started_at", { ascending: false })
          .limit(6);

        const focusItems: SundayFocusItem[] = [];
        for (const row of activeRows ?? []) {
          const ideaRef = (row as { opportunity_ideas?: { id: string; topic: string; field: string } | null }).opportunity_ideas;
          if (!ideaRef) continue;
          const steps = Array.isArray(row.weekly_steps) ? (row.weekly_steps as KickstartStep[]) : [];
          const checkIns = Array.isArray(row.check_ins) ? row.check_ins : [];
          const focusToken = await signStartTodayActionToken(
            { uid: recipient.user_id, iid: ideaRef.id, act: "focus" },
            signingSecret,
          );
          focusItems.push({
            topic: ideaRef.topic,
            field: ideaRef.field,
            completedSteps: steps.filter((s) => s.done).length,
            totalSteps: steps.length || 7,
            checkInCount: checkIns.length,
            isWeeklyFocus: Boolean(row.is_weekly_focus),
            focusUrl: `${actionEndpoint}?token=${encodeURIComponent(focusToken)}`,
          });
        }

        if (focusItems.length > 0) {
          const html = buildSundayFocusEmailHtml(focusItems, appUrl, todayEt);
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `start-today-sunday-${recipient.user_id}-${todayEt}`,
            },
            body: JSON.stringify({
              from: "Concept Replay <onboarding@resend.dev>",
              to: [recipient.report_email],
              subject: `Start Today · Sunday Focus Edition (${todayEt})`,
              html,
            }),
          });
          if (emailRes.ok) sentCount += 1;
          continue;
        }
      }

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
        .select("id, topic, topic_key, sent_for, created_at")
        .eq("user_id", recipient.user_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);

      const { blockedKeys, blockedTopics, reAlertCandidates } = classifyPriorTopics(priorRows ?? []);
      const avoidTopics = [...blockedTopics];
      const reAlertEligibleTopics = Array.from(reAlertCandidates.values()).map((c) => c.topic);

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
        const angleQuery = selectFieldSearchQuery(pick.field, todayEt);
        const sources = await searchWebSignals(angleQuery, 5);
        const idea = await synthesizeOpportunity({
          fieldLabel: pick.field.label,
          focusPrompt: `${angleQuery} (broad lens: ${pick.field.searchPrompt})`,
          sources,
          avoidTopics,
          reAlertEligibleTopics,
          isWildcard: pick.isWildcard,
        });
        const baseTopicKey = normalizeTopicKey(idea.topic);
        if (!baseTopicKey || blockedKeys.has(baseTopicKey)) continue;
        const reAlertMatch = reAlertCandidates.get(baseTopicKey);
        const isBreakthroughUpdate = Boolean(reAlertMatch);
        const topicKey = isBreakthroughUpdate ? `${baseTopicKey}-update-${todayEt}` : baseTopicKey;
        blockedKeys.add(baseTopicKey);
        blockedKeys.add(topicKey);
        avoidTopics.push(idea.topic);

        const { data: inserted, error: insertErr } = await supabase
          .from("opportunity_ideas")
          .insert({
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
            opportunity_stage: idea.opportunity_stage,
            is_breakthrough_update: isBreakthroughUpdate,
            previous_idea_id: reAlertMatch?.id ?? null,
            is_wildcard: pick.isWildcard,
            is_ask_anything: false,
            sent_for: todayEt,
            sent_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (!insertErr && inserted?.id) {
          const [startToken, laterToken, passToken] = await Promise.all([
            signStartTodayActionToken({ uid: recipient.user_id, iid: inserted.id, act: "start" }, signingSecret),
            signStartTodayActionToken({ uid: recipient.user_id, iid: inserted.id, act: "later" }, signingSecret),
            signStartTodayActionToken({ uid: recipient.user_id, iid: inserted.id, act: "not_for_me" }, signingSecret),
          ]);
          createdIdeas.push({
            ...idea,
            id: inserted.id,
            is_wildcard: pick.isWildcard,
            is_breakthrough_update: isBreakthroughUpdate,
            actionLinks: {
              startUrl: `${actionEndpoint}?token=${encodeURIComponent(startToken)}`,
              laterUrl: `${actionEndpoint}?token=${encodeURIComponent(laterToken)}`,
              passUrl: `${actionEndpoint}?token=${encodeURIComponent(passToken)}`,
            },
          });
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