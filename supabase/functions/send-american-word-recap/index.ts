// Daily 5:30 PM Eastern recap: today's hourly words woven into one short story/conversation.
// One Gemini call per day. Auth: x-cron-secret. Cron fires at :30 of 21 and 22 UTC; gated to 17:xx Eastern (DST-safe).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function easternNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

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

function render(s: { title: string; lines: Line[] }, words: W[]) {
  const lines = s.lines.map((l) => `<tr><td style="padding:6px 0;vertical-align:top;font-weight:700;color:#b45309;width:60px;font-size:15px;">${esc(l.speaker)}:</td><td style="padding:6px 0;font-size:16px;color:#111827;line-height:1.5;">${highlight(l.line, words)}</td></tr>`).join("");
  const list = words.map((w) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e7eb;font-size:14px;"><b>${esc(w.word)}</b> <span style="color:#1d4ed8;">(${esc(w.pronunciation)})</span><br><span style="color:#4b5563;">${esc(w.meaning)}</span></td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:28px;"><tr><td>
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#b45309;font-weight:700;">Today's words · Story recap</div>
<div style="font-size:26px;font-weight:700;color:#111827;margin:10px 0 16px 0;">${esc(s.title)}</div>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:20px;">
<div style="font-size:12px;color:#92400e;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Read it out loud — play both parts</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${lines}</table></div>
<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:4px;">All ${words.length} words from today</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${list}</table>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let secret = "";
  try { const { data } = await admin.rpc("get_cron_secret"); if (typeof data === "string") secret = data; } catch { /* ignore */ }
  if (!secret) secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const { date, hour } = easternNow();
  if (!body?.force && hour !== 17) return json({ skipped: "not_530_eastern", hour });

  const { data: ex } = await admin.from("american_word_recaps").select("id,sent_ok").eq("sent_for", date).maybeSingle();
  if (ex?.sent_ok) return json({ skipped: "already_sent", date });

  const { data: words } = await admin.from("american_word_emails").select("word,pronunciation,meaning,sentence,et_hour")
    .eq("sent_for", date).eq("sent_ok", true).gte("et_hour", 9).lte("et_hour", 17).order("et_hour");
  if (!words?.length) return json({ skipped: "no_words_today", date });

  const { data: recips } = await admin.from("portfolio_feature_access").select("report_email");
  const to = (recips ?? []).map((r) => r.report_email).filter(Boolean);
  if (!to.length) return json({ skipped: "no_recipients" });

  let s: { title: string; lines: Line[] };
  try { s = await story(words as W[]); } catch (e) { console.log(JSON.stringify({ phase: "recap_gen", error: String(e) })); return json({ error: "generation_failed" }, 502); }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}` },
    body: JSON.stringify({ from: "American Word <onboarding@resend.dev>", to, subject: `Today's ${words.length} words in one story: ${s.title}`, html: render(s, words as W[]) }),
  });
  if (res.ok) await admin.from("american_word_recaps").upsert({ sent_for: date, story: JSON.stringify(s), sent_ok: true }, { onConflict: "sent_for" });
  else console.log(JSON.stringify({ phase: "recap_send", status: res.status, detail: (await res.text()).slice(0, 200) }));
  return json({ ok: res.ok, date, words: words.length, title: s.title });
});
