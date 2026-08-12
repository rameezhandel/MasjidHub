/**
 * IANA timezone options for the masjid forms.
 *
 * Built from the browser's own list where supported, but with guarantees the
 * browser doesn't give us: some ICU builds only list the legacy alias
 * "Asia/Calcutta", so "Asia/Kolkata" (what tz-lookup derives and users expect)
 * is pinned in explicitly, as is "UTC". Callers pass any values that must be
 * selectable (the currently-saved zone, a location-derived zone) as extras.
 */
const GUARANTEED = ['UTC', 'Asia/Kolkata'];

const FALLBACK = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
];

export function timezoneList(extras: Array<string | undefined | null> = []): string[] {
  let base: string[] = FALLBACK;
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') base = fn('timeZone');
  } catch {
    // keep fallback
  }
  const all = new Set([...base, ...GUARANTEED]);
  for (const extra of extras) {
    if (extra) all.add(extra);
  }
  return [...all].sort();
}
