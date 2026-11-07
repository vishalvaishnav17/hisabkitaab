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

export function getDayOfYear(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  const current = Date.UTC(y, m - 1, d);
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
    if (anchor_day > 366) {
      const targetMonth = Math.floor(anchor_day / 100);
      const targetDay = anchor_day % 100;
      const maxD = getLastDayOfMonth(y, targetMonth);
      const clampedD = Math.min(targetDay, maxD);
      const candidate = `${y}-${pad(targetMonth)}-${pad(clampedD)}`;
      if (candidate > date) return candidate;

      const nextMaxD = getLastDayOfMonth(y + 1, targetMonth);
      const nextClampedD = Math.min(targetDay, nextMaxD);
      return `${y + 1}-${pad(targetMonth)}-${pad(nextClampedD)}`;
    }

    const daysInY = isLeapYear(y) ? 366 : 365;
    const clampedDayY = Math.min(anchor_day, daysInY);
    const candObj = new Date(Date.UTC(y, 0, clampedDayY));
    const candStr = formatISODateUTC(candObj);
    if (candStr > date) {
      return candStr;
    }

    const nextY = y + 1;
    const daysInNextY = isLeapYear(nextY) ? 366 : 365;
    const clampedDayNextY = Math.min(anchor_day, daysInNextY);
    const nextCandObj = new Date(Date.UTC(nextY, 0, clampedDayNextY));
    return formatISODateUTC(nextCandObj);
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
