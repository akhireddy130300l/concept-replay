// American Shadow — 10-minute continuous shadowing sessions.
// Independent module. Text: Google Gemini direct (GEMINI_API_KEY, gemini-2.5-flash).
// Voice: same TTS as Speaking Gym (Lovable AI, openai/gpt-4o-mini-tts, onyx), mp3 chunks joined.
// Work runs one unit per invocation, chained via INTERNAL_DISPATCH_SECRET, so a
// failure only affects the current section and completed sections are never redone.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-dispatch",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BUCKET = "shadow-audio";
const TEXT_MODEL = "gemini-2.5-flash";
const TTS_MODEL = "openai/gpt-4o-mini-tts"; // same as Speaking Gym
const VOICE = "onyx"; // adult male
const TRANSCRIPT_WORDS = 1750;
const TTS_MAX_CHARS = 1900; // speaking-tts limit is 2000
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const PCM_RATE = 24000; // 16-bit mono

function wavHeader(dataLen: number): Uint8Array {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, t: string) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); h.setUint32(4, 36 + dataLen, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, PCM_RATE, true); h.setUint32(28, PCM_RATE * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, "data"); h.setUint32(40, dataLen, true);
  return new Uint8Array(h.buffer);
}
function toWav(pcm: Uint8Array): Uint8Array { const o = new Uint8Array(44 + pcm.length); o.set(wavHeader(pcm.length)); o.set(pcm, 44); return o; }
function pcmOf(wav: Uint8Array): Uint8Array { return wav.subarray(44); }
const pcmSeconds = (pcm: Uint8Array) => pcm.length / (PCM_RATE * 2);
const VOICE_STYLE =
  "Adult American man with a General American accent. Natural, relaxed, conversational, calm but energetic. Steady everyday speaking pace, not dramatic, no long pauses.";
const MIN_SECONDS = 600;
const MAX_RETRIES = 5;
const MAX_STEPS = 60;
const DAILY_LIMIT = 6;
const ACTIVE = ["queued", "generating_text", "generating_audio", "assembling", "verifying_duration"];

const env = (k: string) => Deno.env.get(k) ?? "";

// ---------- MP3 frame parsing (real duration + clean concatenation) ----------
const BITRATES: Record<string, number[]> = {
  "1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function parseMp3(buf: Uint8Array): { frames: Uint8Array[]; seconds: number } {
  let i = 0;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  const frames: Uint8Array[] = [];
  let seconds = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1 = Layer III
    const brIdx = buf[i + 2] >> 4;
    const srIdx = (buf[i + 2] >> 2) & 3;
    const pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; continue; }
    const br = BITRATES[ver === 3 ? "1" : "2"][brIdx] * 1000;
    const sr = RATES[ver][srIdx];
    const spf = ver === 3 ? 1152 : 576;
    const len = Math.floor((spf / 8) * br / sr) + pad;
    if (len < 4 || i + len > buf.length) break;
    const frame = buf.subarray(i, i + len);
    const head = new TextDecoder().decode(frame.subarray(0, Math.min(len, 60)));
    if (!head.includes("Xing") && !head.includes("Info") && !head.includes("VBRI")) {
      frames.push(frame);
      seconds += spf / sr;
    }
    i += len;
  }
  return { frames, seconds };
}

// ---------- AI calls ----------
class GatewayError extends Error { constructor(public status: number, msg: string) { super(msg); } }

// EXACTLY ONE Gemini text call per session: the complete ~10-minute transcript.
async function generateTranscript(topic: string): Promise<string> {
  const instructions = [
    "You write spoken monologue scripts for American English shadowing practice. A learner listens on earphones and speaks along about one second behind the narrator.",
    "Write ONLY the words the narrator says, in first person, as if he is actually living the situation. One-voice performance: he speaks his own lines and naturally reacts to what others say (\"Wait, you went to Denver? No way.\").",
    "The scene moves forward in time from start to finish, ending with one natural goodbye or closing line. Never restart the scene, never re-greet the same people, never repeat earlier lines or paragraphs.",
    "Never lecture or explain. No stage directions, no brackets, no speaker labels, no headings, no lists.",
    "Natural contemporary American English: contractions, natural transitions, follow-up questions, occasional idioms, realistic sentence lengths. Avoid 'um'/'uh'.",
    "For story topics, invent a complete believable everyday story. For opinion topics, move through connected subjects with opinions, reasons, examples, polite disagreement.",
    `Length: this must fill 10+ minutes of continuous speech — write ${TRANSCRIPT_WORDS} to ${TRANSCRIPT_WORDS + 150} words. Plain text only, short paragraphs.`,
  ].join("\n");
  const res = await fetch(`${GEMINI}/${TEXT_MODEL}:generateContent?key=${encodeURIComponent(env("GEMINI_API_KEY"))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: `Topic / situation: ${topic}` }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new GatewayError(res.status, (await res.text()).slice(0, 300));
  const data = await res.json();
  let text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
  text = text.replace(/\[[^\]]*\]|\([^)]*(pause|laugh|sigh)[^)]*\)/gi, "").replace(/\*+/g, "").trim();
  if (text.split(/\s+/).length < 300) throw new GatewayError(200, "empty_or_refused");
  return text;
}

// Split the SAVED transcript locally (zero AI calls) into the minimum number of TTS-safe chunks.
function splitTranscript(text: string, max = TTS_MAX_CHARS): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+["'”’]?\s*|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = ""; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Same TTS as Speaking Gym (speaking-tts): Lovable AI Gateway, openai/gpt-4o-mini-tts, mp3.
async function synthesize(text: string): Promise<Uint8Array> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TTS_MODEL, input: text, voice: VOICE, instructions: VOICE_STYLE, response_format: "mp3" }),
  });
  if (!res.ok) throw new GatewayError(res.status, (await res.text()).slice(0, 300));
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 1000) throw new GatewayError(200, "empty_audio");
  return buf;
}

// ---------- helpers ----------
let bucketReady = false;
async function ensureBucket(admin: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024 });
  bucketReady = true;
}

function dispatch(sessionId: string) {
  const p = fetch(`${env("SUPABASE_URL")}/functions/v1/american-shadow`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-dispatch": env("INTERNAL_DISPATCH_SECRET") },
    body: JSON.stringify({ action: "step", session_id: sessionId }),
  }).then((r) => r.text()).catch((e) => console.log(JSON.stringify({ phase: "shadow_dispatch", error: String(e) })));
  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
}

function friendlyFailure(status: number, what: string, idx: number): string {
  if (idx < 0 && status === 429) return "Gemini's usage limit was reached, so the script wasn't written yet. Nothing was lost — tap Retry later (daily quota resets at midnight Pacific).";
  if (idx < 0 && status === 402) return "Gemini billing/credits are exhausted. Tap Retry once the Gemini key has quota again.";
  if (idx < 0) return "The script couldn't be written. Tap Retry.";
  if (status === 402) return "AI credits for voice audio are exhausted. Your script and finished audio parts are saved — tap Retry after adding credits.";
  if (status === 429) return "Voice service is busy. Your script and finished audio parts are saved — tap Retry in a few minutes.";
  if (status === 403) return "The AI service declined this request. Your completed sections are safe.";
  if (status === 401) return "Voice generation isn't configured yet. Check backend secrets.";
  return `Section ${idx + 1} ${what} couldn't be created. Your completed sections are safe. Retry from Section ${idx + 1}.`;
}

// ---------- one unit of work ----------
async function step(admin: SupabaseClient, sessionId: string): Promise<void> {
  const { data: s } = await admin.from("shadow_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s || !ACTIVE.includes(s.status)) return;
  if (s.step_count >= MAX_STEPS) {
    await admin.from("shadow_sessions").update({ status: "failed", error_message: "Stopped: too many generation steps (safety limit)." }).eq("id", sessionId);
    return;
  }
  // Claim: prevent duplicate concurrent steps (optimistic lock on step_count).
  const { data: claimed } = await admin.from("shadow_sessions")
    .update({ step_count: s.step_count + 1, last_step_at: new Date().toISOString() })
    .eq("id", sessionId).eq("step_count", s.step_count).select("id");
  if (!claimed?.length) return;

  const setS = (patch: Record<string, unknown>) => admin.from("shadow_sessions").update(patch).eq("id", sessionId);

  // 1) transcript: one Gemini call, saved immediately, then split locally into TTS chunks.
  if (!s.transcript) {
    await setS({ status: "generating_text", progress_label: "Writing your 10-minute script" });
    try {
      const text = await generateTranscript(s.topic);
      const chunks = splitTranscript(text);
      await admin.from("shadow_session_sections").delete().eq("session_id", sessionId); // scratch rows only
      await admin.from("shadow_session_sections").insert(chunks.map((t, i) => ({ session_id: sessionId, section_index: i, text: t, generation_status: "text_done" })));
      await setS({ transcript: text, error_message: null });
      console.log(JSON.stringify({ phase: "shadow_text", session: sessionId, gemini_text_calls: 1, words: text.split(/\s+/).length, chunks: chunks.length }));
    } catch (e) {
      const st = e instanceof GatewayError ? e.status : 0;
      console.log(JSON.stringify({ phase: "shadow_text_fail", session: sessionId, status: st, msg: String((e as Error).message).slice(0, 200) }));
      // No automatic Gemini retries — user taps Retry.
      await setS({ status: "partial_failure", error_message: friendlyFailure(st, "script", -1) });
      return;
    }
    return dispatch(sessionId);
  }

  const { data: sections } = await admin.from("shadow_session_sections").select("*").eq("session_id", sessionId).order("section_index");
  const secs = sections ?? [];

  // 2) audio: one TTS call per chunk; a failed chunk is retried alone.
  const needAudio = secs.find((x) => x.text && !x.audio_path);
  if (needAudio) {
    const idx = needAudio.section_index;
    await setS({ status: "generating_audio", progress_label: `Creating voice audio ${idx + 1} of ${secs.length}` });
    try {
      await ensureBucket(admin);
      const mp3 = await synthesize(needAudio.text);
      const seconds = parseMp3(mp3).seconds;
      const path = `${s.user_id}/${sessionId}/chunk-${idx}.mp3`;
      const up = await admin.storage.from(BUCKET).upload(path, mp3, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw new Error(`storage: ${up.error.message}`);
      await admin.from("shadow_session_sections").update({ audio_path: path, duration_seconds: seconds, generation_status: "audio_done", error_message: null }).eq("id", needAudio.id);
    } catch (e) {
      const st = e instanceof GatewayError ? e.status : 0;
      const retries = needAudio.retry_count + 1;
      console.log(JSON.stringify({ phase: "shadow_tts", session: sessionId, idx, status: st, msg: String((e as Error).message).slice(0, 200) }));
      await admin.from("shadow_session_sections").update({ generation_status: "failed", retry_count: retries, error_message: String((e as Error).message).slice(0, 300) }).eq("id", needAudio.id);
      const terminal = [400, 401, 402, 403].includes(st) || retries >= MAX_RETRIES;
      if (terminal) { await setS({ status: "partial_failure", error_message: friendlyFailure(st, "voice audio", idx) }); return; }
      await new Promise((r) => setTimeout(r, Math.min(45000, (st === 429 || st >= 500 ? 15000 : 2000) * retries)));
    }
    return dispatch(sessionId);
  }

  // 3) combine all chunks into one continuous mp3 and verify real duration
  await setS({ status: "assembling", progress_label: "Combining your recording" });
  try {
    const frames: Uint8Array[] = [];
    let seconds = 0;
    for (const x of secs) {
      const { data, error } = await admin.storage.from(BUCKET).download(x.audio_path);
      if (error || !data) throw new Error(`download chunk ${x.section_index + 1}`);
      const p = parseMp3(new Uint8Array(await data.arrayBuffer()));
      frames.push(...p.frames); seconds += p.seconds;
    }
    const size = frames.reduce((a, f) => a + f.length, 0);
    const out = new Uint8Array(size);
    let o = 0;
    for (const f of frames) { out.set(f, o); o += f.length; }
    const path = `${s.user_id}/${sessionId}/session.mp3`;
    const up = await admin.storage.from(BUCKET).upload(path, out, { contentType: "audio/mpeg", upsert: true });
    if (up.error) throw new Error(up.error.message);
    const verified = Math.round(seconds * 10) / 10;
    console.log(JSON.stringify({ phase: "shadow_done", session: sessionId, chunks: secs.length, tts_calls: secs.length, seconds: verified, bytes: size }));
    if (verified < MIN_SECONDS) {
      await setS({ status: "failed", audio_path: path, duration_seconds: verified, error_message: `The script came out short (${fmt(verified)}, under 10:00). Generate a new version.` });
      return;
    }
    await setS({ status: "completed", progress_label: null, audio_path: path, duration_seconds: verified, completed_at: new Date().toISOString(), error_message: null });
  } catch (e) {
    console.log(JSON.stringify({ phase: "shadow_assemble", session: sessionId, msg: String((e as Error).message) }));
    await setS({ status: "partial_failure", error_message: "Your audio chunks are safe. Tap Retry to combine them." });
  }
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

// ---------- HTTP ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    const internal = !!env("INTERNAL_DISPATCH_SECRET") && req.headers.get("x-internal-dispatch") === env("INTERNAL_DISPATCH_SECRET");
    if (action === "step") {
      if (!internal) return json({ error: "Forbidden" }, 403);
      if (typeof body.session_id !== "string") return json({ error: "Invalid" }, 400);
      await step(admin, body.session_id);
      return json({ ok: true });
    }
    // Operator-only verification hook (secret-protected): start or inspect a session for a given user.
    if (action === "internal_create" || action === "internal_status") {
      if (!internal) return json({ error: "Forbidden" }, 403);
      if (action === "internal_status") {
        const { data: s } = await admin.from("shadow_sessions").select("id,status,progress_label,duration_seconds,error_message,step_count").eq("id", body.session_id).maybeSingle();
        const { data: secs } = await admin.from("shadow_session_sections").select("section_index,generation_status,duration_seconds,text").eq("session_id", body.session_id).order("section_index");
        return json({ session: s, sections: secs });
      }
      const { data: created, error } = await admin.from("shadow_sessions").insert({
        user_id: body.user_id, topic: String(body.topic).slice(0, 300), source_type: "generated", idempotency_key: `internal-${crypto.randomUUID()}`,
        status: "queued", progress_label: "Preparing your session…", voice_provider: `lovable-ai/${TTS_MODEL}`, voice_id: VOICE, text_model: TEXT_MODEL,
      }).select("id").single();
      if (error) return json({ error: error.message }, 400);
      dispatch(created.id);
      return json({ session_id: created.id });
    }

    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await userClient.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Please sign in again." }, 401);

    if (action === "create") {
      if (!env("GEMINI_API_KEY")) return json({ error: "Voice generation isn't configured yet. Add the required backend secret GEMINI_API_KEY." }, 500);
      const topic = String(body.topic ?? "").trim().slice(0, 300);
      const key = String(body.idempotency_key ?? "").slice(0, 100);
      const source = body.source_type === "daily" ? "daily" : "generated";
      if (topic.length < 2 || key.length < 8) return json({ error: "Please enter a topic." }, 400);

      const { data: existing } = await admin.from("shadow_sessions").select("*").eq("user_id", user.id).eq("idempotency_key", key).maybeSingle();
      if (existing) return json({ session: existing, reused: true });
      const { data: active } = await admin.from("shadow_sessions").select("*").eq("user_id", user.id).in("status", ACTIVE).is("deleted_at", null).limit(1);
      if (active?.length) return json({ session: active[0], reused: true, message: "A session is already being generated." });
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await admin.from("shadow_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
      if ((count ?? 0) >= DAILY_LIMIT) return json({ error: `Daily limit of ${DAILY_LIMIT} new sessions reached. Replay a saved session instead.` }, 429);

      const { count: prior } = await admin.from("shadow_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id).ilike("topic", topic);
      const { data: created, error } = await admin.from("shadow_sessions").insert({
        user_id: user.id, topic, source_type: source, idempotency_key: key, status: "queued",
        progress_label: "Preparing your session…", voice_provider: `lovable-ai/${TTS_MODEL}`, voice_id: VOICE, text_model: TEXT_MODEL,
        generation_version: (prior ?? 0) + 1,
      }).select("*").single();
      if (error) {
        const { data: dup } = await admin.from("shadow_sessions").select("*").eq("user_id", user.id).eq("idempotency_key", key).maybeSingle();
        if (dup) return json({ session: dup, reused: true });
        return json({ error: "Couldn't start the session." }, 500);
      }
      dispatch(created.id);
      return json({ session: created });
    }

    const { data: sess } = typeof body.session_id === "string"
      ? await admin.from("shadow_sessions").select("*").eq("id", body.session_id).eq("user_id", user.id).maybeSingle()
      : { data: null };
    if (!sess) return json({ error: "Session not found" }, 404);

    if (action === "retry") {
      if (sess.status !== "partial_failure" && sess.status !== "failed") {
        // Allow resuming a stalled job (no progress for 3 minutes)
        const stalled = ACTIVE.includes(sess.status) && (!sess.last_step_at || Date.now() - new Date(sess.last_step_at).getTime() > 180_000);
        if (!stalled) return json({ session: sess });
      }
      await admin.from("shadow_session_sections").update({ retry_count: 0 }).eq("session_id", sess.id).eq("generation_status", "failed");
      await admin.from("shadow_sessions").update({ status: "queued", error_message: null, step_count: 0, progress_label: "Resuming…" }).eq("id", sess.id);
      dispatch(sess.id);
      return json({ ok: true });
    }

    if (action === "audio_url") {
      if (!sess.audio_path) return json({ error: "No audio yet" }, 400);
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(sess.audio_path, 3600, body.download ? { download: `american-shadow-${sess.id.slice(0, 8)}.${sess.audio_path.endsWith(".wav") ? "wav" : "mp3"}` } : undefined);
      if (error) return json({ error: "Couldn't load the recording." }, 500);
      return json({ url: data.signedUrl });
    }

    if (action === "delete") {
      await admin.from("shadow_sessions").update({ deleted_at: new Date().toISOString() }).eq("id", sess.id);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.log(JSON.stringify({ phase: "shadow_uncaught", msg: e instanceof Error ? e.message : "unknown" }));
    return json({ error: "Unexpected error" }, 500);
  }
});
