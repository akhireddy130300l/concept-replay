import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import { normalizeTopicKey } from "../_shared/start-today.ts";
import { searchWebSignals, synthesizeOpportunity } from "../_shared/start-today-research.ts";

const AskSchema = z.object({
  topic: z.string().trim().min(2, "Enter a topic or goal").max(160, "Keep your topic under 160 characters"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  const parsed = AskSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recentCount } = await admin
    .from("opportunity_ideas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_ask_anything", true)
    .gte("created_at", oneHourAgo);

  if ((recentCount ?? 0) >= 5) {
    return new Response(JSON.stringify({ error: "Rate limit reached: up to 5 Ask Anything plans per hour." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const query = `${parsed.data.topic} how to start beginners rising trend 2026`;
    const sources = await searchWebSignals(query, 5);
    const idea = await synthesizeOpportunity({
      fieldLabel: "Ask Anything",
      focusPrompt: `The user explicitly wants to get into: "${parsed.data.topic}". Build an honest, practical, researched starting plan for them.`,
      sources,
      avoidTopics: [],
    });

    const baseKey = normalizeTopicKey(idea.topic) || normalizeTopicKey(parsed.data.topic);
    const topicKey = `${baseKey}-${Date.now().toString(36)}`;
    const todayIso = new Date().toISOString().slice(0, 10);

    const { data: saved, error: insertErr } = await admin
      .from("opportunity_ideas")
      .insert({
        user_id: userId,
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
        is_wildcard: false,
        is_ask_anything: true,
        sent_for: todayIso,
      })
      .select("*")
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ idea: saved }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to research topic";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});