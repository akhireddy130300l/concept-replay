// Influence Speaking Gym — deep scenarios + daily rotation.
// Source of truth for both edge functions and the frontend (mirrored in src/lib/speaking/content.ts).

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

export const SCENARIOS: Record<SpeakingMode, Scenario[]> = {
  "Sales Mode": [
    {
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
    },
    {
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
    },
    {
      title: "Differentiate fast",
      scene: "Hallway conversation at a conference.",
      your_role: "Founder.",
      audience: "Prospect who already uses your obvious competitor.",
      audience_mindset: "Polite but not looking to switch.",
      what_just_happened: "They asked what you do.",
      pressure: "You have 30 seconds. Trashing the competitor will lose them.",
      objection_or_question: "How is this different from <competitor>?",
      your_goal: "Make them lean in without disparaging anyone.",
      speaking_structure: "Reframe category → One sharp difference → Outcome → Invitation",
      your_task: "30-second differentiation. Stay generous about the competitor.",
      success_criteria: "One crisp difference named, no negative framing, ends with curiosity hook.",
      round2_pressure_prompt: "They probe: 'Sounds similar to what they already do — what would I notice in week one?'",
      round3_close_prompt: "Invite them to one specific next step that costs them almost nothing.",
    },
  ],
  "Tech Lead Mode": [
    {
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
    },
    {
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
    },
    {
      title: "Defend the architecture",
      scene: "Architecture review with a skeptical senior engineer.",
      your_role: "Owning architect.",
      audience: "Principal engineer who already has a preferred design.",
      audience_mindset: "Pattern-matching against past failures.",
      what_just_happened: "You proposed a queue between two services.",
      pressure: "Lose this debate and the design changes.",
      objection_or_question: "Why not just call the service directly?",
      your_goal: "Defend the choice on merits, not authority.",
      speaking_structure: "Constraint → Failure modes avoided → Tradeoffs acknowledged → Confidence",
      your_task: "Justify the decision in under a minute.",
      success_criteria: "Names a real failure mode, acknowledges cost, lands with confidence.",
      round2_pressure_prompt: "They counter: 'You're adding operational burden for a problem we don't have yet.'",
      round3_close_prompt: "Close with the decision criteria you'd accept to revisit this in 6 months.",
    },
  ],
  "Marketing Mode": [
    {
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
    },
    {
      title: "Reposition an old product",
      scene: "Repositioning meeting. The product hasn't grown in a year.",
      your_role: "Marketing lead.",
      audience: "Skeptical execs who've seen the metrics flatline.",
      audience_mindset: "Half-checked-out, expecting buzzwords.",
      what_just_happened: "Growth has stalled and a competitor is gaining.",
      pressure: "If this doesn't land, the budget gets cut.",
      objection_or_question: "Is this just a rebrand?",
      your_goal: "Make the same product sound urgent for a new audience.",
      speaking_structure: "New audience → New pain → Same product, sharper promise → Proof",
      your_task: "Re-introduce the product in 45 seconds.",
      success_criteria: "Specific new audience named, sharper promise, no vague adjectives.",
      round2_pressure_prompt: "Exec asks: 'What changes in the product, or is this just words?'",
      round3_close_prompt: "Close with the one campaign you'd ship next week to test this.",
    },
  ],
  "Public Leader Mode": [
    {
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
    },
    {
      title: "Address a setback in public",
      scene: "Company-wide town hall after a high-profile miss.",
      your_role: "Senior leader.",
      audience: "The whole company plus probably some investors.",
      audience_mindset: "Watching for accountability vs. excuses.",
      what_just_happened: "A miss became public news.",
      pressure: "Spin will destroy your credibility. Silence will destroy morale.",
      objection_or_question: "Who is responsible and what changes now?",
      your_goal: "Own it cleanly, then point forward.",
      speaking_structure: "Own it → Name the lesson → Concrete change → Forward energy",
      your_task: "60 seconds, no spin, no blame.",
      success_criteria: "Personal ownership, specific lesson, concrete change, hopeful close.",
      round2_pressure_prompt: "An employee asks: 'Will anyone actually be held accountable?'",
      round3_close_prompt: "Land the close: what should the company tell their families tonight?",
    },
  ],
  "Executive Mode": [
    {
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
    },
    {
      title: "Decision with tradeoffs",
      scene: "Steering committee. Two viable paths, both costly.",
      your_role: "Recommender.",
      audience: "C-suite.",
      audience_mindset: "Will respect a clear recommendation; will lose interest in waffle.",
      what_just_happened: "Two options were presented; they want your call.",
      pressure: "Hedging signals you're not ready to lead.",
      objection_or_question: "Which one and why?",
      your_goal: "Recommend decisively and own the tradeoff.",
      speaking_structure: "Recommendation → Why → Tradeoff named → What you'll do if wrong",
      your_task: "Recommend one option in under a minute.",
      success_criteria: "Clear pick, tradeoff named honestly, contingency stated.",
      round2_pressure_prompt: "CEO challenges: 'What would change your recommendation?'",
      round3_close_prompt: "Close by asking for the green light and naming when you'll re-check.",
    },
  ],
  "Daily Charisma Mode": [
    {
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
    },
    {
      title: "Make a small thing memorable",
      scene: "Casual dinner. Someone asked how your week was.",
      your_role: "You, being interesting on demand.",
      audience: "A small group half-listening.",
      audience_mindset: "Open to a good story, allergic to monologues.",
      what_just_happened: "They asked the boring 'how's it going' question.",
      pressure: "Default answers ('busy, you?') kill the energy.",
      objection_or_question: "How was your week?",
      your_goal: "Turn an ordinary moment into a small, sticky story.",
      speaking_structure: "Setup → Detail → Small twist → Land",
      your_task: "Tell it like it mattered. Under a minute.",
      success_criteria: "One vivid detail, a small twist, lands cleanly without overstaying.",
      round2_pressure_prompt: "Someone teases: 'That's it? There has to be more.'",
      round3_close_prompt: "Close with one line that makes them want to share their week too.",
    },
  ],
  "Friends & Jokes Mode": [
    {
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
    },
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
