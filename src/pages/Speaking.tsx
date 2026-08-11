import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ALL_MODES, MODE_DESCRIPTIONS, pickScenarioForMode, todaysMode, todaysWarmups,
  type SpeakingFeedback, type SpeakingMode, type Scenario,
} from "@/lib/speaking/content";
import { classifyGate, gateLabel, type GateStatus } from "@/lib/speaking/gate";
import QuickDrills from "@/components/speaking/QuickDrills";
import { Mic, MicOff, Sparkles, Flame, CheckCircle2, AlertTriangle, ArrowLeft, Trophy, Target, RefreshCw, Play, SkipForward, SkipBack, Repeat } from "lucide-react";


const BASELINE_TARGET = "Speak clearly with structure and finish with one strong closing line.";

type UserState = {
  user_id: string;
  preferred_mode: SpeakingMode | null;
  current_streak: number;
  longest_streak: number;
  missed_count: number;
  last_completed_date: string | null;
  paused: boolean;
  next_improvement_target: string | null;
  last_main_weakness: string | null;
  speaking_gate_started_at: string | null;
};

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Streak deadline logic (local time):
 *   - completed today       → safe; must complete again before end of tomorrow.
 *   - completed yesterday   → at risk; must complete before end of today.
 *   - completed 2+ days ago → streak already broken.
 *   - never completed       → no active streak.
 */
type StreakInfo = {
  state: "safe" | "at_risk" | "broken" | "none";
  deadline: Date | null;
  msLeft: number;
};
function computeStreakInfo(lastCompletedDate: string | null, now = new Date()): StreakInfo {
  if (!lastCompletedDate) return { state: "none", deadline: null, msLeft: 0 };
  const last = lastCompletedDate.slice(0, 10);
  const today = localDateStr(now);
  const yesterday = localDateStr(new Date(now.getTime() - 86400000));
  if (last === today) {
    const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(23, 59, 59, 999);
    return { state: "safe", deadline: d, msLeft: d.getTime() - now.getTime() };
  }
  if (last === yesterday) {
    const d = new Date(now); d.setHours(23, 59, 59, 999);
    return { state: "at_risk", deadline: d, msLeft: d.getTime() - now.getTime() };
  }
  return { state: "broken", deadline: null, msLeft: 0 };
}
function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}


type SpeechRecResult = { transcript: string };
type SpeechRecAlt = { 0: SpeechRecResult; isFinal: boolean; length: number };
type SpeechRecEvent = { resultIndex: number; results: ArrayLike<SpeechRecAlt> };
type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechRecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ScoreBar = ({ label, value }: { label: string; value: number }) => {
  const v = Math.max(0, Math.min(10, Number(value) || 0));
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span><span className="font-semibold text-foreground">{v.toFixed(1)} / 10</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${(v / 10) * 100}%` }} />
      </div>
    </div>
  );
};

const StreakDeadlineCard = ({
  lastCompletedDate, currentStreak,
}: { lastCompletedDate: string | null; currentStreak: number }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const info = computeStreakInfo(lastCompletedDate, now);
  if (info.state === "none") {
    return (
      <div className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
        <Flame className="w-4 h-4" />
        Complete your first session to start a streak. You'll then need one session every day to keep it alive.
      </div>
    );
  }
  const deadlineStr = info.deadline
    ? info.deadline.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "";
  const left = formatCountdown(info.msLeft);
  if (info.state === "safe") {
    const urgent = info.msLeft < 12 * 3600 * 1000;
    const tone = urgent
      ? "bg-amber-50 border-amber-300 text-amber-900"
      : "bg-emerald-50 border-emerald-300 text-emerald-900";
    return (
      <div className={`mb-4 rounded-md border px-3 py-2 text-sm flex items-center gap-2 ${tone}`}>
        <CheckCircle2 className="w-4 h-4" />
        <span>
          <strong>Streak safe ({currentStreak} day{currentStreak === 1 ? "" : "s"}).</strong>{" "}
          Next session due by <strong>{deadlineStr}</strong> — <strong>{left}</strong> left.
        </span>
      </div>
    );
  }
  if (info.state === "at_risk") {
    const critical = info.msLeft < 3 * 3600 * 1000;
    const tone = critical
      ? "bg-red-50 border-red-300 text-red-900"
      : "bg-amber-50 border-amber-300 text-amber-900";
    return (
      <div className={`mb-4 rounded-md border px-3 py-2 text-sm flex items-center gap-2 ${tone}`}>
        <AlertTriangle className="w-4 h-4" />
        <span>
          <strong>Streak breaking soon!</strong> Complete today's session before <strong>{deadlineStr}</strong> — only <strong>{left}</strong> left to save your {currentStreak}-day streak.
        </span>
      </div>
    );
  }
  // broken
  return (
    <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4" />
      <span>
        <strong>Streak reset.</strong> Your previous streak lapsed. Finish a session today to start a new one.
      </span>
    </div>
  );
};



type RoundKey = "opening" | "pressure" | "close";

const RoundRecorder = ({
  label, prompt, value, onChange, sttSupported, audioUrl, onAudioBlob,
}: {
  label: string; prompt: string; value: string; onChange: (v: string) => void;
  sttSupported: boolean;
  audioUrl: string | null;
  onAudioBlob: (blob: Blob | null) => void;
}) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const finalRef = useRef("");
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopMic = () => {
    try { mediaRecRef.current?.state === "recording" && mediaRecRef.current.stop(); } catch { /* ignore */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    mediaRecRef.current = null;
    streamRef.current = null;
  };

  const start = async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    // Kick off MediaRecorder in parallel so we can play back the user's own voice.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)
      );
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          onAudioBlob(blob);
        }
      };
      mr.start();
      mediaRecRef.current = mr;
    } catch {
      // Mic capture failed — STT can still run if browser has its own path.
    }

    const rec = new Ctor();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    finalRef.current = value ? value + " " : "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i] as SpeechRecAlt;
        const txt = r[0].transcript;
        if (r.isFinal) finalRef.current += txt + " ";
        else interim += txt;
      }
      onChange((finalRef.current + interim).trimStart());
    };
    rec.onerror = () => { setListening(false); stopMic(); };
    rec.onend = () => { setListening(false); stopMic(); };
    try { rec.start(); recRef.current = rec; setListening(true); }
    catch { stopMic(); }
  };
  const stop = () => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    stopMic();
    setListening(false);
  };

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-sm mb-2">{prompt}</div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {!listening ? (
          <Button type="button" onClick={start} variant="outline" size="sm" disabled={!sttSupported} className="gap-2">
            <Mic className="w-4 h-4" /> {sttSupported ? "Record" : "Speech not supported"}
          </Button>
        ) : (
          <Button type="button" onClick={stop} variant="destructive" size="sm" className="gap-2">
            <MicOff className="w-4 h-4" /> Stop
          </Button>
        )}
        {listening && <span className="text-xs text-red-500 animate-pulse">● Listening…</span>}
        <span className="text-xs text-muted-foreground ml-auto">{value.trim().length} chars</span>
      </div>
      <Textarea
        value={value}
        readOnly
        onChange={() => { /* record-only: typing is disabled */ }}
        rows={4}
        placeholder="Press Record and speak. Your transcript will appear here — typing is disabled on purpose."
        className="bg-muted/40 cursor-default"
      />
      {audioUrl && (
        <div className="mt-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">🎙️ Your recording</div>
          <audio controls src={audioUrl} className="w-full h-9" />
        </div>
      )}
    </div>
  );
};

// Lazy on-demand TTS player: fetches audio only when user clicks Play, caches per-text.
const CoachAudioButton = ({ label, text, voice, instructions }: {
  label: string; text: string; voice: string; instructions?: string;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const load = async () => {
    if (url || loading) return;
    setLoading(true); setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${(import.meta.env.VITE_SUPABASE_URL as string)}/functions/v1/speaking-tts`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, voice, instructions }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: "TTS failed" }));
        throw new Error(msg.error || "TTS failed");
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setUrl(objUrl);
      // autoplay after load
      setTimeout(() => audioRef.current?.play().catch(() => {}), 50);
    } catch (e) {
      const m = e instanceof Error ? e.message : "TTS failed";
      setError(m);
      toast({ title: "Couldn't play audio", description: m, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-md border border-border/50 bg-muted/30 p-2">
      <div className="flex items-center gap-2 mb-1">
        <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1 h-7 px-2 text-xs">
          {loading ? "Generating…" : url ? "🔁 Replay" : "▶️ Listen"}
        </Button>
        <span className="text-xs font-semibold">{label}</span>
      </div>
      {url && <audio ref={audioRef} controls src={url} className="w-full h-8" />}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
};

const ScenarioBriefing = ({ s }: { s: Scenario }) => {
  const row = (k: string, v: string) => (
    <div className="flex gap-2 text-sm py-1"><span className="w-40 shrink-0 text-muted-foreground">{k}</span><span className="flex-1">{v}</span></div>
  );
  return (
    <div className="space-y-0.5">
      {row("Scene", s.scene)}
      {row("Your role", s.your_role)}
      {row("Audience", s.audience)}
      {row("Audience mindset", s.audience_mindset)}
      {row("What just happened", s.what_just_happened)}
      {row("Pressure", s.pressure)}
      {row("Objection / question", s.objection_or_question)}
      {row("Your goal", s.your_goal)}
      {row("Structure", s.speaking_structure)}
      {row("Your task", s.your_task)}
      {row("Success criteria", s.success_criteria)}
    </div>
  );
};

// ============================================================
// Shadow Practice — AI reads one sentence at a time; you repeat it.
// ============================================================

type ShadowVoice = { id: string; label: string; voice: string; instructions: string };
const SHADOW_VOICES: ShadowVoice[] = [
  { id: "natural", label: "Natural Professional", voice: "sage",
    instructions: "Speak like a sharp, warm professional in a real conversation. Confident, easy pace, natural pauses." },
  { id: "executive", label: "Executive Leader", voice: "onyx",
    instructions: "Speak like a Fortune 500 executive. Concise, decisive, high-status. Deliberate pauses. End with impact." },
  { id: "charismatic", label: "Charismatic Speaker", voice: "verse",
    instructions: "Speak like a charismatic TED speaker. Vivid, warm, memorable. Vary tone and pace for emotional impact." },
];

function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  // Split on sentence-ending punctuation but keep it attached.
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function normalizeForCompare(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
}

// Longest common subsequence length between two word arrays.
function lcsLen(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similarityScore(target: string, said: string): number {
  const a = normalizeForCompare(target);
  const b = normalizeForCompare(said);
  if (a.length === 0) return 0;
  const lcs = lcsLen(a, b);
  return lcs / a.length; // 0..1, order-aware
}

const ShadowPractice = ({ defaultText }: { defaultText: string }) => {
  const { toast } = useToast();
  const [rawText, setRawText] = useState(defaultText);
  const [sentences, setSentences] = useState<string[]>([]);
  const [voiceId, setVoiceId] = useState<string>("natural");
  const [idx, setIdx] = useState(0);
  const [audioCache, setAudioCache] = useState<Record<string, string>>({});
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [said, setSaid] = useState("");
  const [listening, setListening] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const [scoresByIdx, setScoresByIdx] = useState<Record<number, number>>({});
  const sttOk = getSpeechRecognitionCtor() !== null;

  useEffect(() => { setRawText(defaultText); }, [defaultText]);

  const start = () => {
    const s = splitSentences(rawText);
    if (s.length === 0) {
      toast({ title: "Add some text first", description: "Paste or type at least one sentence to shadow." });
      return;
    }
    setSentences(s);
    setIdx(0);
    setSaid("");
    setScoresByIdx({});
  };

  const cacheKey = (sentence: string, voice: string) => `${voice}::${sentence}`;

  const playCurrent = async () => {
    const sentence = sentences[idx];
    if (!sentence) return;
    const v = SHADOW_VOICES.find((x) => x.id === voiceId) ?? SHADOW_VOICES[0];
    const key = cacheKey(sentence, v.id);
    let url = audioCache[key];
    if (!url) {
      setLoadingAudio(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Not signed in");
        const endpoint = `${(import.meta.env.VITE_SUPABASE_URL as string)}/functions/v1/speaking-tts`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: sentence, voice: v.voice, instructions: v.instructions }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: "TTS failed" }));
          throw new Error(j.error || "TTS failed");
        }
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        setAudioCache((prev) => ({ ...prev, [key]: url! }));
      } catch (e) {
        toast({ title: "Couldn't play sentence", description: e instanceof Error ? e.message : "TTS failed", variant: "destructive" });
        setLoadingAudio(false);
        return;
      }
      setLoadingAudio(false);
    }
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play().catch(() => {});
    }
  };

  const startListening = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    setSaid("");
    const rec = new Ctor();
    rec.lang = "en-US"; rec.continuous = false; rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i] as SpeechRecAlt;
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setSaid((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      // Score against current sentence.
      const t = sentences[idx];
      if (t) {
        const score = similarityScore(t, (finalText || said).trim());
        setScoresByIdx((prev) => ({ ...prev, [idx]: score }));
      }
    };
    try { rec.start(); recRef.current = rec; setListening(true); }
    catch { setListening(false); }
  };
  const stopListening = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); };

  const next = () => { if (idx < sentences.length - 1) { setIdx(idx + 1); setSaid(""); } };
  const prev = () => { if (idx > 0) { setIdx(idx - 1); setSaid(""); } };
  const retry = () => { setSaid(""); setScoresByIdx((p) => { const c = { ...p }; delete c[idx]; return c; }); };

  useEffect(() => () => {
    Object.values(audioCache).forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentScore = scoresByIdx[idx];
  const verdict = currentScore == null ? null
    : currentScore >= 0.85 ? { text: "Nailed it", tone: "text-emerald-600", emoji: "✅" }
    : currentScore >= 0.6  ? { text: "Close — try again for a cleaner take", tone: "text-amber-600", emoji: "⚠️" }
    :                        { text: "Off — replay and try once more", tone: "text-red-600", emoji: "🔁" };
  const completedCount = Object.values(scoresByIdx).filter((s) => s >= 0.6).length;

  return (
    <Card className="glass-card mb-4 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">🎤 Shadow Practice — repeat after the coach</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sentences.length === 0 ? (
          <>
            <p className="text-xs text-muted-foreground">
              Paste any text (a rewrite from above, a pitch, an intro). The coach reads one sentence at a time — you repeat it, then move on.
            </p>
            <Textarea rows={4} value={rawText} onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste the sentence(s) you want to practice out loud…" />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger className="w-56 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHADOW_VOICES.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={start} className="gap-1"><Play className="w-4 h-4" /> Start shadow practice</Button>
              {!sttOk && <span className="text-xs text-amber-600">Speech recognition unsupported here — playback still works.</span>}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Sentence <strong>{idx + 1}</strong> / {sentences.length} · Style: <strong>{SHADOW_VOICES.find((v) => v.id === voiceId)?.label}</strong></span>
              <span>Cleared: {completedCount}/{sentences.length}</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${((idx + (currentScore != null ? 1 : 0)) / sentences.length) * 100}%` }} />
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Coach says</div>
              <p className="text-base leading-relaxed">{sentences[idx]}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={playCurrent} disabled={loadingAudio} className="gap-1">
                  <Play className="w-4 h-4" /> {loadingAudio ? "Generating…" : "▶️ Play"}
                </Button>
                {!listening ? (
                  <Button size="sm" onClick={startListening} disabled={!sttOk} className="gap-1">
                    <Mic className="w-4 h-4" /> Repeat now
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={stopListening} className="gap-1">
                    <MicOff className="w-4 h-4" /> Stop
                  </Button>
                )}
                {listening && <span className="text-xs text-red-500 animate-pulse">● Listening…</span>}
              </div>
              <audio ref={audioRef} className="hidden" />
            </div>

            {said && (
              <div className="rounded-md border border-border/60 p-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">You said</div>
                <p className="text-sm">{said}</p>
                {verdict && (
                  <p className={`text-sm mt-2 font-medium ${verdict.tone}`}>
                    {verdict.emoji} {verdict.text} · match {(currentScore! * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={prev} disabled={idx === 0} className="gap-1">
                <SkipBack className="w-4 h-4" /> Prev
              </Button>
              <Button size="sm" variant="ghost" onClick={retry} className="gap-1">
                <Repeat className="w-4 h-4" /> Retry
              </Button>
              <Button size="sm" onClick={next} disabled={idx >= sentences.length - 1} className="gap-1">
                Next <SkipForward className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setSentences([]); setSaid(""); setScoresByIdx({}); }} className="ml-auto">
                Change text
              </Button>
            </div>

            {idx === sentences.length - 1 && currentScore != null && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
                🎯 Shadow practice done — {completedCount}/{sentences.length} sentences cleared. Run it again with a different style to lock it in.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};



const Speaking = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<UserState | null>(null);

  const defaultMode = useMemo(() => todaysMode(), []);
  const [mode, setMode] = useState<SpeakingMode>(defaultMode);
  const [scenario, setScenario] = useState<Scenario>(() => pickScenarioForMode(defaultMode));
  const warmups = useMemo(() => todaysWarmups(), []);

  const [rounds, setRounds] = useState<Record<RoundKey, string>>({ opening: "", pressure: "", close: "" });
  const [roundAudioUrls, setRoundAudioUrls] = useState<Record<RoundKey, string | null>>({ opening: null, pressure: null, close: null });
  const setRoundBlob = (k: RoundKey) => (blob: Blob | null) => {
    setRoundAudioUrls((prev) => {
      if (prev[k]) URL.revokeObjectURL(prev[k] as string);
      return { ...prev, [k]: blob ? URL.createObjectURL(blob) : null };
    });
  };
  useEffect(() => () => {
    // Revoke any object URLs on unmount to avoid leaks.
    Object.values(roundAudioUrls).forEach((u) => { if (u) URL.revokeObjectURL(u); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [requestingFeedback, setRequestingFeedback] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completedToday, setCompletedToday] = useState(false);
  const [sttSupported, setSttSupported] = useState(true);
  const [generatingScenario, setGeneratingScenario] = useState(false);

  const todaysTarget = state?.next_improvement_target || BASELINE_TARGET;

  // Fetch a fresh Gemini-generated scenario for the mode, avoiding recently-seen titles/ids.
  // Falls back to the built-in picker on any failure so the page never gets stuck.
  const loadFreshScenario = async (m: SpeakingMode, uid: string | null) => {
    setGeneratingScenario(true);
    try {
      let recentTitles: string[] = [];
      let recentIds: string[] = [];
      if (uid) {
        const { data: recents } = await supabase
          .from("speaking_sessions")
          .select("scenario_title, scenario_prompt, mode, completed_at")
          .eq("user_id", uid)
          .order("completed_at", { ascending: false })
          .limit(20);
        if (Array.isArray(recents)) {
          recentTitles = recents.map((r) => r.scenario_title).filter(Boolean) as string[];
        }
      }
      const { data, error } = await supabase.functions.invoke("generate-speaking-scenario", {
        body: { mode: m, recentTitles, recentIds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const s = data?.scenario as Scenario | undefined;
      if (!s || !s.title || !s.your_task) throw new Error("Invalid scenario payload");
      setScenario(s);
    } catch (e) {
      // Silent fallback to a built-in scenario so the page always works.
      setScenario(pickScenarioForMode(m));
      console.warn("[speaking] scenario generation failed, using built-in:", e);
    } finally {
      setGeneratingScenario(false);
    }
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data: sessionRes } = await supabase.auth.getSession();
      if (!sessionRes.session) {
        navigate("/auth?post_login_redirect=/speaking-gym");
        return;
      }
      const uid = sessionRes.session.user.id;
      setUserId(uid);

      // Load or create state. Opening the page also activates the gate (safe activation).
      const nowIso = new Date().toISOString();
      const { data: st } = await supabase
        .from("speaking_user_state").select("*").eq("user_id", uid).maybeSingle();
      let current: UserState;
      if (!st) {
        const { data: inserted } = await supabase
          .from("speaking_user_state")
          .insert({ user_id: uid, speaking_gate_started_at: nowIso })
          .select().single();
        current = inserted as UserState;
      } else {
        current = st as UserState;
        if (!current.speaking_gate_started_at) {
          const { data: upd } = await supabase
            .from("speaking_user_state")
            .update({ speaking_gate_started_at: nowIso })
            .eq("user_id", uid).select().single();
          if (upd) current = upd as UserState;
        }
      }
      setState(current);
      const activeMode: SpeakingMode =
        current.preferred_mode && ALL_MODES.includes(current.preferred_mode)
          ? current.preferred_mode
          : defaultMode;
      if (activeMode !== mode) setMode(activeMode);

      const today = localDateStr();
      const { data: sess } = await supabase
        .from("speaking_sessions")
        .select("id, mode, scenario_title, rounds, feedback")
        .eq("user_id", uid).eq("session_date", today)
        .order("completed_at", { ascending: false }).limit(1).maybeSingle();
      if (sess) {
        setCompletedToday(true);
        if (sess.feedback) setFeedback(sess.feedback as SpeakingFeedback);
        if (sess.rounds && typeof sess.rounds === "object") {
          const r = sess.rounds as Partial<Record<RoundKey, string>>;
          setRounds({ opening: r.opening ?? "", pressure: r.pressure ?? "", close: r.close ?? "" });
        }
        // Keep the built-in placeholder scenario for an already-completed day — do not spend a Gemini call.
        setScenario(pickScenarioForMode(activeMode));
      } else {
        // Fresh day: auto-generate a new scenario every visit.
        await loadFreshScenario(activeMode, uid);
      }

      setSttSupported(getSpeechRecognitionCtor() !== null);
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!sess) navigate("/auth");
    });
    unsub = () => listener.subscription.unsubscribe();
    return () => unsub?.();
  }, [navigate]);

  const handleSelectMode = async (m: SpeakingMode) => {
    setMode(m);
    setFeedback(null);
    setRounds({ opening: "", pressure: "", close: "" });
    if (userId) await supabase.from("speaking_user_state").update({ preferred_mode: m }).eq("user_id", userId);
    if (!completedToday) {
      await loadFreshScenario(m, userId);
    } else {
      setScenario(pickScenarioForMode(m));
    }
  };

  const fullTranscript = useMemo(() => {
    return [
      `[ROUND 1 — Opening: ${scenario.your_task}]`,
      rounds.opening.trim(),
      "",
      `[ROUND 2 — Pressure: ${scenario.objection_or_question}]`,
      rounds.pressure.trim(),
      "",
      `[ROUND 3 — Close]`,
      rounds.close.trim(),
    ].join("\n");
  }, [rounds, scenario]);

  const allRoundsReady = rounds.opening.trim().length >= 40 &&
                        rounds.pressure.trim().length >= 40 &&
                        rounds.close.trim().length >= 40;

  const requestFeedback = async () => {
    if (!allRoundsReady) {
      toast({ title: "Each round needs more content", description: "Aim for at least 40 characters per round.", variant: "destructive" });
      return;
    }
    setRequestingFeedback(true);
    setFeedback(null);
    try {
      const scenarioContext = [
        `Scene: ${scenario.scene}`,
        `Role: ${scenario.your_role}`,
        `Audience: ${scenario.audience} (${scenario.audience_mindset})`,
        `What happened: ${scenario.what_just_happened}`,
        `Pressure: ${scenario.pressure}`,
        `Objection: ${scenario.objection_or_question}`,
        `Goal: ${scenario.your_goal}`,
        `Structure: ${scenario.speaking_structure}`,
        `Task: ${scenario.your_task}`,
        `Success criteria: ${scenario.success_criteria}`,
      ].join("\n");
      const { data, error } = await supabase.functions.invoke("speaking-feedback", {
        body: {
          mode,
          scenarioTitle: scenario.title,
          scenarioContext,
          improvementTarget: todaysTarget,
          rounds: {
            opening: rounds.opening.trim(),
            pressure: rounds.pressure.trim(),
            close: rounds.close.trim(),
          },
          transcript: fullTranscript,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFeedback(data.feedback as SpeakingFeedback);
    } catch (e) {
      toast({ title: "Coaching unavailable", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setRequestingFeedback(false);
    }
  };

  const avgScore = useMemo(() => {
    const s = feedback?.scores;
    if (!s) return 0;
    const vals = [s.clarity, s.confidence, s.persuasion, s.structure, s.executive_presence]
      .map((n) => (typeof n === "number" ? n : 0));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [feedback]);

  // Habit-based eligibility: completing all rounds + getting AI feedback = session counts.
  // Score is coaching only, it does not decide whether the habit was done.
  const eligible = !!feedback && feedback.meaningful_attempt !== false;


  const completeSession = async () => {
    if (!userId || !eligible || !feedback) return;
    setCompleting(true);
    try {
      const today = localDateStr();
      const { error: insErr } = await supabase.from("speaking_sessions").insert({
        user_id: userId,
        session_date: today,
        mode,
        scenario_title: scenario.title,
        scenario_prompt: scenario.your_task,
        transcript: fullTranscript,
        feedback,
        rounds,
        improvement_target: todaysTarget,
        improvement_target_met: feedback.improvement_target_met ?? null,
        main_weakness: feedback.main_weakness ?? null,
        is_recovery: false,
      });
      if (insErr) throw insErr;

      const cur = state;
      const lastDone = cur?.last_completed_date ? cur.last_completed_date.slice(0, 10) : null;
      const yesterday = localDateStr(new Date(Date.now() - 86400000));
      let newStreak = 1;
      if (lastDone === yesterday) newStreak = (cur?.current_streak ?? 0) + 1;
      else if (lastDone === today) newStreak = cur?.current_streak ?? 1;
      const longest = Math.max(cur?.longest_streak ?? 0, newStreak);


      const { data: updated } = await supabase
        .from("speaking_user_state")
        .update({
          current_streak: newStreak,
          longest_streak: longest,
          missed_count: 0,
          paused: false,
          last_completed_date: today,
          next_improvement_target: feedback.tomorrows_drill || BASELINE_TARGET,
          last_main_weakness: feedback.main_weakness ?? null,
        })
        .eq("user_id", userId).select().single();
      if (updated) setState(updated as UserState);
      setCompletedToday(true);
      toast({ title: "Session marked complete", description: `Streak: ${newStreak} day${newStreak === 1 ? "" : "s"}.` });
    } catch (e) {
      toast({ title: "Could not save session", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[image:var(--gradient-hero)]">
        <p className="text-muted-foreground">Loading your speaking gym…</p>
      </div>
    );
  }

  const gateStatus: GateStatus = classifyGate({
    gateStartedAt: state?.speaking_gate_started_at ?? null,
    lastCompletedDate: state?.last_completed_date ?? null,
  });
  const gateInfo = gateLabel(gateStatus);
  const gateToneClass =
    gateInfo.tone === "green" ? "bg-emerald-50 border-emerald-300 text-emerald-900" :
    gateInfo.tone === "amber" ? "bg-amber-50 border-amber-300 text-amber-900" :
    gateInfo.tone === "red"   ? "bg-red-50 border-red-300 text-red-900" :
                                "bg-muted border-border text-muted-foreground";

  return (
    <div className="min-h-screen bg-[image:var(--gradient-hero)] pb-20">
      <header className="glass-card sticky top-0 z-10 border-b border-border/30">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Influence Speaking Gym</div>
              <div className="text-lg font-semibold">Daily 10-minute session</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="font-semibold">{state?.current_streak ?? 0}</span>
              <span className="text-muted-foreground">streak</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span className="font-semibold">{state?.longest_streak ?? 0}</span>
              <span className="text-muted-foreground">best</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Email gate status pill */}
        <div className={`border rounded-md px-3 py-2 text-sm mb-4 ${gateToneClass}`}>
          {gateInfo.text}
        </div>

        {/* Streak deadline indicator */}
        <StreakDeadlineCard lastCompletedDate={state?.last_completed_date ?? null} currentStreak={state?.current_streak ?? 0} />

        {/* Today's improvement target */}
        <Card className="glass-card mb-4 border-primary/30">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Today's improvement target</div>
                <div className="text-base font-semibold mt-1">{todaysTarget}</div>
                {!state?.last_completed_date && (
                  <div className="text-xs text-muted-foreground mt-1">This is your baseline. Future sessions will compare against this.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mode selector */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3"><CardTitle className="text-base">Speaking mode</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={mode} onValueChange={(v) => handleSelectMode(v as SpeakingMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_MODES.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{MODE_DESCRIPTIONS[mode]}</p>
          </CardContent>
        </Card>

        {/* Warm-up */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3"><CardTitle className="text-base">Step 1 — Warm-up (speak aloud)</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {warmups.map((w, i) => (<li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{w}</span></li>))}
            </ul>
          </CardContent>
        </Card>

        {/* Deep scenario briefing */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              Step 2 — Scenario: {generatingScenario ? "Generating a fresh scenario…" : scenario.title}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setFeedback(null);
                setRounds({ opening: "", pressure: "", close: "" });
                loadFreshScenario(mode, userId);
              }}
              disabled={generatingScenario}
              title="Generate a new scenario"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${generatingScenario ? "animate-spin" : ""}`} />
              New scenario
            </Button>
          </CardHeader>
          <CardContent>
            {generatingScenario ? (
              <p className="text-sm text-muted-foreground">Creating a fresh, high-pressure scenario for "{mode}"…</p>
            ) : (
              <ScenarioBriefing s={scenario} />
            )}
          </CardContent>
        </Card>


        {/* 3 rounds */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3"><CardTitle className="text-base">Step 3 — Speak the 3 rounds</CardTitle></CardHeader>
          <CardContent>
            <RoundRecorder
              label="Round 1 — Opening"
              prompt={scenario.your_task}
              value={rounds.opening}
              onChange={(v) => setRounds((r) => ({ ...r, opening: v }))}
              sttSupported={sttSupported}
              audioUrl={roundAudioUrls.opening}
              onAudioBlob={setRoundBlob("opening")}
            />
            <RoundRecorder
              label="Round 2 — Pressure / objection"
              prompt={scenario.round2_pressure_prompt}
              value={rounds.pressure}
              onChange={(v) => setRounds((r) => ({ ...r, pressure: v }))}
              sttSupported={sttSupported}
              audioUrl={roundAudioUrls.pressure}
              onAudioBlob={setRoundBlob("pressure")}
            />
            <RoundRecorder
              label="Round 3 — Close / land the message"
              prompt={scenario.round3_close_prompt}
              value={rounds.close}
              onChange={(v) => setRounds((r) => ({ ...r, close: v }))}
              sttSupported={sttSupported}
              audioUrl={roundAudioUrls.close}
              onAudioBlob={setRoundBlob("close")}
            />

            <Button onClick={requestFeedback} disabled={!allRoundsReady || requestingFeedback} className="gap-2 mt-2">
              <Sparkles className="w-4 h-4" />
              {requestingFeedback ? "Coaching…" : "Get speaking feedback"}
            </Button>
            {!allRoundsReady && (
              <p className="text-xs text-muted-foreground mt-2">Each round needs at least 40 characters of meaningful speech.</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Drills — offline micro-practice */}
        <QuickDrills />

        {/* Shadow Practice — Phase 2 */}

        <ShadowPractice
          defaultText={
            feedback?.powerful ||
            feedback?.natural ||
            feedback?.role_style ||
            scenario.strong_example_round_1 ||
            scenario.round_1_prompt ||
            scenario.your_task ||
            ""
          }
        />



        {/* Feedback */}
        {feedback && (
          <>
            <Card className={`glass-card mb-4 border ${eligible ? "border-emerald-300" : "border-amber-300"}`}>
              <CardContent className="pt-5 pb-5 flex items-start gap-3">
                {eligible ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
                <div>
                  <div className="font-semibold">
                    {eligible ? "Session completed — habit counted" : "Session not counted — needs a real attempt on each round"}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Target: <strong>{todaysTarget}</strong> · Coaching verdict: <strong>{feedback.improvement_target_met}</strong> · Avg score: <strong>{avgScore.toFixed(1)}/10</strong>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Score is feedback only — it does not decide whether today counts.
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card mb-4 border-border/40">
              <CardHeader className="pb-3"><CardTitle className="text-base">Compared with your previous session</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                {state?.last_completed_date ? (
                  <>
                    <div><span className="text-muted-foreground">Previous main weakness:</span> {state?.last_main_weakness || "—"}</div>
                    <div><span className="text-muted-foreground">Today's improvement target:</span> {todaysTarget}</div>
                    <div><span className="text-muted-foreground">Target met:</span> {feedback.improvement_target_met}</div>
                    <div><span className="text-muted-foreground">Today's strongest improvement:</span> {feedback.did_well?.[0] || "—"}</div>
                    <div><span className="text-muted-foreground">One thing to fix tomorrow:</span> {feedback.tomorrows_drill || "—"}</div>
                  </>
                ) : (
                  <p className="text-muted-foreground">This is your baseline session. Future sessions will compare against this.</p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card mb-4 border-border/40">
              <CardHeader className="pb-3"><CardTitle className="text-base">Scores</CardTitle></CardHeader>
              <CardContent>
                <ScoreBar label="Clarity" value={feedback.scores?.clarity} />
                <ScoreBar label="Confidence" value={feedback.scores?.confidence} />
                <ScoreBar label="Persuasion" value={feedback.scores?.persuasion} />
                <ScoreBar label="Structure" value={feedback.scores?.structure} />
                <ScoreBar label="Executive presence" value={feedback.scores?.executive_presence} />
              </CardContent>
            </Card>

            <Card className="glass-card mb-4 border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">🎧 Stronger versions — listen &amp; compare</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-4">
                <p className="text-xs text-muted-foreground">
                  Play your own recordings above, then tap ▶️ Listen on each rewrite to hear how a confident coach would say it.
                </p>
                {[
                  { key: "corrected", label: "Corrected (your voice, cleaned)", text: feedback.corrected, voice: "alloy", instructions: "Speak clearly and naturally, matching a confident professional. Neutral tone." },
                  { key: "natural", label: "Natural Professional", text: feedback.natural, voice: "sage", instructions: "Speak like a sharp, warm professional in a real conversation. Confident, easy pace, natural pauses." },
                  { key: "powerful", label: "Executive Leader", text: feedback.powerful, voice: "onyx", instructions: "Speak like a Fortune 500 executive. Concise, decisive, high-status. Deliberate pauses. End with impact." },
                  { key: "role_style", label: `Charismatic (${mode})`, text: feedback.role_style, voice: "verse", instructions: "Speak like a charismatic TED speaker tuned to the mode. Vivid, warm, memorable. Vary tone and pace for emotional impact." },
                ].map((r) => r.text ? (
                  <div key={r.key} className="space-y-1">
                    <div className="text-xs uppercase text-muted-foreground">{r.label}</div>
                    <p className="mb-1">{r.text}</p>
                    <CoachAudioButton label="Coach audio" text={r.text} voice={r.voice} instructions={r.instructions} />
                  </div>
                ) : null)}
              </CardContent>
            </Card>

            {(feedback.pace_verdict || feedback.pause_verdict || typeof feedback.filler_count === "number" || feedback.power_habit) && (
              <Card className="glass-card mb-4 border-border/40">
                <CardHeader className="pb-3"><CardTitle className="text-base">🎯 Delivery &amp; presence</CardTitle></CardHeader>
                <CardContent className="text-sm grid gap-2 sm:grid-cols-2">
                  {feedback.pace_verdict && (
                    <div><span className="text-muted-foreground">Pace:</span> <strong>{feedback.pace_verdict}</strong>{feedback.pace_wpm ? ` (~${feedback.pace_wpm} wpm)` : ""}</div>
                  )}
                  {feedback.pause_verdict && (
                    <div><span className="text-muted-foreground">Pauses:</span> <strong>{feedback.pause_verdict}</strong></div>
                  )}
                  {typeof feedback.filler_count === "number" && (
                    <div><span className="text-muted-foreground">Filler words:</span> <strong>{feedback.filler_count}</strong></div>
                  )}
                  {feedback.power_habit && (
                    <div className="sm:col-span-2"><span className="text-muted-foreground">Power habit for tomorrow:</span> <strong>{feedback.power_habit}</strong></div>
                  )}
                  {feedback.filler_issues && (
                    <div className="sm:col-span-2 text-xs text-muted-foreground">{feedback.filler_issues}</div>
                  )}
                </CardContent>
              </Card>
            )}


            {(feedback.hard_truth || (feedback.what_to_fix && feedback.what_to_fix.length > 0)) && (
              <Card className="glass-card mb-4 border-red-300/60">
                <CardHeader className="pb-3"><CardTitle className="text-base text-red-700 dark:text-red-400">🥊 Hard Truth</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-3">
                  {feedback.hard_truth && <p className="font-medium text-foreground">{feedback.hard_truth}</p>}
                  {feedback.what_to_fix && feedback.what_to_fix.length > 0 && (
                    <div>
                      <div className="text-xs uppercase text-muted-foreground mb-1">Fix these next time</div>
                      <ul className="list-disc pl-5 space-y-1">
                        {feedback.what_to_fix.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Average score: <strong>{avgScore.toFixed(1)} / 10</strong>. This is coaching feedback — completing all rounds already counts your session.</p>
                </CardContent>
              </Card>
            )}


            <div className="flex flex-col sm:flex-row gap-2 mb-6">
              <Button onClick={completeSession} disabled={!eligible || completing || completedToday} className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {completedToday ? "Already completed today" : completing ? "Saving…" : "Mark Complete"}
              </Button>
              {!eligible && !completedToday && (
                <span className="text-xs text-muted-foreground self-center">
                  Speak a real attempt in each of the 3 rounds (40+ chars) to complete your session.
                </span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default Speaking;
