import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { classifyGate } from "../_shared/speaking-gate.ts";
import { testDeliveryKey, testCooldownRemaining } from "../_shared/automation-policy.ts";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), timezone: z.string().max(100) }).strict(),
  z.object({ action: z.literal("test"), kind: z.enum(["stock", "english"]), request_id: z.string().uuid() }).strict(),
]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Service unavailable" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in required" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Please sign in again" }, 401);
  const userId = auth.user.id;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const body = parsed.data;
  try {
    const { data: access, error: accessError } = await admin.from("portfolio_feature_access").select("enabled,report_email").eq("user_id", userId).maybeSingle();
    if (accessError) throw accessError;
    if (body.action === "status") {
      try { new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }); } catch { return json({ error: "Invalid timezone" }, 400); }
      const now = new Date();
      const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: body.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(p => [p.type, p.value]));
      const today = `${parts.year}-${parts.month}-${parts.day}`;
      const eastern = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      const [speaking, topics, deliveries, cooldowns] = await Promise.all([
        admin.from("speaking_user_state").select("last_completed_date,speaking_gate_started_at,require_speaking_for_stock").eq("user_id", userId).maybeSingle(),
        admin.from("learned_topics").select("id,title,next_revision_date").eq("user_id", userId).is("deleted_at", null).order("next_revision_date"),
        admin.from("automation_email_deliveries").select("kind,is_test,status,sent_at,audio_available,error_message").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
        admin.from("automation_test_cooldowns").select("kind,requested_at").eq("user_id", userId),
      ]);
      for (const result of [speaking, topics, deliveries, cooldowns]) if (result.error) throw result.error;
      const stockTopics = (topics.data ?? []).filter(t => /latest\s+market\s+gainers/i.test(t.title));
      let english: any = null, swing: any = null, training: any = null, model: any = null, prediction: any = null;
      if (access?.enabled) {
        const results = await Promise.all([
          admin.from("american_word_emails").select("id,word,et_hour,sent_ok,created_at").eq("sent_for", eastern).order("et_hour"),
          admin.from("swing_trade_runs").select("selected_ticker,run_date,created_at").eq("run_date", eastern).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          admin.from("ml_training_jobs").select("started_at,finished_at,status,best_model").order("started_at", { ascending: false }).limit(1).maybeSingle(),
          admin.from("prediction_history").select("ticker,predicted_probability,prediction_date,model_versions(algorithm,version,status)").not("model_version_id", "is", null).order("prediction_date", { ascending: false }).order("predicted_probability", { ascending: false }).limit(1).maybeSingle(),
        ]);
        for (const result of results) if (result.error) throw result.error;
        const rows = results[0].data ?? [];
        const last = rows.filter(r => r.sent_ok).at(-1);
        let audio = null;
        if (last) {
          const listed = await admin.storage.from("word-audio").list("", { search: `${last.id}.wav` });
          audio = listed.error ? null : Boolean(listed.data?.some(f => f.name === `${last.id}.wav`));
        }
        english = { sent: rows.filter(r => r.sent_ok).length, remaining: Math.max(0, 9 - rows.filter(r => r.sent_ok).length), lastWord: last?.word ?? null, audio, day: eastern };
        swing = results[1].data; training = results[2].data; model = results[3].data?.model_versions ?? null; prediction = results[3].data;
      }
      return json({ enabled: Boolean(access?.enabled), english, speaking: { required: speaking.data?.require_speaking_for_stock ?? true, completedToday: speaking.data?.last_completed_date === today, gate: classifyGate({ gateStartedAt: speaking.data?.speaking_gate_started_at ?? null, lastCompletedDate: speaking.data?.last_completed_date ?? null, requireSpeaking: speaking.data?.require_speaking_for_stock ?? true }) }, stock: { lastSent: deliveries.data?.find(d => d.kind === "stock" && !d.is_test && d.status === "sent")?.sent_at ?? null, nextRun: stockTopics[0]?.next_revision_date ?? null, topPick: swing?.selected_ticker ?? null }, ml: { training, model, prediction: prediction && prediction.prediction_date === eastern ? prediction : null }, cooldowns: Object.fromEntries((cooldowns.data ?? []).map(c => [c.kind, testCooldownRemaining(c.requested_at)])), lastTests: (deliveries.data ?? []).filter(d => d.is_test).slice(0, 2) });
    }
    if (!access?.enabled) return json({ error: "Stock and English access is not enabled for this account" }, 403);
    const deliveryKey = testDeliveryKey(userId, body.kind, body.request_id);
    const { data: prior } = await admin.from("automation_email_deliveries").select("status").eq("delivery_key", deliveryKey).maybeSingle();
    if (prior?.status === "sent") return json({ ok: true, duplicate: true });
    const claim = await admin.rpc("claim_automation_test", { _user_id: userId, _kind: body.kind, _request_id: body.request_id });
    if (claim.error) throw claim.error;
    if (!claim.data) return json({ error: "Please wait five minutes between tests", retry_after: 300 }, 429);
    const { data: cronSecret, error: secretError } = await admin.rpc("get_cron_secret");
    if (secretError || typeof cronSecret !== "string" || !cronSecret) return json({ error: "Email service unavailable" }, 503);
    let payload: any = { test_user_id: userId, test_request_id: body.request_id };
    let functionName = "send-revision-reminders";
    if (body.kind === "english") {
      const { data: row, error } = await admin.from("american_word_emails").select("id").eq("sent_ok", true).order("sent_for", { ascending: false }).order("et_hour", { ascending: false }).limit(1).maybeSingle();
      if (error || !row) return json({ error: "No English email is available to test yet" }, 409);
      payload.test_row = row.id; functionName = "send-american-word-email";
    }
    const response = await fetch(`${url}/functions/v1/${functionName}`, { method: "POST", headers: { "Content-Type": "application/json", ...(body.kind === "stock" ? { Authorization: `Bearer ${cronSecret}` } : { "x-cron-secret": cronSecret }) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(150000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) return json({ error: result.error ?? "Test email could not be sent" }, response.status >= 400 ? response.status : 502);
    if (result.skipped || (body.kind === "stock" && !result.emailsSent)) return json({ error: result.skipped === "speaking_paused" ? "Complete Speaking Gym or turn the requirement off before testing stocks" : "No test was sent; please try again later" }, 409);
    return json({ ok: true, audio_available: result.audio_available ?? null });
  } catch { return json({ error: "Automation service unavailable; your normal schedules are unchanged" }, 503); }
});