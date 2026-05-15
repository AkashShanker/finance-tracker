/**
 * Timezone-aware date utilities.
 * All "today" calculations use the household's configured timezone
 * so dates don't shift when the browser is in a different zone.
 */

const DEFAULT_TIMEZONE = "America/New_York";

/**
 * Get today's date string (YYYY-MM-DD) in the given timezone.
 */
export function getTodayString(timezone?: string): string {
  const tz = timezone || DEFAULT_TIMEZONE;
  const now = new Date();
  // Format in the target timezone to get the correct local date
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // en-CA gives YYYY-MM-DD format
  return parts;
}

/**
 * Get today as a Date object (midnight local) in the given timezone.
 */
export function getToday(timezone?: string): Date {
  const dateStr = getTodayString(timezone);
  return new Date(dateStr + "T00:00:00");
}

/**
 * Parse a YYYY-MM-DD string into a Date at local midnight.
 * Avoids the UTC interpretation bug of new Date("YYYY-MM-DD").
 */
export function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

/**
 * Common US timezone options for the settings dropdown.
 */
export const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "America/Puerto_Rico", label: "Atlantic (AT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Central Europe (CET)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Tokyo", label: "Japan (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];
