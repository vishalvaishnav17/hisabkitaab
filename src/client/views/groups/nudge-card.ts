import qrcode from 'qrcode-generator';
import { formatPaise } from './helpers';
import { buildUpiUrl, truncateItems, wrapText } from './nudge-helpers';

export interface StatementData {
  group: {
    id: string;
    name: string;
    emoji: string | null;
  };
  group_name: string;
  person: {
    id: string;
    name: string;
    upi_vpa: string | null;
    phone: string | null;
    is_me: boolean;
  };
  net_balance_paise: number;
  expenses: {
    id: string;
    description: string;
    date: string;
    total: number;
    total_paise: number;
    share: number;
    share_paise: number;
    paid_by: string;
    paid_by_name: string;
  }[];
  transfers: {
    id: string;
    from_person: string;
    from_name: string;
    to_person: string;
    to_name: string;
    amount_paise: number;
    date: string;
  }[];
  settlements: {
    from: string;
    from_name: string;
    to: string;
    to_name: string;
    amount_paise: number;
  }[];
}

export interface GroupSummaryData {
  group: {
    id: string;
    name: string;
    emoji: string | null;
  };
  members: {
    person_id: string;
    name: string;
    is_me: number;
  }[];
  balances: Record<string, number>;
  settlements: {
    from: string;
    to: string;
    amount_paise: number;
  }[];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draws the HisabKitaab header icon & brand
 */
function drawHeader(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  groupName: string,
  groupEmoji: string | null,
  badgeText: string
): number {
  // HisabKitaab ₹ Icon
  const iconSize = 38;
  drawRoundedRect(ctx, x, y, iconSize, iconSize, 10);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#10b981';
  ctx.stroke();

  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillStyle = '#10b981';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('₹', x + iconSize / 2, y + iconSize / 2);

  // App Name & Group Name
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('HisabKitaab', x + iconSize + 12, y + 17);

  ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#a1a1aa';
  const displayGroup = `${groupEmoji ? groupEmoji + ' ' : ''}${groupName}`;
  ctx.fillText(displayGroup, x + iconSize + 12, y + 33);

  // Badge on the right
  ctx.textAlign = 'right';
  ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
  const badgeWidth = ctx.measureText(badgeText.toUpperCase()).width + 16;
  const badgeX = 540 - 36 - badgeWidth;
  drawRoundedRect(ctx, badgeX, y + 7, badgeWidth, 22, 11);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#10b981';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(badgeText.toUpperCase(), badgeX + badgeWidth / 2, y + 18);

  // Divider
  const nextY = y + iconSize + 18;
  ctx.strokeStyle = '#1c1c22';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(36, nextY);
  ctx.lineTo(540 - 36, nextY);
  ctx.stroke();

  return nextY + 22;
}

/**
 * Renders a Per-Friend Nudge Card onto an off-screen Canvas and returns the PNG Blob.
 */
export async function renderFriendNudgeCard(
  data: StatementData,
  settings: { my_name: string; my_upi_vpa: string }
): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  const W = 540;
  const paddingX = 36;
  const contentWidth = W - paddingX * 2;

  // Determine who owes whom:
  // 1. Check suggested settlements involving this person and 'me'
  let personOwesMePaise = 0;
  let iOwePersonPaise = 0;

  for (const s of data.settlements) {
    if (s.from === data.person.id && s.to === 'me') {
      personOwesMePaise += s.amount_paise;
    } else if (s.from === 'me' && s.to === data.person.id) {
      iOwePersonPaise += s.amount_paise;
    }
  }

  // Fallback to net balance if no pairwise settlement but there's a balance
  if (personOwesMePaise === 0 && iOwePersonPaise === 0) {
    if (data.net_balance_paise < 0) {
      personOwesMePaise = Math.abs(data.net_balance_paise);
    } else if (data.net_balance_paise > 0) {
      iOwePersonPaise = data.net_balance_paise;
    }
  }

  const personOwesMe = personOwesMePaise > 0;
  const iOwePerson = !personOwesMe && iOwePersonPaise > 0;
  const isSettled = !personOwesMe && !iOwePerson;

  // Hero Amount & Text
  const heroAmountPaise = personOwesMe ? personOwesMePaise : iOwePersonPaise;
  const myName = settings.my_name || 'Me';
  const personName = data.person.name;

  let heroSub = '';
  if (personOwesMe) {
    heroSub = `${personName}, you owe`;
  } else if (iOwePerson) {
    heroSub = `${myName} owes you`;
  } else {
    heroSub = `${personName}, you are`;
  }

  const heroAmountText = isSettled ? 'All Settled Up' : formatPaise(heroAmountPaise);

  // Truncate expenses to at most 8
  const { items: visibleExpenses, remainingCount } = truncateItems(data.expenses, 8);

  // Check if QR code should be rendered
  const showQr = personOwesMe && Boolean(settings.my_upi_vpa?.trim());
  const upiUrl = showQr
    ? buildUpiUrl({
        vpa: settings.my_upi_vpa,
        name: myName,
        amountPaise: heroAmountPaise,
        note: data.group_name,
      })
    : null;

  // Estimate Height
  let H = 60; // top padding
  H += 50; // header
  H += 90; // hero section

  // Expenses section
  if (visibleExpenses.length > 0) {
    H += 30; // title
    H += visibleExpenses.length * 48 + 16;
    if (remainingCount > 0) H += 28;
  }

  // Transfers section
  if (data.transfers.length > 0) {
    H += 30; // title
    H += data.transfers.length * 38 + 16;
  }

  // QR section
  if (showQr && upiUrl) {
    H += 240;
  }

  H += 70; // footer watermark & bottom padding

  // Create canvas (1080px wide, 2x scale)
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // Draw background
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  // Subtle background glow
  const grad = ctx.createRadialGradient(W / 2, 80, 10, W / 2, 80, 260);
  grad.addColorStop(0, personOwesMe ? 'rgba(244, 63, 94, 0.08)' : 'rgba(16, 185, 129, 0.08)');
  grad.addColorStop(1, 'rgba(5, 5, 5, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 300);

  // Header
  let curY = 32;
  curY = drawHeader(ctx, paddingX, curY, data.group_name, data.group.emoji, 'Statement');

  // Hero Section
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText(heroSub, paddingX, curY);

  curY += 38;
  ctx.font = 'bold 36px "JetBrains Mono", monospace';
  ctx.fillStyle = personOwesMe ? '#fb7185' : isSettled ? '#10b981' : '#34d399';
  ctx.fillText(heroAmountText, paddingX, curY);

  curY += 28;

  // Expenses Section
  if (visibleExpenses.length > 0) {
    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#71717a';
    ctx.fillText('ITEMISED EXPENSES', paddingX, curY);
    curY += 10;

    const cardY = curY;
    const cardHeight = visibleExpenses.length * 48 + 14 + (remainingCount > 0 ? 26 : 0);

    drawRoundedRect(ctx, paddingX, cardY, contentWidth, cardHeight, 14);
    ctx.fillStyle = '#0a0a0c';
    ctx.fill();
    ctx.strokeStyle = '#1c1c22';
    ctx.lineWidth = 1;
    ctx.stroke();

    let rowY = cardY + 22;
    for (const exp of visibleExpenses) {
      // Date
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'left';
      ctx.fillText(exp.date, paddingX + 14, rowY);

      // Description (truncated if long)
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#f4f4f5';
      const maxDescW = contentWidth - 140;
      let desc = exp.description;
      if (ctx.measureText(desc).width > maxDescW) {
        while (desc.length > 0 && ctx.measureText(desc + '...').width > maxDescW) {
          desc = desc.slice(0, -1);
        }
        desc += '...';
      }
      ctx.fillText(desc, paddingX + 14, rowY + 16);

      // Share Amount
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.fillText(formatPaise(exp.share_paise), W - paddingX - 14, rowY + 10);

      rowY += 48;
    }

    if (remainingCount > 0) {
      ctx.font = 'italic 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'center';
      ctx.fillText(`+${remainingCount} more expense${remainingCount > 1 ? 's' : ''}`, W / 2, rowY - 14);
    }

    curY = cardY + cardHeight + 24;
  }

  // Transfers Section
  if (data.transfers.length > 0) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#71717a';
    ctx.fillText('TRANSFERS RECORDED', paddingX, curY);
    curY += 10;

    const tCardY = curY;
    const tCardHeight = data.transfers.length * 36 + 12;

    drawRoundedRect(ctx, paddingX, tCardY, contentWidth, tCardHeight, 14);
    ctx.fillStyle = '#0a0a0c';
    ctx.fill();
    ctx.strokeStyle = '#1c1c22';
    ctx.lineWidth = 1;
    ctx.stroke();

    let tRowY = tCardY + 22;
    for (const tr of data.transfers) {
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#71717a';
      ctx.textAlign = 'left';
      ctx.fillText(tr.date, paddingX + 14, tRowY);

      ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#e4e4e7';
      const label = `${tr.from_name} paid ${tr.to_name}`;
      ctx.fillText(label, paddingX + 85, tRowY);

      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillStyle = '#10b981';
      ctx.textAlign = 'right';
      ctx.fillText(formatPaise(tr.amount_paise), W - paddingX - 14, tRowY);

      tRowY += 36;
    }

    curY = tCardY + tCardHeight + 24;
  }

  // UPI QR Code Section (only when friend owes me & UPI is configured)
  if (showQr && upiUrl) {
    ctx.textAlign = 'center';
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#d4d4d8';
    ctx.fillText('Scan to settle up instantly via any UPI app', W / 2, curY);
    curY += 14;

    const qrSize = 148;
    const qrBoxSize = qrSize + 24;
    const qrBoxX = (W - qrBoxSize) / 2;
    const qrBoxY = curY;

    // White rounded square background
    drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxBox(qrBoxSize), qrBoxSize, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Generate and draw QR matrix
    try {
      const qr = qrcode(0, 'M');
      qr.addData(upiUrl);
      qr.make();
      const count = qr.getModuleCount();
      const cellSize = qrSize / count;

      ctx.fillStyle = '#000000';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect(
              qrBoxX + 12 + c * cellSize,
              qrBoxY + 12 + r * cellSize,
              cellSize + 0.3,
              cellSize + 0.3
            );
          }
        }
      }
    } catch (e) {
      console.error('Failed to generate QR:', e);
    }

    curY = qrBoxY + qrBoxSize + 18;

    // UPI ID as text
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#10b981';
    ctx.fillText(`UPI ID: ${settings.my_upi_vpa}`, W / 2, curY);

    curY += 16;
    ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#71717a';
    ctx.fillText('Google Pay · PhonePe · Paytm · BHIM', W / 2, curY);
    curY += 24;
  }

  // Bottom Watermark
  ctx.textAlign = 'center';
  ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#52525b';
  ctx.fillText('Tracked with HisabKitaab', W / 2, H - 24);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create card image blob'));
    }, 'image/png');
  });
}

function qrBoxBox(val: number): number {
  return val;
}

/**
 * Renders a Group Summary Card onto an off-screen Canvas and returns the PNG Blob.
 */
export async function renderGroupSummaryCard(
  data: GroupSummaryData
): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  const W = 540;
  const paddingX = 36;
  const contentWidth = W - paddingX * 2;

  // Name map
  const nameMap = new Map<string, string>();
  for (const m of data.members) {
    nameMap.set(m.person_id, m.name);
  }

  // Height estimation
  let H = 60; // top padding
  H += 50; // header
  H += 60; // hero title

  // Member balances
  H += 30; // section title
  H += data.members.length * 38 + 16;

  // Suggested payments
  H += 30; // section title
  H += Math.max(1, data.settlements.length) * 38 + 16;

  H += 70; // footer & padding

  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  // Top glow
  const grad = ctx.createRadialGradient(W / 2, 70, 10, W / 2, 70, 240);
  grad.addColorStop(0, 'rgba(16, 185, 129, 0.08)');
  grad.addColorStop(1, 'rgba(5, 5, 5, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 280);

  // Header
  let curY = 32;
  curY = drawHeader(ctx, paddingX, curY, data.group.name, data.group.emoji, 'Group Summary');

  // Hero Section
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#a1a1aa';
  ctx.fillText('Group Standing & Suggested Settlements', paddingX, curY);

  curY += 28;

  // Member Balances Section
  ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#71717a';
  ctx.fillText('MEMBER BALANCES', paddingX, curY);
  curY += 10;

  const mCardY = curY;
  const mCardHeight = data.members.length * 38 + 14;

  drawRoundedRect(ctx, paddingX, mCardY, contentWidth, mCardHeight, 14);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.strokeStyle = '#1c1c22';
  ctx.lineWidth = 1;
  ctx.stroke();

  let mRowY = mCardY + 24;
  for (const m of data.members) {
    const net = data.balances[m.person_id] ?? 0;

    // Member initial circle
    drawRoundedRect(ctx, paddingX + 12, mRowY - 14, 22, 22, 6);
    ctx.fillStyle = '#18181b';
    ctx.fill();

    ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'center';
    ctx.fillText((m.name[0] || '?').toUpperCase(), paddingX + 23, mRowY + 1);

    // Member Name
    ctx.textAlign = 'left';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#f4f4f5';
    ctx.fillText(m.name, paddingX + 42, mRowY + 2);

    // Balance label
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    if (net > 0) {
      ctx.fillStyle = '#34d399';
      ctx.fillText(`gets back ${formatPaise(net)}`, W - paddingX - 14, mRowY + 2);
    } else if (net < 0) {
      ctx.fillStyle = '#fb7185';
      ctx.fillText(`owes ${formatPaise(Math.abs(net))}`, W - paddingX - 14, mRowY + 2);
    } else {
      ctx.fillStyle = '#71717a';
      ctx.fillText('settled up', W - paddingX - 14, mRowY + 2);
    }

    mRowY += 38;
  }

  curY = mCardY + mCardHeight + 24;

  // Suggested Payments Section
  ctx.textAlign = 'left';
  ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#71717a';
  ctx.fillText('SUGGESTED SETTLEMENTS', paddingX, curY);
  curY += 10;

  const sCardY = curY;
  const sCardHeight = Math.max(1, data.settlements.length) * 38 + 14;

  drawRoundedRect(ctx, paddingX, sCardY, contentWidth, sCardHeight, 14);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.strokeStyle = '#1c1c22';
  ctx.lineWidth = 1;
  ctx.stroke();

  let sRowY = sCardY + 24;
  if (data.settlements.length === 0) {
    ctx.textAlign = 'center';
    ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('All balances are fully settled! 🎉', W / 2, sRowY + 2);
  } else {
    for (const s of data.settlements) {
      const fromName = nameMap.get(s.from) || s.from;
      const toName = nameMap.get(s.to) || s.to;

      ctx.textAlign = 'left';
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#e4e4e7';
      ctx.fillText(fromName, paddingX + 14, sRowY + 2);

      const fromW = ctx.measureText(fromName).width;
      ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#71717a';
      ctx.fillText('→ pays →', paddingX + 18 + fromW, sRowY + 2);

      const arrowW = ctx.measureText('→ pays →').width;
      ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#e4e4e7';
      ctx.fillText(toName, paddingX + 22 + fromW + arrowW, sRowY + 2);

      // Amount
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.fillStyle = '#34d399';
      ctx.fillText(formatPaise(s.amount_paise), W - paddingX - 14, sRowY + 2);

      sRowY += 38;
    }
  }

  // Footer Watermark
  ctx.textAlign = 'center';
  ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#52525b';
  ctx.fillText('Tracked with HisabKitaab', W / 2, H - 24);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create summary card image blob'));
    }, 'image/png');
  });
}
