/**
 * Asia/Colombo time helper utilities.
 * Sri Lanka Standard Time is UTC +05:30 with no daylight saving time.
 */

export const COLOMBO_OFFSET_MINUTES = 330; // 5.5 hours

export function getNowUTC(): string {
  return new Date().toISOString();
}

/**
 * Returns date formatted in Asia/Colombo time zone
 */
export function formatColomboTime(dateInput?: string | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
}

/**
 * Returns the start of the Sri Lankan local day (00:00:00 SLST) in UTC ISO format.
 */
export function getStartOfColomboDayUTC(offsetDays = 0): string {
  const now = new Date();
  // Adjust to SLST
  const slTime = new Date(now.getTime() + COLOMBO_OFFSET_MINUTES * 60 * 1000);
  slTime.setUTCDate(slTime.getUTCDate() + offsetDays);
  slTime.setUTCHours(0, 0, 0, 0);
  // Shift back to UTC
  const utcStart = new Date(slTime.getTime() - COLOMBO_OFFSET_MINUTES * 60 * 1000);
  return utcStart.toISOString();
}
