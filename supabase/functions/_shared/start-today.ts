export interface OpportunityFieldDef {
  id: string;
  label: string;
  searchPrompt: string;
}

export const OPPORTUNITY_FIELDS: readonly OpportunityFieldDef[] = [
  { id: "money", label: "Money", searchPrompt: "emerging personal finance, new asset classes, micro-businesses, side income trends 2026" },
  { id: "career", label: "Career", searchPrompt: "fastest growing high-demand career skills, certifications, new job roles 2026" },
  { id: "technology", label: "Technology", searchPrompt: "rising practical AI tools, robotics, clean energy, biotech, everyday tech trends 2026" },
  { id: "creative", label: "Creative", searchPrompt: "rising creator economy niches, digital writing, video, design, personal brand opportunities 2026" },
  { id: "health", label: "Health & Body", searchPrompt: "evidence-based longevity, fitness, sleep, nutrition, preventive health habits rising 2026" },
  { id: "mind", label: "Mind", searchPrompt: "high-leverage cognitive skills, languages, public speaking, learning methods trending 2026" },
  { id: "life", label: "Life", searchPrompt: "modern lifestyle design, networking, travel arbitrage, real estate, community building trends 2026" },
  { id: "society", label: "Society", searchPrompt: "fast-growing global cities, policy shifts, emerging market opportunities 2026" },
  { id: "hobbies", label: "Hobbies & Craft", searchPrompt: "hands-on crafts, culinary skills, urban farming, repair, maker hobbies turning into value 2026" },
] as const;

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
      return `
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;margin-bottom:16px;">
          <div style="margin-bottom:8px;">
            <span style="display:inline-block;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;">${escapeHtml(idea.field)}</span>${badge}
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