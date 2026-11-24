export interface OpportunityFieldDef {
  id: string;
  label: string;
  searchPrompt: string;
  worldAngles: readonly string[];
}

export const OPPORTUNITY_FIELDS: readonly OpportunityFieldDef[] = [
  {
    id: "money",
    label: "Money",
    searchPrompt: "emerging personal finance, micro-businesses, boring profitable local services, side income, niche franchises, new asset classes worldwide 2026",
    worldAngles: [
      "underserved small local service businesses and micro-franchises booming 2026",
      "niche B2B solo businesses, cash-flow micro-acquisitions, and side hustles worldwide 2026",
      "emerging personal finance, alternative yields, and global consumer spending shifts 2026",
    ],
  },
  {
    id: "career",
    label: "Career",
    searchPrompt: "fastest growing high-demand career skills, niche certifications, solo consulting, skilled trades, new job roles worldwide 2026",
    worldAngles: [
      "high-income skilled trades, technical certifications, and shortage professions 2026",
      "emerging specialist job roles and fractional consulting niches worldwide 2026",
      "cross-industry hybrid career skills companies struggle to hire for 2026",
    ],
  },
  {
    id: "technology",
    label: "Technology",
    searchPrompt: "rising practical AI workflows, robotics, clean energy, biotech, hardware niches, everyday tech businesses worldwide 2026",
    worldAngles: [
      "practical AI automation services for traditional small businesses 2026",
      "clean energy, home electrification, drones, and robotics service niches 2026",
      "micro-SaaS, niche developer tools, and open-source hardware opportunities 2026",
    ],
  },
  {
    id: "creative",
    label: "Creative",
    searchPrompt: "rising creator economy niches, digital writing, short-form video, niche newsletters, design, audio, indie publishing worldwide 2026",
    worldAngles: [
      "niche media, local newsletters, and specialized B2B content studios 2026",
      "indie digital products, templates, 3D assets, and design micro-studios 2026",
      "storytelling, podcasting, and visual production skills in high demand 2026",
    ],
  },
  {
    id: "health",
    label: "Health & Body",
    searchPrompt: "evidence-based longevity, mobility, sleep, preventive health, metabolic fitness, wellness micro-businesses rising worldwide 2026",
    worldAngles: [
      "preventive health, biomarker tracking, and longevity habits gaining traction 2026",
      "strength, mobility, recovery, and specialized coaching niches 2026",
      "functional food, fermentation, sleep optimization, and everyday wellness practices 2026",
    ],
  },
  {
    id: "mind",
    label: "Mind",
    searchPrompt: "high-leverage cognitive skills, negotiation, languages, public speaking, synthesis, learning methods trending worldwide 2026",
    worldAngles: [
      "persuasion, negotiation, executive communication, and live facilitation skills 2026",
      "high-value languages, cross-cultural fluency, and rapid skill acquisition 2026",
      "deep focus, decision-making frameworks, and research synthesis habits 2026",
    ],
  },
  {
    id: "life",
    label: "Life",
    searchPrompt: "modern lifestyle design, community building, local events, travel arbitrage, real estate niches, intentional living worldwide 2026",
    worldAngles: [
      "third-place communities, supper clubs, and local micro-event businesses 2026",
      "house hacking, co-living, mid-term rentals, and creative real estate niches 2026",
      "global mobility, remote lifestyle design, and high-trust personal networks 2026",
    ],
  },
  {
    id: "society",
    label: "Society",
    searchPrompt: "fast-growing global cities, demographic shifts, aging population services, policy tailwinds, emerging market opportunities 2026",
    worldAngles: [
      "aging population services, elder-tech, and caregiving businesses booming 2026",
      "fast-growing global cities, climate adaptation, and infrastructure tailwinds 2026",
      "new regulations, sustainability mandates, and compliance niches creating demand 2026",
    ],
  },
  {
    id: "hobbies",
    label: "Hobbies & Craft",
    searchPrompt: "hands-on crafts, specialty food, urban farming, repair economy, woodworking, restoration, maker businesses worldwide 2026",
    worldAngles: [
      "repair economy, restoration, and custom fabrication micro-businesses 2026",
      "specialty culinary crafts, micro-bakeries, coffee roasting, and urban farming 2026",
      "bespoke woodworking, leathercraft, ceramics, and tactile maker hobbies 2026",
    ],
  },
] as const;

export type OpportunityStage = "early_wave" | "inflection_point" | "evergreen";

export interface KickstartStep {
  day: number;
  title: string;
  done: boolean;
}

export interface StageBadgeMeta {
  label: string;
  bg: string;
  color: string;
}

export function getStageBadgeMeta(stage?: string | null): StageBadgeMeta {
  if (stage === "inflection_point") {
    return { label: "Inflection Point", bg: "#fef3c7", color: "#92400e" };
  }
  if (stage === "evergreen") {
    return { label: "Evergreen Skill", bg: "#e0f2fe", color: "#075985" };
  }
  return { label: "Early Wave", bg: "#dcfce7", color: "#166534" };
}

export function selectFieldSearchQuery(field: OpportunityFieldDef, dateIso: string): string {
  const parsed = new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
  const epochDays = Math.floor(parsed.getTime() / 86_400_000);
  const idx = ((epochDays % field.worldAngles.length) + field.worldAngles.length) % field.worldAngles.length;
  return field.worldAngles[idx] ?? field.searchPrompt;
}

export function buildFallbackKickstartPlan(topic: string, firstStep: string): KickstartStep[] {
  return [
    { day: 1, title: firstStep.slice(0, 140), done: false },
    { day: 2, title: `Watch or read one 15-minute beginner walkthrough on ${topic}.`, done: false },
    { day: 3, title: `List 3 real people or small businesses already succeeding with ${topic}.`, done: false },
    { day: 4, title: `Try a tiny hands-on test or sample exercise for ${topic} (15 mins).`, done: false },
    { day: 5, title: `Write down the biggest obstacle you noticed and look up one fix.`, done: false },
    { day: 6, title: `Share one question or takeaway in a community focused on ${topic}.`, done: false },
    { day: 7, title: `Review your week and decide your next 30-day goal for ${topic}.`, done: false },
  ];
}

export type EmailQuickAction = "start" | "later" | "not_for_me" | "focus";

export interface ActionTokenPayload {
  uid: string;
  iid: string;
  act: EmailQuickAction;
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

export async function signStartTodayActionToken(
  payload: Omit<ActionTokenPayload, "exp">,
  secret: string,
  ttlSeconds = 14 * 86_400,
): Promise<string> {
  const full: ActionTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await hmacSign(body, secret);
  return `${body}.${sig}`;
}

export async function verifyStartTodayActionToken(
  token: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<ActionTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = await hmacSign(body, secret);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as ActionTokenPayload;
    if (!parsed.uid || !parsed.iid || !parsed.act || typeof parsed.exp !== "number") return null;
    if (parsed.exp < nowSec) return null;
    if (!["start", "later", "not_for_me", "focus"].includes(parsed.act)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface DailyFieldPick {
  field: OpportunityFieldDef;
  isWildcard: boolean;
}

export function normalizeTopicKey(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function deduplicateIdeas<T extends { topic: string }>(
  candidates: T[],
  existingKeys: ReadonlySet<string>,
): T[] {
  const seen = new Set<string>(existingKeys);
  const unique: T[] = [];
  for (const item of candidates) {
    const key = normalizeTopicKey(item.topic);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function selectDailyFields(
  dateIso: string,
  preferredLabels: string[] = [],
): DailyFieldPick[] {
  const parsed = new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
  const epochDays = Math.floor(parsed.getTime() / 86_400_000);
  const startIdx = ((epochDays * 3) % OPPORTUNITY_FIELDS.length + OPPORTUNITY_FIELDS.length) % OPPORTUNITY_FIELDS.length;
  const picks: OpportunityFieldDef[] = [
    OPPORTUNITY_FIELDS[startIdx],
    OPPORTUNITY_FIELDS[(startIdx + 1) % OPPORTUNITY_FIELDS.length],
    OPPORTUNITY_FIELDS[(startIdx + 2) % OPPORTUNITY_FIELDS.length],
  ];
  const isWildcardDay = parsed.getUTCDay() === 0; // Sunday
  if (isWildcardDay && preferredLabels.length > 0) {
    const prefSet = new Set(preferredLabels.map((l) => l.toLowerCase()));
    const pickedIds = new Set([picks[0].id, picks[1].id]);
    const outsider = OPPORTUNITY_FIELDS.find(
      (f) => !pickedIds.has(f.id) && !prefSet.has(f.label.toLowerCase()),
    );
    if (outsider) picks[2] = outsider;
  }
  return picks.map((field, idx) => ({ field, isWildcard: isWildcardDay && idx === 2 }));
}

export const MILESTONE_DAYS = [30, 90, 365] as const;

export function getDueMilestone(
  startedAtIso: string | null | undefined,
  now: Date,
  lastMilestoneSent: number,
): number | null {
  if (!startedAtIso) return null;
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) return null;
  const elapsedDays = Math.floor((now.getTime() - startedMs) / 86_400_000);
  let due: number | null = null;
  for (const milestone of MILESTONE_DAYS) {
    if (elapsedDays >= milestone && milestone > lastMilestoneSent) {
      due = milestone;
    }
  }
  return due;
}

export interface OpportunitySource {
  title: string;
  url: string;
}

export interface OpportunityEmailItem {
  id?: string;
  field: string;
  topic: string;
  why_rising: string;
  five_year_vision: string;
  real_examples: string[];
  first_step: string;
  difficulty: string;
  cost_estimate: string;
  time_estimate: string;
  sources: OpportunitySource[];
  is_wildcard: boolean;
  opportunity_stage?: OpportunityStage;
  actionLinks?: {
    startUrl: string;
    laterUrl: string;
    passUrl: string;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildStartTodayEmailHtml(
  ideas: OpportunityEmailItem[],
  appUrl: string,
  dateLabel: string,
): string {
  const cards = ideas
    .map((idea) => {
      const stageMeta = getStageBadgeMeta(idea.opportunity_stage);
      const stageBadge = `<span style="display:inline-block;background:${stageMeta.bg};color:${stageMeta.color};font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;margin-left:6px;">${escapeHtml(stageMeta.label)}</span>`;
      const badge = idea.is_wildcard
        ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;margin-left:6px;">WILD CARD</span>`
        : "";
      const examplesHtml = idea.real_examples.length
        ? `<p style="margin:8px 0 0;font-size:13px;color:#334155;"><strong>Who's already doing it:</strong> ${idea.real_examples.map(escapeHtml).join(" · ")}</p>`
        : "";
      const sourcesHtml = idea.sources.length
        ? `<p style="margin:10px 0 0;font-size:12px;color:#64748b;"><strong>Sources:</strong> ${idea.sources
            .slice(0, 3)
            .map((s) => `<a href="${escapeHtml(s.url)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(s.title)}</a>`)
            .join(" · ")}</p>`
        : "";
      const actionsHtml = idea.actionLinks
        ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;">
            <a href="${escapeHtml(idea.actionLinks.startUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;margin-right:6px;margin-bottom:6px;">Start Today</a>
            <a href="${escapeHtml(idea.actionLinks.laterUrl)}" style="display:inline-block;background:#f1f5f9;color:#0f172a;text-decoration:none;font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;margin-right:6px;margin-bottom:6px;">Save for Later</a>
            <a href="${escapeHtml(idea.actionLinks.passUrl)}" style="display:inline-block;background:#ffffff;color:#64748b;border:1px solid #cbd5e1;text-decoration:none;font-size:12px;font-weight:600;padding:7px 13px;border-radius:999px;margin-bottom:6px;">Pass</a>
          </div>`
        : "";
      return `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;margin-bottom:16px;">
          <div style="margin-bottom:8px;">
            <span style="display:inline-block;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;">${escapeHtml(idea.field)}</span>${stageBadge}${badge}
          </div>
          <h2 style="margin:0 0 8px;font-size:18px;color:#0f172a;">${escapeHtml(idea.topic)}</h2>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#1e293b;"><strong>Why it's rising:</strong> ${escapeHtml(idea.why_rising)}</p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#1e293b;"><strong>5 years from now:</strong> ${escapeHtml(idea.five_year_vision)}</p>
          ${examplesHtml}
          <div style="margin-top:12px;background:#f8fafc;border-left:3px solid #2563eb;padding:10px 12px;border-radius:8px;">
            <p style="margin:0;font-size:13px;color:#0f172a;"><strong>15-minute first step today:</strong> ${escapeHtml(idea.first_step)}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#475569;">Difficulty: ${escapeHtml(idea.difficulty)} · Cost: ${escapeHtml(idea.cost_estimate)} · Time: ${escapeHtml(idea.time_estimate)}</p>
          </div>
          ${sourcesHtml}
          ${actionsHtml}
        </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2563eb;">Start Today · Future Regret Radar</p>
      <h1 style="margin:0 0 6px;font-size:24px;color:#0f172a;">3 Rising Opportunities for ${escapeHtml(dateLabel)}</h1>
      <p style="margin:0 0 18px;font-size:14px;color:#475569;">Anyone can learn or start anything. Pick one small step today so 5 years from now you say "I did" instead of "I wish I had."</p>
      ${cards}
      <div style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(appUrl)}/start-today" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Mark Started, Later, or Ask Anything</a>
      </div>
      <p style="margin:12px 0 0;font-size:11px;color:#64748b;text-align:center;">Educational ideas grounded in current public signals — never guaranteed returns and separate from your stock picks.</p>
    </div>
  </body></html>`;
}

export interface MilestoneEmailItem {
  topic: string;
  field: string;
  milestoneDays: number;
  checkInCount: number;
}

export function buildMilestoneEmailHtml(items: MilestoneEmailItem[], appUrl: string): string {
  const rows = items
    .map(
      (item) => `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin-bottom:12px;">
        <span style="display:inline-block;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;">${item.milestoneDays} DAYS</span>
        <span style="font-size:12px;color:#64748b;margin-left:8px;">${escapeHtml(item.field)}</span>
        <h2 style="margin:8px 0 4px;font-size:17px;color:#0f172a;">${escapeHtml(item.topic)}</h2>
        <p style="margin:0;font-size:13px;color:#475569;">You started this ${item.milestoneDays} days ago and logged ${item.checkInCount} progress check-in${item.checkInCount === 1 ? "" : "s"}.</p>
      </div>`,
    )
    .join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <div style="max-width:600px;margin:0 auto;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#16a34a;">Look How Far You Came</p>
      <h1 style="margin:0 0 14px;font-size:23px;color:#0f172a;">You replaced "I should have" with "I did"</h1>
      ${rows}
      <div style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(appUrl)}/start-today" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Log a Check-In</a>
      </div>
    </div>
  </body></html>`;
}

export interface SundayFocusItem {
  topic: string;
  field: string;
  completedSteps: number;
  totalSteps: number;
  checkInCount: number;
  isWeeklyFocus: boolean;
  focusUrl?: string;
}

export function buildSundayFocusEmailHtml(
  activeItems: SundayFocusItem[],
  appUrl: string,
  dateLabel: string,
): string {
  const rows = activeItems.length
    ? activeItems
        .map((item) => {
          const focusTag = item.isWeeklyFocus
            ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;margin-left:6px;">CURRENT FOCUS</span>`
            : "";
          const btn = item.focusUrl
            ? `<div style="margin-top:10px;"><a href="${escapeHtml(item.focusUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;padding:7px 14px;border-radius:999px;">Lock as Focus of the Week</a></div>`
            : "";
          return `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:16px 18px;margin-bottom:14px;">
            <div>
              <span style="display:inline-block;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;">${escapeHtml(item.field)}</span>${focusTag}
            </div>
            <h2 style="margin:8px 0 4px;font-size:17px;color:#0f172a;">${escapeHtml(item.topic)}</h2>
            <p style="margin:0;font-size:13px;color:#475569;">7-Day Roadmap: ${item.completedSteps}/${item.totalSteps} days done · ${item.checkInCount} check-in${item.checkInCount === 1 ? "" : "s"}</p>
            ${btn}
          </div>`;
        })
        .join("")
    : `<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:14px;">
        <p style="margin:0;font-size:14px;color:#475569;">You haven't marked an idea as Started yet. Open Start Today to pick one small 15-minute step for this week.</p>
      </div>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2563eb;">Start Today · Sunday Focus Edition</p>
      <h1 style="margin:0 0 6px;font-size:24px;color:#0f172a;">Lock In Your 1 Focus for the Week (${escapeHtml(dateLabel)})</h1>
      <p style="margin:0 0 18px;font-size:14px;color:#475569;">No new idea overload on Sundays. Review what you've started and pick one thing to push forward this week.</p>
      ${rows}
      <div style="text-align:center;margin:20px 0;">
        <a href="${escapeHtml(appUrl)}/start-today" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">Open Start Today Dashboard</a>
      </div>
    </div>
  </body></html>`;
}