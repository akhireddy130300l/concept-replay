import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import {
  verifyStartTodayActionToken,
  type KickstartStep,
} from "../_shared/start-today.ts";
import { generateKickstartRoadmap } from "../_shared/start-today-research.ts";

const PostSchema = z.object({
  ideaId: z.string().uuid(),
});

function renderConfirmationHtml(title: string, subtitle: string, appUrl: string, isError = false): Response {
  const accent = isError ? "#dc2626" : "#16a34a";
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Start Today</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:440px;width:100%;background:rgba(255,255,255,0.92);border:1px solid #e2e8f0;border-radius:24px;padding:28px 24px;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${accent};">Start Today</p>
    <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;">${title}</h1>
    <p style="margin:0 0 22px;font-size:14px;line-height:1.5;color:#475569;">${subtitle}</p>
    <a href="${appUrl}/start-today" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Open Start Today</a>
  </div>
</body></html>`;
  return new Response(html, {
    status: isError ? 400 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const signingSecret = Deno.env.get("START_TODAY_ACTION_SECRET") || serviceKey;
  const appUrl = (Deno.env.get("APP_BASE_URL") || "https://concept-replay.lovable.app").replace(/\/$/, "");
  const admin = createClient(supabaseUrl, serviceKey);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    const verified = await verifyStartTodayActionToken(token, signingSecret);
    if (!verified) {
      return renderConfirmationHtml(
        "Link expired or invalid",
        "Open Start Today in the app to update this idea.",
        appUrl,
        true,
      );
    }

    const { uid, iid, act } = verified;
    const { data: idea } = await admin
      .from("opportunity_ideas")
      .select("id, topic, first_step, field")
      .eq("id", iid)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .maybeSingle();

    if (!idea) {
      return renderConfirmationHtml("Idea not found", "This idea is no longer available.", appUrl, true);
    }

    const { data: existing } = await admin
      .from("opportunity_actions")
      .select("id, started_at, weekly_steps")
      .eq("user_id", uid)
      .eq("idea_id", iid)
      .is("deleted_at", null)
      .maybeSingle();

    const nowIso = new Date().toISOString();
    const nextStatus = act === "focus" ? "started" : act === "start" ? "started" : act;
    let weeklySteps: KickstartStep[] = Array.isArray(existing?.weekly_steps)
      ? (existing.weekly_steps as KickstartStep[])
      : [];

    if (nextStatus === "started" && weeklySteps.length === 0) {
      weeklySteps = await generateKickstartRoadmap({
        topic: idea.topic,
        firstStep: idea.first_step,
        field: idea.field,
      });
    }

    if (act === "focus") {
      await admin
        .from("opportunity_actions")
        .update({ is_weekly_focus: false })
        .eq("user_id", uid)
        .is("deleted_at", null);
    }

    const payload = {
      user_id: uid,
      idea_id: iid,
      status: nextStatus,
      started_at: nextStatus === "started" ? existing?.started_at ?? nowIso : existing?.started_at ?? null,
      weekly_steps: weeklySteps,
      ...(act === "focus" ? { is_weekly_focus: true } : {}),
    };

    if (existing) {
      await admin.from("opportunity_actions").update(payload).eq("id", existing.id);
    } else {
      await admin.from("opportunity_actions").insert(payload);
    }

    if (act === "focus") {
      return renderConfirmationHtml(
        "Locked as Focus of the Week",
        `"${idea.topic}" is now your single focus for the week. Open the app to check off your daily steps.`,
        appUrl,
      );
    }
    if (act === "start") {
      return renderConfirmationHtml(
        "You Started Today!",
        `We saved "${idea.topic}" and built your 7-Day Kickstart Roadmap (15 mins/day).`,
        appUrl,
      );
    }
    if (act === "later") {
      return renderConfirmationHtml(
        "Saved for Later",
        `"${idea.topic}" is waiting in your Later tab whenever you're ready.`,
        appUrl,
      );
    }
    return renderConfirmationHtml(
      "Marked as Passed",
      `Got it — "${idea.topic}" moved to Not for me.`,
      appUrl,
    );
  }

  if (req.method === "POST") {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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

    const parsed = PostSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid ideaId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uid = userData.user.id;
    const { data: idea } = await admin
      .from("opportunity_ideas")
      .select("id, topic, first_step, field")
      .eq("id", parsed.data.ideaId)
      .eq("user_id", uid)
      .is("deleted_at", null)
      .maybeSingle();

    if (!idea) {
      return new Response(JSON.stringify({ error: "Idea not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const steps = await generateKickstartRoadmap({
      topic: idea.topic,
      firstStep: idea.first_step,
      field: idea.field,
    });

    const { data: existing } = await admin
      .from("opportunity_actions")
      .select("id")
      .eq("user_id", uid)
      .eq("idea_id", idea.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      await admin.from("opportunity_actions").update({ weekly_steps: steps }).eq("id", existing.id);
    }

    return new Response(JSON.stringify({ steps }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});