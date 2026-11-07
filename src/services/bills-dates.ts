export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatISODateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Yearly anchor: the date's day of the year in the leap reference year 2000
 * (1..366), so the same month/day always maps to the same anchor whatever the
 * year. Using the real year would drift a day around Feb 29.
 */
export function getDayOfYear(dateStr: string): number {
  const [, m, d] = dateStr.split('-').map(Number);
  const start = Date.UTC(2000, 0, 1);
  const current = Date.UTC(2000, m - 1, d);
  return Math.floor((current - start) / 86400000) + 1;
}

/**
 * Computes the next due date strictly after `date` based on cadence and anchor_day.
 * Works exclusively with UTC YYYY-MM-DD strings.
 */
export function nextDueAfter(
  date: string,
  cadence: 'weekly' | 'monthly' | 'yearly',
  anchor_day: number
): string {
  const [y, m, d] = date.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');

  if (cadence === 'weekly') {
    const current = new Date(Date.UTC(y, m - 1, d));
    const currentDay = current.getUTCDay(); // 0 = Sunday .. 6 = Saturday
    let diff = (anchor_day - currentDay + 7) % 7;
    if (diff === 0) diff = 7;
    const nextD = new Date(current.getTime() + diff * 86400000);
    return formatISODateUTC(nextD);
  }

  if (cadence === 'monthly') {
    const maxDCurrent = getLastDayOfMonth(y, m);
    const clampedCurrent = Math.min(anchor_day, maxDCurrent);
    const candidate = `${y}-${pad(m)}-${pad(clampedCurrent)}`;
    if (candidate > date) {
      return candidate;
    }
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const maxDNext = getLastDayOfMonth(nextY, nextM);
    const clampedNext = Math.min(anchor_day, maxDNext);
    return `${nextY}-${pad(nextM)}-${pad(clampedNext)}`;
  }

  if (cadence === 'yearly') {
    // anchor_day is a day of the leap reference year 2000 (see getDayOfYear).
    const ref = new Date(Date.UTC(2000, 0, Math.min(Math.max(anchor_day, 1), 366)));
    const targetMonth = ref.getUTCMonth() + 1;
    const targetDay = ref.getUTCDate();
    const inYear = (year: number) =>
      `${year}-${pad(targetMonth)}-${pad(Math.min(targetDay, getLastDayOfMonth(year, targetMonth)))}`;
    const candidate = inYear(y);
    return candidate > date ? candidate : inYear(y + 1);
  }

  throw new Error(`Unsupported cadence: ${cadence}`);
}

export function computePeriodsDue(
  nextDue: string,
  cadence: 'weekly' | 'monthly' | 'yearly',
  anchorDay: number,
  asOfDate: string
): number {
  if (nextDue > asOfDate) return 0;
  let count = 1;
  let cur = nextDue;
  while (true) {
    const next = nextDueAfter(cur, cadence, anchorDay);
    if (next <= asOfDate) {
      count++;
      cur = next;
    } else {
      break;
    }
  }
  return count;
}
