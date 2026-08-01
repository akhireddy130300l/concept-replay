// Influence Speaking Gym — daily 9:00 AM ET progress email.
// Summarises ALL past speaking sessions: scores, trends, recurring weaknesses,
// filler/pace habits, and "how you should have spoken" rewrites from the latest rep.
// Auth: x-cron-secret (cron) OR a valid JWT (manual trigger by the owner).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function etHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(h);
}
function etDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type Feedback = Record<string, any> | null;
type Session = {
  id: string;
  session_date: string;
  mode: string;
  scenario_title: string;
  transcript: string;
  rounds: { opening?: string; pressure?: string; close?: string } | null;
  feedback: Feedback;
  improvement_target: string | null;
  improvement_target_met: string | null;
  main_weakness: string | null;
  completed_at: string;
};

const SCORE_KEYS = ["clarity", "structure", "confidence", "persuasion", "executive_presence"] as const;

function avg(nums: number[]): number | null {
  const v = nums.filter((n) => Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}
function sessionAvg(f: Feedback): number | null {
  if (!f?.scores) return null;
  return avg(SCORE_KEYS.map((k) => Number(f.scores[k])));
}
function fmt1(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}
function trendArrow(recent: number | null, prior: number | null): string {
  if (recent === null || prior === null) return "";
  const d = recent - prior;
  if (Math.abs(d) < 0.2) return ` <span style="color:#6b7280;">→ steady</span>`;
  return d > 0
    ? ` <span style="color:#047857;">▲ +${d.toFixed(1)}</span>`
    : ` <span style="color:#b91c1c;">▼ ${d.toFixed(1)}</span>`;
}
function topCounts(items: string[], limit: number): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const raw of items) {
    const k = raw.trim();
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
function excerpt(s: string, n = 420): string {
  const t = (s || "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function card(title: string, inner: string, accent = "#e5e7eb"): string {
  return `<div style="border:1px solid ${accent};border-radius:12px;padding:14px;margin-bottom:14px;">
    <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${esc(title)}</div>
    <div style="margin-top:8px;">${inner}</div>
  </div>`;
}
function list(items: unknown[]): string {
  const clean = (items ?? []).map(asStr).filter(Boolean);
  if (!clean.length) return `<div style="font-size:14px;color:#9ca3af;">Not enough data yet.</div>`;
  return `<ul style="margin:0 0 0 18px;padding:0;font-size:14px;color:#1f2937;">${clean
    .map((i) => `<li style="margin:5px 0;">${esc(i)}</li>`)
    .join("")}</ul>`;
}
function beforeAfter(label: string, said: string, better: string, tint: string): string {
  if (!better?.trim()) return "";
  return `<div style="margin-bottom:12px;">
    <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:5px;">${esc(label)}</div>
    ${said ? `<div style="background:#f9fafb;border-left:3px solid #d1d5db;padding:9px 11px;border-radius:6px;font-size:13px;color:#4b5563;margin-bottom:6px;"><b style="color:#6b7280;">You said:</b> ${esc(excerpt(said, 320))}</div>` : ""}
    <div style="background:${tint};border-left:3px solid #2563eb;padding:9px 11px;border-radius:6px;font-size:14px;color:#111827;"><b style="color:#1d4ed8;">You should have said:</b> ${esc(better)}</div>
  </div>`;
}

type PlanExercise = { name?: string; how?: string; minutes?: number };
type PlanDay = {
  day?: number;
  focus?: string;
  targets_mistake?: string;
  exercises?: PlanExercise[];
  total_minutes?: number;
  success_check?: string;
};

type CoachReport = {
  blunt_assessment?: string;
  biggest_mistakes?: Array<{ mistake?: string; why_it_costs_you?: string; fix?: string }>;
  pattern_bullets?: string[];
  level?: string;
  level_reason?: string;
  one_thing_today?: string;
  drills?: Array<{ name?: string; how?: string; minutes?: number }>;
  phrases_to_kill?: string[];
  phrases_to_adopt?: string[];
  next_7_days?: string[];
  weekly_plan?: PlanDay[];
};


function asStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(asStr).filter(Boolean).join(" — ");
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).map(asStr).filter(Boolean).join(" — ");
  return String(v);
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asStr).filter(Boolean) : [];
}

async function geminiCoachReport(payload: unknown, apiKey: string): Promise<CoachReport | null> {
  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "You are this person's Executive Communication Coach. Below is the JSON history of their speaking-gym sessions " +
                  "(scores, transcript excerpts, weaknesses, filler habits, pace, targets).\n\n" +
                  "BE BLUNT. No flattery, no hedging, no 'great job'. Name the mistakes directly and say what they cost the speaker " +
                  "in a real room (credibility, authority, being interrupted, not being believed). Be specific to THEIR words, quote " +
                  "their phrasing where useful. Never be cruel — be the coach who tells the truth so they improve fast.\n\n" +
                  "Return STRICT JSON only, exactly these keys:\n" +
                  `{
  "blunt_assessment": "3-5 sentences. The honest verdict on how they currently come across.",
  "biggest_mistakes": [{"mistake":"plain string","why_it_costs_you":"plain string","fix":"plain string"}],
  "pattern_bullets": ["4-6 plain strings on what is improving vs what keeps repeating across sessions"],
  "level": "one of: Beginner, Developing, Competent, Strong, Executive-ready",
  "level_reason": "one sentence justifying the level",
  "one_thing_today": "the single highest-leverage change for today's rep",
  "drills": [{"name":"plain string","how":"plain string","minutes":5}],
  "phrases_to_kill": ["plain strings they actually said that weaken them"],
  "phrases_to_adopt": ["plain strings - stronger replacements"],
  "next_7_days": ["5-7 plain strings, one focus per day"]
}\n` +
                  "Give 3-5 biggest_mistakes. Every array element must be a plain string unless the schema says an object.\n\n" +
                  JSON.stringify(payload).slice(0, 80000),
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.65, responseMimeType: "application/json", maxOutputTokens: 4096 },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as CoachReport) : null;
  } catch {
    return null;
  }
}

function renderEmail(opts: {
  sessions: Session[];
  streak: number;
  longest: number;
  coach: CoachReport | null;
  ctaUrl: string;
}): string {
  const { sessions, streak, longest, coach, ctaUrl } = opts;
  const latest = sessions[0];
  const withScores = sessions.filter((s) => sessionAvg(s.feedback) !== null);
  const overall = avg(withScores.map((s) => sessionAvg(s.feedback)!));
  const recent5 = avg(withScores.slice(0, 5).map((s) => sessionAvg(s.feedback)!));
  const prior5 = avg(withScores.slice(5, 10).map((s) => sessionAvg(s.feedback)!));

  const perDim = SCORE_KEYS.map((k) => {
    const all = withScores.map((s) => Number(s.feedback!.scores?.[k]));
    const r = avg(withScores.slice(0, 5).map((s) => Number(s.feedback!.scores?.[k])));
    const p = avg(withScores.slice(5, 10).map((s) => Number(s.feedback!.scores?.[k])));
    return { key: k, all: avg(all), recent: r, prior: p };
  });

  const fillerRecent = avg(
    sessions.slice(0, 5).map((s) => Number(s.feedback?.filler_count)).filter((n) => Number.isFinite(n)),
  );
  const fillerPrior = avg(
    sessions.slice(5, 10).map((s) => Number(s.feedback?.filler_count)).filter((n) => Number.isFinite(n)),
  );

  const weaknesses = topCounts(
    sessions.map((s) => s.main_weakness || s.feedback?.main_weakness || "").filter(Boolean),
    4,
  );
  const fixes = topCounts(
    sessions.flatMap((s) => (Array.isArray(s.feedback?.what_to_fix) ? s.feedback!.what_to_fix : [])),
    5,
  );
  const wins = topCounts(
    sessions.flatMap((s) => (Array.isArray(s.feedback?.did_well) ? s.feedback!.did_well : [])),
    4,
  );
  const targetsMet = sessions.filter((s) => (s.improvement_target_met || s.feedback?.improvement_target_met) === "met").length;

  const dimRows = perDim
    .map(
      (d) => `<tr>
        <td style="padding:6px 8px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;text-transform:capitalize;">${esc(d.key.replace(/_/g, " "))}</td>
        <td style="padding:6px 8px;font-size:13px;color:#111827;font-weight:700;border-bottom:1px solid #f3f4f6;">${fmt1(d.recent)}</td>
        <td style="padding:6px 8px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${fmt1(d.all)}${trendArrow(d.recent, d.prior)}</td>
      </tr>`,
    )
    .join("");

  const f = latest?.feedback ?? {};
  const rounds = latest?.rounds ?? {};
  const rewrites = `
    ${beforeAfter("Same content, cleaned up (Corrected)", rounds.opening ?? "", f.corrected ?? "", "#eff6ff")}
    ${beforeAfter("Natural Professional", rounds.pressure ?? "", f.natural ?? "", "#eef2ff")}
    ${beforeAfter("Executive Leader", rounds.close ?? "", f.powerful ?? "", "#ecfdf5")}
    ${f.role_style ? beforeAfter("Charismatic / in-role version", "", f.role_style, "#fefce8") : ""}
  `;

  const strongerPhrases: string[] = Array.isArray(f.stronger_phrases) ? f.stronger_phrases : [];
  const weakPhrases: string[] = Array.isArray(f.weak_phrases) ? f.weak_phrases : [];
  const phraseSwap =
    weakPhrases.length || strongerPhrases.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="width:50%;vertical-align:top;padding-right:6px;">
              <div style="font-size:12px;color:#b91c1c;font-weight:700;margin-bottom:5px;">Drop these</div>
              ${list(weakPhrases.slice(0, 5))}
            </td>
            <td style="width:50%;vertical-align:top;padding-left:6px;">
              <div style="font-size:12px;color:#047857;font-weight:700;margin-bottom:5px;">Use these instead</div>
              ${list(strongerPhrases.slice(0, 5))}
            </td>
          </tr>
        </table>`
      : "";

  // ---- blunt coaching blocks -------------------------------------------
  const mistakes = Array.isArray(coach?.biggest_mistakes) ? coach!.biggest_mistakes!.slice(0, 5) : [];
  const mistakesHtml = mistakes.length
    ? mistakes
        .map(
          (m, i) => `<div style="margin:0 0 12px 0;padding:11px 13px;background:#fff7ed;border-left:3px solid #ea580c;border-radius:8px;">
            <div style="font-size:13.5px;font-weight:700;color:#7c2d12;">${i + 1}. ${esc(asStr(m?.mistake))}</div>
            ${m?.why_it_costs_you ? `<div style="font-size:13px;color:#9a3412;margin-top:4px;line-height:1.6;"><b>What it costs you:</b> ${esc(asStr(m.why_it_costs_you))}</div>` : ""}
            ${m?.fix ? `<div style="font-size:13px;color:#065f46;margin-top:4px;line-height:1.6;"><b>Fix:</b> ${esc(asStr(m.fix))}</div>` : ""}
          </div>`,
        )
        .join("")
    : "";

  const drills = Array.isArray(coach?.drills) ? coach!.drills!.slice(0, 4) : [];
  const drillsHtml = drills.length
    ? drills
        .map(
          (d) => `<div style="margin:0 0 9px 0;font-size:13.5px;color:#1f2937;line-height:1.6;">
            <b style="color:#111827;">${esc(asStr(d?.name))}</b>${d?.minutes ? ` <span style="color:#6b7280;">· ${Number(d.minutes)} min</span>` : ""}
            <div style="color:#4b5563;">${esc(asStr(d?.how))}</div>
          </div>`,
        )
        .join("")
    : "";

  // Recent session log
  const logRows = sessions
    .slice(0, 8)
    .map((s) => {
      const a = sessionAvg(s.feedback);
      const met = (s.improvement_target_met || s.feedback?.improvement_target_met) === "met";
      const w = asStr(s.main_weakness || s.feedback?.main_weakness || "—");
      return `<tr>
        <td style="padding:6px 8px;font-size:12.5px;color:#374151;border-bottom:1px solid #f3f4f6;white-space:nowrap;">${esc(s.session_date ?? "")}</td>
        <td style="padding:6px 8px;font-size:12.5px;color:#374151;border-bottom:1px solid #f3f4f6;">${esc(s.mode ?? "")}</td>
        <td style="padding:6px 8px;font-size:12.5px;color:#111827;font-weight:700;border-bottom:1px solid #f3f4f6;">${fmt1(a)}</td>
        <td style="padding:6px 8px;font-size:12.5px;border-bottom:1px solid #f3f4f6;color:${met ? "#047857" : "#b91c1c"};">${met ? "met" : "missed"}</td>
        <td style="padding:6px 8px;font-size:12.5px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${esc(w.slice(0, 60))}</td>
      </tr>`;
    })
    .join("");
  const logHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;">
      <tr>
        ${["Date", "Mode", "Avg", "Target", "Main weakness"]
          .map((h) => `<th align="left" style="font-size:11px;color:#6b7280;text-transform:uppercase;padding:0 8px 6px;">${h}</th>`)
          .join("")}
      </tr>${logRows}</table>`;

  // Habits: pace + fillers
  const paceRecent = avg(
    sessions.slice(0, 5).map((s) => Number(s.feedback?.words_per_minute ?? s.feedback?.wpm)).filter((n) => Number.isFinite(n)),
  );
  const habitBits: string[] = [];
  if (fillerRecent !== null) habitBits.push(`Filler words per session (last 5): ${fmt1(fillerRecent)}${fillerPrior !== null ? ` (was ${fmt1(fillerPrior)})` : ""}`);
  if (paceRecent !== null) habitBits.push(`Speaking pace (last 5): ${Math.round(paceRecent)} words/min — target 130–160`);
  const paceVerdicts = topCounts(sessions.slice(0, 10).map((s) => asStr(s.feedback?.pace_verdict)).filter(Boolean), 2);
  if (paceVerdicts.length) habitBits.push(`Most common pace verdict: ${paceVerdicts[0][0]} (${paceVerdicts[0][1]}×)`);
  const modeCounts = topCounts(sessions.map((s) => asStr(s.mode)).filter(Boolean), 5);
  if (modeCounts.length) habitBits.push(`Practice mix: ${modeCounts.map(([m, c]) => `${m} ${c}×`).join(", ")}`);


  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Your Speaking Progress Report</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;padding:28px;">
        <tr><td>
          <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b7280;">Influence Speaking Gym</div>
          <h1 style="margin:6px 0 4px 0;font-size:22px;color:#111827;">Your Speaking Progress Report</h1>
          <p style="font-size:14px;color:#374151;margin:0 0 14px 0;">
            No sugar-coating. Below is exactly how you currently come across, the mistakes that keep repeating,
            and how you should have said it.
          </p>
          ${
            coach?.blunt_assessment
              ? `<div style="background:#111827;border-radius:12px;padding:16px 18px;margin:0 0 14px 0;">
                   <div style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;font-weight:700;">Straight talk from your coach</div>
                   <div style="font-size:14.5px;color:#f9fafb;line-height:1.65;margin-top:7px;">${esc(asStr(coach.blunt_assessment))}</div>
                   ${coach.level ? `<div style="margin-top:10px;font-size:13px;color:#c7d2fe;"><b>Current level: ${esc(asStr(coach.level))}</b>${coach.level_reason ? ` — ${esc(asStr(coach.level_reason))}` : ""}</div>` : ""}
                 </div>`
              : ""
          }

          <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:14px;margin-bottom:14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#374151;">Sessions completed<br/><b style="font-size:19px;color:#111827;">${sessions.length}</b></td>
                <td style="font-size:13px;color:#374151;">Current streak<br/><b style="font-size:19px;color:#111827;">${streak}</b> <span style="font-size:12px;color:#6b7280;">(best ${longest})</span></td>
                <td style="font-size:13px;color:#374151;">Avg score (last 5)<br/><b style="font-size:19px;color:#111827;">${fmt1(recent5)}</b>${trendArrow(recent5, prior5)}</td>
                <td style="font-size:13px;color:#374151;">Targets met<br/><b style="font-size:19px;color:#111827;">${targetsMet}/${sessions.length}</b></td>
              </tr>
            </table>
          </div>

          ${card(
            "Skill scores — last 5 vs all-time",
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr>
                <th align="left" style="font-size:11px;color:#6b7280;text-transform:uppercase;padding:0 8px 6px;">Skill</th>
                <th align="left" style="font-size:11px;color:#6b7280;text-transform:uppercase;padding:0 8px 6px;">Last 5</th>
                <th align="left" style="font-size:11px;color:#6b7280;text-transform:uppercase;padding:0 8px 6px;">All-time / trend</th>
              </tr>
              ${dimRows}
            </table>
            <div style="font-size:13px;color:#374151;margin-top:10px;">Overall all-time average: <b>${fmt1(overall)}</b> · Filler words per session (last 5): <b>${fmt1(fillerRecent)}</b>${trendArrow(
              fillerPrior === null || fillerRecent === null ? null : -fillerRecent,
              fillerPrior === null || fillerRecent === null ? null : -fillerPrior,
            )}</div>`,
          )}

          ${mistakesHtml ? card("Your biggest mistakes right now — ranked", mistakesHtml, "#fdba74") : ""}
          ${coach?.one_thing_today ? card("If you fix one thing today", `<div style="font-size:14.5px;color:#065f46;line-height:1.65;font-weight:600;">${esc(asStr(coach.one_thing_today))}</div>`, "#6ee7b7") : ""}

          ${coach?.pattern_bullets?.length ? card("Coach's read across all your sessions", list(strArr(coach.pattern_bullets)), "#c7d2fe") : ""}

          ${card("What keeps holding you back", list(weaknesses.map(([w, c]) => (c > 1 ? `${w} (seen in ${c} sessions)` : w))))}
          ${card("Fix list — most repeated corrections", list(fixes.map(([w, c]) => (c > 1 ? `${w} (${c}×)` : w))))}
          ${card("What you're consistently doing well", list(wins.map(([w, c]) => (c > 1 ? `${w} (${c}×)` : w))))}
          ${habitBits.length ? card("Delivery habits — fillers, pace, practice mix", list(habitBits)) : ""}
          ${card("Recent session log", logHtml)}
          ${
            coach?.phrases_to_kill?.length || coach?.phrases_to_adopt?.length
              ? card(
                  "Language upgrade — across all your sessions",
                  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="width:50%;vertical-align:top;padding-right:6px;">
                        <div style="font-size:12px;color:#b91c1c;font-weight:700;margin-bottom:5px;">Stop saying</div>
                        ${list(strArr(coach?.phrases_to_kill).slice(0, 6))}
                      </td>
                      <td style="width:50%;vertical-align:top;padding-left:6px;">
                        <div style="font-size:12px;color:#047857;font-weight:700;margin-bottom:5px;">Say this instead</div>
                        ${list(strArr(coach?.phrases_to_adopt).slice(0, 6))}
                      </td>
                    </tr>
                  </table>`,
                  "#fecaca",
                )
              : ""
          }


          ${
            latest
              ? card(
                  `How you should have spoken — ${latest.mode}: ${latest.scenario_title}`,
                  rewrites + (phraseSwap ? `<div style="margin-top:10px;">${phraseSwap}</div>` : ""),
                  "#bfdbfe",
                )
              : ""
          }

          ${
            f.hard_truth
              ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px;margin-bottom:14px;">
                  <div style="font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">🥊 Hard truth</div>
                  <div style="font-size:14px;color:#7f1d1d;margin-top:6px;">${esc(f.hard_truth)}</div>
                </div>`
              : ""
          }

          ${
            f.tomorrows_drill || f.power_habit
              ? card(
                  "Today's drill",
                  list([f.tomorrows_drill, f.power_habit].filter(Boolean) as string[]),
                  "#bbf7d0",
                )
              : ""
          }
          ${drillsHtml ? card("Drills prescribed for you", drillsHtml, "#bbf7d0") : ""}
          ${coach?.next_7_days?.length ? card("Your next 7 days — one focus per day", list(strArr(coach.next_7_days)), "#ddd6fe") : ""}

          <div style="text-align:center;margin:18px 0 6px 0;">
            <a href="${esc(ctaUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-size:15px;">Start today's session</a>
          </div>
          <div style="font-size:12px;color:#9ca3af;text-align:center;margin-top:6px;">Delivered daily at 9:00 AM Eastern.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const force = body?.force === true;

    // Resolve cron secret from vault (single source of truth), fall back to env.
    let cronSecret = "";
    try {
      const tmp = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await tmp.rpc("get_cron_secret");
      if (!error && typeof data === "string") cronSecret = data;
    } catch { /* ignore */ }
    if (!cronSecret) cronSecret = CRON_SECRET ?? "";

    const authRaw = req.headers.get("Authorization") ?? "";
    const isCron =
      !!cronSecret &&
      (req.headers.get("x-cron-secret") === cronSecret || authRaw === `Bearer ${cronSecret}`);
    let triggerUserId: string | null = null;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await anon.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      triggerUserId = userData.user.id;
    }

    // Cron runs hourly-ish; only actually send at 9 AM Eastern.
    if (isCron && !force && etHour(new Date()) !== 9) {
      return new Response(JSON.stringify({ ok: true, sent: 0, note: "Not 9 AM ET" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let recipients: Array<{ user_id: string; report_email: string }> = [];
    if (isCron) {
      const { data, error } = await admin.from("portfolio_feature_access").select("user_id, report_email");
      if (error) {
        return new Response(JSON.stringify({ error: "Recipient lookup failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipients = (data ?? []).filter((r) => !!r.report_email);
    } else if (triggerUserId) {
      const { data, error } = await admin
        .from("portfolio_feature_access")
        .select("user_id, report_email")
        .eq("user_id", triggerUserId)
        .maybeSingle();
      if (error || !data?.report_email) {
        return new Response(JSON.stringify({
          error: "Email sending is in testing mode and is only enabled for authorized accounts right now.",
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      recipients = [data];
    }

    const results: Array<{ to: string; ok: boolean; status: number | null; reason?: string }> = [];

    for (const r of recipients) {
      const { data: sessionRows } = await admin
        .from("speaking_sessions")
        .select("id, session_date, mode, scenario_title, transcript, rounds, feedback, improvement_target, improvement_target_met, main_weakness, completed_at")
        .eq("user_id", r.user_id)
        .order("completed_at", { ascending: false })
        .limit(60);

      const sessions = (sessionRows ?? []) as unknown as Session[];
      if (!sessions.length) {
        results.push({ to: r.report_email, ok: true, status: 0, reason: "no_sessions_yet" });
        continue;
      }

      const { data: state } = await admin
        .from("speaking_user_state")
        .select("current_streak, longest_streak")
        .eq("user_id", r.user_id)
        .maybeSingle();

      let coach: CoachReport | null = null;
      if (GEMINI_API_KEY) {
        coach = await geminiCoachReport(
          sessions.slice(0, 15).map((s) => ({
            date: s.session_date,
            mode: s.mode,
            scenario: s.scenario_title,
            transcript_excerpt: excerpt(s.transcript ?? "", 900),
            scores: s.feedback?.scores ?? null,
            hard_truth: s.feedback?.hard_truth ?? null,
            main_weakness: s.main_weakness ?? s.feedback?.main_weakness ?? null,
            what_to_fix: s.feedback?.what_to_fix ?? null,
            did_well: s.feedback?.did_well ?? null,
            weak_phrases: s.feedback?.weak_phrases ?? null,
            filler_count: s.feedback?.filler_count ?? null,
            words_per_minute: s.feedback?.words_per_minute ?? s.feedback?.wpm ?? null,
            pace_verdict: s.feedback?.pace_verdict ?? null,
            target: s.improvement_target,
            target_met: s.improvement_target_met ?? s.feedback?.improvement_target_met ?? null,
          })),
          GEMINI_API_KEY,
        );
      }

      const html = renderEmail({
        sessions,
        streak: state?.current_streak ?? 0,
        longest: state?.longest_streak ?? 0,
        coach,
        ctaUrl: `${APP_BASE_URL || ""}/speaking-gym`,
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Influence Gym <onboarding@resend.dev>",
          to: [r.report_email],
          subject: `Your Speaking Progress Report — ${etDate(new Date())}`,
          html,
        }),
      });
      const ok = res.status >= 200 && res.status < 300;
      results.push({ to: r.report_email, ok, status: res.status, reason: ok ? undefined : `resend_${res.status}` });
    }

    console.log(JSON.stringify({
      phase: "send_speaking_progress_email",
      recipients: recipients.length,
      sent: results.filter((x) => x.ok).length,
      statuses: results.map((x) => ({ status: x.status, ok: x.ok, reason: x.reason })),
    }));
    return new Response(JSON.stringify({ ok: true, sent: results.filter((x) => x.ok).length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.log(JSON.stringify({
      phase: "send_speaking_progress_email",
      failure_category: "uncaught",
      message: e instanceof Error ? e.message : "unknown",
    }));
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
