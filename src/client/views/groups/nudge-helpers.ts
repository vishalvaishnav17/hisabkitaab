export interface BuildUpiUrlParams {
  vpa?: string | null;
  name: string;
  amountPaise: number;
  note?: string | null;
}

/**
 * Builds a standard UPI payment URL.
 * Format: upi://pay?pa=<vpa>&pn=<my_name>&am=<rupees with 2 decimals>&cu=INR&tn=<group name>
 * Returns null if VPA is missing or if amountPaise <= 0 (settled up or I owe them).
 */
export function buildUpiUrl(params: BuildUpiUrlParams): string | null {
  const vpa = params.vpa?.trim();
  if (!vpa) {
    return null;
  }

  // No QR when person does not owe me (amount <= 0 or I owe them)
  if (params.amountPaise <= 0) {
    return null;
  }

  const rupeesStr = (params.amountPaise / 100).toFixed(2);
  const name = params.name.trim();
  const note = (params.note ?? '').trim();

  const queryParts = [
    `pa=${encodeURIComponent(vpa)}`,
    `pn=${encodeURIComponent(name)}`,
    `am=${encodeURIComponent(rupeesStr)}`,
    'cu=INR',
  ];

  if (note) {
    queryParts.push(`tn=${encodeURIComponent(note)}`);
  }

  return `upi://pay?${queryParts.join('&')}`;
}

export interface TruncatedResult<T> {
  items: T[];
  remainingCount: number;
}

/**
 * Returns at most `limit` items and the count of remaining items.
 */
export function truncateItems<T>(items: T[], limit: number = 8): TruncatedResult<T> {
  if (items.length <= limit) {
    return {
      items: [...items],
      remainingCount: 0,
    };
  }
  return {
    items: items.slice(0, limit),
    remainingCount: items.length - limit,
  };
}

/**
 * Wraps text into lines that fit within maxWidth according to measureWidth.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measureWidth: (str: string) => number
): string[] {
  if (!text) return [];

  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = `${currentLine} ${word}`;
      if (measureWidth(testLine) <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
  }

  return lines;
}
