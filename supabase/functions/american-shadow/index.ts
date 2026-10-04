// American Shadow — 10-minute continuous shadowing sessions.
// Independent module. Text: Google Gemini direct (GEMINI_API_KEY, gemini-2.5-flash).
// Voice: Google Gemini TTS direct (gemini-2.5-flash-preview-tts, male voice), 24kHz PCM -> WAV.
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
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const VOICE = "Orus";
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
const PLANNED_SECTIONS = 8; // 7 body sections + 1 closing sized from measured audio
const WORDS_PER_SECTION = 245;
const TARGET_SECONDS = 615;
const MIN_SECONDS = 600;
const MAX_SECTIONS = 11; // hard stop against runaway generation
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

async function generateText(topic: string, index: number, total: number, previous: string, extension: boolean, words = WORDS_PER_SECTION, openings: string[] = []): Promise<string> {
  const beat = extension
    ? "This is a short final add-on after the goodbye: one last natural exchange as he heads out (e.g. a parting remark or quick text), ending cleanly. Do not restart the scene."
    : index === 0
      ? "This is the opening: jump straight into the situation (e.g. arriving, starting the conversation). No meta-introduction."
      : index === total - 1
        ? "This is the final part: naturally wrap things up and end with a real goodbye or closing line."
        : `This is part ${index + 1} of ${total}: move the situation forward with new details, new people or new subtopics. Never repeat earlier lines.`;
  const instructions = [
    "You write spoken monologue scripts for American English shadowing practice. A learner listens on earphones and speaks along about one second behind the narrator.",
    "Write ONLY the words the narrator says, in first person, as if he is actually living the situation (talking to friends, teammates, coworkers, etc.). It is a one-voice performance: he speaks his own lines and naturally reacts to what others say (\"Wait, you went to Denver? No way.\").",
    "The scene keeps moving forward in time. Never restart the scene, never re-arrive, never greet the same people again, never reintroduce people already introduced.",
    "Never lecture or explain (do NOT write 'Here are ways to...'). No stage directions, no brackets, no speaker labels, no headings, no 'pause now', no lists.",
    "Natural contemporary American English: contractions, natural transitions, follow-up questions, occasional idioms, realistic sentence lengths. Light, not excessive, slang. Avoid 'um'/'uh' and repeated greetings.",
    "For story topics, invent a complete believable everyday story (setup, people, event, reactions, details, outcome, reflection). For opinion topics, move through connected subjects: give opinions, reasons, examples, agree, partly agree, disagree politely, qualify views.",
    `Length: about ${words} words for this part. Plain text only, short paragraphs.`,
  ].join("\n");
  const input = [
    `Topic / situation: ${topic}`,
    beat,
    previous ? `The script so far ends with:\n"""${previous.slice(-3000)}"""\nContinue seamlessly from there. Do NOT repeat that last sentence — start with the very next new line.` : "",
    openings.length ? `Earlier parts began with these lines — do not repeat or echo them:\n${openings.map((o) => `- ${o}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const res = await fetch(`${GEMINI}/${TEXT_MODEL}:generateContent?key=${encodeURIComponent(env("GEMINI_API_KEY"))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: { temperature: 0.9 },
    }),
  });
  if (!res.ok) throw new GatewayError(res.status, (await res.text()).slice(0, 300));
  const data = await res.json();
  let text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
  text = text.replace(/\[[^\]]*\]|\([^)]*(pause|laugh|sigh)[^)]*\)/gi, "").replace(/\*+/g, "").trim();
  if (text.split(/\s+/).length < 60) throw new GatewayError(200, "empty_or_refused");
  return text;
}

async function synthesize(text: string): Promise<Uint8Array> {
  const res = await fetch(`${GEMINI}/${TTS_MODEL}:generateContent?key=${encodeURIComponent(env("GEMINI_API_KEY"))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${VOICE_STYLE} Read this aloud:\n\n${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
    }),
  });
  if (!res.ok) throw new GatewayError(res.status, (await res.text()).slice(0, 300));
  const data = await res.json();
  const b64 = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data)?.inlineData?.data;
  if (!b64) throw new GatewayError(200, "empty_audio");
  const bin = atob(b64);
  const pcm = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
  return pcm;
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
  if (status === 402) return "Gemini quota is used up. Your completed sections are safe — tap Retry later.";
  if (status === 403) return "The AI service declined this request. Your completed sections are safe.";
  if (status === 401) return "Voice generation isn't configured yet. Add the required backend secret GEMINI_API_KEY.";
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

  const { data: sections } = await admin.from("shadow_session_sections").select("*").eq("session_id", sessionId).order("section_index");
  const secs = sections ?? [];
  const setS = (patch: Record<string, unknown>) => admin.from("shadow_sessions").update(patch).eq("id", sessionId);
  const plannedTotal = Math.max(PLANNED_SECTIONS, secs.length);

  // 1) text
  let needText = secs.find((x) => x.generation_status === "pending" || (x.generation_status === "failed" && !x.text));
  // The closing section is sized from the real measured audio, so voice all earlier sections first.
  if (needText && needText.section_index >= PLANNED_SECTIONS - 1 && secs.some((x) => x.section_index < needText!.section_index && !x.audio_path)) needText = undefined;
  if (needText) {
    const idx = needText.section_index;
    await setS({ status: "generating_text", progress_label: `Writing section ${idx + 1} of ${plannedTotal}` });
    const prev = secs.filter((x) => x.section_index < idx && x.text).map((x) => x.text).join("\n\n");
    try {
      let words = WORDS_PER_SECTION;
      if (idx >= PLANNED_SECTIONS - 1) {
        const voiced = secs.filter((x) => x.section_index < idx && x.audio_path);
        const secsSoFar = voiced.reduce((a, x) => a + Number(x.duration_seconds ?? 0), 0);
        const wordsSoFar = voiced.reduce((a, x) => a + String(x.text ?? "").split(/\s+/).length, 0);
        const wps = secsSoFar > 0 ? wordsSoFar / secsSoFar : 3.1;
        words = Math.max(90, Math.min(450, Math.round((TARGET_SECONDS - secsSoFar) * wps)));
      }
      const openings = secs.filter((x) => x.section_index < idx && x.text).map((x) => String(x.text).split(/(?<=[.!?])\s/)[0].slice(0, 120));
      const text = await generateText(s.topic, idx, PLANNED_SECTIONS, prev, idx >= PLANNED_SECTIONS, words, openings);
      // drop any leading sentences the model echoed from the end of the previous part
      let cleaned = text;
      for (let k = 0; k < 3; k++) {
        const m = cleaned.match(/^[^.!?]*[.!?]+["'”’]?\s*/);
        if (!m || m[0].trim().length < 8 || !prev.slice(-400).includes(m[0].trim())) break;
        cleaned = cleaned.slice(m[0].length);
      }
      await admin.from("shadow_session_sections").update({ text: cleaned.trim() || text, generation_status: "text_done", error_message: null }).eq("id", needText.id);
    } catch (e) {
      const st = e instanceof GatewayError ? e.status : 0;
      const retries = needText.retry_count + 1;
      console.log(JSON.stringify({ phase: "shadow_text", session: sessionId, idx, status: st, msg: String((e as Error).message).slice(0, 200) }));
      await admin.from("shadow_session_sections").update({ generation_status: "failed", retry_count: retries, error_message: String((e as Error).message).slice(0, 300) }).eq("id", needText.id);
      const terminal = [401, 402, 403, 400].includes(st) || retries >= MAX_RETRIES;
      if (terminal) { await setS({ status: "partial_failure", error_message: friendlyFailure(st, "text", idx) }); return; }
      await new Promise((r) => setTimeout(r, Math.min(45000, (st === 429 || st >= 500 ? 15000 : 2000) * retries)));
    }
    return dispatch(sessionId);
  }

  // 2) audio
  const needAudio = secs.find((x) => x.text && (x.generation_status === "text_done" || (x.generation_status === "failed" && !x.audio_path)));
  if (needAudio) {
    const idx = needAudio.section_index;
    await setS({ status: "generating_audio", progress_label: `Creating voice audio ${idx + 1} of ${secs.length}` });
    try {
      await ensureBucket(admin);
      const pcm = await synthesize(needAudio.text);
      const seconds = pcmSeconds(pcm);
      const path = `${s.user_id}/${sessionId}/section-${idx}.wav`;
      const up = await admin.storage.from(BUCKET).upload(path, toWav(pcm), { contentType: "audio/wav", upsert: true });
      if (up.error) throw new Error(`storage: ${up.error.message}`);
      await admin.from("shadow_session_sections").update({ audio_path: path, duration_seconds: seconds, generation_status: "audio_done", error_message: null }).eq("id", needAudio.id);
    } catch (e) {
      const st = e instanceof GatewayError ? e.status : 0;
      const retries = needAudio.retry_count + 1;
      console.log(JSON.stringify({ phase: "shadow_tts", session: sessionId, idx, status: st, msg: String((e as Error).message).slice(0, 200) }));
      await admin.from("shadow_session_sections").update({ generation_status: "failed", retry_count: retries, error_message: String((e as Error).message).slice(0, 300) }).eq("id", needAudio.id);
      const terminal = [401, 402, 403, 400].includes(st) || retries >= MAX_RETRIES;
      if (terminal) { await setS({ status: "partial_failure", error_message: friendlyFailure(st, "voice audio", idx) }); return; }
      await new Promise((r) => setTimeout(r, Math.min(45000, (st === 429 || st >= 500 ? 15000 : 2000) * retries)));
    }
    return dispatch(sessionId);
  }

  // 3) duration check (sum of measured section durations) -> extend if short
  const total = secs.reduce((a, x) => a + Number(x.duration_seconds ?? 0), 0);
  await setS({ status: "verifying_duration", progress_label: "Checking audio duration" });
  if (total < MIN_SECONDS) {
    if (secs.length >= MAX_SECTIONS) {
      await setS({ status: "partial_failure", error_message: `Measured duration is ${fmt(total)}, below 10:00, and the safety limit on extra sections was reached.` });
      return;
    }
    await admin.from("shadow_session_sections").insert({ session_id: sessionId, section_index: secs.length });
    return dispatch(sessionId);
  }

  // 4) assemble into one continuous mp3
  await setS({ status: "assembling", progress_label: "Combining your recording" });
  try {
    const parts: Uint8Array[] = [];
    let seconds = 0;
    for (const x of secs) {
      const { data, error } = await admin.storage.from(BUCKET).download(x.audio_path);
      if (error || !data) throw new Error(`download section ${x.section_index + 1}`);
      const pcm = pcmOf(new Uint8Array(await data.arrayBuffer()));
      parts.push(pcm);
      seconds += pcmSeconds(pcm);
    }
    const size = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(44 + size);
    out.set(wavHeader(size));
    let o = 44;
    for (const p of parts) { out.set(p, o); o += p.length; }
    const path = `${s.user_id}/${sessionId}/session.wav`;
    const up = await admin.storage.from(BUCKET).upload(path, out, { contentType: "audio/wav", upsert: true });
    if (up.error) throw new Error(up.error.message);
    const verified = pcmSeconds(out.subarray(44));
    await setS({
      status: "completed", progress_label: null, audio_path: path, duration_seconds: Math.round(verified * 10) / 10,
      transcript: secs.map((x) => x.text).join("\n\n"), completed_at: new Date().toISOString(), error_message: null,
    });
    console.log(JSON.stringify({ phase: "shadow_done", session: sessionId, sections: secs.length, seconds: verified, bytes: size, words: secs.map((x) => x.text).join(" ").split(/\s+/).length }));
  } catch (e) {
    console.log(JSON.stringify({ phase: "shadow_assemble", session: sessionId, msg: String((e as Error).message) }));
    await setS({ status: "partial_failure", error_message: "Your generated sections are safe. Retry audio assembly." });
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
        status: "queued", progress_label: "Preparing your session…", voice_provider: `google-gemini/${TTS_MODEL}`, voice_id: VOICE, text_model: TEXT_MODEL,
      }).select("id").single();
      if (error) return json({ error: error.message }, 400);
      await admin.from("shadow_session_sections").insert(Array.from({ length: PLANNED_SECTIONS }, (_, i) => ({ session_id: created.id, section_index: i })));
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
        progress_label: "Preparing your session…", voice_provider: `google-gemini/${TTS_MODEL}`, voice_id: VOICE, text_model: TEXT_MODEL,
        generation_version: (prior ?? 0) + 1,
      }).select("*").single();
      if (error) {
        const { data: dup } = await admin.from("shadow_sessions").select("*").eq("user_id", user.id).eq("idempotency_key", key).maybeSingle();
        if (dup) return json({ session: dup, reused: true });
        return json({ error: "Couldn't start the session." }, 500);
      }
      await admin.from("shadow_session_sections").insert(Array.from({ length: PLANNED_SECTIONS }, (_, i) => ({ session_id: created.id, section_index: i })));
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
