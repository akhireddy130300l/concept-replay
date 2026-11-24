// Hourly American word email: 9 AM–5 PM Eastern. One Gemini call per email.
// New phrases never repeat; labelled reviews use fresh situations and sentences.
// Auth: x-cron-secret. Cron fires hourly 13–22 UTC; this function gates on Eastern hour (DST-safe).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AUDIO_LINK_SECONDS, sentenceSpeechRequest } from "./sentence-audio.ts";
import { PLAN, eligibleHour, pickReview, shouldIntroduce } from "./learning-plan.ts";
import { z } from "npm:zod@3";
import { testDeliveryKey } from "../_shared/automation-policy.ts";
import { sendRecordedEmail } from "../_shared/recorded-email.ts";

type SavedItem = Item & { id: string; sent_for: string; et_hour: number; kind: string; review_of: string | null };

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Item = { word: string; pronunciation: string; meaning: string; sentence: string; situation?: string };

function easternNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const minute = new Date().getUTCMinutes();
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute };
}

export const THEMES = [
  "ordering at a drive-thru or fast-casual place like Chipotle",
  "office small talk, Slack messages, and Zoom meetings",
  "airport, TSA lines, flight delays, and Uber/Lyft pickups",
  "ordering custom drinks at a coffee shop",
  "returning items or calling customer service",
  "visiting the doctor, pharmacy, or feeling sick",
  "bars, breweries, splitting the tab, and nights out",
  "the gym, workouts, and sharing equipment",
  "grocery shopping, the deli counter, and checkout chat",
  "watching football or basketball with friends and tailgating",
  "talking to a landlord, roommates, or a repair person",
  "driving, traffic, road trips, and gas stations",
  "making, changing, or canceling plans with friends",
  "binge-watching shows, movies, and game night",
  "chatting with neighbors and walking the dog",
  "dining out, ordering, tipping, and splitting the check",
  "job interviews, asking for a raise, and talking to a boss",
  "texting friends and reacting to news or gossip",
  "family holidays, Thanksgiving, and visiting parents",
  "the bank, bills, money, and saving up",
  "the weather, seasons, and weekend plans",
  "hair salon or barbershop small talk",
  "complimenting, cheering up, or comforting a friend",
  "complaining or venting about a bad day",
];

async function generate(used: string[], themeIdx: number): Promise<Item[]> {
  const theme = THEMES[((themeIdx % THEMES.length) + THEMES.length) % THEMES.length];
  const prompt = `Give 12 different everyday American English words or short phrases a native speaker would really say while ${theme}.
Focus on natural conversational phrasing native speakers actually say daily, not textbook words or overused slang (avoid "cool", "dude", "awesome", "gonna", "totally", "like", "basically").
For each: a one-sentence "situation" written to the learner in second person describing the moment and what they want to express WITHOUT revealing the phrase (e.g. "You're leaving work early and want to tell your coworker you're done for the day."), the word, how Americans actually pronounce it in relaxed casual speech (simple respelling with stressed syllable in CAPS, e.g. "water" -> "WAH-der", "going to" -> "GUN-nuh"), a short plain meaning, and one natural everyday sentence an American would say using it.
Every sentence must be fresh and different. Do NOT use any of these already-used words: ${used.slice(-1500).join(", ") || "(none)"}.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(Deno.env.get("GEMINI_API_KEY") ?? "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 },
        responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { situation: { type: "STRING" }, word: { type: "STRING" }, pronunciation: { type: "STRING" }, meaning: { type: "STRING" }, sentence: { type: "STRING" } }, required: ["situation", "word", "pronunciation", "meaning", "sentence"] } },
      },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
  return JSON.parse(text) as Item[];
}

// Review: same phrase, brand-new situation and sentence (one Gemini call).
async function reviewGen(p: Item, themeIdx: number): Promise<{ situation: string; sentence: string }[]> {
  const theme = THEMES[((themeIdx % THEMES.length) + THEMES.length) % THEMES.length];
  const prompt = `The learner already studied the American English phrase "${p.word}" (${p.meaning}). Old example: "${p.sentence}".
Write 4 options. Each has a "situation": one second-person sentence describing a NEW real moment while ${theme} where an American would naturally say "${p.word}", WITHOUT revealing the phrase. And a "sentence": a fresh natural thing an American would say there using "${p.word}" exactly. Never reuse the old example.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(Deno.env.get("GEMINI_API_KEY") ?? "")}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 1.0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 },
        responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { situation: { type: "STRING" }, sentence: { type: "STRING" } }, required: ["situation", "sentence"] } },
      },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return JSON.parse((data?.candidates?.[0]?.content?.parts ?? []).map((x: any) => x?.text ?? "").join(""));
}

// Memory picture: one image per new phrase, saved privately and reused by its reviews.
async function drawMemoryPicture(it: Item): Promise<Uint8Array> {
  const prompt = `Funny, vivid, colorful cartoon illustration that helps an English learner remember the American expression "${it.word}" (meaning: ${it.meaning}). Show one exaggerated, physical, slightly absurd scene that visually connects the literal words to the meaning, inspired by: "${it.sentence}". Clean modern editorial cartoon style, bright friendly colors, simple background, no text, no letters, no words anywhere in the image.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}` },
    body: JSON.stringify({ model: "openai/gpt-image-2.5-sunburst", prompt, size: "1024x1024", quality: "low" }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("empty_image");
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Gemini TTS: one call per email, complete sentence only, saved as a private WAV.
async function speak(it: Item): Promise<Uint8Array> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(Deno.env.get("GEMINI_API_KEY") ?? "")}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sentenceSpeechRequest(it.sentence)),
  });
  if (!res.ok) throw new Error(`tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new Error("empty_audio");
  const bin = atob(b64); const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  const h = new DataView(new ArrayBuffer(44)); const w = (o: number, t: string) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, 24000, true); h.setUint32(28, 48000, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, "data"); h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length); out.set(new Uint8Array(h.buffer)); out.set(pcm, 44); return out;
}

function render(it: Item, hourLabel: string, audioUrl: string | null, kind: string, hour: number, imageUrl: string | null = null) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;padding:28px;"><tr><td>
<div style="font-size:12px;text-transform:uppercase;color:#0891b2;font-weight:700;">${kind === "new" ? "New American expression" : hour === 9 ? "Morning recall challenge" : hour >= 15 ? "Try it in a new situation" : "Spaced recall"} · ${esc(hourLabel)}</div>
<div style="font-size:22px;font-weight:700;color:#0f172a;margin:18px 0 12px;">What would you say?</div>
<div style="font-size:18px;line-height:1.6;color:#334155;">${esc(it.situation || "Think of a natural American way to express this idea: " + it.meaning)}</div>
<p style="color:#0891b2;font-weight:700;">Say your answer out loud before scrolling down.</p>
<p style="font-size:13px;color:#64748b;margin-bottom:64px;">Missed an earlier email? No catch-up needed. Start here.</p>
<div style="border-top:1px solid #cbd5e1;padding-top:24px;">
${imageUrl ? `<img src="${esc(imageUrl)}" width="504" alt="Memory picture for ${esc(it.word)}" style="display:block;width:100%;max-width:504px;height:auto;border-radius:12px;margin:0 0 8px;" /><div style="font-size:13px;color:#64748b;margin-bottom:20px;">Look at the picture for 3 seconds and connect it to the phrase below.</div>` : ""}
<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">One natural way to say it</div>
<div style="font-size:30px;font-weight:700;color:#0f172a;margin:10px 0 4px;">${esc(it.word)}</div>
<div style="font-size:18px;color:#0891b2;font-weight:700;margin-bottom:6px;">Say it: ${esc(it.pronunciation)}</div>
<div style="font-size:14px;color:#475569;margin-bottom:18px;">${esc(it.meaning)}</div>
<div style="font-size:18px;line-height:1.5;color:#0f172a;margin-bottom:18px;">&ldquo;${esc(it.sentence)}&rdquo;</div>
${audioUrl ? `<a href="${esc(audioUrl)}" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;font-size:15px;">&#9654; Hear it like a real American</a>` : ""}
<p style="font-size:14px;color:#334155;">Now say your own sentence using this expression, without reading the example.</p></div>
</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Service unavailable" }, 503);
  const admin = createClient(url, key);
  let secret = "";
  try { const { data } = await admin.rpc("get_cron_secret"); if (typeof data === "string") secret = data; } catch { /* ignore */ }
  if (!secret) secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);
  const parsed = z.object({ force: z.boolean().optional(), dry_run: z.boolean().optional(), test_row: z.string().uuid().optional(), test_user_id: z.string().uuid().optional(), test_request_id: z.string().uuid().optional() }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const body = parsed.data;
  const testRow = body.test_row ?? null;
  if (body.test_user_id && (!testRow || !body.test_request_id)) return json({ error: "Incomplete test request" }, 400);
  const now = easternNow();
  const { minute } = now;
  let { date, hour } = now;
  if (testRow) {
    const { data: t } = await admin.from("american_word_emails").select("sent_for,et_hour").eq("id", testRow).maybeSingle();
    if (!t) return json({ error: "test_row_not_found" }, 404);
    date = t.sent_for; hour = t.et_hour;
  }
  if (!testRow && !eligibleHour(hour, minute)) return json({ skipped: "outside_learning_schedule", hour, minute });
  // Serialize the entire day: concurrent slots cannot exceed three new phrases.
  const lockName = `american-word-learning-${date}`;
  const lock = await admin.rpc("try_acquire_run_lock", { _name: lockName, _seconds: 300 });
  if (lock.error) return json({ error: "delivery_lock_unavailable" }, 503);
  if (!lock.data) return json({ skipped: "concurrent_run" });
  try {
  const { data: existing, error: existingError } = await admin.from("american_word_emails").select("id,sent_ok").eq("sent_for", date).eq("et_hour", hour).maybeSingle();
  if (existingError) throw new Error("Cannot read hourly delivery");
  if (existing?.sent_ok && !body.dry_run && !testRow) return json({ skipped: "already_sent", date, hour });

  let recipientQuery = admin.from("portfolio_feature_access").select("user_id,report_email");
  if (body.test_user_id) recipientQuery = recipientQuery.eq("user_id", body.test_user_id).eq("enabled", true);
  const { data: recips, error: recipientError } = await recipientQuery;
  if (recipientError) throw new Error("Recipients unavailable");
  const recipients = (recips ?? []).filter(r => r.report_email);
  if (!recipients.length) return json({ skipped: "no_recipients" });

  let row = body.dry_run ? null : existing;
  let item: Item | null = null;
  let kind = "new";
  let reviewOf: string | null = null;
  if (row) {
    const { data } = await admin.from("american_word_emails").select("*").eq("id", row.id).single();
    if (!data) throw new Error("Saved phrase unavailable");
    item = data as Item;
    kind = data.kind;
    reviewOf = data.review_of ?? null;
  } else {
    const { data: usedRows, error: historyError } = await admin.from("american_word_emails").select("id,word,pronunciation,meaning,sentence,sent_for,et_hour,kind,review_of").order("sent_for").order("et_hour");
    if (historyError) throw new Error("Cannot load practice history");
    const history = (usedRows ?? []) as SavedItem[];
    const roots = history.filter((p) => p.kind === "new");
    const todayRows = history.filter((p) => p.sent_for === date);
    const slot = PLAN[hour];
    if (!slot) return json({ skipped: "no_slot" });
    const selected = pickReview(slot.kind === "new" ? { kind: "review", source: "yesterday" } : slot, date, roots, new Set(todayRows.flatMap((p) => p.review_of ? [p.review_of] : [])));
    const parent = roots.find((p) => p.id === selected?.id);
    const introduce = shouldIntroduce(slot, todayRows.filter((p) => p.kind === "new").length, Boolean(parent));
    const used = roots.map((r) => r.word);
    const usedKeys = new Set(used.map((w) => w.trim().toLowerCase()));
    const dayIdx = Math.floor(Date.parse(date) / 86400000);
    if (!introduce) {
      if (!parent) return json({ error: "no_review_material" }, 503);
      kind = "review";
    }
    // Up to 3 tries, each with a different real-life situation, so repeats never skip an hour.
    outer: for (let attempt = 0; attempt < 3 && !item; attempt++) {
      const themeIdx = dayIdx * 9 + hour + attempt * 7;
      let cands: Item[];
      try {
        cands = introduce ? await generate(used, themeIdx) : (await reviewGen(parent as SavedItem, themeIdx)).map((c) => ({ ...(parent as SavedItem), situation: c.situation, sentence: c.sentence }));
      } catch (e) {
        console.log(JSON.stringify({ phase: "word_gen", attempt, error: String(e).slice(0, 200) }));
        if (String(e).includes("gemini 429")) return json({ error: "generation_quota_reached", retry: "Next scheduled run can retry this slot; saved material is preserved." }, 429);
        if (attempt === 2) return json({ error: "generation_failed" }, 502);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const c of cands) {
        if (!c?.word || !c?.sentence || !c?.pronunciation || !c?.meaning || !c?.situation || (introduce && usedKeys.has(c.word.trim().toLowerCase()))) continue;
        if (c.situation.toLowerCase().includes(c.word.toLowerCase())) continue;
        if (!introduce && !c.sentence.toLowerCase().includes(c.word.toLowerCase())) continue;
        if (body.dry_run) return json({ ok: true, dry_run: true, date, hour, kind, review_of: parent?.id ?? null, word: c.word, situation: c.situation, sentence: c.sentence, html: render(c, `${((hour + 11) % 12) + 1}${hour === 9 ? ":10" : ":00"} ${hour < 12 ? "AM" : "PM"} ET`, null, kind, hour), delivered: false });
        const { data, error } = await admin.from("american_word_emails").insert({ word: c.word.trim(), pronunciation: c.pronunciation, meaning: c.meaning, sentence: c.sentence.trim(), situation: c.situation.trim(), kind, review_of: introduce ? null : parent?.id, sent_for: date, et_hour: hour }).select("id").single();
        if (!error) { row = { id: data.id, sent_ok: false }; item = c; reviewOf = introduce ? null : parent?.id ?? null; break outer; }
        if (error.code === "23505" && error.message.includes("sent_for")) return json({ skipped: "concurrent_run" });
        if (error.code !== "23505") throw new Error("Cannot save practice item");
        if (introduce) usedKeys.add(c.word.trim().toLowerCase());
      }
      console.log(JSON.stringify({ phase: "word_gen", attempt, result: "all_repeats_retrying" }));
    }
    if (!item || !row) return json({ error: "all_candidates_were_repeats" }, 409);
  }

  if (!row || !item) return json({ error: "practice_unavailable" }, 503);
  let audioUrl: string | null = null;
  try {
    const path = `${row.id}.wav`;
    const { data: ex, error: listError } = await admin.storage.from("word-audio").list("", { search: path });
    if (listError) throw new Error(listError.message);
    if (!ex?.some((file) => file.name === path)) {
      const wav = await speak(item);
      const up = await admin.storage.from("word-audio").upload(path, wav, { contentType: "audio/wav", upsert: true });
      if (up.error) throw new Error(up.error.message);
    }
    const signed = await admin.storage.from("word-audio").createSignedUrl(path, AUDIO_LINK_SECONDS);
    if (signed.error) throw new Error(signed.error.message);
    audioUrl = signed.data.signedUrl;
  } catch (e) { console.log(JSON.stringify({ phase: "word_audio", error: String(e).slice(0, 200) })); }

  // Picture is optional: any failure still sends the normal email.
  let imageUrl: string | null = null;
  try {
    const rootId = kind === "new" ? row.id : reviewOf;
    if (rootId) {
      const ipath = `pictures/${rootId}.png`;
      const { data: ix, error: ie } = await admin.storage.from("word-audio").list("pictures", { search: `${rootId}.png` });
      if (ie) throw new Error(ie.message);
      let exists = Boolean(ix?.some((f) => f.name === `${rootId}.png`));
      if (!exists && kind === "new" && !testRow) {
        const png = await drawMemoryPicture(item);
        const up = await admin.storage.from("word-audio").upload(ipath, png, { contentType: "image/png", upsert: true });
        if (up.error) throw new Error(up.error.message);
        exists = true;
      }
      if (exists) {
        const signed = await admin.storage.from("word-audio").createSignedUrl(ipath, AUDIO_LINK_SECONDS);
        if (signed.error) throw new Error(signed.error.message);
        imageUrl = signed.data.signedUrl;
      }
    }
  } catch (e) { console.log(JSON.stringify({ phase: "word_picture", error: String(e).slice(0, 200) })); }

  const hourLabel = `${((hour + 11) % 12) + 1}${hour === 9 ? ":10" : ":00"} ${hour < 12 ? "AM" : "PM"} ET`;
  const label = kind === "new" ? "New American expression" : hour === 9 ? "Morning recall challenge" : hour >= 15 ? "Try it in a new situation" : "Spaced recall challenge";
  const subject = `${testRow ? "[TEST] " : ""}${label}: what would you say? (${hourLabel})`;
  const html = render(item, hourLabel, audioUrl, kind, hour, imageUrl);
  for (const recipient of recipients) {
    await sendRecordedEmail(admin, { userId: recipient.user_id, kind: "english", isTest: Boolean(testRow),
      key: testRow ? testDeliveryKey(recipient.user_id, "english", body.test_request_id ?? testRow) : `american-learning-${date}-${hour}-${recipient.user_id}`,
      from: "American Word <onboarding@resend.dev>", to: recipient.report_email, subject, html, audioAvailable: Boolean(audioUrl), apiKey: Deno.env.get("RESEND_API_KEY") ?? "" });
  }
  if (!testRow) {
    const { error } = await admin.from("american_word_emails").update({ sent_ok: true }).eq("id", row.id);
    if (error) throw new Error("Delivery confirmation unavailable");
  }
  return json({ ok: true, word: item.word, date, hour, kind, audio_available: Boolean(audioUrl), picture_available: Boolean(imageUrl) });
  } catch (e) {
    console.log(JSON.stringify({ phase: "learning_delivery", error: String(e).slice(0, 200) }));
    return json({ error: "delivery_failed" }, 502);
  } finally {
    await admin.rpc("release_run_lock", { _name: lockName });
  }
});
