import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Download, FileText } from "lucide-react";

export const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

type Props = {
  src: string;
  knownDuration?: number | null;
  onDownload?: () => void;
  sections?: { text: string; start: number }[];
};

const SPEEDS = [0.85, 1, 1.1];

export default function ShadowPlayer({ src, knownDuration, onDownload, sections }: Props) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showText, setShowText] = useState(true);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { setPlaying(false); setT(0); }, [src]);
  useEffect(() => { if (ref.current) ref.current.playbackRate = speed; }, [speed, src]);

  const total = dur || knownDuration || 0;
  const activeIdx = sections ? sections.reduce((acc, s, i) => (t >= s.start ? i : acc), 0) : -1;
  useEffect(() => {
    if (playing) activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx, playing]);

  const toggle = async () => {
    const a = ref.current; if (!a) return;
    if (a.paused) { try { await a.play(); } catch { /* blocked */ } } else a.pause();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-lg">
      <audio
        ref={ref} src={src} preload="metadata" playsInline
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); e.currentTarget.playbackRate = speed; }}
        onDurationChange={(e) => { const d = e.currentTarget.duration; if (isFinite(d)) setDur(d); }}
      />
      <div className="flex items-center gap-4">
        <button
          onClick={toggle} aria-label={playing ? "Pause" : "Play"}
          className="h-16 w-16 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-95 transition"
        >
          {playing ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-1" />}
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="range" min={0} max={total || 0} step={0.1} value={Math.min(t, total || 0)} aria-label="Seek"
            onChange={(e) => { const v = Number(e.target.value); if (ref.current) ref.current.currentTime = v; setT(v); }}
            className="w-full h-3 accent-[hsl(var(--primary))] cursor-pointer"
          />
          <div className="flex justify-between text-sm text-muted-foreground tabular-nums mt-1">
            <span>{fmtTime(t)}</span><span>{fmtTime(total)}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="lg" className="h-12" onClick={() => { if (ref.current) { ref.current.currentTime = 0; setT(0); } }}>
          <RotateCcw className="h-4 w-4 mr-2" /> Restart
        </Button>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => setSpeed(s)}
              className={`h-12 px-4 text-sm font-medium ${speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {s}x
            </button>
          ))}
        </div>
        {onDownload && (
          <Button variant="outline" size="lg" className="h-12" onClick={onDownload}><Download className="h-4 w-4 mr-2" /> Download</Button>
        )}
        {sections && (
          <Button variant="outline" size="lg" className="h-12" onClick={() => setShowText((v) => !v)}>
            <FileText className="h-4 w-4 mr-2" /> {showText ? "Hide transcript" : "Show transcript"}
          </Button>
        )}
      </div>
      {sections && showText && (
        <div className="mt-4 max-h-80 overflow-y-auto rounded-xl bg-muted/50 p-4 space-y-3 text-[15px] leading-relaxed">
          {sections.map((s, i) => (
            <p key={i} ref={i === activeIdx ? activeRef : undefined}
              className={`transition-colors ${i === activeIdx && (playing || t > 0) ? "text-foreground" : "text-muted-foreground"}`}>
              {i === activeIdx && (playing || t > 0) && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" />}
              {s.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
