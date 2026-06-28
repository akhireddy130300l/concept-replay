// Shared content for Influence Speaking Gym.
// Used by both the email function and (mirrored in) the frontend.

export type SpeakingMode =
  | "Sales Mode"
  | "Tech Lead Mode"
  | "Marketing Mode"
  | "Public Leader Mode"
  | "Executive Mode"
  | "Daily Charisma Mode";

export const ALL_MODES: SpeakingMode[] = [
  "Sales Mode",
  "Tech Lead Mode",
  "Marketing Mode",
  "Public Leader Mode",
  "Executive Mode",
  "Daily Charisma Mode",
];

export const MODE_DESCRIPTIONS: Record<SpeakingMode, string> = {
  "Sales Mode": "Pitch ideas, explain value, handle objections, and close with confidence.",
  "Tech Lead Mode": "Explain technical topics simply, give project updates, and lead meetings.",
  "Marketing Mode": "Create excitement, explain benefits, and make ideas memorable.",
  "Public Leader Mode": "Motivational speaking, vision, and public-speaking presence.",
  "Executive Mode": "Concise updates, decisions, risks, and strategic communication.",
  "Daily Charisma Mode": "Casual confidence, storytelling, humor, and social conversation.",
};

export const WARMUPS: string[] = [
  "I will speak clearly, calmly, and confidently.",
  "I will organize my thoughts before speaking.",
  "I will sound natural, not memorized.",
  "My voice carries the weight of someone who has thought this through.",
  "I will pause where it matters and land each idea.",
  "I will lead the room with steady energy.",
  "I will be brief, specific, and useful.",
  "I will speak like the person making the decision.",
];

type Scenario = { title: string; prompt: string };

export const SCENARIOS: Record<SpeakingMode, Scenario[]> = {
  "Sales Mode": [
    { title: "Pitch without pushing", prompt: "Convince someone why your app is useful without sounding pushy. Lead with one specific outcome it delivers." },
    { title: "Handle the price objection", prompt: "A prospect says 'It's too expensive.' Respond confidently in 45 seconds — re-anchor on value, not discount." },
    { title: "Close the meeting", prompt: "End a sales call by proposing a clear next step. Be direct, optimistic, and specific about timing." },
    { title: "Differentiate fast", prompt: "In 30 seconds, explain how your offering is different from the obvious alternative — without trashing the competitor." },
  ],
  "Tech Lead Mode": [
    { title: "Explain a production issue", prompt: "Explain a production incident to a non-technical manager in simple, confident language. Cover impact, cause, and fix." },
    { title: "Push back on a deadline", prompt: "Tell a stakeholder the deadline is unrealistic. Stay collaborative, propose a credible alternative." },
    { title: "Defend the architecture", prompt: "Justify a technical decision (e.g. choosing a queue over direct calls) to a skeptical senior engineer in under a minute." },
    { title: "Weekly project update", prompt: "Give a 60-second standup-style update: what shipped, what's blocked, what's next. No filler." },
  ],
  "Marketing Mode": [
    { title: "Launch a new feature", prompt: "Promote a new feature in a way that sounds exciting and useful, not gimmicky. Lead with the user's win." },
    { title: "Reposition an old product", prompt: "Re-introduce an existing product to a new audience. Make it sound fresh and relevant in 45 seconds." },
    { title: "One-line value prop", prompt: "Craft and deliver a single sentence that captures who it's for, what it does, and why it matters." },
    { title: "Tell a customer story", prompt: "Tell a 60-second story about a customer who used your product and what changed for them." },
  ],
  "Public Leader Mode": [
    { title: "Rally a losing team", prompt: "Give a short motivational message to a team that is losing confidence. Be honest, hopeful, and specific." },
    { title: "Cast a vision", prompt: "Describe where the team will be 12 months from now and why it matters. Speak in vivid, concrete terms." },
    { title: "Open a town hall", prompt: "Open a company-wide meeting with energy and clarity. Set the tone in 45 seconds." },
    { title: "Address a setback", prompt: "Acknowledge a public failure or missed target without losing the room. Own it, then point forward." },
  ],
  "Executive Mode": [
    { title: "60-second project update", prompt: "Give a 60-second update about project status, risks, and next steps for an executive audience." },
    { title: "Decision with tradeoffs", prompt: "Recommend one of two options and explain the tradeoff in plain language. Be decisive." },
    { title: "Explain a risk", prompt: "Explain a business risk to the board. Quantify it, frame the mitigation, avoid jargon." },
    { title: "Quarterly priorities", prompt: "State the three priorities for the next quarter and why these three, not others. 60 seconds max." },
  ],
  "Daily Charisma Mode": [
    { title: "Story about your weekend", prompt: "Tell a short story about your weekend in an interesting way. Have a small arc — setup, twist, landing." },
    { title: "Make a small thing memorable", prompt: "Take an ordinary moment from this week and tell it like it mattered. Keep it under a minute." },
    { title: "Warm intro of yourself", prompt: "Introduce yourself to a stranger at a dinner. Likeable, curious, not a résumé." },
    { title: "Disagree without friction", prompt: "Disagree with someone in a casual conversation without making it tense. Stay warm." },
  ],
};

// Deterministic daily rotation across modes/scenarios/warm-ups.
export function dayOfYear(d: Date = new Date()): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start;
  return Math.floor(diff / 86400000);
}

export function todaysMode(d: Date = new Date()): SpeakingMode {
  return ALL_MODES[dayOfYear(d) % ALL_MODES.length];
}

export function todaysScenario(mode: SpeakingMode, d: Date = new Date()): Scenario {
  const list = SCENARIOS[mode];
  return list[dayOfYear(d) % list.length];
}

export function todaysWarmups(d: Date = new Date()): string[] {
  const i = dayOfYear(d);
  return [WARMUPS[i % WARMUPS.length], WARMUPS[(i + 3) % WARMUPS.length], WARMUPS[(i + 5) % WARMUPS.length]];
}
