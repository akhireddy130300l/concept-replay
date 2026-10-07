// Hourly American word email: 9 AM–5 PM Eastern. One Gemini call per email.
// Words and sentences are never repeated (unique keys in american_word_emails).
// Auth: x-cron-secret. Cron fires hourly 13–22 UTC; this function gates on Eastern hour (DST-safe).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Item = { word: string; pronunciation: string; meaning: string; sentence: string };

function easternNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

async function generate(used: string[]): Promise<Item[]> {
  const prompt = `Give 5 different everyday American English words or short phrases that people use constantly in casual daily conversation.
For each: the word, how Americans actually pronounce it in relaxed casual speech (simple respelling with stressed syllable in CAPS, e.g. "water" -> "WAH-der", "going to" -> "GUN-nuh"), a short plain meaning, and one natural everyday sentence an American would say using it.
Every sentence must be fresh and different. Do NOT use any of these already-used words: ${used.slice(-1500).join(", ") || "(none)"}.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(Deno.env.get("GEMINI_API_KEY") ?? "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 },
        responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { word: { type: "STRING" }, pronunciation: { type: "STRING" }, meaning: { type: "STRING" }, sentence: { type: "STRING" } }, required: ["word", "pronunciation", "meaning", "sentence"] } },
      },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
  return JSON.parse(text) as Item[];
}

function render(it: Item, hourLabel: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:28px;"><tr><td>
<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#b45309;font-weight:700;">American Word · ${esc(hourLabel)}</div>
<div style="font-size:30px;font-weight:700;color:#111827;margin:10px 0 4px 0;">${esc(it.word)}</div>
<div style="font-size:18px;color:#1d4ed8;font-weight:700;margin-bottom:6px;">Say it: ${esc(it.pronunciation)}</div>
<div style="font-size:14px;color:#4b5563;margin-bottom:18px;">${esc(it.meaning)}</div>
<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;">
<div style="font-size:12px;color:#92400e;font-weight:700;text-transform:uppercase;">Say this out loud 3 times</div>
<div style="font-size:17px;color:#111827;margin-top:6px;">&ldquo;${esc(it.sentence)}&rdquo;</div></div>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let secret = "";
  try { const { data } = await admin.rpc("get_cron_secret"); if (typeof data === "string") secret = data; } catch { /* ignore */ }
  if (!secret) secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const { date, hour } = easternNow();
  if (!body?.force && (hour < 9 || hour > 17)) return json({ skipped: "outside_9_to_5_eastern", hour });
  const { data: existing } = await admin.from("american_word_emails").select("id,sent_ok").eq("sent_for", date).eq("et_hour", hour).maybeSingle();
  if (existing?.sent_ok) return json({ skipped: "already_sent", date, hour });

  const { data: recips } = await admin.from("portfolio_feature_access").select("report_email");
  const to = (recips ?? []).map((r) => r.report_email).filter(Boolean);
  if (!to.length) return json({ skipped: "no_recipients" });

  let row = existing;
  let item: Item | null = null;
  if (row) {
    const { data } = await admin.from("american_word_emails").select("*").eq("id", row.id).single();
    item = data as Item;
  } else {
    const { data: usedRows } = await admin.from("american_word_emails").select("word");
    const used = (usedRows ?? []).map((r) => r.word);
    let cands: Item[];
    try { cands = await generate(used); } catch (e) { console.log(JSON.stringify({ phase: "word_gen", error: String(e) })); return json({ error: "generation_failed" }, 502); }
    for (const c of cands) {
      if (!c?.word || !c?.sentence) continue;
      const { data, error } = await admin.from("american_word_emails").insert({ word: c.word.trim(), pronunciation: c.pronunciation, meaning: c.meaning, sentence: c.sentence.trim(), sent_for: date, et_hour: hour }).select("id").single();
      if (!error) { row = { id: data.id, sent_ok: false }; item = c; break; }
      if (error.code === "23505" && error.message.includes("sent_for")) return json({ skipped: "concurrent_run" });
    }
    if (!item || !row) return json({ error: "all_candidates_were_repeats" }, 409);
  }

  const hourLabel = `${((hour + 11) % 12) + 1} ${hour < 12 ? "AM" : "PM"} ET`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}` },
    body: JSON.stringify({ from: "American Word <onboarding@resend.dev>", to, subject: `${item.word} — say it like an American (${hourLabel})`, html: render(item, hourLabel) }),
  });
  if (res.ok) await admin.from("american_word_emails").update({ sent_ok: true }).eq("id", row.id);
  else console.log(JSON.stringify({ phase: "word_send", status: res.status, detail: (await res.text()).slice(0, 200) }));
  return json({ ok: res.ok, word: item.word, date, hour });
});
