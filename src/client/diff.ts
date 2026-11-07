export interface FieldDiff {
  key: string;
  field: string;
  beforeVal: string;
  afterVal: string;
  rawBefore: any;
  rawAfter: any;
  changed: boolean;
}

const DEFAULT_IGNORED_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'deleted_at',
  'at',
  'timestamp',
]);

const FRIENDLY_NAMES: Record<string, string> = {
  description: 'Description',
  amount_paise: 'Amount',
  amount: 'Amount',
  amount_expr: 'Amount Expression',
  category: 'Category',
  payment_method: 'Payment Method',
  date: 'Date',
  notes: 'Notes',
  name: 'Name',
  group_id: 'Group ID',
  from_person_id: 'From',
  to_person_id: 'To',
};

const PREFERRED_ORDER = [
  'description',
  'amount_paise',
  'amount',
  'amount_expr',
  'category',
  'payment_method',
  'date',
  'notes',
  'name',
];

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const isWhole = Number.isInteger(rupees);
  const formatted = Math.abs(rupees).toLocaleString('en-IN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${rupees < 0 ? '-' : ''}₹${formatted}`;
}

export function formatFieldValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (key.endsWith('_paise') && typeof value === 'number') {
    return formatPaise(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function getFieldDisplayName(key: string): string {
  if (FRIENDLY_NAMES[key]) {
    return FRIENDLY_NAMES[key];
  }
  const cleanKey = key.endsWith('_paise') ? key.replace(/_paise$/, '') : key;
  return cleanKey
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function computeFieldDiffs(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  options?: { ignoredKeys?: string[] }
): FieldDiff[] {
  const ignored = options?.ignoredKeys
    ? new Set([...DEFAULT_IGNORED_KEYS, ...options.ignoredKeys])
    : DEFAULT_IGNORED_KEYS;

  const b = before || {};
  const a = after || {};

  const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter(
    (key) => !ignored.has(key)
  );

  allKeys.sort((x, y) => {
    const idxX = PREFERRED_ORDER.indexOf(x);
    const idxY = PREFERRED_ORDER.indexOf(y);
    if (idxX !== -1 && idxY !== -1) return idxX - idxY;
    if (idxX !== -1) return -1;
    if (idxY !== -1) return 1;
    return x.localeCompare(y);
  });

  return allKeys.map((key) => {
    const rawBefore = b[key];
    const rawAfter = a[key];

    const isBeforeEmpty = rawBefore === null || rawBefore === undefined;
    const isAfterEmpty = rawAfter === null || rawAfter === undefined;

    let changed = false;
    if (isBeforeEmpty && isAfterEmpty) {
      changed = false;
    } else if (isBeforeEmpty !== isAfterEmpty) {
      changed = true;
    } else {
      changed = rawBefore !== rawAfter;
    }

    return {
      key,
      field: getFieldDisplayName(key),
      beforeVal: formatFieldValue(key, rawBefore),
      afterVal: formatFieldValue(key, rawAfter),
      rawBefore,
      rawAfter,
      changed,
    };
  });
}
