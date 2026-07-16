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
import { Mic, MicOff, Sparkles, Flame, CheckCircle2, AlertTriangle, ArrowLeft, Trophy, Target, RefreshCw } from "lucide-react";

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

type RoundKey = "opening" | "pressure" | "close";

const RoundRecorder = ({
  label, prompt, value, onChange, sttSupported,
}: {
  label: string; prompt: string; value: string; onChange: (v: string) => void; sttSupported: boolean;
}) => {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const finalRef = useRef("");

  const start = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
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
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    try { rec.start(); recRef.current = rec; setListening(true); } catch { /* ignore */ }
  };
  const stop = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); };

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-sm mb-2">{prompt}</div>
      <div className="flex items-center gap-2 mb-2">
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

  const eligible = !!feedback &&
    feedback.meaningful_attempt !== false &&
    avgScore >= 5.0 &&
    (feedback.improvement_target_met === "met" || feedback.improvement_target_met === "partial");


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
      const yesterday = localDateStr(new Date(Date.now() - 86400000));
      let newStreak = 1;
      if (cur?.last_completed_date === yesterday) newStreak = (cur.current_streak ?? 0) + 1;
      else if (cur?.last_completed_date === today) newStreak = cur.current_streak ?? 1;
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
              onClick={() => loadFreshScenario(mode, userId)}
              disabled={generatingScenario || completedToday}
              title={completedToday ? "Already completed today" : "Generate a new scenario"}
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
            />
            <RoundRecorder
              label="Round 2 — Pressure / objection"
              prompt={scenario.round2_pressure_prompt}
              value={rounds.pressure}
              onChange={(v) => setRounds((r) => ({ ...r, pressure: v }))}
              sttSupported={sttSupported}
            />
            <RoundRecorder
              label="Round 3 — Close / land the message"
              prompt={scenario.round3_close_prompt}
              value={rounds.close}
              onChange={(v) => setRounds((r) => ({ ...r, close: v }))}
              sttSupported={sttSupported}
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

        {/* Feedback */}
        {feedback && (
          <>
            <Card className={`glass-card mb-4 border ${eligible ? "border-emerald-300" : "border-amber-300"}`}>
              <CardContent className="pt-5 pb-5 flex items-start gap-3">
                {eligible ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
                <div>
                  <div className="font-semibold">
                    {eligible ? "Good session — improvement target met" : "Needs another attempt — improvement target not met yet"}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Target: <strong>{todaysTarget}</strong> — verdict: <strong>{feedback.improvement_target_met}</strong>
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
              <CardHeader className="pb-3"><CardTitle className="text-base">Stronger versions</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-3">
                <div><div className="text-xs uppercase text-muted-foreground mb-1">Corrected</div><p>{feedback.corrected}</p></div>
                <div><div className="text-xs uppercase text-muted-foreground mb-1">Natural</div><p>{feedback.natural}</p></div>
                <div><div className="text-xs uppercase text-muted-foreground mb-1">Powerful</div><p>{feedback.powerful}</p></div>
                <div><div className="text-xs uppercase text-muted-foreground mb-1">Role style rewrite ({mode})</div><p>{feedback.role_style}</p></div>
              </CardContent>
            </Card>

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
                  <p className="text-xs text-muted-foreground">Average score: <strong>{avgScore.toFixed(1)} / 10</strong>. Sessions with average under 5.0 do not count toward your streak.</p>
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
                  Mark Complete unlocks only when the AI confirms a real attempt at today's target.
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
