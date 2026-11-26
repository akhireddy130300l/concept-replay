// Daily 10:30 PM Eastern recap: today's hourly words woven into one short story/conversation.
// One Gemini call per day. Auth: x-cron-secret. UTC callbacks at 02:30/03:30 use the previous Eastern date.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { conversationSpeechRequest, pcmToWav } from "./recap-audio.ts";
import { distinctPhrases } from "../_shared/english-practice.ts";
import { LEARNING_LINK_SECONDS } from "../_shared/automation-policy.ts";
import { sendRecordedEmail } from "../_shared/recorded-email.ts";
import { z } from "npm:zod@3";
import { easternLearningTime, eligibleRecap, FIRST_ENGLISH_HOUR, LAST_ENGLISH_HOUR } from "../_shared/english-schedule.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type W = { word: string; pronunciation: string; meaning: string; sentence: string; et_hour: number };
type Line = { speaker: string; line: string };

async function story(words: W[]): Promise<{ title: string; lines: Line[] }> {
  const prompt = `Write a short, natural, casual American conversation between two friends, Jake and Mia (about 14-22 lines), that uses ALL of these words/phrases naturally, each at least once: ${words.map((w) => `"${w.word}" (${w.meaning})`).join("; ")}.
It should feel like a real everyday scene from a movie, not a lesson. Keep each line short and spoken. Also give a short fun title.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(Deno.env.get("GEMINI_API_KEY") ?? "")}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 },
        responseSchema: { type: "OBJECT", properties: { title: { type: "STRING" }, lines: { type: "ARRAY", items: { type: "OBJECT", properties: { speaker: { type: "STRING" }, line: { type: "STRING" } }, required: ["speaker", "line"] } } }, required: ["title", "lines"] },
      },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return JSON.parse((data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join(""));
}

function highlight(text: string, words: W[]) {
  let out = esc(text);
  for (const w of [...words].sort((a, b) => b.word.length - a.word.length)) {
    const re = new RegExp(`(${esc(w.word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    out = out.replace(re, `<b style="color:#1d4ed8;">$1</b>`);
  }
  return out;
}

function render(s: { title: string; lines: Line[] }, words: W[], audioUrl: string | null) {
  const lines = s.lines.map((l) => `<tr><td style="padding:6px 0;vertical-align:top;font-weight:700;color:#b45309;width:60px;font-size:15px;">${esc(l.speaker)}:</td><td style="padding:6px 0;font-size:16px;color:#111827;line-height:1.5;">${highlight(l.line, words)}</td></tr>`).join("");
  const list = words.map((w) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:14px;"><b>${esc(w.word)}</b> <span style="color:#1d4ed8;">(${esc(w.pronunciation)})</span><br><span style="color:#4b5563;">${esc(w.meaning)}</span></td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:28px;"><tr><td>
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#b45309;font-weight:700;">Today's words · Story recap</div>
<div style="font-size:26px;font-weight:700;color:#111827;margin:10px 0 16px 0;">${esc(s.title)}</div>
${audioUrl ? `<div style="margin:0 0 18px 0;"><a href="${esc(audioUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;font-size:15px;">&#9654; Hear the conversation</a></div>` : ""}
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:20px;">
<div style="font-size:12px;color:#92400e;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Read it out loud — play both parts</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${lines}</table></div>
<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:4px;">All ${words.length} words from today</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${list}</table>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Service unavailable" }, 503);
  const admin = createClient(url, key);
  let secret = "";
  try { const { data } = await admin.rpc("get_cron_secret"); if (typeof data === "string") secret = data; } catch { /* ignore */ }
  if (!secret) secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const parsed = z.object({ force: z.boolean().optional() }).strict().safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const body = parsed.data;
  const { date, hour, minute } = easternLearningTime();
  if (!body?.force && !eligibleRecap(hour, minute)) return json({ skipped: "outside_recap_schedule", hour, minute });

  const lockName = `american-recap-${date}`;
  const lock = await admin.rpc("try_acquire_run_lock", { _name: lockName, _seconds: 300 });
  if (lock.error) return json({ error: "delivery_lock_unavailable" }, 503);
  if (!lock.data) return json({ skipped: "concurrent_run" });
  try {
  const { data: ex, error: recapError } = await admin.from("american_word_recaps").select("id,sent_ok,story").eq("sent_for", date).maybeSingle();
  if (recapError) throw recapError;
  if (ex?.sent_ok) return json({ skipped: "already_sent", date });

  const { data: practiced, error: practiceError } = await admin.from("american_word_emails").select("word,pronunciation,meaning,sentence,et_hour")
    .eq("sent_for", date).eq("sent_ok", true).gte("et_hour", FIRST_ENGLISH_HOUR).lte("et_hour", LAST_ENGLISH_HOUR).order("et_hour");
  if (practiceError) return json({ error: "practice_history_unavailable" }, 503);
  const words = distinctPhrases(practiced ?? []);
  if (!words.length) return json({ skipped: "no_words_today", date });

  const { data: recips, error: recipientError } = await admin.from("portfolio_feature_access").select("user_id,report_email");
  if (recipientError) throw recipientError;
  const recipients = (recips ?? []).filter(r => r.report_email);
  if (!recipients.length) return json({ skipped: "no_recipients" });

  let s: { title: string; lines: Line[] };
  try { s = ex?.story ? JSON.parse(ex.story) : await story(words as W[]); } catch (e) { console.log(JSON.stringify({ phase: "recap_gen", error: String(e) })); return json({ error: "generation_failed" }, 502); }
  if (!ex?.story) {
    const { error } = await admin.from("american_word_recaps").upsert({ sent_for: date, story: JSON.stringify(s), sent_ok: false }, { onConflict: "sent_for" });
    if (error) throw error;
  }

  // One TTS call per day; email still goes out if audio fails.
  let audioUrl: string | null = null;
  try {
    const path = `recap-${date}.wav`;
    const listed = await admin.storage.from("word-audio").list("", { search: path });
    if (listed.error) throw listed.error;
    if (!listed.data?.some(f => f.name === path)) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(Deno.env.get("GEMINI_API_KEY") ?? "")}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conversationSpeechRequest(s.lines)),
    });
    if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const b64 = d?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
    if (!b64) throw new Error("empty_audio");
    const up = await admin.storage.from("word-audio").upload(path, pcmToWav(b64), { contentType: "audio/wav", upsert: true });
    if (up.error) throw new Error(up.error.message);
    }
    const signed = await admin.storage.from("word-audio").createSignedUrl(path, LEARNING_LINK_SECONDS);
    if (signed.error) throw new Error(signed.error.message);
    audioUrl = signed.data.signedUrl;
  } catch (e) { console.log(JSON.stringify({ phase: "recap_audio", error: String(e).slice(0, 200) })); }

  for (const recipient of recipients) {
    await sendRecordedEmail(admin, { userId: recipient.user_id, kind: "recap", key: `american-recap-${date}-${recipient.user_id}`,
      from: "American Word <onboarding@resend.dev>", to: recipient.report_email, subject: `Today's ${words.length} words in one story: ${s.title}`,
      html: render(s, words as W[], audioUrl), audioAvailable: Boolean(audioUrl), apiKey: Deno.env.get("RESEND_API_KEY") ?? "" });
  }
  const { error } = await admin.from("american_word_recaps").update({ sent_ok: true }).eq("sent_for", date);
  if (error) throw error;
  return json({ ok: true, date, words: words.length, title: s.title });
  } catch { return json({ error: "recap_delivery_failed" }, 502); }
  finally { await admin.rpc("release_run_lock", { _name: lockName }); }
});
