import { escapeHtml, todayISO } from '../../format';
import { showToast } from '../../components/toast';
import { restoreActivityApi } from '../../api';
import { createAmountInput, AmountInputComponent } from '../../components/amount-input';
import {
  addGroupMemberApi,
  createGroupExpenseApi,
  deleteGroupExpenseApi,
  updateGroupExpenseApi,
} from './api';
import {
  computeExactRemainingPaise,
  computeSummaryLine,
  formatPaise,
  formatRemainingMessage,
} from './helpers';
import { GroupDetailResponse, TimelineExpenseItem } from './types';

export interface GroupExpenseSheetOptions {
  detail: GroupDetailResponse;
  expense?: TimelineExpenseItem;
  onSaved: () => void;
}

export function openGroupExpenseSheet({
  detail,
  expense,
  onSaved,
}: GroupExpenseSheetOptions): void {
  let modal = document.getElementById('groupExpenseModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupExpenseModal';
    modal.className =
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4';
    document.body.appendChild(modal);
  }

  const group = detail.group;
  const isEditing = Boolean(expense);
  const isArchived = Boolean(group.archived_at);

  let activeMembers = detail.members.filter((m) => !m.left_at);
  if (activeMembers.length === 0) {
    showToast('No active members in group', 'error');
    return;
  }

  // Initial state
  let paidBy = isEditing ? expense!.paid_by : 'me';
  // Ensure paidBy exists in active members; fallback to first active member
  if (!activeMembers.some((m) => m.person_id === paidBy)) {
    paidBy = activeMembers[0].person_id;
  }

  let splitType: 'equal' | 'exact' = isEditing ? expense!.split_type : 'equal';

  let selectedMemberIds = new Set<string>();
  if (isEditing && expense!.shares && expense!.shares.length > 0) {
    for (const s of expense!.shares) {
      selectedMemberIds.add(s.person_id);
    }
  } else {
    for (const m of activeMembers) {
      selectedMemberIds.add(m.person_id);
    }
  }

  // Exact amounts map (in integer paise)
  const exactAmounts: Record<string, number> = {};
  if (isEditing && expense!.shares) {
    for (const s of expense!.shares) {
      exactAmounts[s.person_id] = s.amount_paise;
    }
  }

  let isAdjustOpen = isEditing && splitType === 'exact';
  let isAddingInlinePerson = false;

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[92dvh] overflow-y-auto">
      <div class="flex items-center justify-between pb-3 border-b border-borderDark">
        <h3 class="text-base font-semibold text-white">
          ${isEditing ? 'Edit Expense' : 'Add Group Expense'}
        </h3>
        <button type="button" id="closeExpenseSheetBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-10 w-10 flex items-center justify-center rounded-lg">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="groupExpenseForm" class="mt-4 space-y-4">
        <!-- 1. Description / Title -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Title / Description *</label>
          <input
            type="text"
            id="groupExpenseDesc"
            required
            placeholder="e.g. Dinner at Toit, Airbnb, Taxi, Groceries"
            value="${escapeHtml(expense?.description || '')}"
            ${isArchived ? 'disabled' : ''}
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60"
          />
        </div>

        <!-- 2. Amount Input (chunk 05 component) -->
        <div id="groupAmountContainer"></div>

        <!-- 3. Split Between Members Chips -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-medium text-zinc-400">Split between</label>
            <span class="text-[11px] text-zinc-500" id="selectedCountLabel">
              ${selectedMemberIds.size} of ${activeMembers.length} people
            </span>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap" id="memberChipsContainer">
            <!-- Rendered dynamically -->
          </div>

          <!-- Inline New Person Input (shown when + New person chip is clicked) -->
          <div id="inlineNewPersonRow" class="hidden mt-2 pt-2 border-t border-borderDark/60 flex items-center gap-2">
            <input
              type="text"
              id="inlineNewPersonName"
              placeholder="Person name..."
              class="flex-1 bg-surface2 border border-borderDark rounded-xl px-3 h-10 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              id="saveInlinePersonBtn"
              class="h-10 px-3.5 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95 transition-all"
            >
              Add
            </button>
            <button
              type="button"
              id="cancelInlinePersonBtn"
              class="h-10 px-2.5 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- 4. Live Summary Line -->
        <div
          id="summaryLineCard"
          class="p-3 bg-surface2/80 hover:bg-surface2 border border-borderDark rounded-xl flex items-center justify-between cursor-pointer transition-colors"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
            <span id="summaryLineText" class="text-xs sm:text-sm font-semibold text-zinc-200 truncate">
              <!-- Rendered dynamically -->
            </span>
          </div>
          <button
            type="button"
            id="toggleAdjustBtn"
            class="text-xs text-emerald-400 font-medium hover:underline shrink-0 flex items-center gap-1"
          >
            <span id="adjustBtnLabel">${isAdjustOpen ? 'Hide split' : 'Adjust split'}</span>
            <i data-lucide="${isAdjustOpen ? 'chevron-up' : 'chevron-down'}" class="w-3.5 h-3.5"></i>
          </button>
        </div>

        <!-- 5. Adjust Split Section (Collapsible) -->
        <div id="adjustSection" class="${isAdjustOpen ? '' : 'hidden'} space-y-4 pt-1">
          <!-- Paid By Picker & Next Payer Chip -->
          <div class="p-3 bg-surface2/50 border border-borderDark rounded-xl space-y-2.5">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <label class="block text-xs font-medium text-zinc-300">Paid by</label>
              <div id="nextPayerSlot">
                <!-- Rendered dynamically if next_payer is eligible -->
              </div>
            </div>

            <select
              id="paidBySelect"
              ${isArchived ? 'disabled' : ''}
              class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 focus:outline-none focus:border-emerald-500 text-xs sm:text-sm"
            >
              <!-- Populated dynamically -->
            </select>
          </div>

          <!-- Split Mode Toggle: Equal vs Exact -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="block text-xs font-medium text-zinc-400">Split Mode</label>
            </div>
            <div class="grid grid-cols-2 gap-2 p-1 bg-surface2 border border-borderDark rounded-xl">
              <button
                type="button"
                id="btnSplitEqual"
                class="py-2 text-xs font-semibold rounded-lg transition-all ${
                  splitType === 'equal'
                    ? 'bg-emerald-500 text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }"
              >
                Equal
              </button>
              <button
                type="button"
                id="btnSplitExact"
                class="py-2 text-xs font-semibold rounded-lg transition-all ${
                  splitType === 'exact'
                    ? 'bg-emerald-500 text-black shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }"
              >
                Exact Amounts
              </button>
            </div>
          </div>

          <!-- Exact Split Rows & Remaining Indicator -->
          <div id="exactSplitContainer" class="${splitType === 'exact' ? '' : 'hidden'} space-y-2.5">
            <div class="flex items-center justify-between px-1">
              <span class="text-xs text-zinc-400 font-medium">Assign shares</span>
              <span id="exactRemainingBadge" class="text-xs font-bold px-2 py-0.5 rounded-full mono border">
                <!-- Rendered dynamically -->
              </span>
            </div>
            <div id="exactMemberRows" class="space-y-2 max-h-48 overflow-y-auto pr-1">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- Date & Category -->
          <div class="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-zinc-400 mb-1">Date *</label>
              <input
                type="date"
                id="groupExpenseDate"
                required
                value="${expense?.date || todayISO()}"
                ${isArchived ? 'disabled' : ''}
                class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-zinc-400 mb-1">Category</label>
              <select
                id="groupExpenseCategory"
                ${isArchived ? 'disabled' : ''}
                class="w-full bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 focus:outline-none focus:border-emerald-500 text-xs sm:text-sm"
              >
                <option value="Food & Dining" ${expense?.category === 'Food & Dining' ? 'selected' : ''}>🍔 Food & Dining</option>
                <option value="Groceries" ${expense?.category === 'Groceries' ? 'selected' : ''}>🛒 Groceries</option>
                <option value="Shopping" ${expense?.category === 'Shopping' ? 'selected' : ''}>🛍️ Shopping</option>
                <option value="Bills & Utilities" ${expense?.category === 'Bills & Utilities' ? 'selected' : ''}>⚡ Bills & Utilities</option>
                <option value="Rent & Housing" ${expense?.category === 'Rent & Housing' ? 'selected' : ''}>🏠 Rent & Housing</option>
                <option value="Transport & Fuel" ${expense?.category === 'Transport & Fuel' ? 'selected' : ''}>⛽ Transport & Fuel</option>
                <option value="Entertainment" ${expense?.category === 'Entertainment' ? 'selected' : ''}>🎬 Entertainment</option>
                <option value="Health & Medical" ${expense?.category === 'Health & Medical' ? 'selected' : ''}>💊 Health & Medical</option>
                <option value="Others" ${!expense || expense.category === 'Others' ? 'selected' : ''}>📦 Others</option>
              </select>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Notes (Optional)</label>
            <textarea
              id="groupExpenseNotes"
              rows="2"
              placeholder="Optional notes or remarks"
              ${isArchived ? 'disabled' : ''}
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 py-2 text-zinc-200 focus:outline-none focus:border-emerald-500 text-xs sm:text-sm"
            >${escapeHtml(expense?.notes || '')}</textarea>
          </div>
        </div>

        <!-- Footer Buttons -->
        <div class="flex items-center justify-between pt-3 border-t border-borderDark gap-2">
          ${
            isEditing && !isArchived
              ? `
            <button
              type="button"
              id="deleteExpenseBtn"
              class="h-11 px-3.5 text-xs font-semibold rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <i data-lucide="trash-2" class="w-4 h-4"></i>
              <span>Delete</span>
            </button>
          `
              : '<div></div>'
          }

          <div class="flex items-center gap-2">
            <button
              type="button"
              id="cancelExpenseSheetBtn"
              class="h-11 px-4 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            ${
              !isArchived
                ? `
              <button
                type="submit"
                id="submitExpenseBtn"
                class="h-11 px-5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ${isEditing ? 'Save Changes' : 'Save Expense'}
              </button>
            `
                : ''
            }
          </div>
        </div>
      </form>
    </div>
  `;

  document.body.style.overflow = 'hidden';

  const closeBtn = modal.querySelector('#closeExpenseSheetBtn') as HTMLButtonElement;
  const cancelBtn = modal.querySelector('#cancelExpenseSheetBtn') as HTMLButtonElement;
  const form = modal.querySelector('#groupExpenseForm') as HTMLFormElement;
  const descInput = modal.querySelector('#groupExpenseDesc') as HTMLInputElement;
  const amountContainer = modal.querySelector('#groupAmountContainer') as HTMLElement;
  const memberChipsContainer = modal.querySelector('#memberChipsContainer') as HTMLElement;
  const selectedCountLabel = modal.querySelector('#selectedCountLabel') as HTMLElement;
  const inlinePersonRow = modal.querySelector('#inlineNewPersonRow') as HTMLElement;
  const inlinePersonNameInput = modal.querySelector('#inlineNewPersonName') as HTMLInputElement;
  const saveInlinePersonBtn = modal.querySelector('#saveInlinePersonBtn') as HTMLButtonElement;
  const cancelInlinePersonBtn = modal.querySelector('#cancelInlinePersonBtn') as HTMLButtonElement;
  const summaryLineCard = modal.querySelector('#summaryLineCard') as HTMLElement;
  const summaryLineText = modal.querySelector('#summaryLineText') as HTMLElement;
  const toggleAdjustBtn = modal.querySelector('#toggleAdjustBtn') as HTMLButtonElement;
  const adjustBtnLabel = modal.querySelector('#adjustBtnLabel') as HTMLElement;
  const adjustSection = modal.querySelector('#adjustSection') as HTMLElement;
  const paidBySelect = modal.querySelector('#paidBySelect') as HTMLSelectElement;
  const nextPayerSlot = modal.querySelector('#nextPayerSlot') as HTMLElement;
  const btnSplitEqual = modal.querySelector('#btnSplitEqual') as HTMLButtonElement;
  const btnSplitExact = modal.querySelector('#btnSplitExact') as HTMLButtonElement;
  const exactSplitContainer = modal.querySelector('#exactSplitContainer') as HTMLElement;
  const exactRemainingBadge = modal.querySelector('#exactRemainingBadge') as HTMLElement;
  const exactMemberRows = modal.querySelector('#exactMemberRows') as HTMLElement;
  const dateInput = modal.querySelector('#groupExpenseDate') as HTMLInputElement;
  const categorySelect = modal.querySelector('#groupExpenseCategory') as HTMLSelectElement;
  const notesInput = modal.querySelector('#groupExpenseNotes') as HTMLTextAreaElement;
  const submitBtn = modal.querySelector('#submitExpenseBtn') as HTMLButtonElement | null;
  const deleteBtn = modal.querySelector('#deleteExpenseBtn') as HTMLButtonElement | null;

  function closeModal() {
    if (modal) {
      modal.remove();
    }
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Mount Amount Input component
  let currentPaise: number = expense ? expense.amount_paise : 0;
  let currentExpr: string | null = expense?.amount_expr || null;

  const amountComp: AmountInputComponent = createAmountInput({
    initialPaise: isEditing ? expense!.amount_paise : null,
    initialExpr: isEditing ? expense!.amount_expr : null,
    quickChips: true,
    id: 'groupAmountField',
    required: true,
    onChange: (paise, expr) => {
      currentPaise = paise || 0;
      currentExpr = expr;
      updateUI();
    },
  });
  amountContainer.appendChild(amountComp.el);

  function getPayerDisplayName(pid: string): string {
    if (pid === 'me') return 'Me';
    const found = activeMembers.find((m) => m.person_id === pid);
    return found ? found.name : pid;
  }

  function renderPaidByOptions() {
    paidBySelect.innerHTML = activeMembers
      .map(
        (m) => `
        <option value="${escapeHtml(m.person_id)}" ${m.person_id === paidBy ? 'selected' : ''}>
          ${escapeHtml(m.name)}${m.is_me ? ' (Me)' : ''}
        </option>
      `
      )
      .join('');
  }

  function renderNextPayerChip() {
    // Spec 6: "Rahul's turn?" chip next to "Paid by", shown when next_payer is among selected participants and isn't me
    const nextPayerId = detail.next_payer;
    if (
      nextPayerId &&
      nextPayerId !== 'me' &&
      selectedMemberIds.has(nextPayerId) &&
      paidBy !== nextPayerId
    ) {
      const p = activeMembers.find((m) => m.person_id === nextPayerId);
      const payerName = p ? p.name : 'Next person';
      nextPayerSlot.innerHTML = `
        <button
          type="button"
          id="nextPayerTurnBtn"
          class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95 transition-all shadow-sm"
        >
          <span>✨ ${escapeHtml(payerName)}'s turn?</span>
        </button>
      `;

      const btn = nextPayerSlot.querySelector('#nextPayerTurnBtn');
      btn?.addEventListener('click', () => {
        paidBy = nextPayerId;
        paidBySelect.value = nextPayerId;
        updateUI();
      });
    } else {
      nextPayerSlot.innerHTML = '';
    }
  }

  function renderMemberChips() {
    let html = '';
    for (const m of activeMembers) {
      const isSelected = selectedMemberIds.has(m.person_id);
      html += `
        <button
          type="button"
          data-member-id="${escapeHtml(m.person_id)}"
          class="member-chip min-h-[38px] px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all ${
            isSelected
              ? 'bg-emerald-500 text-black border-emerald-500 font-semibold shadow-sm shadow-emerald-500/20'
              : 'bg-surface2 text-zinc-400 border-borderDark hover:text-white hover:border-zinc-700'
          }"
        >
          <span>${escapeHtml(m.name)}${m.is_me ? ' (Me)' : ''}</span>
          ${
            isSelected
              ? '<i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>'
              : '<i data-lucide="plus" class="w-3.5 h-3.5"></i>'
          }
        </button>
      `;
    }

    // + New person chip
    html += `
      <button
        type="button"
        id="openNewPersonChipBtn"
        class="min-h-[38px] px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-zinc-700 bg-surface2/60 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-400 flex items-center gap-1 active:scale-95 transition-all"
      >
        <i data-lucide="user-plus" class="w-3.5 h-3.5"></i>
        <span>New person</span>
      </button>
    `;

    memberChipsContainer.innerHTML = html;
    selectedCountLabel.textContent = `${selectedMemberIds.size} of ${activeMembers.length} people`;

    if (window.lucide) {
      window.lucide.createIcons();
    }

    memberChipsContainer.querySelectorAll<HTMLButtonElement>('.member-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.memberId;
        if (!pid) return;

        if (selectedMemberIds.has(pid)) {
          if (selectedMemberIds.size <= 1) {
            showToast('At least one person must be selected', 'error');
            return;
          }
          selectedMemberIds.delete(pid);
        } else {
          selectedMemberIds.add(pid);
        }
        updateUI();
      });
    });

    const openNewPersonBtn = memberChipsContainer.querySelector('#openNewPersonChipBtn');
    openNewPersonBtn?.addEventListener('click', () => {
      isAddingInlinePerson = true;
      inlinePersonRow.classList.remove('hidden');
      inlinePersonNameInput.focus();
    });
  }

  function renderExactMemberRows() {
    const selectedList = activeMembers.filter((m) => selectedMemberIds.has(m.person_id));
    let html = '';

    for (const m of selectedList) {
      const paise = exactAmounts[m.person_id] ?? 0;
      const rupeesVal = paise > 0 ? (paise / 100).toString() : '';

      html += `
        <div class="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-surface2/70 border border-borderDark">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
              ${escapeHtml(m.name.charAt(0) || '?')}
            </span>
            <span class="text-xs text-zinc-200 font-medium truncate">
              ${escapeHtml(m.name)}${m.is_me ? ' (Me)' : ''}
            </span>
          </div>

          <div class="relative w-32 shrink-0">
            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-semibold">₹</span>
            <input
              type="number"
              step="any"
              min="0"
              data-exact-person="${escapeHtml(m.person_id)}"
              value="${rupeesVal}"
              placeholder="0"
              class="exact-person-input w-full bg-surface border border-borderDark rounded-lg pl-6 pr-2 h-9 text-xs text-right text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      `;
    }

    exactMemberRows.innerHTML = html;

    exactMemberRows.querySelectorAll<HTMLInputElement>('.exact-person-input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const pid = inp.dataset.exactPerson;
        if (!pid) return;
        const val = parseFloat(inp.value.trim() || '0');
        const paise = Math.round((isNaN(val) ? 0 : Math.max(0, val)) * 100);
        exactAmounts[pid] = paise;
        updateExactRemaining();
      });
    });
  }

  function updateExactRemaining(): boolean {
    if (splitType !== 'exact') {
      if (submitBtn) submitBtn.disabled = false;
      return true;
    }

    const remainingPaise = computeExactRemainingPaise(
      currentPaise,
      exactAmounts,
      Array.from(selectedMemberIds)
    );
    const msg = formatRemainingMessage(remainingPaise);

    exactRemainingBadge.textContent = msg.text;

    if (msg.status === 'ok') {
      exactRemainingBadge.className =
        'text-xs font-bold px-2.5 py-0.5 rounded-full mono border bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      if (submitBtn) submitBtn.disabled = false;
      return true;
    } else if (msg.status === 'under') {
      exactRemainingBadge.className =
        'text-xs font-bold px-2.5 py-0.5 rounded-full mono border bg-amber-500/10 text-amber-400 border-amber-500/30';
      if (submitBtn) submitBtn.disabled = true;
      return false;
    } else {
      exactRemainingBadge.className =
        'text-xs font-bold px-2.5 py-0.5 rounded-full mono border bg-rose-500/10 text-rose-400 border-rose-500/30';
      if (submitBtn) submitBtn.disabled = true;
      return false;
    }
  }

  function updateUI() {
    renderMemberChips();
    renderPaidByOptions();
    renderNextPayerChip();

    // Summary line
    const summary = computeSummaryLine({
      totalPaise: currentPaise,
      splitType,
      participantCount: selectedMemberIds.size,
      payerName: getPayerDisplayName(paidBy),
    });
    summaryLineText.textContent = summary;

    if (splitType === 'exact') {
      renderExactMemberRows();
    }
    updateExactRemaining();
  }

  // Toggle Adjust Split section
  function toggleAdjust() {
    isAdjustOpen = !isAdjustOpen;
    adjustSection.classList.toggle('hidden', !isAdjustOpen);
    adjustBtnLabel.textContent = isAdjustOpen ? 'Hide split' : 'Adjust split';
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  summaryLineCard.addEventListener('click', (e) => {
    // Only toggle if not clicking another interactive element inside
    toggleAdjust();
  });

  // Paid By Select change
  paidBySelect.addEventListener('change', () => {
    paidBy = paidBySelect.value;
    updateUI();
  });

  // Split Type toggle
  btnSplitEqual.addEventListener('click', () => {
    if (splitType === 'equal') return;
    splitType = 'equal';
    btnSplitEqual.className =
      'py-2 text-xs font-semibold rounded-lg transition-all bg-emerald-500 text-black shadow-sm';
    btnSplitExact.className =
      'py-2 text-xs font-semibold rounded-lg transition-all text-zinc-400 hover:text-white';
    exactSplitContainer.classList.add('hidden');
    updateUI();
  });

  btnSplitExact.addEventListener('click', () => {
    if (splitType === 'exact') return;
    splitType = 'exact';
    btnSplitExact.className =
      'py-2 text-xs font-semibold rounded-lg transition-all bg-emerald-500 text-black shadow-sm';
    btnSplitEqual.className =
      'py-2 text-xs font-semibold rounded-lg transition-all text-zinc-400 hover:text-white';
    exactSplitContainer.classList.remove('hidden');

    // Pre-populate exact amounts equally if empty
    const selectedList = Array.from(selectedMemberIds);
    const currentAssigned = selectedList.reduce((sum, pid) => sum + (exactAmounts[pid] || 0), 0);
    if (currentAssigned === 0 && currentPaise > 0 && selectedList.length > 0) {
      const baseShare = Math.floor(currentPaise / selectedList.length);
      let remainder = currentPaise % selectedList.length;
      for (const pid of selectedList) {
        exactAmounts[pid] = baseShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
      }
    }

    updateUI();
  });

  // Inline Add Person
  cancelInlinePersonBtn.addEventListener('click', () => {
    inlinePersonRow.classList.add('hidden');
    inlinePersonNameInput.value = '';
    isAddingInlinePerson = false;
  });

  async function handleSaveInlinePerson() {
    const name = inlinePersonNameInput.value.trim();
    if (!name) return;

    saveInlinePersonBtn.disabled = true;
    saveInlinePersonBtn.textContent = '...';

    try {
      const result = await addGroupMemberApi(group.id, { name });
      if (result && result.person_id) {
        activeMembers.push({
          group_id: group.id,
          person_id: result.person_id,
          name: result.name,
          joined_at: new Date().toISOString(),
          left_at: null,
          upi_vpa: null,
          phone: null,
          is_me: 0,
        });
        selectedMemberIds.add(result.person_id);
        inlinePersonRow.classList.add('hidden');
        inlinePersonNameInput.value = '';
        isAddingInlinePerson = false;
        showToast(`Added ${result.name} to group`);
        updateUI();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to add member', 'error');
    } finally {
      saveInlinePersonBtn.disabled = false;
      saveInlinePersonBtn.textContent = 'Add';
    }
  }

  saveInlinePersonBtn.addEventListener('click', handleSaveInlinePerson);
  inlinePersonNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveInlinePerson();
    }
  });

  // Delete Expense
  if (deleteBtn && isEditing) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = confirm(`Delete expense "${expense!.description}"?`);
      if (!confirmed) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';

      try {
        const res = await deleteGroupExpenseApi(group.id, expense!.id);
        closeModal();
        showToast('Expense deleted', 'success', {
          label: 'Undo',
          onClick: async () => {
            if (res?.activity_id) {
              await restoreActivityApi(res.activity_id);
              showToast('Expense restored');
              onSaved();
            }
          },
        });
        onSaved();
      } catch (err: any) {
        showToast(err.message || 'Failed to delete expense', 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete';
      }
    });
  }

  // Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const desc = descInput.value.trim();
    if (!desc) {
      showToast('Title is required', 'error');
      descInput.focus();
      return;
    }

    if (!currentPaise || currentPaise <= 0) {
      showToast('Amount must be greater than zero', 'error');
      amountComp.focus();
      return;
    }

    if (selectedMemberIds.size === 0) {
      showToast('Select at least one participant', 'error');
      return;
    }

    if (splitType === 'exact') {
      const isBalanced = updateExactRemaining();
      if (!isBalanced) {
        showToast('Exact split amounts must add up to total', 'error');
        return;
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    const participantIds = Array.from(selectedMemberIds);
    const splitPayload =
      splitType === 'equal'
        ? { type: 'equal' as const, personIds: participantIds }
        : {
            type: 'exact' as const,
            amounts: Object.fromEntries(
              participantIds.map((pid) => [pid, exactAmounts[pid] ?? 0])
            ),
          };

    const payload = {
      description: desc,
      amount_paise: currentPaise,
      amount_expr: currentExpr || null,
      paid_by: paidBy,
      participant_ids: participantIds,
      split: splitPayload,
      category: categorySelect.value || 'Others',
      date: dateInput.value || todayISO(),
      notes: notesInput.value.trim() || null,
    };

    try {
      if (isEditing) {
        await updateGroupExpenseApi(group.id, expense!.id, payload);
        showToast('Expense updated');
      } else {
        await createGroupExpenseApi(group.id, payload);
        showToast('Expense added');
      }

      closeModal();
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Failed to save expense', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isEditing ? 'Save Changes' : 'Save Expense';
      }
    }
  });

  // Initial render
  updateUI();
  if (window.lucide) {
    window.lucide.createIcons();
  }

  setTimeout(() => {
    if (!isEditing) {
      descInput.focus();
    }
  }, 100);
}
