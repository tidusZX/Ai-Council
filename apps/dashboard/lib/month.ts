/**
 * Heuristic — convert a monthLabel like "May 2026", "May", or "2026-05"
 * into a 'YYYY-MM' string suitable for Scheduled Date prefix matching.
 * Returns null when the label is too ambiguous (caller should treat as
 * "all months").
 *
 * Used by /api/planner/run to filter listOccupiedSlots by month.
 *
 * Exported so it can be unit-tested without spinning up Next.
 */
const MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
}

export function monthLabelToYYYYMM(label: string | undefined): string | null {
  if (!label) return null
  const trimmed = label.trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed
  const m = trimmed.toLowerCase().match(/^([a-z]+)(?:\s+(\d{4}))?$/)
  if (!m) return null
  const mm = MONTHS[m[1]]
  if (!mm) return null
  const yyyy = m[2] ?? String(new Date().getFullYear())
  return `${yyyy}-${mm}`
}
