import {
  createBillApi,
  CreateBillPayload,
  fetchGroupMembersForBillsApi,
  fetchGroupsForBillsApi,
  GroupMember,
  GroupSummary,
  payBillApi,
  RecurringBillItem,
  skipBillApi,
  updateBillApi,
  UpdateBillPayload,
} from '../bills-api';
import { createAmountInput, AmountInputComponent } from './amount-input';
import { showToast } from './toast';
import { escapeHtml, todayISO } from '../format';
import { getDayOfYear, nextDueAfter } from '../../services/bills-dates';

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function openBillModal(
  bill?: RecurringBillItem | null,
  onSaved?: () => void
): void {
  // Remove any existing bill sheet
  const existingModal = document.getElementById('billSheetModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'billSheetModal';
  modal.className =
    'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4';

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[92dvh] overflow-y-auto">
      <div class="flex items-center justify-between pb-3 border-b border-borderDark">
        <h3 id="billModalTitle" class="text-base font-semibold text-white">
          ${bill ? 'Edit Recurring Bill' : 'Add Recurring Bill'}
        </h3>
        <button id="closeBillModalBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-11 w-11 flex items-center justify-center rounded-lg cursor-pointer">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="billForm" class="mt-4 space-y-4">
        <!-- Title -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Title *</label>
          <input type="text" id="billTitle" required placeholder="e.g. Netflix, Wi-Fi, Electricity, House Rent"
            value="${bill ? escapeHtml(bill.title) : ''}"
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 text-base focus:outline-none focus:border-emerald-500 transition-colors">
        </div>

        <!-- Amount & Varies Toggle -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-medium text-zinc-400">Amount</label>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" id="billAmountVaries" class="accent-emerald-500 w-4 h-4 rounded" ${
                bill && bill.amount_paise === null ? 'checked' : ''
              }>
              <span class="text-xs text-zinc-400 hover:text-zinc-300">Amount varies each time</span>
            </label>
          </div>
          <div id="billAmountContainer" class="${bill && bill.amount_paise === null ? 'hidden' : ''}"></div>
        </div>

        <!-- Cadence and Day -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Cadence *</label>
            <select id="billCadence" class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 text-base focus:outline-none focus:border-emerald-500">
              <option value="monthly" ${!bill || bill.cadence === 'monthly' ? 'selected' : ''}>Monthly</option>
              <option value="weekly" ${bill && bill.cadence === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="yearly" ${bill && bill.cadence === 'yearly' ? 'selected' : ''}>Yearly</option>
            </select>
          </div>

          <div id="billAnchorDayWrapper">
            <label id="billAnchorDayLabel" class="block text-xs font-medium text-zinc-400 mb-1">Day of Month *</label>
            <select id="billAnchorDaySelect" class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 text-base focus:outline-none focus:border-emerald-500">
            </select>
          </div>
        </div>

        <!-- First Due Date / Next Due Date -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">
            ${bill ? 'Next Due Date *' : 'First Due Date *'}
          </label>
          <input type="date" id="billFirstDue" required
            value="${bill ? bill.next_due : todayISO()}"
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 text-base focus:outline-none focus:border-emerald-500 transition-colors">
        </div>

        <!-- Category & Payment Method Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Category *</label>
            <select id="billCategory" class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 text-base focus:outline-none focus:border-emerald-500">
              <option value="Bills & Utilities" ${!bill || bill.category === 'Bills & Utilities' ? 'selected' : ''}>⚡ Bills & Utilities</option>
              <option value="Rent & Housing" ${bill && bill.category === 'Rent & Housing' ? 'selected' : ''}>🏠 Rent & Housing</option>
              <option value="Entertainment" ${bill && bill.category === 'Entertainment' ? 'selected' : ''}>🎬 Entertainment</option>
              <option value="Food & Dining" ${bill && bill.category === 'Food & Dining' ? 'selected' : ''}>🍔 Food & Dining</option>
              <option value="Groceries" ${bill && bill.category === 'Groceries' ? 'selected' : ''}>🛒 Groceries</option>
              <option value="Shopping" ${bill && bill.category === 'Shopping' ? 'selected' : ''}>🛍️ Shopping</option>
              <option value="Transport & Fuel" ${bill && bill.category === 'Transport & Fuel' ? 'selected' : ''}>⛽ Transport & Fuel</option>
              <option value="Health & Medical" ${bill && bill.category === 'Health & Medical' ? 'selected' : ''}>💊 Health & Medical</option>
              <option value="Investments & Savings" ${bill && bill.category === 'Investments & Savings' ? 'selected' : ''}>📈 Investments</option>
              <option value="Others" ${bill && bill.category === 'Others' ? 'selected' : ''}>📦 Others</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Payment Method</label>
            <select id="billPaymentMethod" class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 text-base focus:outline-none focus:border-emerald-500">
              <option value="UPI" ${!bill || bill.payment_method === 'UPI' ? 'selected' : ''}>UPI</option>
              <option value="Credit Card" ${bill && bill.payment_method === 'Credit Card' ? 'selected' : ''}>Credit Card</option>
              <option value="Debit Card" ${bill && bill.payment_method === 'Debit Card' ? 'selected' : ''}>Debit Card</option>
              <option value="Net Banking" ${bill && bill.payment_method === 'Net Banking' ? 'selected' : ''}>Net Banking</option>
              <option value="Cash" ${bill && bill.payment_method === 'Cash' ? 'selected' : ''}>Cash</option>
            </select>
          </div>
        </div>

        <!-- Bill Kind: Personal vs Shared -->
        <div class="pt-2 border-t border-borderDark">
          <label class="block text-xs font-medium text-zinc-400 mb-2">Bill Split Type</label>
          <div class="grid grid-cols-2 gap-2 bg-surface2 p-1 rounded-xl border border-borderDark">
            <button type="button" id="kindPersonalBtn" class="min-h-[44px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              !bill || bill.kind === 'personal'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }">Personal</button>
            <button type="button" id="kindSharedBtn" class="min-h-[44px] rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              bill && bill.kind === 'shared'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }">Shared (Group)</button>
          </div>
        </div>

        <!-- Shared Group Configuration -->
        <div id="sharedConfigContainer" class="${!bill || bill.kind === 'personal' ? 'hidden' : ''} space-y-3 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Select Group *</label>
            <select id="billGroupSelect" class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 text-base focus:outline-none focus:border-emerald-500">
              <option value="">Loading groups...</option>
            </select>
          </div>

          <div id="groupMembersSection" class="hidden space-y-3">
            <div>
              <label class="block text-xs font-medium text-zinc-400 mb-1">Participants *</label>
              <div id="billParticipantsList" class="flex flex-wrap gap-2"></div>
            </div>

            <div>
              <label class="block text-xs font-medium text-zinc-400 mb-1">Paid By</label>
              <select id="billPayerSelect" class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 text-base focus:outline-none focus:border-emerald-500">
              </select>
            </div>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="pt-3 flex gap-3">
          <button type="button" id="cancelBillModalBtn" class="flex-1 min-h-[44px] bg-surface2 hover:bg-zinc-800 text-zinc-300 font-medium rounded-xl border border-borderDark transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" id="saveBillBtn" class="flex-1 min-h-[44px] bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl transition-colors cursor-pointer shadow-lg shadow-emerald-500/10">
            ${bill ? 'Save Changes' : 'Create Bill'}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  if (window.lucide) {
    window.lucide.createIcons();
  }

  function closeModal(): void {
    modal.remove();
    document.body.style.overflow = '';
  }

  modal.querySelector('#closeBillModalBtn')?.addEventListener('click', closeModal);
  modal.querySelector('#cancelBillModalBtn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Mount Amount Input component
  const amountContainer = modal.querySelector('#billAmountContainer') as HTMLElement;
  const amountVariesToggle = modal.querySelector('#billAmountVaries') as HTMLInputElement;

  let amountComp: AmountInputComponent | null = null;
  amountComp = createAmountInput({
    quickChips: true,
    initialPaise: bill ? bill.amount_paise : null,
    initialExpr: bill ? bill.amount_expr : null,
    id: 'billAmountInput',
    required: false,
  });
  amountContainer.appendChild(amountComp.el);

  amountVariesToggle.addEventListener('change', () => {
    if (amountVariesToggle.checked) {
      amountContainer.classList.add('hidden');
    } else {
      amountContainer.classList.remove('hidden');
    }
  });

  // Cadence and Day selector logic
  const cadenceSelect = modal.querySelector('#billCadence') as HTMLSelectElement;
  const anchorDaySelect = modal.querySelector('#billAnchorDaySelect') as HTMLSelectElement;
  const anchorDayLabel = modal.querySelector('#billAnchorDayLabel') as HTMLElement;
  const anchorDayWrapper = modal.querySelector('#billAnchorDayWrapper') as HTMLElement;
  const firstDueInput = modal.querySelector('#billFirstDue') as HTMLInputElement;

  function refreshAnchorDayOptions(preserveValue?: number): void {
    const cadence = cadenceSelect.value;
    anchorDaySelect.innerHTML = '';

    if (cadence === 'weekly') {
      anchorDayWrapper.classList.remove('hidden');
      anchorDayLabel.textContent = 'Day of Week *';
      WEEKDAYS.forEach((name, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = name;
        if (preserveValue !== undefined && preserveValue === idx) {
          opt.selected = true;
        }
        anchorDaySelect.appendChild(opt);
      });
    } else if (cadence === 'monthly') {
      anchorDayWrapper.classList.remove('hidden');
      anchorDayLabel.textContent = 'Day of Month (1–31) *';
      for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${i}${getOrdinal(i)} of month`;
        if (preserveValue !== undefined && preserveValue === i) {
          opt.selected = true;
        }
        anchorDaySelect.appendChild(opt);
      }
    } else {
      // Yearly: anchor day is calculated from first due date
      anchorDayWrapper.classList.add('hidden');
    }
  }

  function getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  const initialAnchorDay = bill ? bill.anchor_day : 1;
  refreshAnchorDayOptions(initialAnchorDay);

  cadenceSelect.addEventListener('change', () => {
    refreshAnchorDayOptions();
  });

  // Personal vs Shared Toggle
  let currentKind: 'personal' | 'shared' = bill && bill.kind === 'shared' ? 'shared' : 'personal';
  const kindPersonalBtn = modal.querySelector('#kindPersonalBtn') as HTMLButtonElement;
  const kindSharedBtn = modal.querySelector('#kindSharedBtn') as HTMLButtonElement;
  const sharedConfig = modal.querySelector('#sharedConfigContainer') as HTMLElement;
  const groupSelect = modal.querySelector('#billGroupSelect') as HTMLSelectElement;
  const groupMembersSection = modal.querySelector('#groupMembersSection') as HTMLElement;
  const participantsList = modal.querySelector('#billParticipantsList') as HTMLElement;
  const payerSelect = modal.querySelector('#billPayerSelect') as HTMLSelectElement;

  let loadedGroups: GroupSummary[] = [];
  let currentGroupMembers: GroupMember[] = [];
  let selectedParticipantIds = new Set<string>(bill?.participant_ids || []);

  function setKind(kind: 'personal' | 'shared'): void {
    currentKind = kind;
    if (kind === 'personal') {
      kindPersonalBtn.className =
        'min-h-[44px] rounded-lg text-sm font-medium transition-colors bg-zinc-800 text-white shadow-sm cursor-pointer';
      kindSharedBtn.className =
        'min-h-[44px] rounded-lg text-sm font-medium transition-colors text-zinc-400 hover:text-white cursor-pointer';
      sharedConfig.classList.add('hidden');
    } else {
      kindSharedBtn.className =
        'min-h-[44px] rounded-lg text-sm font-medium transition-colors bg-zinc-800 text-white shadow-sm cursor-pointer';
      kindPersonalBtn.className =
        'min-h-[44px] rounded-lg text-sm font-medium transition-colors text-zinc-400 hover:text-white cursor-pointer';
      sharedConfig.classList.remove('hidden');
      loadGroups();
    }
  }

  kindPersonalBtn.addEventListener('click', () => setKind('personal'));
  kindSharedBtn.addEventListener('click', () => setKind('shared'));

  async function loadGroups(): Promise<void> {
    if (loadedGroups.length === 0) {
      loadedGroups = await fetchGroupsForBillsApi();
      groupSelect.innerHTML = '<option value="">-- Choose Group --</option>';
      for (const g of loadedGroups) {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = `${g.emoji ? g.emoji + ' ' : ''}${g.name}`;
        if (bill && bill.group_id === g.id) {
          opt.selected = true;
        }
        groupSelect.appendChild(opt);
      }
    }
    if (groupSelect.value) {
      loadMembers(groupSelect.value);
    }
  }

  async function loadMembers(groupId: string): Promise<void> {
    if (!groupId) {
      groupMembersSection.classList.add('hidden');
      return;
    }
    currentGroupMembers = await fetchGroupMembersForBillsApi(groupId);
    groupMembersSection.classList.remove('hidden');

    if (selectedParticipantIds.size === 0) {
      currentGroupMembers.forEach((m) => selectedParticipantIds.add(m.person_id));
    }

    renderParticipantChips();
    renderPayerOptions();
  }

  function renderParticipantChips(): void {
    participantsList.innerHTML = '';
    for (const m of currentGroupMembers) {
      const isSelected = selectedParticipantIds.has(m.person_id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `min-h-[36px] px-3 py-1 text-xs rounded-full border transition-all cursor-pointer ${
        isSelected
          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-semibold'
          : 'bg-surface2 border-borderDark text-zinc-400 hover:text-zinc-200'
      }`;
      chip.textContent = m.name + (m.is_me ? ' (You)' : '');
      chip.addEventListener('click', () => {
        if (selectedParticipantIds.has(m.person_id)) {
          if (selectedParticipantIds.size > 1) {
            selectedParticipantIds.delete(m.person_id);
          } else {
            showToast('At least one participant required', 'error');
          }
        } else {
          selectedParticipantIds.add(m.person_id);
        }
        renderParticipantChips();
      });
      participantsList.appendChild(chip);
    }
  }

  function renderPayerOptions(): void {
    payerSelect.innerHTML = '';
    const currentPayer = bill?.paid_by || 'me';
    for (const m of currentGroupMembers) {
      const opt = document.createElement('option');
      opt.value = m.person_id;
      opt.textContent = m.name + (m.is_me ? ' (You)' : '');
      if (m.person_id === currentPayer) {
        opt.selected = true;
      }
      payerSelect.appendChild(opt);
    }
  }

  groupSelect.addEventListener('change', () => {
    selectedParticipantIds.clear();
    loadMembers(groupSelect.value);
  });

  if (bill && bill.kind === 'shared') {
    loadGroups();
  }

  // Handle Form Submission
  const form = modal.querySelector('#billForm') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = (modal.querySelector('#billTitle') as HTMLInputElement).value.trim();
    if (!title) {
      showToast('Title is required', 'error');
      return;
    }

    const cadence = cadenceSelect.value as 'weekly' | 'monthly' | 'yearly';
    const firstDue = firstDueInput.value.trim();
    if (!firstDue) {
      showToast('Due date is required', 'error');
      return;
    }

    let anchorDay: number;
    if (cadence === 'yearly') {
      anchorDay = getDayOfYear(firstDue);
    } else {
      anchorDay = parseInt(anchorDaySelect.value, 10);
    }

    let amount_paise: number | null = null;
    let amount_expr: string | null = null;

    if (!amountVariesToggle.checked) {
      if (amountComp) {
        const val = amountComp.getValue();
        if (val.paise && val.paise > 0) {
          amount_paise = val.paise;
          amount_expr = val.expr;
        } else {
          showToast('Enter an amount or toggle "Amount varies"', 'error');
          amountComp.focus();
          return;
        }
      }
    }

    const category = (modal.querySelector('#billCategory') as HTMLSelectElement).value;
    const payment_method = (modal.querySelector('#billPaymentMethod') as HTMLSelectElement).value;

    let group_id: string | null = null;
    let paid_by: string | null = null;
    let participant_ids: string[] = [];

    if (currentKind === 'shared') {
      group_id = groupSelect.value || null;
      if (!group_id) {
        showToast('Please select a group for this shared bill', 'error');
        return;
      }
      paid_by = payerSelect.value || 'me';
      participant_ids = Array.from(selectedParticipantIds);
      if (participant_ids.length === 0) {
        showToast('Please select at least one participant', 'error');
        return;
      }
    }

    try {
      if (bill) {
        const payload: UpdateBillPayload = {
          title,
          amount_paise,
          amount_expr,
          category,
          payment_method,
          cadence,
          anchor_day: anchorDay,
          next_due: firstDue,
          group_id,
          paid_by,
          participant_ids,
        };
        await updateBillApi(bill.id, payload);
        showToast(`Updated ${title}`);
      } else {
        const payload: CreateBillPayload = {
          title,
          amount_paise,
          amount_expr,
          category,
          payment_method,
          cadence,
          anchor_day: anchorDay,
          first_due_date: firstDue,
          next_due: firstDue,
          group_id,
          paid_by,
          participant_ids,
        };
        await createBillApi(payload);
        showToast(`Created bill ${title}`);
      }
      closeModal();
      onSaved?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to save bill', 'error');
    }
  });
}

/**
 * Confirm Pay Bottom Sheet
 */
export function openPayBillConfirm(
  bill: RecurringBillItem,
  onPaid?: () => void
): void {
  const existingModal = document.getElementById('payConfirmModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'payConfirmModal';
  modal.className =
    'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4';

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[90dvh] overflow-y-auto">
      <div class="flex items-center justify-between pb-3 border-b border-borderDark">
        <h3 class="text-base font-semibold text-white">Mark as Paid</h3>
        <button id="closePayConfirmBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-11 w-11 flex items-center justify-center rounded-lg cursor-pointer">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="mt-3 py-2">
        <h4 class="text-lg font-bold text-white tracking-tight">${escapeHtml(bill.title)}</h4>
        <p class="text-xs text-zinc-400 mt-0.5">
          ${bill.group_name ? `${escapeHtml(bill.group_name)} · ` : ''}Due date: ${bill.next_due}
        </p>
      </div>

      <form id="payConfirmForm" class="mt-3 space-y-4">
        <!-- Amount Input -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">
            Amount (₹) ${bill.amount_paise === null ? '(Required - Varies)' : '*'}
          </label>
          <div id="payAmountContainer"></div>
        </div>

        <!-- Date Paid -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Payment Date *</label>
          <input type="date" id="payDate" required value="${bill.next_due <= todayISO() ? todayISO() : bill.next_due}"
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 text-base focus:outline-none focus:border-emerald-500">
        </div>

        <!-- Next Due Date Preview -->
        <div class="bg-surface2/60 border border-borderDark/80 p-3 rounded-xl flex items-center justify-between text-xs">
          <span class="text-zinc-400">Next due after payment:</span>
          <span class="font-mono text-emerald-400 font-semibold" id="nextDuePreview">
            ${nextDueAfter(bill.next_due, bill.cadence, bill.anchor_day)}
          </span>
        </div>

        <div class="pt-2 flex gap-3">
          <button type="button" id="cancelPayConfirmBtn" class="flex-1 min-h-[44px] bg-surface2 hover:bg-zinc-800 text-zinc-300 font-medium rounded-xl border border-borderDark cursor-pointer">
            Cancel
          </button>
          <button type="submit" id="submitPayConfirmBtn" class="flex-1 min-h-[44px] bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl cursor-pointer shadow-lg shadow-emerald-500/10">
            Confirm & Pay
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  if (window.lucide) {
    window.lucide.createIcons();
  }

  function closeModal(): void {
    modal.remove();
    document.body.style.overflow = '';
  }

  modal.querySelector('#closePayConfirmBtn')?.addEventListener('click', closeModal);
  modal.querySelector('#cancelPayConfirmBtn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  const payAmountContainer = modal.querySelector('#payAmountContainer') as HTMLElement;
  const amountComp = createAmountInput({
    quickChips: true,
    initialPaise: bill.amount_paise,
    initialExpr: bill.amount_expr,
    id: 'payAmountInput',
    required: true,
  });
  payAmountContainer.appendChild(amountComp.el);

  const form = modal.querySelector('#payConfirmForm') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { paise, expr } = amountComp.getValue();
    if (!paise || paise <= 0) {
      showToast('Valid payment amount required', 'error');
      amountComp.focus();
      return;
    }

    const payDate = (modal.querySelector('#payDate') as HTMLInputElement).value;
    try {
      await payBillApi(bill.id, {
        amount_paise: paise,
        amount_expr: expr,
        date: payDate,
      });
      showToast(`Marked ${bill.title} as paid`);
      closeModal();
      onPaid?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to pay bill', 'error');
    }
  });
}

/**
 * Confirm Skip Period Modal
 */
export function openSkipBillConfirm(
  bill: RecurringBillItem,
  onSkipped?: () => void
): void {
  const existingModal = document.getElementById('skipConfirmModal');
  if (existingModal) existingModal.remove();

  const nextDue = nextDueAfter(bill.next_due, bill.cadence, bill.anchor_day);

  const modal = document.createElement('div');
  modal.id = 'skipConfirmModal';
  modal.className =
    'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full max-w-sm rounded-2xl p-5 shadow-2xl relative">
      <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
        <i data-lucide="skip-forward" class="w-6 h-6"></i>
      </div>

      <h3 class="text-base font-bold text-white tracking-tight">Skip this period?</h3>
      <p class="text-xs text-zinc-400 mt-1.5 leading-relaxed">
        Skip period for <strong class="text-zinc-200">${escapeHtml(bill.title)}</strong> (due on ${bill.next_due})?
        No expense will be created, and the next due date will move to <strong class="text-emerald-400 font-mono">${nextDue}</strong>.
      </p>

      <div class="mt-5 flex gap-2.5">
        <button type="button" id="cancelSkipBtn" class="flex-1 min-h-[44px] bg-surface2 hover:bg-zinc-800 text-zinc-300 text-sm font-medium rounded-xl border border-borderDark cursor-pointer">
          Cancel
        </button>
        <button type="button" id="confirmSkipBtn" class="flex-1 min-h-[44px] bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-xl cursor-pointer shadow-lg shadow-amber-500/10">
          Skip Period
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  if (window.lucide) {
    window.lucide.createIcons();
  }

  function closeModal(): void {
    modal.remove();
    document.body.style.overflow = '';
  }

  modal.querySelector('#cancelSkipBtn')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  modal.querySelector('#confirmSkipBtn')?.addEventListener('click', async () => {
    try {
      await skipBillApi(bill.id);
      showToast(`Skipped ${bill.title}`);
      closeModal();
      onSkipped?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to skip bill', 'error');
    }
  });
}
