// Indian Law Daily — one non-repeating law lesson per day at 6:00 PM Eastern.
// Includes: today's law (with real-world examples + loophole/misuse notes),
// a short recap of the previously learned law, advocate-grade English terms,
// and a "path to Supreme Court lawyer" progress panel.
// Auth: x-cron-secret / Bearer CRON_SECRET (cron) OR a valid JWT (manual trigger).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function etHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
}
function etDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ---------------------------------------------------------------- curriculum
// Ordered syllabus mirroring how Indian law is actually taught (foundation ->
// procedure -> specialised). Gemini writes the lesson; this keeps the sequence
// deterministic and guarantees no repeats.
const CURRICULUM: Array<{ key: string; law: string; section: string; category: string; difficulty: string }> = [
  { key: "coi-art-14", law: "Constitution of India", section: "Article 14", category: "Constitutional Law", difficulty: "Foundation" },
  { key: "coi-art-19", law: "Constitution of India", section: "Article 19", category: "Constitutional Law", difficulty: "Foundation" },
  { key: "coi-art-21", law: "Constitution of India", section: "Article 21", category: "Constitutional Law", difficulty: "Foundation" },
  { key: "coi-art-32", law: "Constitution of India", section: "Article 32", category: "Constitutional Law", difficulty: "Foundation" },
  { key: "coi-art-226", law: "Constitution of India", section: "Article 226", category: "Constitutional Law", difficulty: "Foundation" },
  { key: "coi-art-136", law: "Constitution of India", section: "Article 136 (SLP)", category: "Constitutional Law", difficulty: "Core" },
  { key: "coi-art-141-142", law: "Constitution of India", section: "Articles 141 & 142", category: "Constitutional Law", difficulty: "Core" },
  { key: "bns-s103", law: "Bharatiya Nyaya Sanhita, 2023", section: "Section 103 (Murder)", category: "Criminal Law", difficulty: "Core" },
  { key: "bns-s105", law: "Bharatiya Nyaya Sanhita, 2023", section: "Section 105 (Culpable homicide not amounting to murder)", category: "Criminal Law", difficulty: "Core" },
  { key: "bns-s115-117", law: "Bharatiya Nyaya Sanhita, 2023", section: "Sections 115–117 (Hurt & grievous hurt)", category: "Criminal Law", difficulty: "Core" },
  { key: "bns-s318", law: "Bharatiya Nyaya Sanhita, 2023", section: "Section 318 (Cheating)", category: "Criminal Law", difficulty: "Core" },
  { key: "bns-s316", law: "Bharatiya Nyaya Sanhita, 2023", section: "Section 316 (Criminal breach of trust)", category: "Criminal Law", difficulty: "Core" },
  { key: "bns-s85", law: "Bharatiya Nyaya Sanhita, 2023", section: "Section 85 (Cruelty to a married woman)", category: "Criminal Law", difficulty: "Core" },
  { key: "bnss-s173", law: "Bharatiya Nagarik Suraksha Sanhita, 2023", section: "Section 173 (FIR / information in cognizable cases)", category: "Criminal Procedure", difficulty: "Core" },
  { key: "bnss-s35", law: "Bharatiya Nagarik Suraksha Sanhita, 2023", section: "Section 35 (Arrest without warrant)", category: "Criminal Procedure", difficulty: "Core" },
  { key: "bnss-s187", law: "Bharatiya Nagarik Suraksha Sanhita, 2023", section: "Section 187 (Police custody / remand)", category: "Criminal Procedure", difficulty: "Core" },
  { key: "bnss-s480-483", law: "Bharatiya Nagarik Suraksha Sanhita, 2023", section: "Sections 480–483 (Bail)", category: "Criminal Procedure", difficulty: "Core" },
  { key: "bnss-s528", law: "Bharatiya Nagarik Suraksha Sanhita, 2023", section: "Section 528 (Inherent powers of the High Court)", category: "Criminal Procedure", difficulty: "Advanced" },
  { key: "bsa-s3-4", law: "Bharatiya Sakshya Adhiniyam, 2023", section: "Sections 3–4 (Relevancy of facts)", category: "Evidence", difficulty: "Core" },
  { key: "bsa-s23", law: "Bharatiya Sakshya Adhiniyam, 2023", section: "Section 23 (Confessions to police)", category: "Evidence", difficulty: "Core" },
  { key: "bsa-s61-63", law: "Bharatiya Sakshya Adhiniyam, 2023", section: "Sections 61–63 (Electronic evidence)", category: "Evidence", difficulty: "Advanced" },
  { key: "bsa-s104-105", law: "Bharatiya Sakshya Adhiniyam, 2023", section: "Sections 104–105 (Burden of proof)", category: "Evidence", difficulty: "Core" },
  { key: "ica-s10", law: "Indian Contract Act, 1872", section: "Section 10 (What agreements are contracts)", category: "Contract Law", difficulty: "Foundation" },
  { key: "ica-s2h", law: "Indian Contract Act, 1872", section: "Section 2(h) & offer/acceptance", category: "Contract Law", difficulty: "Foundation" },
  { key: "ica-s16", law: "Indian Contract Act, 1872", section: "Section 16 (Undue influence)", category: "Contract Law", difficulty: "Core" },
  { key: "ica-s23", law: "Indian Contract Act, 1872", section: "Section 23 (Unlawful consideration & object)", category: "Contract Law", difficulty: "Core" },
  { key: "ica-s73-74", law: "Indian Contract Act, 1872", section: "Sections 73–74 (Damages & liquidated damages)", category: "Contract Law", difficulty: "Core" },
  { key: "cpc-o7r11", law: "Code of Civil Procedure, 1908", section: "Order VII Rule 11 (Rejection of plaint)", category: "Civil Procedure", difficulty: "Core" },
  { key: "cpc-s9", law: "Code of Civil Procedure, 1908", section: "Section 9 (Jurisdiction of civil courts)", category: "Civil Procedure", difficulty: "Core" },
  { key: "cpc-o39", law: "Code of Civil Procedure, 1908", section: "Order XXXIX (Temporary injunctions)", category: "Civil Procedure", difficulty: "Core" },
  { key: "cpc-s11", law: "Code of Civil Procedure, 1908", section: "Section 11 (Res judicata)", category: "Civil Procedure", difficulty: "Advanced" },
  { key: "limitation-1963", law: "Limitation Act, 1963", section: "Sections 3 & 5 (Limitation and condonation of delay)", category: "Civil Procedure", difficulty: "Core" },
  { key: "specific-relief-s10", law: "Specific Relief Act, 1963", section: "Section 10 (Specific performance)", category: "Civil Law", difficulty: "Advanced" },
  { key: "it-act-s66", law: "Information Technology Act, 2000", section: "Sections 66 & 66C (Computer offences, identity theft)", category: "Cyber Law", difficulty: "Core" },
  { key: "it-act-s79", law: "Information Technology Act, 2000", section: "Section 79 (Intermediary safe harbour)", category: "Cyber Law", difficulty: "Advanced" },
  { key: "ni-act-s138", law: "Negotiable Instruments Act, 1881", section: "Section 138 (Cheque dishonour)", category: "Commercial Law", difficulty: "Core" },
  { key: "consumer-2019", law: "Consumer Protection Act, 2019", section: "Sections 2(7), 34, 35 (Consumer, jurisdiction, complaints)", category: "Consumer Law", difficulty: "Core" },
  { key: "companies-s149", law: "Companies Act, 2013", section: "Sections 149 & 166 (Directors' duties)", category: "Corporate Law", difficulty: "Advanced" },
  { key: "ibc-s7-9", law: "Insolvency and Bankruptcy Code, 2016", section: "Sections 7 & 9 (Initiating CIRP)", category: "Insolvency", difficulty: "Advanced" },
  { key: "arbitration-s34", law: "Arbitration and Conciliation Act, 1996", section: "Section 34 (Setting aside an award)", category: "Arbitration", difficulty: "Advanced" },
  { key: "hma-s13", law: "Hindu Marriage Act, 1955", section: "Section 13 & 13B (Divorce, mutual consent)", category: "Family Law", difficulty: "Core" },
  { key: "dv-act-2005", law: "Protection of Women from Domestic Violence Act, 2005", section: "Sections 12, 18–22 (Reliefs)", category: "Family Law", difficulty: "Core" },
  { key: "hsa-s6", law: "Hindu Succession Act, 1956", section: "Section 6 (Coparcenary rights of daughters)", category: "Family Law", difficulty: "Core" },
  { key: "labour-id-act", law: "Industrial Disputes Act, 1947", section: "Sections 2A & 25F (Retrenchment)", category: "Labour Law", difficulty: "Core" },
  { key: "rti-2005", law: "Right to Information Act, 2005", section: "Sections 6, 7, 8 (Requests and exemptions)", category: "Public Law", difficulty: "Foundation" },
  { key: "pmla-s3-45", law: "Prevention of Money Laundering Act, 2002", section: "Sections 3 & 45 (Offence and twin bail conditions)", category: "Economic Offences", difficulty: "Advanced" },
  { key: "ndps-s37", law: "NDPS Act, 1985", section: "Section 37 (Bail restrictions)", category: "Criminal Law", difficulty: "Advanced" },
  { key: "sc-st-act", law: "SC/ST (Prevention of Atrocities) Act, 1989", section: "Sections 3 & 18 (Offences, anticipatory bail bar)", category: "Criminal Law", difficulty: "Advanced" },
  { key: "posh-2013", law: "POSH Act, 2013", section: "Sections 4, 9, 11 (ICC, complaints, inquiry)", category: "Employment Law", difficulty: "Core" },
  { key: "juvenile-justice", law: "Juvenile Justice (Care and Protection) Act, 2015", section: "Sections 15 & 18 (Heinous offences, trial as adult)", category: "Criminal Law", difficulty: "Advanced" },
  { key: "transfer-property-s53a", law: "Transfer of Property Act, 1882", section: "Section 53A (Part performance)", category: "Property Law", difficulty: "Advanced" },
  { key: "registration-s17", law: "Registration Act, 1908", section: "Section 17 (Compulsory registration)", category: "Property Law", difficulty: "Core" },
  { key: "advocates-act", law: "Advocates Act, 1961", section: "Sections 24, 30, 35 (Enrolment, right to practise, misconduct)", category: "Professional Ethics", difficulty: "Core" },
  { key: "contempt-1971", law: "Contempt of Courts Act, 1971", section: "Sections 2, 12 (Civil & criminal contempt)", category: "Professional Ethics", difficulty: "Core" },
  { key: "coi-art-368", law: "Constitution of India", section: "Article 368 & Basic Structure doctrine", category: "Constitutional Law", difficulty: "Advanced" },
];

// Path to becoming a Supreme Court lawyer (India) — used for the pending panel.
const ROADMAP: Array<{ stage: string; detail: string }> = [
  { stage: "Law degree (LL.B.)", detail: "3-year LL.B. after graduation, or 5-year integrated BA/BBA LL.B. from a BCI-recognised college. Non-negotiable." },
  { stage: "State Bar Council enrolment", detail: "Enrol under Section 24, Advocates Act 1961 with your State Bar Council after the degree." },
  { stage: "All India Bar Examination (AIBE)", detail: "Clear AIBE to get the Certificate of Practice; until then enrolment alone doesn't let you practise." },
  { stage: "Litigation apprenticeship", detail: "1–3 years under a senior advocate — drafting, filing, court craft, client conferences." },
  { stage: "Trial & High Court practice", detail: "Argue real matters: bail, injunctions, 482/528 petitions, writs. This is where advocacy is actually built." },
  { stage: "Supreme Court practice", detail: "Any enrolled advocate may appear in the SC; drafting/filing needs an Advocate-on-Record (AoR)." },
  { stage: "Advocate-on-Record (AoR) exam", detail: "4 years' practice + 1 year training under an AoR, then clear the SC's AoR exam. This is the real gate." },
  { stage: "Senior Advocate designation", detail: "Designated by the SC/HC under Section 16, Advocates Act — typically 10+ years of distinguished practice." },
];

type Feedback = Record<string, unknown>;

type GeminiResult =
  | { ok: true; lesson: Record<string, any> }
  | { ok: false; reason: string; status: number | null };

async function geminiJSONOnce(apiKey: string, prompt: string): Promise<GeminiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: "application/json", maxOutputTokens: 4096 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      console.log(JSON.stringify({ phase: "gemini", status: res.status, body }));
      const reason = res.status === 429 ? "gemini_rate_limited" : res.status >= 500 ? "gemini_upstream_error" : "gemini_http_error";
      return { ok: false, reason, status: res.status };
    }
    const j = await res.json();
    const text: string = j?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
    const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      return { ok: true, lesson: JSON.parse(cleaned) };
    } catch {
      console.log(JSON.stringify({ phase: "gemini", error: "parse_failed", preview: cleaned.slice(0, 200) }));
      return { ok: false, reason: "gemini_parse_failed", status: 200 };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.log(JSON.stringify({ phase: "gemini", error: msg }));
    return { ok: false, reason: msg.includes("abort") ? "gemini_timeout" : "gemini_network_error", status: null };
  } finally {
    clearTimeout(timer);
  }
}

// Up to 3 attempts; only retry transient failures (429 / 5xx / timeout / network).
async function geminiJSON(apiKey: string, prompt: string): Promise<GeminiResult> {
  const retryable = new Set(["gemini_rate_limited", "gemini_upstream_error", "gemini_timeout", "gemini_network_error"]);
  let last: GeminiResult = { ok: false, reason: "gemini_not_attempted", status: null };
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await geminiJSONOnce(apiKey, prompt);
    console.log(JSON.stringify({ phase: "gemini_attempt", attempt, ok: last.ok, reason: last.ok ? null : last.reason }));
    if (last.ok || !retryable.has(last.reason)) return last;
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 4000));
  }
  return last;
}

// Deterministic lesson body used when Gemini is unavailable, so a day is never skipped.
function fallbackLesson(topic: typeof CURRICULUM[number], prevLawName: string | null): Record<string, any> {
  return {
    headline: `${topic.law} — ${topic.section}: today's provision, delivered without AI commentary.`,
    plain_explanation:
      `Today's scheduled topic is ${topic.section} of the ${topic.law} (${topic.category}, ${topic.difficulty} level). ` +
      `The AI drafting service was unavailable when this email was generated, so this edition carries the syllabus entry only. ` +
      `Read the bare provision from a reliable source (India Code or the official gazette text) and note the elements it requires. ` +
      `Tomorrow's edition resumes the full lesson, and this topic will be re-issued in expanded form once drafting succeeds.`,
    bare_provision_gist: `Refer to the official text of ${topic.section}, ${topic.law}.`,
    ingredients: [],
    examples: [],
    landmark_cases: [],
    loopholes_and_misuse: [],
    how_lawyers_argue: "",
    english_terms: [],
    recap: prevLawName ? `Previously covered: ${prevLawName}.` : "This is your first lesson.",
    fallback: true,
  };
}


function buildPrompt(topic: typeof CURRICULUM[number], prevLawName: string | null, lessonNumber: number) {
  return `You are a Senior Advocate of the Supreme Court of India teaching a motivated self-learner (not a law student) one law per day.

TODAY'S TOPIC (do not change it): ${topic.law} — ${topic.section} (${topic.category}).
This is lesson number ${lessonNumber} for the learner.
${prevLawName ? `Previously learned law (for the recap section): ${prevLawName}.` : "This is their first lesson; the recap should welcome them and explain how Indian law is structured."}

Return STRICT JSON only, no markdown, with EXACTLY these keys:
{
  "headline": "one-line plain-English statement of what this law does",
  "plain_explanation": "150-220 words, simple English, no jargon dumping",
  "bare_provision_gist": "a faithful paraphrase of what the provision actually says (do NOT fabricate exact statutory text)",
  "ingredients": ["3-6 elements that must be proved/satisfied"],
  "examples": [{"title": "short label", "facts": "a concrete everyday Indian scenario, 2-3 sentences", "outcome": "how the law applies and the likely legal result"}],
  "landmark_cases": [{"case": "case name", "principle": "one-line ratio"}],
  "loopholes_and_misuse": ["3-5 items. EACH ITEM MUST BE A PLAIN STRING (never an object), written as: the loophole/misuse in practice — then the safeguard or counter-argument, separated by an em dash"],
  "how_lawyers_argue": "3-4 sentences showing how an advocate would actually argue this in court, in courtroom register",
  "english_terms": [{"term": "legal/English term", "meaning": "plain meaning", "used_in_a_sentence": "an advocate-style sentence using it"}],
  "practice_question": "one applied question the learner should answer mentally",
  "recap": {"law": "${prevLawName ?? "Introduction"}", "summary": "60-90 word refresher of the previously learned law", "one_line_test": "one quick recall question on it"}
}

RULES:
- Indian law only. Reflect the new criminal codes (BNS/BNSS/BSA, 2023) where relevant and mention the old IPC/CrPC/Evidence Act equivalent in brackets.
- Give 3 examples and 2-3 landmark cases. Only cite cases you are confident are real; never invent citations or paragraph numbers.
- 5-7 english_terms, mixing legal Latin/terms of art with the fluent English advocates actually use.
- Be precise and practical, like you are training a junior who will one day argue in the Supreme Court.`;
}

// ---------------------------------------------------------------- rendering
function renderEmail(o: {
  topic: typeof CURRICULUM[number];
  lesson: Record<string, any>;
  lessonNumber: number;
  totalTopics: number;
  categoriesCovered: string[];
  ctaUrl: string;
}): string {
  const { topic, lesson, lessonNumber, totalTopics, categoriesCovered, ctaUrl } = o;
  const card = (title: string, body: string, accent = "#e5e7eb") =>
    `<div style="border:1px solid ${accent};border-radius:12px;padding:14px 16px;margin:0 0 14px 0;">
       <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:8px;">${esc(title)}</div>
       ${body}
     </div>`;
  const p = (t: string) => `<div style="font-size:14px;line-height:1.65;color:#1f2937;">${esc(t)}</div>`;
  const list = (items: string[]) =>
    `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.65;color:#1f2937;">${items
      .map((i) => `<li style="margin:5px 0;">${esc(i)}</li>`)
      .join("")}</ul>`;

  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

  // Gemini sometimes returns objects instead of strings inside string arrays.
  // Flatten any shape into readable text so we never print "[object Object]".
  const toText = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(" — ");
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const label = ["point", "loophole", "issue", "misuse", "title", "name", "text", "description", "gap"]
        .map((k) => o[k]).find((x) => typeof x === "string" && x.trim());
      const fix = ["safeguard", "counter", "counter_argument", "counterArgument", "remedy", "response", "solution", "explanation", "detail"]
        .map((k) => o[k]).find((x) => typeof x === "string" && x.trim());
      if (label || fix) return [label, fix].filter(Boolean).map((s) => String(s).trim()).join(" — ");
      return Object.values(o).map(toText).filter(Boolean).join(" — ");
    }
    return String(v);
  };
  const strList = (v: unknown): string[] => arr(v).map(toText).filter(Boolean);

  const examplesHtml = arr(lesson.examples)
    .map(
      (e: any) => `<div style="margin:0 0 12px 0;padding:10px 12px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:6px;">
        <div style="font-size:13px;font-weight:700;color:#111827;">${esc(e?.title)}</div>
        <div style="font-size:13.5px;color:#374151;margin-top:4px;line-height:1.6;">${esc(e?.facts)}</div>
        <div style="font-size:13.5px;color:#1e3a8a;margin-top:6px;line-height:1.6;"><b>Result:</b> ${esc(e?.outcome)}</div>
      </div>`,
    )
    .join("");

  const casesHtml = arr(lesson.landmark_cases)
    .map(
      (c: any) =>
        `<div style="margin:6px 0;font-size:13.5px;color:#1f2937;line-height:1.6;"><b style="color:#111827;">${esc(c?.case)}</b> — ${esc(c?.principle)}</div>`,
    )
    .join("");

  const termsHtml = arr(lesson.english_terms)
    .map(
      (t: any) => `<div style="margin:0 0 10px 0;">
        <div style="font-size:13.5px;font-weight:700;color:#111827;">${esc(t?.term)}</div>
        <div style="font-size:13.5px;color:#374151;line-height:1.6;">${esc(t?.meaning)}</div>
        <div style="font-size:13px;color:#4338ca;font-style:italic;line-height:1.6;margin-top:2px;">“${esc(t?.used_in_a_sentence)}”</div>
      </div>`,
    )
    .join("");

  const recap = lesson.recap ?? {};
  const pct = Math.round((lessonNumber / totalTopics) * 100);

  const roadmapHtml = ROADMAP.map(
    (r, i) => `<div style="margin:0 0 9px 0;font-size:13.5px;line-height:1.6;">
      <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#111827;color:#fff;text-align:center;font-size:11px;line-height:20px;font-weight:700;">${i + 1}</span>
      <b style="color:#111827;"> ${esc(r.stage)}</b>
      <div style="color:#4b5563;margin-left:26px;">${esc(r.detail)}</div>
    </div>`,
  ).join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Indian Law Daily</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:22px 0;">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;background:#ffffff;border-radius:16px;padding:26px;">
<tr><td>
  <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#6b7280;font-weight:700;">Indian Law Daily · Lesson ${lessonNumber}</div>
  <h1 style="margin:6px 0 2px 0;font-size:22px;color:#111827;line-height:1.3;">${esc(topic.law)}</h1>
  <div style="font-size:15px;color:#4338ca;font-weight:700;">${esc(topic.section)}</div>
  <div style="font-size:12px;color:#6b7280;margin-top:4px;">${esc(topic.category)} · ${esc(topic.difficulty)}</div>
  <div style="margin:14px 0 18px 0;font-size:15px;color:#111827;line-height:1.6;font-weight:600;">${esc(lesson.headline)}</div>

  ${card("Recap — what you learned last time", `${p(String(recap.summary ?? ""))}<div style="margin-top:8px;font-size:13px;color:#b45309;"><b>Quick test:</b> ${esc(recap.one_line_test ?? "")}</div>`, "#fde68a")}

  ${card("What this law says", p(String(lesson.bare_provision_gist ?? "")))}
  ${card("In plain English", p(String(lesson.plain_explanation ?? "")))}
  ${card("Ingredients that must be proved", list(strList(lesson.ingredients)))}
  ${card("Worked examples", examplesHtml)}
  ${card("Landmark cases", casesHtml)}
  ${card("Loopholes, misuse & the counter-argument", list(strList(lesson.loopholes_and_misuse)), "#fecaca")}
  ${card("How an advocate argues this in court", p(String(lesson.how_lawyers_argue ?? "")))}
  ${card("Advocate's English — terms to start using", termsHtml, "#c7d2fe")}
  ${card("Today's practice question", p(String(lesson.practice_question ?? "")))}

  ${card(
    "Your progress",
    `<div style="font-size:13.5px;color:#1f2937;line-height:1.6;">Lesson <b>${lessonNumber}</b> of ${totalTopics} in the core syllabus (${pct}%).</div>
     <div style="height:8px;background:#e5e7eb;border-radius:99px;margin:8px 0;"><div style="height:8px;width:${pct}%;background:#4338ca;border-radius:99px;"></div></div>
     <div style="font-size:12.5px;color:#6b7280;">Areas covered so far: ${esc(categoriesCovered.join(", ") || topic.category)}</div>`,
  )}

  ${card("What's still pending to become a Supreme Court lawyer", roadmapHtml, "#bbf7d0")}

  <div style="font-size:12.5px;color:#6b7280;line-height:1.6;margin-top:6px;">
    Reality check: reading one law a day builds the doctrine, but the AoR route needs a law degree, Bar enrolment, AIBE, and years of real court practice. This email builds the knowledge layer — the qualification layer is on you.
  </div>

  <div style="text-align:center;margin:20px 0 4px 0;">
    <a href="${esc(ctaUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:14.5px;">Open dashboard</a>
  </div>
  <div style="font-size:11.5px;color:#9ca3af;text-align:center;margin-top:10px;">Educational content only — not legal advice. Verify provisions before relying on them.</div>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

    if (!RESEND_API_KEY || !GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Email or AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    // Vault is the single source of truth for CRON_SECRET; env is the fallback.
    let cronSecret = "";
    try {
      const tmp = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await tmp.rpc("get_cron_secret");
      if (!error && typeof data === "string") cronSecret = data;
    } catch { /* ignore */ }
    if (!cronSecret) cronSecret = CRON_SECRET ?? "";
    const isCron = !!cronSecret && (req.headers.get("x-cron-secret") === cronSecret || bearer === cronSecret);

    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* no body */ }
    const force = body?.force === true;

    let triggerUserId: string | null = null;
    if (!isCron) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: u, error: uErr } = await anon.auth.getUser();
      if (uErr || !u?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      triggerUserId = u.user.id;
    }

    const now = new Date();
    // Cron runs twice (DST-safe); only send at 18:00 ET.
    if (isCron && !force && etHour(now) !== 18) {
      return new Response(JSON.stringify({ ok: true, skipped: "not_6pm_et", et_hour: etHour(now) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let recipients: Array<{ user_id: string; report_email: string }> = [];
    if (isCron) {
      const { data } = await admin.from("portfolio_feature_access").select("user_id, report_email");
      recipients = (data ?? []).filter((r: any) => !!r.report_email);
    } else if (triggerUserId) {
      const { data } = await admin
        .from("portfolio_feature_access")
        .select("user_id, report_email")
        .eq("user_id", triggerUserId)
        .maybeSingle();
      if (!data?.report_email) {
        return new Response(JSON.stringify({ error: "Email sending is enabled for authorized accounts only." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipients = [data as any];
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "No authorized recipients." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = etDate(now);
    const ctaUrl = `${APP_BASE_URL || ""}/dashboard`;
    const results: any[] = [];

    for (const r of recipients) {
      // Already sent today?
      const { data: todays } = await admin
        .from("law_daily_lessons")
        .select("id")
        .eq("user_id", r.user_id)
        .eq("lesson_date", today)
        .not("sent_at", "is", null)
        .maybeSingle();
      if (todays && !force) {
        results.push({ to: r.report_email, ok: true, skipped: "already_sent_today" });
        continue;
      }

      // History -> next non-repeated topic.
      const { data: past } = await admin
        .from("law_daily_lessons")
        .select("topic_key, law_name, section_ref, category, content, created_at")
        .eq("user_id", r.user_id)
        .order("created_at", { ascending: false });
      const history = past ?? [];
      const seen = new Set(history.map((h: any) => h.topic_key));
      const topic = CURRICULUM.find((c) => !seen.has(c.key));
      if (!topic) {
        results.push({ to: r.report_email, ok: true, skipped: "syllabus_complete" });
        continue;
      }

      const prev = history[0] as any | undefined;
      const prevLawName = prev ? `${prev.law_name} — ${prev.section_ref ?? ""}`.trim() : null;
      const lessonNumber = history.length + 1;

      const lesson = await geminiJSON(GEMINI_API_KEY, buildPrompt(topic, prevLawName, lessonNumber));
      if (!lesson) {
        results.push({ to: r.report_email, ok: false, reason: "gemini_failed" });
        continue;
      }

      const categoriesCovered = Array.from(new Set([...history.map((h: any) => h.category).filter(Boolean), topic.category]));
      const html = renderEmail({ topic, lesson, lessonNumber, totalTopics: CURRICULUM.length, categoriesCovered, ctaUrl });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Indian Law Daily <onboarding@resend.dev>",
          to: [r.report_email],
          subject: `Law ${lessonNumber}: ${topic.law} — ${topic.section}`,
          html,
        }),
      });
      const ok = res.status >= 200 && res.status < 300;

      if (ok) {
        await admin.from("law_daily_lessons").upsert(
          {
            user_id: r.user_id,
            lesson_date: today,
            topic_key: topic.key,
            law_name: topic.law,
            section_ref: topic.section,
            category: topic.category,
            difficulty: topic.difficulty,
            content: lesson,
            english_terms: lesson.english_terms ?? [],
            sent_at: new Date().toISOString(),
          },
          { onConflict: "user_id,topic_key" },
        );
      }
      results.push({ to: r.report_email, ok, status: res.status, topic: topic.key, lessonNumber });
    }

    return new Response(JSON.stringify({ ok: true, sent: results.filter((x) => x.ok && !x.skipped).length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.log(JSON.stringify({ phase: "law_lesson_email", error: e instanceof Error ? e.message : "unknown" }));
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
