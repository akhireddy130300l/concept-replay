// Helpers for computing reminder times in a specific IANA timezone.

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function listTimezones(): string[] {
  // @ts-ignore - supportedValuesOf may not be typed in older TS lib
  const tz: string[] | undefined = (Intl as any).supportedValuesOf?.("timeZone");
  if (tz && tz.length) return tz;
  return [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

/**
 * Get the UTC Date that represents the given local wall-clock time in `tz`
 * on the given calendar date (year/month/day in that tz).
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  // Start with the naive UTC guess, then correct by the tz offset at that moment.
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = getTimezoneOffsetMs(new Date(guess), tz);
  // local = utc + offset  =>  utc = local - offset
  return new Date(guess - offsetMs);
}

/** Offset in ms: localTime - utcTime for the given instant in tz. */
export function getTimezoneOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/**
 * Compute the next revision UTC Date: take `now`, add `daysFromNow` days
 * in the user's tz, then set the wall-clock time to hour:minute in that tz.
 * If the resulting time is in the past (e.g. daysFromNow = 0 and time passed),
 * push it to the next day.
 */
export function nextRevisionInstant(
  now: Date,
  daysFromNow: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  // Get year/month/day of "now" as observed in tz.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let y = get("year");
  let m = get("month");
  let d = get("day");
  // Add days by using a UTC date as a calendar carrier (calendar math is tz-agnostic for date-only).
  const cal = new Date(Date.UTC(y, m - 1, d));
  cal.setUTCDate(cal.getUTCDate() + daysFromNow);
  let instant = zonedTimeToUtc(
    cal.getUTCFullYear(),
    cal.getUTCMonth() + 1,
    cal.getUTCDate(),
    hour,
    minute,
    tz,
  );
  if (instant.getTime() <= now.getTime()) {
    cal.setUTCDate(cal.getUTCDate() + 1);
    instant = zonedTimeToUtc(
      cal.getUTCFullYear(),
      cal.getUTCMonth() + 1,
      cal.getUTCDate(),
      hour,
      minute,
      tz,
    );
  }
  return instant;
}

export function formatInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}
