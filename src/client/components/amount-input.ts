import { evalAmount, formatExpr, AmountError } from '../../split/amount';
import { escapeHtml } from '../format';

export const LAST_MULTIPLIER_KEY = 'hk:lastMultiplier';

export interface AmountInputOptions {
  initialPaise?: number | null;
  initialExpr?: string | null;
  quickChips?: boolean;
  label?: string;
  id?: string;
  required?: boolean;
  onChange?: (paise: number | null, expr: string | null) => void;
}

export interface AmountInputValue {
  paise: number | null;
  expr: string | null;
}

export interface AmountInputComponent {
  el: HTMLElement;
  inputEl: HTMLInputElement;
  getValue: () => AmountInputValue;
  setValue: (
    valOrPaise?: number | null | { paise?: number | null; expr?: string | null },
    maybeExpr?: string | null
  ) => void;
  updateRateChip: () => void;
  focus: () => void;
}

/**
 * Inserts text at cursor or replaces the selection range [start, end].
 */
export function insertAtCursor(
  text: string,
  start: number,
  end: number,
  insertText: string
): { text: string; cursor: number } {
  const len = text.length;
  const s = Math.max(0, Math.min(start, len));
  const e = Math.max(s, Math.min(end, len));
  const before = text.slice(0, s);
  const after = text.slice(e);
  return {
    text: before + insertText + after,
    cursor: s + insertText.length,
  };
}

/**
 * Deletes character before cursor or deletes the selection range [start, end].
 */
export function deleteAtCursor(
  text: string,
  start: number,
  end: number
): { text: string; cursor: number } {
  const len = text.length;
  const s = Math.max(0, Math.min(start, len));
  const e = Math.max(s, Math.min(end, len));

  if (s !== e) {
    return {
      text: text.slice(0, s) + text.slice(e),
      cursor: s,
    };
  }

  if (s === 0) {
    return { text, cursor: 0 };
  }

  return {
    text: text.slice(0, s - 1) + text.slice(s),
    cursor: s - 1,
  };
}

/**
 * Checks whether an expression string is a plain number (e.g. "50", "4170.50").
 */
export function isPlainNumber(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  return /^\d+(\.\d+)?$/.test(trimmed) || /^\.\d+$/.test(trimmed);
}

/**
 * Extracts multiplier `n` from expressions containing `* n` or `× n`.
 */
export function extractMultiplier(expr: string | null | undefined): string | null {
  if (!expr) return null;
  const matches = [...expr.matchAll(/(?:[*×\u00D7])\s*([0-9]+(?:\.[0-9]+)?)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const val = last[1];
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) return null;
  return val;
}

export function getLastMultiplier(storage?: Storage): string | null {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    return s?.getItem(LAST_MULTIPLIER_KEY) || null;
  } catch {
    return null;
  }
}

export function setLastMultiplier(multiplier: string, storage?: Storage): void {
  try {
    const s = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    s?.setItem(LAST_MULTIPLIER_KEY, multiplier);
  } catch {
    // Ignore storage errors (quota, private mode)
  }
}

export function saveMultiplierFromExpr(expr: string | null | undefined, storage?: Storage): string | null {
  const mult = extractMultiplier(expr);
  if (mult) {
    setLastMultiplier(mult, storage);
    return mult;
  }
  return null;
}

function formatPaiseToINR(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

interface KeyDef {
  label: string;
  insert?: string;
  action?: 'backspace';
  ariaLabel: string;
}

const OPERATOR_KEYS: KeyDef[] = [
  { label: '+', insert: '+', ariaLabel: 'Add' },
  { label: '−', insert: '−', ariaLabel: 'Subtract' },
  { label: '×', insert: '×', ariaLabel: 'Multiply' },
  { label: '÷', insert: '÷', ariaLabel: 'Divide' },
  { label: '(', insert: '(', ariaLabel: 'Open parenthesis' },
  { label: ')', insert: ')', ariaLabel: 'Close parenthesis' },
  { label: '⌫', action: 'backspace', ariaLabel: 'Backspace' },
];

export function createAmountInput(options: AmountInputOptions = {}): AmountInputComponent {
  const root = document.createElement('div');
  root.className = 'amount-input-root space-y-2';

  if (options.label !== undefined ? options.label : true) {
    const labelText = typeof options.label === 'string' ? options.label : 'Amount (₹) *';
    const labelEl = document.createElement('label');
    labelEl.className = 'block text-xs font-medium text-zinc-400 mb-1';
    labelEl.textContent = labelText;
    root.appendChild(labelEl);
  }

  // 1. Operator keys toolbar
  const keysRow = document.createElement('div');
  keysRow.className = 'grid grid-cols-7 gap-1.5';
  keysRow.setAttribute('role', 'toolbar');
  keysRow.setAttribute('aria-label', 'Calculator operators');

  // 2. Input wrapper
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'relative';

  const prefix = document.createElement('span');
  prefix.className =
    'absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold mono select-none pointer-events-none';
  prefix.textContent = '₹';
  inputWrapper.appendChild(prefix);

  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.inputMode = 'decimal';
  inputEl.id = options.id || 'formAmount';
  if (options.required !== false) {
    inputEl.required = true;
  }
  inputEl.placeholder = '0.00';
  inputEl.autocomplete = 'off';
  inputEl.setAttribute('autocorrect', 'off');
  inputEl.setAttribute('spellcheck', 'false');
  inputEl.className =
    'w-full bg-surface2 border border-borderDark rounded-xl pl-9 pr-4 h-12 text-base font-semibold mono text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors';
  inputWrapper.appendChild(inputEl);

  // 3. Live result container
  const resultEl = document.createElement('div');
  resultEl.className = 'text-xs min-h-[1.25rem] flex items-center';

  // 4. Chips container
  const chipsRow = document.createElement('div');
  chipsRow.className = 'flex flex-wrap gap-2 items-center';

  // Rate chip
  const rateChip = document.createElement('button');
  rateChip.type = 'button';
  rateChip.className =
    'rate-chip hidden text-xs h-9 px-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 active:bg-emerald-500/30 transition-colors font-mono select-none cursor-pointer';
  chipsRow.appendChild(rateChip);

  // Quick-add chips
  if (options.quickChips) {
    const quickAmts = [100, 500, 1000, 2000];
    quickAmts.forEach((amt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'quick-amt text-xs h-9 px-3 rounded-md bg-surface2 border border-borderDark text-zinc-400 hover:text-white active:bg-zinc-800 transition-colors select-none cursor-pointer';
      btn.textContent = `+₹${amt >= 1000 ? amt.toLocaleString('en-IN') : amt}`;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        let currentRupees = 0;
        try {
          if (inputEl.value.trim()) {
            const currentPaise = evalAmount(inputEl.value);
            currentRupees = currentPaise / 100;
          }
        } catch {
          currentRupees = parseFloat(inputEl.value) || 0;
        }
        const nextRupees = currentRupees + amt;
        inputEl.value = Number.isInteger(nextRupees) ? String(nextRupees) : nextRupees.toFixed(2);
        inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
        if (document.activeElement !== inputEl) {
          inputEl.focus();
        }
        updateState();
      });
      chipsRow.appendChild(btn);
    });
  }

  // Populate operator keys
  OPERATOR_KEYS.forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', key.ariaLabel);
    btn.className =
      'h-11 min-h-[44px] flex items-center justify-center bg-surface2 border border-borderDark text-zinc-200 hover:text-white hover:bg-zinc-800 active:bg-zinc-700 rounded-lg text-sm font-mono select-none transition-colors cursor-pointer';
    btn.textContent = key.label;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const start = inputEl.selectionStart ?? inputEl.value.length;
      const end = inputEl.selectionEnd ?? inputEl.value.length;

      if (key.action === 'backspace') {
        const res = deleteAtCursor(inputEl.value, start, end);
        inputEl.value = res.text;
        inputEl.setSelectionRange(res.cursor, res.cursor);
      } else if (key.insert) {
        const res = insertAtCursor(inputEl.value, start, end, key.insert);
        inputEl.value = res.text;
        inputEl.setSelectionRange(res.cursor, res.cursor);
      }

      if (document.activeElement !== inputEl) {
        inputEl.focus();
      }
      updateState();
    });

    keysRow.appendChild(btn);
  });

  // Assemble DOM
  root.appendChild(keysRow);
  root.appendChild(inputWrapper);
  root.appendChild(resultEl);
  root.appendChild(chipsRow);

  function updateRateChip(): void {
    const lastMult = getLastMultiplier();
    if (lastMult) {
      rateChip.textContent = `× ${lastMult}`;
      rateChip.classList.remove('hidden');
      rateChip.dataset.multiplier = lastMult;
    } else {
      rateChip.classList.add('hidden');
      rateChip.textContent = '';
      delete rateChip.dataset.multiplier;
    }
  }

  rateChip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const mult = rateChip.dataset.multiplier || getLastMultiplier();
    if (!mult) return;
    inputEl.value = inputEl.value + `×${mult}`;
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    if (document.activeElement !== inputEl) {
      inputEl.focus();
    }
    updateState();
  });

  function updateState(): void {
    const val = inputEl.value.trim();
    if (!val) {
      resultEl.textContent = '';
      options.onChange?.(null, null);
      return;
    }

    try {
      const paise = evalAmount(val);
      if (isPlainNumber(val)) {
        // Plain number: shows nothing under the field
        resultEl.textContent = '';
        options.onChange?.(paise, null);
      } else {
        // Expression: shows `= ₹...`
        const formatted = formatPaiseToINR(paise);
        resultEl.innerHTML = `<span class="font-mono text-emerald-400 text-xs">= ${formatted}</span>`;
        let expr = val;
        try {
          expr = formatExpr(val);
        } catch {
          // fallback to val
        }
        options.onChange?.(paise, expr);
      }
    } catch (err: any) {
      const msg = err instanceof AmountError ? err.message : (err?.message || 'Invalid amount');
      resultEl.innerHTML = `<span class="text-rose-400 text-xs font-mono">${escapeHtml(msg)}</span>`;
      options.onChange?.(null, null);
    }
  }

  function getValue(): AmountInputValue {
    const val = inputEl.value.trim();
    if (!val) {
      return { paise: null, expr: null };
    }
    try {
      const paise = evalAmount(val);
      if (isPlainNumber(val)) {
        return { paise, expr: null };
      }
      let expr = val;
      try {
        expr = formatExpr(val);
      } catch {
        // fallback
      }
      return { paise, expr };
    } catch {
      return { paise: null, expr: null };
    }
  }

  function setValue(
    valOrPaise?: number | null | { paise?: number | null; expr?: string | null },
    maybeExpr?: string | null
  ): void {
    let p: number | null = null;
    let e: string | null = null;

    if (valOrPaise && typeof valOrPaise === 'object') {
      p = valOrPaise.paise ?? null;
      e = valOrPaise.expr ?? null;
    } else if (typeof valOrPaise === 'number') {
      p = valOrPaise;
      e = maybeExpr ?? null;
    } else {
      e = maybeExpr ?? null;
    }

    if (e) {
      inputEl.value = e;
    } else if (typeof p === 'number' && p > 0) {
      const rupees = p / 100;
      inputEl.value = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
    } else {
      inputEl.value = '';
    }

    updateState();
    updateRateChip();
  }

  inputEl.addEventListener('input', () => {
    updateState();
  });

  // Initial values
  if (options.initialExpr) {
    setValue({ expr: options.initialExpr });
  } else if (options.initialPaise) {
    setValue({ paise: options.initialPaise });
  } else {
    setValue();
  }

  return {
    el: root,
    inputEl,
    getValue,
    setValue,
    updateRateChip,
    focus: () => inputEl.focus(),
  };
}
