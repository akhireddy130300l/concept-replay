import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Compass, ExternalLink, Loader2, Sparkles, CheckCircle2, Clock, XCircle } from "lucide-react";

type ActionStatus = "started" | "later" | "not_for_me";
type FilterTab = "all" | ActionStatus;

interface SourceLink { title: string; url: string; }
interface CheckInEntry { note: string; at: string; }

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
  const [checkInDrafts, setCheckInDrafts] = useState<Record<string, string>>({});

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
              const daysStarted = action?.started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(action.started_at)) / 86_400_000)) : null;

              return (
                <article key={idea.id} className="glass-card rounded-2xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{idea.field}</Badge>
                      {idea.is_wildcard && <Badge variant="outline">Wild Card</Badge>}
                      {idea.is_ask_anything && <Badge variant="outline">Ask Anything</Badge>}
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
                  </div>

                  {action?.status === "started" && (
                    <div className="pt-2 border-t border-border/50 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          value={checkInDrafts[idea.id] ?? ""}
                          onChange={(e) => setCheckInDrafts((prev) => ({ ...prev, [idea.id]: e.target.value }))}
                          placeholder="Log a quick weekly progress check-in…"
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