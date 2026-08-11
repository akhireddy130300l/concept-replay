// Offline speaking drills — 100% frontend, no backend calls.
// Short, focused reps you can do before a meeting or between full sessions.

export type DrillKind = "freeform" | "read";

export type Drill = {
  id: string;
  title: string;
  emoji: string;
  kind: DrillKind;
  seconds: number;
  goal: string;
  /** Prompts (freeform) or texts to read aloud (read). One is picked at random. */
  items: string[];
  /** Target words-per-minute band, used for pace scoring. */
  wpm?: [number, number];
  /** Max fillers tolerated before the drill is marked failed. */
  maxFillers?: number;
  /** Expected sentence count (min, max) for structure drills. */
  sentences?: [number, number];
};

export const FILLER_WORDS = [
  "um", "uh", "erm", "ah", "like", "you know", "actually", "basically",
  "literally", "sort of", "kind of", "i mean", "so yeah", "right?",
];

export const DRILLS: Drill[] = [
  {
    id: "filler-killer",
    title: "Filler Killer",
    emoji: "🚫",
    kind: "freeform",
    seconds: 60,
    goal: "Speak for 60 seconds with zero filler words. Pause in silence instead of saying “um”.",
    maxFillers: 2,
    items: [
      "Explain what you worked on yesterday.",
      "Describe your current project to a new joiner.",
      "Explain one decision you made this week and why.",
      "Describe the biggest risk in your work right now.",
      "Explain how you would onboard someone into your role.",
    ],
  },
  {
    id: "pace-control",
    title: "Pace Control",
    emoji: "🎚️",
    kind: "freeform",
    seconds: 45,
    goal: "Hold a calm executive pace of roughly 130–160 words per minute — not rushed, not slow.",
    wpm: [125, 165],
    items: [
      "Give a status update on something you own.",
      "Explain a technical idea to a non-technical leader.",
      "Describe your plan for the rest of this week.",
      "Walk through how you solved a recent problem.",
    ],
  },
  {
    id: "impromptu-60",
    title: "60-Second Impromptu",
    emoji: "⏱️",
    kind: "freeform",
    seconds: 60,
    goal: "Random prompt, no prep. Open with a clear point, give one example, close with a line that lands.",
    maxFillers: 5,
    items: [
      "Is remote work better for deep thinking?",
      "The most underrated skill in your field.",
      "One rule you'd give your younger self.",
      "Should teams optimise for speed or correctness?",
      "What makes feedback actually useful?",
      "The best decision you made this year.",
      "Why most meetings fail.",
    ],
  },
  {
    id: "three-sentence-summary",
    title: "Three-Sentence Summary",
    emoji: "🎯",
    kind: "freeform",
    seconds: 40,
    goal: "Compress an update into exactly three sentences: situation, action, ask.",
    sentences: [3, 4],
    items: [
      "Summarise your current project for a busy executive.",
      "Summarise a problem you need help with.",
      "Summarise the outcome of your last piece of work.",
      "Summarise why your team should get more budget.",
    ],
  },
  {
    id: "articulation",
    title: "Articulation Warm-up",
    emoji: "👄",
    kind: "read",
    seconds: 40,
    goal: "Read the line aloud slowly and cleanly. Hit every consonant — accuracy over speed.",
    items: [
      "Red leather, yellow leather. Red leather, yellow leather.",
      "The sixth sick sheikh's sixth sheep's sick.",
      "Unique New York, unique New York, you know you need unique New York.",
      "A proper copper coffee pot. A proper copper coffee pot.",
      "Truly rural, truly rural, truly rural.",
    ],
  },
  {
    id: "pre-meeting",
    title: "Pre-Meeting Warm-up",
    emoji: "🔥",
    kind: "freeform",
    seconds: 30,
    goal: "Thirty seconds before you join the call: say your one key message out loud, twice.",
    maxFillers: 3,
    items: [
      "State the single outcome you want from your next meeting.",
      "State your recommendation in one sentence, then justify it in one more.",
      "State what you will say if someone disagrees with you.",
    ],
  },
];

export type DrillMetrics = {
  words: number;
  seconds: number;
  wpm: number;
  fillers: number;
  fillerList: string[];
  sentences: number;
  accuracy: number | null; // read drills only, 0..1
};

export function countFillers(text: string): { count: number; found: string[] } {
  const t = ` ${text.toLowerCase().replace(/[^a-z?\s]/g, " ").replace(/\s+/g, " ")} `;
  const found: string[] = [];
  let count = 0;
  for (const f of FILLER_WORDS) {
    const needle = ` ${f.toLowerCase()} `;
    let idx = t.indexOf(needle);
    while (idx !== -1) {
      count += 1;
      if (!found.includes(f)) found.push(f);
      idx = t.indexOf(needle, idx + 1);
    }
  }
  return { count, found };
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** Longest-common-subsequence word overlap, used for read-aloud accuracy. */
export function readAccuracy(target: string, spoken: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const a = norm(target);
  const b = norm(spoken);
  if (!a.length || !b.length) return 0;
  const dp: number[] = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length] / a.length;
}

export function computeMetrics(
  drill: Drill,
  transcript: string,
  elapsedSeconds: number,
  targetText?: string,
): DrillMetrics {
  const w = words(transcript);
  const secs = Math.max(1, elapsedSeconds);
  const { count, found } = countFillers(transcript);
  const sentences = transcript.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 2).length;
  return {
    words: w.length,
    seconds: secs,
    wpm: Math.round((w.length / secs) * 60),
    fillers: count,
    fillerList: found,
    sentences,
    accuracy: drill.kind === "read" && targetText ? readAccuracy(targetText, transcript) : null,
  };
}

export type DrillVerdict = { passed: boolean; headline: string; notes: string[] };

export function judgeDrill(drill: Drill, m: DrillMetrics): DrillVerdict {
  const notes: string[] = [];
  let passed = true;

  if (m.words < 12) {
    return {
      passed: false,
      headline: "Not enough speech captured",
      notes: ["Say at least a couple of full sentences so the drill can measure you."],
    };
  }

  if (drill.maxFillers !== undefined) {
    if (m.fillers > drill.maxFillers) {
      passed = false;
      notes.push(`${m.fillers} fillers (${m.fillerList.slice(0, 4).join(", ")}) — limit is ${drill.maxFillers}. Replace them with a silent pause.`);
    } else {
      notes.push(`Fillers: ${m.fillers} — within the limit of ${drill.maxFillers}.`);
    }
  }

  if (drill.wpm) {
    const [lo, hi] = drill.wpm;
    if (m.wpm < lo) { passed = false; notes.push(`${m.wpm} wpm — too slow. Push energy up; aim for ${lo}–${hi}.`); }
    else if (m.wpm > hi) { passed = false; notes.push(`${m.wpm} wpm — too fast. Slow down and land your endings; aim for ${lo}–${hi}.`); }
    else notes.push(`${m.wpm} wpm — right in the executive band.`);
  } else {
    notes.push(`Pace: ${m.wpm} wpm.`);
  }

  if (drill.sentences) {
    const [lo, hi] = drill.sentences;
    if (m.sentences < lo || m.sentences > hi) {
      passed = false;
      notes.push(`${m.sentences} sentences detected — target is ${lo}${hi > lo ? `–${hi}` : ""}. Tighten it.`);
    } else {
      notes.push(`${m.sentences} sentences — well compressed.`);
    }
  }

  if (m.accuracy !== null) {
    const pct = Math.round(m.accuracy * 100);
    if (pct < 80) { passed = false; notes.push(`${pct}% of the line matched. Slow down and over-articulate.`); }
    else notes.push(`${pct}% match — crisp delivery.`);
  }

  return {
    passed,
    headline: passed ? "Drill passed" : "Drill missed — run it again",
    notes,
  };
}

// ---- Local-only drill history (localStorage, no backend) ----
export type DrillLog = { id: string; drillId: string; title: string; at: string; passed: boolean; wpm: number; fillers: number };
const KEY = "speaking_drill_log_v1";

export function loadDrillLog(): DrillLog[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as DrillLog[]) : [];
    return Array.isArray(arr) ? arr.slice(0, 50) : [];
  } catch { return []; }
}

export function saveDrillLog(entry: DrillLog): DrillLog[] {
  const next = [entry, ...loadDrillLog()].slice(0, 50);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function drillsDoneToday(log: DrillLog[]): number {
  const today = new Date().toDateString();
  return log.filter((l) => new Date(l.at).toDateString() === today).length;
}
