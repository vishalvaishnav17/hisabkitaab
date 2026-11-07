function formatMonthStart(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getThisMonthRange(now = new Date()): { start: string; end: string } {
  const start = formatMonthStart(now.getFullYear(), now.getMonth());
  const end = formatMonthStart(now.getFullYear(), now.getMonth() + 1);
  return { start, end };
}

export function getLastMonthRange(now = new Date()): { start: string; end: string } {
  const start = formatMonthStart(now.getFullYear(), now.getMonth() - 1);
  const end = formatMonthStart(now.getFullYear(), now.getMonth());
  return { start, end };
}

export function getLast30DaysStart(now = new Date()): string {
  const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return formatISODate(past30);
}

export function getDateRangeClause(
  dateRange: string,
  now = new Date(),
): { clause?: string; params: string[] } {
  if (dateRange === 'this_month') {
    const { start, end } = getThisMonthRange(now);
    return { clause: 'date >= ? AND date < ?', params: [start, end] };
  } else if (dateRange === 'last_month') {
    const { start, end } = getLastMonthRange(now);
    return { clause: 'date >= ? AND date < ?', params: [start, end] };
  } else if (dateRange === 'last_30') {
    const start = getLast30DaysStart(now);
    return { clause: 'date >= ?', params: [start] };
  }
  return { params: [] };
}
