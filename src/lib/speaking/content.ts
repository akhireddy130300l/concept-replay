// Mirror of supabase/functions/_shared/speaking-content.ts for the frontend.
export type SpeakingMode =
  | "Sales Mode"
  | "Tech Lead Mode"
  | "Marketing Mode"
  | "Public Leader Mode"
  | "Executive Mode"
  | "Daily Charisma Mode"
  | "Friends & Jokes Mode";

export const ALL_MODES: SpeakingMode[] = [
  "Sales Mode",
  "Tech Lead Mode",
  "Marketing Mode",
  "Public Leader Mode",
  "Executive Mode",
  "Daily Charisma Mode",
  "Friends & Jokes Mode",
];

export const MODE_DESCRIPTIONS: Record<SpeakingMode, string> = {
  "Sales Mode": "Pitch ideas, explain value, handle objections, and close with confidence.",
  "Tech Lead Mode": "Explain technical topics simply, give project updates, and lead meetings.",
  "Marketing Mode": "Create excitement, explain benefits, and make ideas memorable.",
  "Public Leader Mode": "Motivational speaking, vision, and public-speaking presence.",
  "Executive Mode": "Concise updates, decisions, risks, and strategic communication.",
  "Daily Charisma Mode": "Casual confidence, storytelling, humor, and social conversation.",
  "Friends & Jokes Mode": "Playful timing, punchlines, teasing, roast-style banter, and being genuinely funny with friends.",
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

export type Scenario = {
  title: string;
  scene: string;
  your_role: string;
  audience: string;
  audience_mindset: string;
  what_just_happened: string;
  pressure: string;
  objection_or_question: string;
  your_goal: string;
  speaking_structure: string;
  your_task: string;
  success_criteria: string;
  round2_pressure_prompt: string;
  round3_close_prompt: string;
};

// Frontend scenarios — same data as shared (kept compact: list mirrors backend by id index).
// To avoid duplication maintenance pain, the frontend imports just titles + uses backend during sessions.
// We do include 1 deep scenario per mode here for fast UI rendering (daily auto-pick uses index 0).
const S = (s: Scenario) => s;

export const SCENARIOS: Record<SpeakingMode, Scenario[]> = {
  "Sales Mode": [
    S({
      title: "Pitch without pushing",
      scene: "You are in a quick conversation with a busy working professional.",
      your_role: "You are presenting your app idea.",
      audience: "Someone who is skeptical and short on time.",
      audience_mindset: "Already overloaded with apps and notifications.",
      what_just_happened: "They heard your app sends reminders and said they already get too many notifications.",
      pressure: "You have only 30 seconds before they lose interest.",
      objection_or_question: "I don't have time for another app.",
      your_goal: "Make them curious without sounding pushy.",
      speaking_structure: "Hook → Pain → Value → Proof → Soft close",
      your_task: "Give a short pitch and end with one confident next step.",
      success_criteria: "Specific outcome named, no jargon, ends with a clear soft-close ask.",
      round2_pressure_prompt: "They push back: 'Honestly, I tried three apps like this — none stuck. Why is yours different?'",
      round3_close_prompt: "Land the close. Propose one small next step they can say yes to in under 10 seconds.",
    }),
    S({
      title: "Handle the price objection",
      scene: "Late-stage sales call with a procurement-conscious buyer.",
      your_role: "Account executive.",
      audience: "Decision-maker holding the budget.",
      audience_mindset: "Cost-anchored, comparing line items.",
      what_just_happened: "You shared pricing and they paused.",
      pressure: "Any discount talk now sets a permanent ceiling.",
      objection_or_question: "It's too expensive.",
      your_goal: "Re-anchor on value, not discount.",
      speaking_structure: "Acknowledge → Reframe to ROI → Concrete proof → Confident ask",
      your_task: "Respond in 45 seconds without dropping price.",
      success_criteria: "No discount offered, ROI framed in their terms, ends with momentum.",
      round2_pressure_prompt: "They say: 'Your competitor came in 20% lower. Match it or we move on.'",
      round3_close_prompt: "Close the meeting with a next step that protects price and keeps the deal alive.",
    }),
  ],
  "Tech Lead Mode": [
    S({
      title: "Explain a production issue",
      scene: "A production issue happened and your manager asks for an update.",
      your_role: "Tech lead.",
      audience: "Non-technical manager.",
      audience_mindset: "Wants clarity and confidence, not technical detail.",
      what_just_happened: "A service failed and users were affected.",
      pressure: "Leadership wants clarity, not excuses.",
      objection_or_question: "Why did this happen and what are we doing to prevent it?",
      your_goal: "Give a calm, credible update.",
      speaking_structure: "Context → Impact → Root cause → Fix → Prevention",
      your_task: "Give a 60-second update.",
      success_criteria: "Impact quantified, cause in plain English, prevention is specific.",
      round2_pressure_prompt: "Manager asks: 'Could this happen again tomorrow? Be straight with me.'",
      round3_close_prompt: "Close with the one commitment you'll make about prevention this week.",
    }),
    S({
      title: "Push back on a deadline",
      scene: "Stakeholder sync. A target date was set without engineering input.",
      your_role: "Tech lead.",
      audience: "Product lead + GM.",
      audience_mindset: "Pressured by their own commitments upstream.",
      what_just_happened: "They announced a launch date you know is unrealistic.",
      pressure: "Saying yes burns the team. Saying no without a path makes you look weak.",
      objection_or_question: "We've already committed externally. Can you make it work?",
      your_goal: "Protect quality, propose a credible alternative.",
      speaking_structure: "Acknowledge → Risk → Tradeoff options → Recommendation",
      your_task: "Hold the line and offer a real alternative in under 60 seconds.",
      success_criteria: "No blame, concrete tradeoffs, one clear recommended path.",
      round2_pressure_prompt: "They push: 'Just give me a yes for the original date and we'll deal with risk later.'",
      round3_close_prompt: "Land your recommendation and ask for a decision in this meeting.",
    }),
  ],
  "Marketing Mode": [
    S({
      title: "Launch a new feature",
      scene: "All-hands launch announcement to users.",
      your_role: "Product marketer.",
      audience: "Users who do not immediately understand why it matters.",
      audience_mindset: "Skimming. Will tune out after 10 seconds if it sounds boring.",
      what_just_happened: "Engineering shipped a feature most users won't notice on their own.",
      pressure: "You need to make a quiet feature feel valuable.",
      objection_or_question: "Why should I care about this?",
      your_goal: "Make them feel the win, not the feature.",
      speaking_structure: "Pain → Benefit → Emotion → Memorable line",
      your_task: "Explain the feature in a way that sounds exciting and useful.",
      success_criteria: "Lead with the user's win, one memorable line, no feature-spec language.",
      round2_pressure_prompt: "A user replies: 'Cool, but I already use a workaround that does this — why switch?'",
      round3_close_prompt: "Land one memorable line they'd repeat to a friend.",
    }),
  ],
  "Public Leader Mode": [
    S({
      title: "Rally a losing team",
      scene: "Your team is losing confidence after a setback.",
      your_role: "Leader.",
      audience: "Tired team members.",
      audience_mindset: "Demoralized. Sensitive to anything that sounds like spin.",
      what_just_happened: "A major target was missed publicly.",
      pressure: "You need to rebuild belief without sounding fake.",
      objection_or_question: "Are we actually going to recover from this?",
      your_goal: "Acknowledge honestly, then point forward.",
      speaking_structure: "Acknowledge → Reframe → Vision → Action",
      your_task: "Give a short motivational message.",
      success_criteria: "Honest, hopeful, ends with one concrete next action.",
      round2_pressure_prompt: "Someone says quietly: 'We've heard pep talks before. What's actually different this time?'",
      round3_close_prompt: "Close with one specific commitment YOU will personally do this week.",
    }),
  ],
  "Executive Mode": [
    S({
      title: "60-second exec update",
      scene: "You are giving a status update to leadership.",
      your_role: "Initiative owner.",
      audience: "Senior manager.",
      audience_mindset: "Time-poor, wants signal not noise.",
      what_just_happened: "They asked for a project status.",
      pressure: "You must be brief, clear, and strategic.",
      objection_or_question: "Where are we, what's at risk, what do you need?",
      your_goal: "Give a 60-second executive update.",
      speaking_structure: "Status → Risk → Impact → Decision → Next step",
      your_task: "Deliver the update in under 60 seconds.",
      success_criteria: "One headline status, one quantified risk, one specific ask.",
      round2_pressure_prompt: "They cut in: 'Skip the details — what decision do you need from me today?'",
      round3_close_prompt: "Close with the single decision you need and by when.",
    }),
  ],
  "Daily Charisma Mode": [
    S({
      title: "Disagree without friction",
      scene: "You are having a casual conversation with a friend.",
      your_role: "You.",
      audience: "Someone you want to stay warm with.",
      audience_mindset: "Holding a view they feel pretty strongly about.",
      what_just_happened: "They stated an opinion you don't share.",
      pressure: "You disagree, but you do not want tension.",
      objection_or_question: "Don't you agree with me on this?",
      your_goal: "Disagree confidently without making it awkward.",
      speaking_structure: "Agree partially → Share view → Give reason → Stay warm",
      your_task: "Disagree confidently without making it awkward.",
      success_criteria: "Warm tone, real disagreement (not just hedging), keeps connection.",
      round2_pressure_prompt: "They push back: 'Come on — you can't really believe that.'",
      round3_close_prompt: "Close warmly. End the topic without either of you feeling judged.",
    }),
  ],
  "Friends & Jokes Mode": [
    S({
      title: "Roast a friend without hurting them",
      scene: "Weekend hangout. Your friend just did something mildly ridiculous everyone noticed.",
      your_role: "You, being the funny one.",
      audience: "3–4 close friends, already laughing.",
      audience_mindset: "Wants a punchline, not a lecture.",
      what_just_happened: "Your friend confidently mispronounced a word in front of everyone.",
      pressure: "Too soft = not funny. Too hard = mean.",
      objection_or_question: "Oh come on, it wasn't that bad — was it?",
      your_goal: "Land a punchline that gets a real laugh AND keeps them liking you.",
      speaking_structure: "Callback → Exaggerate → Punchline → Warm out",
      your_task: "Roast them in under 30 seconds. Land one clean punchline.",
      success_criteria: "Real punchline (not just a mean observation), timing lands, ends warm.",
      round2_pressure_prompt: "They fire back: 'Alright genius, do better — say something actually funny.'",
      round3_close_prompt: "Close by making yourself the joke this time so everyone stays warm.",
    }),
  ],
};


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
export function pickScenarioForMode(mode: SpeakingMode, d: Date = new Date()): Scenario {
  return todaysScenario(mode, d);
}

export type SpeakingFeedback = {
  corrected: string;
  natural: string;
  powerful: string;
  role_style: string;
  did_well: string[];
  weak_phrases: string[];
  stronger_phrases: string[];
  filler_issues: string;
  scores: {
    clarity: number;
    confidence: number;
    persuasion: number;
    structure: number;
    executive_presence: number;
  };
  tomorrows_drill: string;
  main_weakness?: string;
  improvement_target_met?: "met" | "partial" | "missed";
  target_evaluated?: string;
  meaningful_attempt?: boolean;
};
