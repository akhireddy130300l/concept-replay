import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Compass, ExternalLink, Loader2, Sparkles, CheckCircle2, Circle, Clock, XCircle, Mail, Mic, MicOff, Star } from "lucide-react";

type ActionStatus = "started" | "later" | "not_for_me";
type FilterTab = "all" | ActionStatus;
type OpportunityStage = "early_wave" | "inflection_point" | "evergreen";

interface SourceLink { title: string; url: string; }
interface CheckInEntry { note: string; at: string; }
interface KickstartStep { day: number; title: string; done: boolean; }

const STAGE_LABELS: Record<OpportunityStage, { label: string; className: string }> = {
  early_wave: { label: "Early Wave", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  inflection_point: { label: "Inflection Point", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  evergreen: { label: "Evergreen Skill", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
};

interface IdeaRow {
  id: string;
  field: string;
  topic: string;
  why_rising: string;
  five_year_vision: string;
  real_examples: unknown;
  first_step: string;
  difficulty: string;
  cost_estimate: string;
  time_estimate: string;
  sources: unknown;
  opportunity_stage?: string | null;
  is_breakthrough_update?: boolean;
  is_wildcard: boolean;
  is_ask_anything: boolean;
  sent_for: string;
  created_at: string;
}

interface ActionRow {
  id: string;
  idea_id: string;
  status: ActionStatus;
  check_ins: unknown;
  weekly_steps?: unknown;
  is_weekly_focus?: boolean;
  started_at: string | null;
}

const StartToday = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [askTopic, setAskTopic] = useState("");
  const [asking, setAsking] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [checkInDrafts, setCheckInDrafts] = useState<Record<string, string>>({});
  const [generatingPlanFor, setGeneratingPlanFor] = useState<string | null>(null);
  const [listeningFor, setListeningFor] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth");
      else setUserId(data.session.user.id);
    });
  }, [navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["start-today", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [ideasRes, actionsRes] = await Promise.all([
        supabase.from("opportunity_ideas").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(60),
        supabase.from("opportunity_actions").select("*").is("deleted_at", null),
      ]);
      if (ideasRes.error) throw ideasRes.error;
      if (actionsRes.error) throw actionsRes.error;
      const actionMap = new Map<string, ActionRow>();
      for (const a of (actionsRes.data ?? []) as ActionRow[]) actionMap.set(a.idea_id, a);
      return { ideas: (ideasRes.data ?? []) as IdeaRow[], actionMap };
    },
  });

  const handleSendDailyEmail = async () => {
    setSendingEmail(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("send-start-today-email");
      if (error || res?.error) throw new Error(res?.error || error?.message || "Could not send email");
      if (res?.sent > 0) {
        toast({ title: "Daily email sent!", description: "Check your inbox to try Start, Later, or Pass." });
        await queryClient.invalidateQueries({ queryKey: ["start-today", userId] });
      } else {
        toast({ title: "Already sent today", description: "Today's Start Today email was already delivered." });
      }
    } catch (err) {
      toast({ title: "Could not send email", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = askTopic.trim();
    if (topic.length < 2) return;
    setAsking(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("ask-start-today", { body: { topic } });
      if (error || res?.error) throw new Error(res?.error || error?.message || "Could not research topic");
      setAskTopic("");
      toast({ title: "Start plan ready", description: res.idea?.topic ?? topic });
      await queryClient.invalidateQueries({ queryKey: ["start-today", userId] });
    } catch (err) {
      toast({ title: "Could not create plan", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setAsking(false);
    }
  };

  const setStatus = async (ideaId: string, status: ActionStatus) => {
    if (!userId) return;
    const existing = data?.actionMap.get(ideaId);
    const payload = {
      user_id: userId,
      idea_id: ideaId,
      status,
      started_at: status === "started" ? existing?.started_at ?? new Date().toISOString() : existing?.started_at ?? null,
    };
    const { error } = existing
      ? await supabase.from("opportunity_actions").update(payload).eq("id", existing.id)
      : await supabase.from("opportunity_actions").insert(payload);
    if (error) {
      toast({ title: "Could not save status", description: error.message, variant: "destructive" });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["start-today", userId] });

    const existingSteps = Array.isArray(existing?.weekly_steps) ? (existing.weekly_steps as KickstartStep[]) : [];
    if (status === "started" && existingSteps.length === 0) {
      setGeneratingPlanFor(ideaId);
      try {
        await supabase.functions.invoke("start-today-action", { body: { ideaId } });
        await queryClient.invalidateQueries({ queryKey: ["start-today", userId] });
      } finally {
        setGeneratingPlanFor(null);
      }
    }
  };

  const toggleStep = async (ideaId: string, day: number) => {
    const existing = data?.actionMap.get(ideaId);
    if (!existing) return;
    const steps = Array.isArray(existing.weekly_steps) ? (existing.weekly_steps as KickstartStep[]) : [];
    const next = steps.map((s) => (s.day === day ? { ...s, done: !s.done } : s));
    const { error } = await supabase.from("opportunity_actions").update({ weekly_steps: next as unknown as never }).eq("id", existing.id);
    if (error) {
      toast({ title: "Could not update step", description: error.message, variant: "destructive" });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["start-today", userId] });
  };

  const setWeeklyFocus = async (ideaId: string) => {
    if (!userId) return;
    const existing = data?.actionMap.get(ideaId);
    if (!existing) return;
    await supabase.from("opportunity_actions").update({ is_weekly_focus: false }).eq("user_id", userId).is("deleted_at", null);
    const { error } = await supabase.from("opportunity_actions").update({ is_weekly_focus: true }).eq("id", existing.id);
    if (error) {
      toast({ title: "Could not set weekly focus", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Locked as Focus of the Week" });
    await queryClient.invalidateQueries({ queryKey: ["start-today", userId] });
  };

  const startVoiceCheckIn = (ideaId: string) => {
    const SpeechRec = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast({ title: "Voice input not supported", description: "Type your quick note instead.", variant: "destructive" });
      return;
    }
    if (listeningFor === ideaId) {
      setListeningFor(null);
      return;
    }
    const rec = new SpeechRec() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
    };
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListeningFor(ideaId);
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setCheckInDrafts((prev) => ({ ...prev, [ideaId]: prev[ideaId] ? `${prev[ideaId]} ${transcript}` : transcript }));
      }
    };
    rec.onerror = () => {
      setListeningFor(null);
      toast({ title: "Could not hear audio", description: "Check microphone permission and try again.", variant: "destructive" });
    };
    rec.onend = () => setListeningFor(null);
    rec.start();
  };

  const addCheckIn = async (ideaId: string) => {
    const note = (checkInDrafts[ideaId] ?? "").trim();
    const existing = data?.actionMap.get(ideaId);
    if (!note || !existing) return;
    const prior = Array.isArray(existing.check_ins) ? (existing.check_ins as CheckInEntry[]) : [];
    const next = [...prior, { note, at: new Date().toISOString() }];
    const { error } = await supabase.from("opportunity_actions").update({ check_ins: next as unknown as never }).eq("id", existing.id);
    if (error) {
      toast({ title: "Could not save check-in", description: error.message, variant: "destructive" });
      return;
    }
    setCheckInDrafts((prev) => ({ ...prev, [ideaId]: "" }));
    await queryClient.invalidateQueries({ queryKey: ["start-today", userId] });
  };

  const ideas = (data?.ideas ?? []).filter((idea) => {
    if (filter === "all") return true;
    return data?.actionMap.get(idea.id)?.status === filter;
  });

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-6 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")} className="glass-card border-border/50">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Dashboard
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
                <Compass className="w-5 h-5 text-primary" /> Start Today
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Future Regret Radar · Anyone can learn or start anything</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSendDailyEmail} disabled={sendingEmail} className="glass-card border-border/50">
            {sendingEmail ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}
            Send Today&apos;s Email
          </Button>
        </header>

        <form onSubmit={handleAsk} className="glass-card rounded-2xl p-4 sm:p-5 space-y-3">
          <label className="text-sm font-medium block">Ask anything — what do you want to get into?</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={askTopic}
              onChange={(e) => setAskTopic(e.target.value)}
              placeholder='e.g. "I want to get into robotics" or "solar micro-investing"'
              maxLength={160}
              disabled={asking}
            />
            <Button type="submit" disabled={asking || askTopic.trim().length < 2} className="shrink-0">
              {asking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Research Start Plan
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {(["all", "started", "later", "not_for_me"] as FilterTab[]).map((tab) => (
            <Button key={tab} size="sm" variant={filter === tab ? "default" : "outline"} onClick={() => setFilter(tab)}>
              {tab === "all" ? "All" : tab === "started" ? "Started" : tab === "later" ? "Later" : "Not for me"}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="glass-card rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading ideas…</div>
        ) : ideas.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center space-y-2">
            <p className="font-medium">No ideas here yet</p>
            <p className="text-sm text-muted-foreground">Use Ask Anything above, or wait for your 8 AM Eastern daily Start Today email.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {ideas.map((idea) => {
              const action = data?.actionMap.get(idea.id);
              const examples = Array.isArray(idea.real_examples) ? (idea.real_examples as string[]) : [];
              const sources = Array.isArray(idea.sources) ? (idea.sources as SourceLink[]) : [];
              const checkIns = Array.isArray(action?.check_ins) ? (action.check_ins as CheckInEntry[]) : [];
              const steps = Array.isArray(action?.weekly_steps) ? (action.weekly_steps as KickstartStep[]) : [];
              const stageKey = (idea.opportunity_stage === "inflection_point" || idea.opportunity_stage === "evergreen"
                ? idea.opportunity_stage
                : "early_wave") as OpportunityStage;
              const stageBadge = STAGE_LABELS[stageKey];
              const daysStarted = action?.started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(action.started_at)) / 86_400_000)) : null;

              return (
                <article key={idea.id} className="glass-card rounded-2xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{idea.field}</Badge>
                      <Badge variant="outline" className={stageBadge.className}>{stageBadge.label}</Badge>
                      {idea.is_breakthrough_update && (
                        <Badge variant="outline" className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30">New Update</Badge>
                      )}
                      {idea.is_wildcard && <Badge variant="outline">Wild Card</Badge>}
                      {idea.is_ask_anything && <Badge variant="outline">Ask Anything</Badge>}
                      {action?.is_weekly_focus && (
                        <Badge variant="default" className="gap-1"><Star className="w-3 h-3" /> Focus of the Week</Badge>
                      )}
                      {daysStarted !== null && action?.status === "started" && (
                        <Badge variant="default">Day {daysStarted}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{idea.sent_for}</span>
                  </div>

                  <h2 className="text-lg font-semibold leading-snug">{idea.topic}</h2>
                  <p className="text-sm leading-relaxed"><span className="font-medium">Why it's rising:</span> {idea.why_rising}</p>
                  <p className="text-sm leading-relaxed"><span className="font-medium">5 years from now:</span> {idea.five_year_vision}</p>
                  {examples.length > 0 && (
                    <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Who's already doing it:</span> {examples.join(" · ")}</p>
                  )}

                  <div className="rounded-xl bg-muted/50 p-3.5 space-y-1">
                    <p className="text-sm"><span className="font-medium">15-minute first step today:</span> {idea.first_step}</p>
                    <p className="text-xs text-muted-foreground">Difficulty: {idea.difficulty} · Cost: {idea.cost_estimate} · Time: {idea.time_estimate}</p>
                  </div>

                  {sources.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {sources.slice(0, 3).map((s) => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                          {s.title} <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant={action?.status === "started" ? "default" : "outline"} onClick={() => setStatus(idea.id, "started")}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Started
                    </Button>
                    <Button size="sm" variant={action?.status === "later" ? "default" : "outline"} onClick={() => setStatus(idea.id, "later")}>
                      <Clock className="w-3.5 h-3.5 mr-1.5" /> Later
                    </Button>
                    <Button size="sm" variant={action?.status === "not_for_me" ? "secondary" : "outline"} onClick={() => setStatus(idea.id, "not_for_me")}>
                      <XCircle className="w-3.5 h-3.5 mr-1.5" /> Not for me
                    </Button>
                    {action?.status === "started" && !action.is_weekly_focus && (
                      <Button size="sm" variant="ghost" onClick={() => setWeeklyFocus(idea.id)}>
                        <Star className="w-3.5 h-3.5 mr-1.5" /> Set Weekly Focus
                      </Button>
                    )}
                  </div>

                  {action?.status === "started" && (
                    <div className="pt-3 border-t border-border/50 space-y-3">
                      {generatingPlanFor === idea.id ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Building your 7-Day Kickstart Roadmap…
                        </p>
                      ) : steps.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            7-Day Kickstart Roadmap ({steps.filter((s) => s.done).length}/{steps.length} done)
                          </p>
                          <div className="space-y-1">
                            {steps.map((step) => (
                              <button
                                key={step.day}
                                type="button"
                                onClick={() => toggleStep(idea.id, step.day)}
                                className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60 transition-colors"
                              >
                                {step.done ? (
                                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                ) : (
                                  <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                                )}
                                <span className={step.done ? "line-through text-muted-foreground" : "text-foreground"}>
                                  <strong>Day {step.day}:</strong> {step.title}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={listeningFor === idea.id ? "destructive" : "outline"}
                          onClick={() => startVoiceCheckIn(idea.id)}
                          aria-label="Tap to speak progress note"
                          className="shrink-0 px-2.5"
                        >
                          {listeningFor === idea.id ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                        <Input
                          value={checkInDrafts[idea.id] ?? ""}
                          onChange={(e) => setCheckInDrafts((prev) => ({ ...prev, [idea.id]: e.target.value }))}
                          placeholder={listeningFor === idea.id ? "Listening…" : "Tap mic or type a progress note…"}
                          className="h-9 text-sm"
                        />
                        <Button size="sm" variant="outline" onClick={() => addCheckIn(idea.id)}>Save</Button>
                      </div>
                      {checkIns.length > 0 && (
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {checkIns.slice(-3).map((c, idx) => (
                            <li key={idx}>• {new Date(c.at).toLocaleDateString()} — {c.note}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StartToday;