import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, MicOff, Timer, RefreshCw, CheckCircle2, AlertTriangle, Dumbbell } from "lucide-react";
import {
  DRILLS, computeMetrics, judgeDrill, loadDrillLog, saveDrillLog, drillsDoneToday,
  type Drill, type DrillLog, type DrillVerdict, type DrillMetrics,
} from "@/lib/speaking/drills";

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
function getRecCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickItem(drill: Drill): string {
  return drill.items[Math.floor(Math.random() * drill.items.length)];
}

export default function QuickDrills() {
  const [drill, setDrill] = useState<Drill>(DRILLS[0]);
  const [item, setItem] = useState<string>(() => pickItem(DRILLS[0]));
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(DRILLS[0].seconds);
  const [transcript, setTranscript] = useState("");
  const [verdict, setVerdict] = useState<{ v: DrillVerdict; m: DrillMetrics } | null>(null);
  const [log, setLog] = useState<DrillLog[]>([]);
  const [micError, setMicError] = useState<string | null>(null);

  const recRef = useRef<SpeechRec | null>(null);
  const finalRef = useRef("");
  const startedAtRef = useRef(0);
  const supported = useMemo(() => !!getRecCtor(), []);

  useEffect(() => { setLog(loadDrillLog()); }, []);

  const stopAll = () => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    recRef.current = null;
    setRunning(false);
  };

  useEffect(() => () => stopAll(), []);

  // countdown
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { finish(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const selectDrill = (d: Drill) => {
    stopAll();
    setDrill(d);
    setItem(pickItem(d));
    setLeft(d.seconds);
    setTranscript("");
    finalRef.current = "";
    setVerdict(null);
    setMicError(null);
  };

  const newItem = () => {
    stopAll();
    setItem(pickItem(drill));
    setLeft(drill.seconds);
    setTranscript("");
    finalRef.current = "";
    setVerdict(null);
  };

  const start = () => {
    const Ctor = getRecCtor();
    if (!Ctor) { setMicError("Speech recognition isn't supported in this browser. Try Chrome."); return; }
    setMicError(null);
    setVerdict(null);
    setTranscript("");
    finalRef.current = "";
    setLeft(drill.seconds);
    startedAtRef.current = Date.now();

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setMicError(`Microphone error: ${e.error}`);
    };
    rec.onend = () => { if (recRef.current) { try { rec.start(); } catch { /* ignore */ } } };
    recRef.current = rec;
    try { rec.start(); setRunning(true); } catch { setMicError("Could not start the microphone."); }
  };

  const finish = () => {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    stopAll();
    const text = (finalRef.current || transcript).trim();
    const m = computeMetrics(drill, text, Math.min(elapsed, drill.seconds), drill.kind === "read" ? item : undefined);
    const v = judgeDrill(drill, m);
    setTranscript(text);
    setVerdict({ v, m });
    setLog(saveDrillLog({
      id: `${Date.now()}`, drillId: drill.id, title: drill.title,
      at: new Date().toISOString(), passed: v.passed, wpm: m.wpm, fillers: m.fillers,
    }));
  };

  const doneToday = drillsDoneToday(log);
  const pct = ((drill.seconds - left) / drill.seconds) * 100;

  return (
    <Card className="glass-card mb-4 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Dumbbell className="w-4 h-4" /> Quick Drills — 30–60 second reps
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Offline micro-practice with instant, rule-based scoring. These don't affect your streak — use them any time,
          especially right before a meeting. {doneToday > 0 && <strong>{doneToday} done today.</strong>}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {DRILLS.map((d) => (
            <button
              key={d.id}
              onClick={() => selectDrill(d)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                d.id === drill.id
                  ? "border-primary bg-primary/10 text-foreground font-semibold"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {d.emoji} {d.title}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground mb-1">{drill.goal}</div>
          <div className="text-sm font-medium">
            {drill.kind === "read" ? "Read aloud:" : "Prompt:"} <span className="font-normal">{item}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="w-3.5 h-3.5" /> {drill.seconds}s
            <button onClick={newItem} className="ml-auto inline-flex items-center gap-1 hover:text-foreground">
              <RefreshCw className="w-3.5 h-3.5" /> New prompt
            </button>
          </div>
        </div>

        {running && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Recording…</span>
              <span className="font-semibold">{left}s left</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {!running ? (
            <Button onClick={start} className="gap-2" disabled={!supported}>
              <Mic className="w-4 h-4" /> Start drill
            </Button>
          ) : (
            <Button onClick={finish} variant="secondary" className="gap-2">
              <MicOff className="w-4 h-4" /> Stop & score
            </Button>
          )}
        </div>

        {!supported && (
          <p className="text-xs text-amber-700">Speech recognition isn't available in this browser — use Chrome for drills.</p>
        )}
        {micError && <p className="text-xs text-destructive">{micError}</p>}

        {transcript && (
          <div className="rounded-md border border-border/60 p-3 text-sm">
            <div className="text-xs text-muted-foreground mb-1">What you said</div>
            {transcript}
          </div>
        )}

        {verdict && (
          <div className={`rounded-md border p-3 ${verdict.v.passed ? "border-emerald-300 bg-emerald-50/60" : "border-amber-300 bg-amber-50/60"}`}>
            <div className="flex items-center gap-2 font-semibold text-sm">
              {verdict.v.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
              {verdict.v.headline}
            </div>
            <div className="grid grid-cols-3 gap-2 my-3 text-center">
              <div className="rounded-md bg-background/70 py-2">
                <div className="text-lg font-bold">{verdict.m.wpm}</div>
                <div className="text-[11px] text-muted-foreground">words / min</div>
              </div>
              <div className="rounded-md bg-background/70 py-2">
                <div className="text-lg font-bold">{verdict.m.fillers}</div>
                <div className="text-[11px] text-muted-foreground">fillers</div>
              </div>
              <div className="rounded-md bg-background/70 py-2">
                <div className="text-lg font-bold">{verdict.m.accuracy !== null ? `${Math.round(verdict.m.accuracy * 100)}%` : verdict.m.words}</div>
                <div className="text-[11px] text-muted-foreground">{verdict.m.accuracy !== null ? "line match" : "words"}</div>
              </div>
            </div>
            <ul className="text-sm space-y-1 list-disc pl-5">
              {verdict.v.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
            <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={newItem}>
              <RefreshCw className="w-3.5 h-3.5" /> Run again
            </Button>
          </div>
        )}

        {log.length > 0 && (
          <div className="pt-1">
            <div className="text-xs text-muted-foreground mb-2">Recent drills (stored on this device only)</div>
            <div className="space-y-1">
              {log.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1">
                  <span>{l.passed ? "✅" : "⚠️"} {l.title}</span>
                  <span className="text-muted-foreground">{l.wpm} wpm · {l.fillers} fillers · {new Date(l.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
