import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Headphones, Loader2, RefreshCw, Sparkles, Upload, AlertTriangle, Trash2 } from "lucide-react";
import ShadowPlayer, { fmtTime } from "@/components/shadow/ShadowPlayer";
import { toast } from "sonner";

type Session = {
  id: string; topic: string; status: string; progress_label: string | null; transcript: string | null;
  duration_seconds: number | null; audio_path: string | null; error_message: string | null; created_at: string;
  generation_version: number; source_type: string; voice_id: string | null;
};
type Section = { section_index: number; text: string | null; duration_seconds: number | null; generation_status: string };

const ACTIVE = ["queued", "generating_text", "generating_audio", "assembling", "verifying_duration"];
const EXAMPLES = [
  "Greeting one person", "Greeting a group of friends", "Joining a game with strangers", "Making small talk at work",
  "Talking with coworkers", "Telling stories", "Sharing opinions", "Politely disagreeing", "Job interviews",
  "Giving a project update", "Leading a meeting", "Meeting someone new",
];
const DAILY = [
  "Catching up with an old friend over coffee", "Greeting a group of friends at a barbecue", "Small talk with coworkers on Monday morning",
  "Joining a pickup basketball game with strangers", "Telling a funny story about a travel mishap", "Sharing opinions about remote work",
  "Giving a project update in a team meeting", "Answering 'Tell me about yourself' in a job interview", "Leading a weekly planning meeting",
  "Meeting new neighbors", "Politely disagreeing with a friend about a movie", "Telling the story of a stressful day that ended well",
];
const todayTopic = () => {
  const d = new Date(); const day = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  return DAILY[day % DAILY.length];
};
const newKey = () => crypto.randomUUID();

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("american-shadow", { body });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) { try { msg = (await error.context.json()).error ?? msg; } catch { /* ignore */ } }
    throw new Error(msg);
  }
  return data;
}

export default function AmericanShadow() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [topic, setTopic] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState<Session | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("practice");
  const keyRef = useRef<{ topic: string; key: string } | null>(null);
  const [upload, setUpload] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    document.title = "American Shadow — 10-minute shadowing";
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate("/auth?post_login_redirect=/american-shadow"); else setReady(true);
    });
  }, [navigate]);

  const loadList = useCallback(async () => {
    const { data } = await supabase.from("shadow_sessions").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
    const list = (data ?? []) as Session[];
    setSessions(list);
    return list;
  }, []);

  const openSession = useCallback(async (s: Session) => {
    setCurrent(s); setAudioUrl(null);
    const { data } = await supabase.from("shadow_session_sections").select("section_index,text,duration_seconds,generation_status").eq("session_id", s.id).order("section_index");
    setSections((data ?? []) as Section[]);
    if (s.status === "completed" && s.audio_path) {
      try { const r = await call({ action: "audio_url", session_id: s.id }); setAudioUrl(r.url); } catch (e) { toast.error((e as Error).message); }
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadList().then((list) => { const active = list.find((x) => ACTIVE.includes(x.status)); if (active) openSession(active); });
  }, [ready, loadList, openSession]);

  // Poll while generating
  useEffect(() => {
    if (!current || !ACTIVE.includes(current.status)) return;
    const id = setInterval(async () => {
      const { data } = await supabase.from("shadow_sessions").select("*").eq("id", current.id).maybeSingle();
      if (!data) return;
      const s = data as Session;
      if (s.status !== current.status || s.progress_label !== current.progress_label) {
        if (!ACTIVE.includes(s.status)) { await openSession(s); loadList(); } else setCurrent(s);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [current, openSession, loadList]);

  const generate = async (t: string, source: "generated" | "daily" = "generated") => {
    const tt = t.trim(); if (tt.length < 2 || submitting) return;
    if (!keyRef.current || keyRef.current.topic !== tt) keyRef.current = { topic: tt, key: newKey() };
    setSubmitting(true);
    try {
      const r = await call({ action: "create", topic: tt, idempotency_key: keyRef.current.key, source_type: source });
      if (r.message) toast.info(r.message);
      keyRef.current = null;
      await openSession(r.session);
      loadList();
    } catch (e) { toast.error((e as Error).message); } finally { setSubmitting(false); }
  };

  const retry = async () => {
    if (!current) return;
    try { await call({ action: "retry", session_id: current.id }); setCurrent({ ...current, status: "queued", error_message: null, progress_label: "Resuming…" }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const download = async () => {
    if (!current) return;
    try { const r = await call({ action: "audio_url", session_id: current.id, download: true }); window.location.href = r.url; }
    catch (e) { toast.error((e as Error).message); }
  };

  const remove = async (s: Session) => {
    try { await call({ action: "delete", session_id: s.id }); if (current?.id === s.id) { setCurrent(null); setAudioUrl(null); } loadList(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const busy = submitting || (current ? ACTIVE.includes(current.status) : false);
  let acc = 0;
  const playerSections = sections.filter((s) => s.text).map((s) => { const start = acc; acc += Number(s.duration_seconds ?? 0); return { text: s.text as string, start }; });
  const daily = todayTopic();

  if (!ready) return null;

  return (
    <div className="shadow-theme min-h-screen text-foreground bg-[image:var(--shadow-gradient)] bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
          <Headphones className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">American Shadow</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full h-12 mb-6">
            <TabsTrigger value="practice" className="h-10">Practice</TabsTrigger>
            <TabsTrigger value="history" className="h-10">My Sessions</TabsTrigger>
            <TabsTrigger value="audio" className="h-10">My Audio</TabsTrigger>
          </TabsList>

          <TabsContent value="practice" className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5">
              <label htmlFor="topic" className="text-xl font-semibold block mb-3">What do you want to practice today?</label>
              <Textarea id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} rows={2}
                placeholder="e.g. talking with friends at a barbecue" className="text-base bg-muted/50" />
              <div className="flex flex-wrap gap-2 mt-3">
                {EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => setTopic(ex)}
                    className="rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition">{ex}</button>
                ))}
              </div>
              <Button size="lg" className="w-full h-14 mt-4 text-base" disabled={busy || topic.trim().length < 2} onClick={() => generate(topic)}>
                {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Sparkles className="h-5 w-5 mr-2" />}
                Generate my 10-minute session
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Put on earphones, press play, and speak along about one second behind him — for the whole session.</p>
            </section>

            <section className="rounded-2xl border border-primary/40 bg-card p-5">
              <div className="text-xs uppercase tracking-wider text-primary font-semibold">Today's Shadow</div>
              <div className="text-lg font-medium mt-1">{daily}</div>
              <Button variant="outline" size="lg" className="w-full h-12 mt-3" disabled={busy} onClick={() => generate(daily, "daily")}>
                Generate today's 10-minute session
              </Button>
            </section>

            {current && (
              <section className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Current session · v{current.generation_version}</div>
                  <h2 className="text-xl font-semibold">{current.topic}</h2>
                </div>
                {ACTIVE.includes(current.status) && (
                  <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div>
                      <div className="font-medium">{current.progress_label ?? "Preparing your session…"}</div>
                      <div className="text-xs text-muted-foreground">This usually takes a few minutes. You can leave and come back.</div>
                    </div>
                  </div>
                )}
                {(current.status === "partial_failure" || current.status === "failed") && (
                  <div className="rounded-2xl border border-destructive/60 bg-card p-5">
                    <div className="flex items-start gap-2"><AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" /><p>{current.error_message ?? "Generation stopped."}</p></div>
                    <Button className="mt-3 h-12" onClick={retry}><RefreshCw className="h-4 w-4 mr-2" /> Retry</Button>
                  </div>
                )}
                {current.status === "completed" && audioUrl && (
                  <>
                    <ShadowPlayer src={audioUrl} knownDuration={current.duration_seconds} onDownload={download} sections={playerSections} />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Recording length: {fmtTime(Number(current.duration_seconds ?? 0))}</span>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => { keyRef.current = null; generate(current.topic); }}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Generate a new version
                      </Button>
                    </div>
                  </>
                )}
              </section>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {sessions.length === 0 && <p className="text-muted-foreground">No sessions yet.</p>}
            {sessions.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <button className="flex-1 text-left min-w-0" onClick={() => { openSession(s); setTab("practice"); }}>
                  <div className="font-medium truncate">{s.topic}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {" · "}v{s.generation_version}{" · "}
                    {s.status === "completed" ? fmtTime(Number(s.duration_seconds ?? 0)) : s.status.replace(/_/g, " ")}
                  </div>
                </button>
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="audio" className="space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card p-8 cursor-pointer hover:border-primary transition">
              <Upload className="h-6 w-6 text-primary" />
              <span className="font-medium">Choose an audio file</span>
              <span className="text-xs text-muted-foreground">MP3, WAV, M4A, AAC, OGG — plays on this device only</span>
              <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  if (upload) URL.revokeObjectURL(upload.url);
                  setUpload({ url: URL.createObjectURL(f), name: f.name });
                }} />
            </label>
            {upload && (<><div className="text-sm text-muted-foreground truncate">{upload.name}</div><ShadowPlayer src={upload.url} /></>)}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
