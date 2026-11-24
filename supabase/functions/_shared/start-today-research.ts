import {
  buildFallbackKickstartPlan,
  type KickstartStep,
  type OpportunitySource,
  type OpportunityStage,
} from "./start-today.ts";

export interface ResearchedOpportunity {
  field: string;
  topic: string;
  why_rising: string;
  five_year_vision: string;
  real_examples: string[];
  first_step: string;
  difficulty: "Beginner" | "Moderate" | "Challenging";
  cost_estimate: string;
  time_estimate: string;
  signals: string[];
  opportunity_stage: OpportunityStage;
  sources: OpportunitySource[];
}

export async function searchWebSignals(query: string, numResults = 5): Promise<OpportunitySource[]> {
  const exaKey = Deno.env.get("EXA_API_KEY");
  if (!exaKey) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": exaKey },
      body: JSON.stringify({
        query,
        numResults,
        type: "auto",
        useAutoprompt: true,
        contents: { highlights: { numSentences: 2 } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .filter((r: { url?: string; title?: string }) => typeof r?.url === "string" && r.url.startsWith("http"))
      .map((r: { title?: string; url: string }) => ({
        title: (r.title || r.url).slice(0, 120),
        url: r.url,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const IDEA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "field",
    "topic",
    "why_rising",
    "five_year_vision",
    "real_examples",
    "first_step",
    "difficulty",
    "cost_estimate",
    "time_estimate",
    "signals",
    "opportunity_stage",
  ],
  properties: {
    field: { type: "string" },
    topic: { type: "string" },
    why_rising: { type: "string" },
    five_year_vision: { type: "string" },
    real_examples: { type: "array", items: { type: "string" } },
    first_step: { type: "string" },
    difficulty: { type: "string", enum: ["Beginner", "Moderate", "Challenging"] },
    cost_estimate: { type: "string" },
    time_estimate: { type: "string" },
    signals: { type: "array", items: { type: "string" } },
    opportunity_stage: { type: "string", enum: ["early_wave", "inflection_point", "evergreen"] },
  },
} as const;

export async function synthesizeOpportunity(params: {
  fieldLabel: string;
  focusPrompt: string;
  sources: OpportunitySource[];
  avoidTopics: string[];
  isWildcard?: boolean;
}): Promise<ResearchedOpportunity> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const sourcesList = params.sources.length
    ? params.sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})`).join("\n")
    : "No live web links returned; ground only in well-established 2025-2026 public trends and state clearly what to verify.";

  const avoidText = params.avoidTopics.length
    ? `Do NOT repeat or closely paraphrase any of these already-sent topics:\n- ${params.avoidTopics.slice(-40).join("\n- ")}`
    : "No prior topics yet.";

  const systemText = [
    "You are the 'Start Today' Future Regret Radar researcher.",
    "Core belief: anyone can learn or start anything regardless of current job or background.",
    "Search broadly across the entire world — small overlooked local businesses, niche trades, micro-SaaS, creative studios, health habits, emerging skills, community ventures, and global shifts — never limit yourself to only big mainstream headlines.",
    "Return one concrete, specific, actionable opportunity that people who start today will be glad they started 3-10 years from now.",
    "Assign opportunity_stage honestly: 'early_wave' (1-3 years ahead of mainstream), 'inflection_point' (surging right now — prime window), or 'evergreen' (timeless compounding skill).",
    "Never promise guaranteed money or investment returns. Keep financial ideas strictly educational.",
    "Keep every field concise, vivid, honest about difficulty/cost/time, and immediately actionable in 15 minutes today.",
  ].join(" ");

  const userText = [
    `Field: ${params.fieldLabel}${params.isWildcard ? " (WEEKLY WILD CARD — pick something surprising and eye-opening)" : ""}`,
    `Focus: ${params.focusPrompt}`,
    avoidText,
    `Current public signals:\n${sourcesList}`,
  ].join("\n\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      reasoning: { effort: "low" },
      max_output_tokens: 1200,
      input: [
        { role: "system", content: systemText },
        { role: "user", content: userText },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "start_today_opportunity",
          strict: true,
          schema: IDEA_JSON_SCHEMA,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${errText.slice(0, 240)}`);
  }

  const payload = await res.json();
  const outputText =
    typeof payload?.output_text === "string"
      ? payload.output_text
      : payload?.output?.find((o: { type?: string }) => o.type === "message")?.content?.[0]?.text ?? "";

  const parsed = JSON.parse(outputText) as Omit<ResearchedOpportunity, "sources">;
  return {
    ...parsed,
    field: params.fieldLabel,
    sources: params.sources.slice(0, 4),
  };
}

const KICKSTART_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "title"],
        properties: {
          day: { type: "integer" },
          title: { type: "string" },
        },
      },
    },
  },
} as const;

export async function generateKickstartRoadmap(params: {
  topic: string;
  firstStep: string;
  field: string;
}): Promise<KickstartStep[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return buildFallbackKickstartPlan(params.topic, params.firstStep);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning: { effort: "low" },
        max_output_tokens: 700,
        input: [
          {
            role: "system",
            content:
              "Create a practical 7-day kickstart micro-plan where each day takes 15 minutes or less. Day 1 must be the provided first step. Keep each step short (under 110 characters), concrete, and beginner-friendly.",
          },
          {
            role: "user",
            content: `Field: ${params.field}\nTopic: ${params.topic}\nDay 1 first step: ${params.firstStep}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "kickstart_roadmap",
            strict: true,
            schema: KICKSTART_JSON_SCHEMA,
          },
        },
      }),
    });
    if (!res.ok) return buildFallbackKickstartPlan(params.topic, params.firstStep);
    const payload = await res.json();
    const outputText =
      typeof payload?.output_text === "string"
        ? payload.output_text
        : payload?.output?.find((o: { type?: string }) => o.type === "message")?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(outputText) as { steps?: Array<{ day: number; title: string }> };
    if (!Array.isArray(parsed.steps) || parsed.steps.length < 7) {
      return buildFallbackKickstartPlan(params.topic, params.firstStep);
    }
    return parsed.steps.slice(0, 7).map((s, idx) => ({
      day: idx + 1,
      title: String(s.title).slice(0, 140),
      done: false,
    }));
  } catch {
    return buildFallbackKickstartPlan(params.topic, params.firstStep);
  }
}