import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ALL_MODES,
  MODE_DESCRIPTIONS,
  pickScenarioForMode,
  todaysMode,
  todaysWarmups,
  type SpeakingFeedback,
  type SpeakingMode,
  type Scenario,
} from "@/lib/speaking/content";
import { Mic, MicOff, Sparkles, Flame, CheckCircle2, AlertTriangle, RotateCcw, ArrowLeft, Trophy } from "lucide-react";

type UserState = {
  user_id: string;
  preferred_mode: SpeakingMode | null;
  current_streak: number;
  longest_streak: number;
  missed_count: number;
  last_completed_date: string | null;
  paused: boolean;
};

function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

// Minimal Web Speech API typings (browser-only).
type SpeechRecResult = { transcript: string };
type SpeechRecAlt = { 0: SpeechRecResult; isFinal: boolean; length: number };
type SpeechRecEvent = { resultIndex: number; results: ArrayLike<SpeechRecAlt> };
type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
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

  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(true);
  const recRef = useRef<SpeechRec | null>(null);
  const finalTextRef = useRef<string>("");

  const [feedback, setFeedback] = useState<SpeakingFeedback | null>(null);
  const [requestingFeedback, setRequestingFeedback] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completedToday, setCompletedToday] = useState(false);

  // Load auth + state + today's completion status.
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

      // Load or create user state.
      const { data: st } = await supabase
        .from("speaking_user_state")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      let current: UserState;
      if (!st) {
        const { data: inserted } = await supabase
          .from("speaking_user_state")
          .insert({ user_id: uid })
          .select()
          .single();
        current = inserted as UserState;
      } else {
        current = st as UserState;
      }

      // Recompute missed count if user has skipped days.
      const today = localDateStr();
      if (current.last_completed_date) {
        const gap = daysBetween(current.last_completed_date, today);
        if (gap > 1) {
          const missed = gap - 1;
          const paused = missed >= 3;
          const { data: updated } = await supabase
            .from("speaking_user_state")
            .update({
              missed_count: missed,
              paused,
              // Streak resets if a day was skipped.
              current_streak: 0,
            })
            .eq("user_id", uid)
            .select()
            .single();
          if (updated) current = updated as UserState;
        }
      }
      setState(current);
      if (current.preferred_mode && ALL_MODES.includes(current.preferred_mode)) {
        setMode(current.preferred_mode);
        setScenario(pickScenarioForMode(current.preferred_mode));
      }

      // Check today's completion.
      const { data: sess } = await supabase
        .from("speaking_sessions")
        .select("id, mode, scenario_title, scenario_prompt, feedback")
        .eq("user_id", uid)
        .eq("session_date", today)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sess) {
        setCompletedToday(true);
        if (sess.feedback) setFeedback(sess.feedback as SpeakingFeedback);
        if (sess.mode && ALL_MODES.includes(sess.mode as SpeakingMode)) {
          setMode(sess.mode as SpeakingMode);
          setScenario({ title: sess.scenario_title, prompt: sess.scenario_prompt });
        }
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
    setScenario(pickScenarioForMode(m));
    setFeedback(null);
    if (userId) {
      await supabase.from("speaking_user_state").update({ preferred_mode: m }).eq("user_id", userId);
    }
  };

  const startListening = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast({ title: "Speech-to-text not available", description: "Your browser doesn't support speech recognition. Please type your transcript below.", variant: "destructive" });
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      finalTextRef.current = transcript ? transcript + " " : "";
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i] as SpeechRecAlt;
          const txt = r[0].transcript;
          if (r.isFinal) finalTextRef.current += txt + " ";
          else interim += txt;
        }
        setTranscript((finalTextRef.current + interim).trimStart());
      };
      rec.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          toast({ title: "Speech error", description: e.error, variant: "destructive" });
        }
        setListening(false);
      };
      rec.onend = () => setListening(false);
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (e) {
      toast({ title: "Could not start microphone", description: e instanceof Error ? e.message : "Please allow microphone access.", variant: "destructive" });
    }
  };
  const stopListening = () => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  };

  const requestFeedback = async () => {
    if (transcript.trim().length < 20) {
      toast({ title: "Add a bit more", description: "Speak or type at least a few sentences first.", variant: "destructive" });
      return;
    }
    setRequestingFeedback(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.functions.invoke("speaking-feedback", {
        body: { mode, scenarioTitle: scenario.title, scenarioPrompt: scenario.prompt, transcript: transcript.trim() },
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

  const completeSession = async (isRecovery: boolean) => {
    if (!userId) return;
    setCompleting(true);
    try {
      const today = localDateStr();
      const { error: insErr } = await supabase.from("speaking_sessions").insert({
        user_id: userId,
        session_date: today,
        mode,
        scenario_title: scenario.title,
        scenario_prompt: scenario.prompt,
        transcript: transcript.trim(),
        feedback: feedback ?? null,
        is_recovery: isRecovery,
      });
      if (insErr) throw insErr;

      // Update state: streak, missed, paused.
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
        })
        .eq("user_id", userId)
        .select()
        .single();
      if (updated) setState(updated as UserState);
      setCompletedToday(true);
      toast({ title: isRecovery ? "Recovery session complete" : "Session marked complete", description: `Streak: ${newStreak} day${newStreak === 1 ? "" : "s"}.` });
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

  const missed = state?.missed_count ?? 0;
  const paused = state?.paused ?? false;

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
        {/* Accountability banners */}
        {paused && (
          <Card className="glass-card border-amber-300 mb-4">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-900">Speaking rhythm paused</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    You've missed 3+ days. Normal sessions are paused. Complete one short <strong>recovery session</strong> below to resume daily practice.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {!paused && missed >= 2 && (
          <Card className="glass-card border-orange-300 mb-4">
            <CardContent className="pt-5 pb-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div>
                <div className="font-semibold">Your speaking rhythm is at risk</div>
                <p className="text-sm text-muted-foreground mt-1">You've missed {missed} days. Ship one rep today and you're back on track.</p>
              </div>
            </CardContent>
          </Card>
        )}
        {!paused && missed === 1 && (
          <Card className="glass-card border-yellow-300 mb-4">
            <CardContent className="pt-5 pb-5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <div className="font-semibold">Missed yesterday</div>
                <p className="text-sm text-muted-foreground mt-1">One day off is fine. Don't make it two.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mode selector */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Speaking mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={mode} onValueChange={(v) => handleSelectMode(v as SpeakingMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_MODES.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{MODE_DESCRIPTIONS[mode]}</p>
            <p className="text-xs text-muted-foreground">Today's auto-pick: <strong>{defaultMode}</strong>. Pick any mode you want to drill.</p>
          </CardContent>
        </Card>

        {/* Warm-up */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 1 — Warm-up (speak aloud)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {warmups.map((w, i) => (<li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{w}</span></li>))}
            </ul>
          </CardContent>
        </Card>

        {/* Scenario */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 2 — Today's scenario</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-semibold mb-1">{scenario.title}</div>
            <p className="text-sm text-muted-foreground">{scenario.prompt}</p>
          </CardContent>
        </Card>

        {/* Speak */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 3 — Speak (or paste what you said)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {!listening ? (
                <Button onClick={startListening} variant="outline" disabled={!sttSupported} className="gap-2">
                  <Mic className="w-4 h-4" /> {sttSupported ? "Start speaking" : "Speech not supported"}
                </Button>
              ) : (
                <Button onClick={stopListening} variant="destructive" className="gap-2">
                  <MicOff className="w-4 h-4" /> Stop
                </Button>
              )}
              {!sttSupported && <span className="text-xs text-muted-foreground">Type or paste your transcript below.</span>}
              {listening && <span className="text-xs text-red-500 animate-pulse">● Listening…</span>}
            </div>
            <div>
              <Label htmlFor="transcript" className="text-xs text-muted-foreground">Transcript ({transcript.length} chars)</Label>
              <Textarea
                id="transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="What did you say? Speak with the button above, or just type it here…"
                rows={6}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Feedback */}
        <Card className="glass-card mb-4 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Step 4 — AI feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={requestFeedback}
              disabled={requestingFeedback || transcript.trim().length < 20}
              className="gap-2 glossy-button bg-gradient-to-r from-primary to-secondary text-primary-foreground"
            >
              <Sparkles className="w-4 h-4" />
              {requestingFeedback ? "Coaching…" : feedback ? "Re-run coaching" : "Get Speaking Feedback"}
            </Button>

            {feedback && (
              <div className="space-y-4 pt-2">
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    <ScoreBar label="Clarity" value={feedback.scores?.clarity} />
                    <ScoreBar label="Confidence" value={feedback.scores?.confidence} />
                    <ScoreBar label="Persuasion" value={feedback.scores?.persuasion} />
                    <ScoreBar label="Structure" value={feedback.scores?.structure} />
                    <ScoreBar label="Executive presence" value={feedback.scores?.executive_presence} />
                  </div>
                </div>

                {feedback.did_well?.length > 0 && (
                  <section>
                    <h4 className="font-semibold text-sm mb-1">What you did well</h4>
                    <ul className="text-sm space-y-1">
                      {feedback.did_well.map((b, i) => (<li key={i} className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /><span>{b}</span></li>))}
                    </ul>
                  </section>
                )}

                {(feedback.weak_phrases?.length ?? 0) > 0 && (
                  <section>
                    <h4 className="font-semibold text-sm mb-1">Weak → stronger</h4>
                    <ul className="text-sm space-y-1">
                      {feedback.weak_phrases.map((w, i) => (
                        <li key={i}>
                          <span className="text-muted-foreground line-through">{w}</span>
                          {feedback.stronger_phrases?.[i] && (<>
                            <span className="mx-2 text-muted-foreground">→</span>
                            <span className="font-medium">{feedback.stronger_phrases[i]}</span>
                          </>)}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {feedback.filler_issues && (
                  <section>
                    <h4 className="font-semibold text-sm mb-1">Filler &amp; hesitation</h4>
                    <p className="text-sm text-muted-foreground">{feedback.filler_issues}</p>
                  </section>
                )}

                <section className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Corrected", text: feedback.corrected },
                    { label: "Natural", text: feedback.natural },
                    { label: "Powerful", text: feedback.powerful },
                    { label: `${mode} style`, text: feedback.role_style },
                  ].map((b) => (
                    <div key={b.label} className="border border-border/40 rounded-xl p-3 bg-background/60">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{b.label}</div>
                      <p className="text-sm whitespace-pre-wrap">{b.text}</p>
                    </div>
                  ))}
                </section>

                {feedback.tomorrows_drill && (
                  <section className="border-l-4 border-primary pl-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Tomorrow's drill</div>
                    <p className="text-sm">{feedback.tomorrows_drill}</p>
                  </section>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Complete */}
        <Card className="glass-card mb-4 border-border/40">
          <CardContent className="pt-6 pb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="font-semibold flex items-center gap-2">
                {completedToday ? <><CheckCircle2 className="w-5 h-5 text-green-600" /> Today's session is in the books</> : "Mark today complete"}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {paused ? "Completing this counts as your recovery session and resumes daily practice." : "One rep a day. That's how presence gets built."}
              </p>
            </div>
            <Button
              onClick={() => completeSession(paused)}
              disabled={completing || completedToday}
              className="gap-2"
              variant={paused ? "default" : "default"}
            >
              {paused ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {paused ? "Complete recovery session" : completedToday ? "Completed" : "Mark Complete"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Speaking;
