import { escapeHtml, todayISO } from '../../format';
import { showToast } from '../../components/toast';
import { restoreActivityApi } from '../../api';
import { createAmountInput } from '../../components/amount-input';
import { createGroupTransferApi, deleteGroupTransferApi } from './api';
import { formatPaise } from './helpers';
import { GroupDetailResponse, TimelineTransferItem } from './types';

export interface TransferSheetOptions {
  detail: GroupDetailResponse;
  prefill?: {
    from_person?: string;
    to_person?: string;
    amount_paise?: number;
    amount_expr?: string | null;
  };
  onSaved: () => void;
}

export function openTransferSheet({ detail, prefill, onSaved }: TransferSheetOptions): void {
  const existingModal = document.getElementById('groupTransferModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'groupTransferModal';
  modal.className =
    'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4';

  const group = detail.group;
  const isArchived = Boolean(group.archived_at);
  const activeMembers = detail.members.filter((m) => !m.left_at);

  if (activeMembers.length < 2) {
    showToast('At least 2 active members are needed to record a payment', 'error');
    return;
  }

  // 1. Determine default debtor (from_person)
  let defaultFrom = prefill?.from_person;
  if (!defaultFrom || !activeMembers.some((m) => m.person_id === defaultFrom)) {
    if (detail.my_net_paise < 0) {
      defaultFrom = 'me';
    } else if (detail.settlements.length > 0) {
      defaultFrom = detail.settlements[0].from;
    } else if (detail.next_payer && activeMembers.some((m) => m.person_id === detail.next_payer)) {
      defaultFrom = detail.next_payer;
    } else {
      // Find person with lowest net balance
      let lowestId = activeMembers[0].person_id;
      let lowestBal = detail.balances[lowestId] ?? 0;
      for (const m of activeMembers) {
        const bal = detail.balances[m.person_id] ?? 0;
        if (bal < lowestBal) {
          lowestBal = bal;
          lowestId = m.person_id;
        }
      }
      defaultFrom = lowestId;
    }
  }

  // 2. Determine default creditor (to_person)
  let defaultTo = prefill?.to_person;
  if (!defaultTo || defaultTo === defaultFrom || !activeMembers.some((m) => m.person_id === defaultTo)) {
    const matchingSettlement = detail.settlements.find((s) => s.from === defaultFrom);
    if (matchingSettlement && matchingSettlement.to !== defaultFrom) {
      defaultTo = matchingSettlement.to;
    } else {
      // Find member with highest positive balance different from defaultFrom
      let bestTo = activeMembers.find((m) => m.person_id !== defaultFrom)?.person_id || '';
      let bestBal = -Infinity;
      for (const m of activeMembers) {
        if (m.person_id === defaultFrom) continue;
        const bal = detail.balances[m.person_id] ?? 0;
        if (bal > bestBal) {
          bestBal = bal;
          bestTo = m.person_id;
        }
      }
      defaultTo = bestTo;
    }
  }

  const methods = ['UPI', 'Cash', 'Bank', 'Other'];
  let selectedMethod = 'UPI';

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[92dvh] overflow-y-auto">
      <div class="flex items-center justify-between pb-3 border-b border-borderDark">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <i data-lucide="arrow-left-right" class="w-4 h-4"></i>
          </div>
          <h3 class="text-base font-semibold text-white">Record Payment</h3>
        </div>
        <button type="button" id="closeTransferSheetBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-10 w-10 flex items-center justify-center rounded-lg cursor-pointer">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="groupTransferForm" class="mt-4 space-y-4">
        <!-- Who paid whom (Pickers) -->
        <div class="p-3.5 bg-surface2/60 border border-borderDark rounded-2xl space-y-3">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Paid by (From) *</label>
            <select
              id="transferFromSelect"
              ${isArchived ? 'disabled' : ''}
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 text-sm focus:outline-none focus:border-emerald-500"
            >
              ${activeMembers
                .map(
                  (m) => `
                <option value="${escapeHtml(m.person_id)}" ${m.person_id === defaultFrom ? 'selected' : ''}>
                  ${escapeHtml(m.name)}${m.is_me ? ' (You)' : ''}
                </option>
              `
                )
                .join('')}
            </select>
          </div>

          <div class="flex items-center justify-center -my-1 text-zinc-500">
            <i data-lucide="arrow-down" class="w-4 h-4 text-cyan-400"></i>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Paid to (To) *</label>
            <select
              id="transferToSelect"
              ${isArchived ? 'disabled' : ''}
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 text-sm focus:outline-none focus:border-emerald-500"
            >
              ${activeMembers
                .map(
                  (m) => `
                <option value="${escapeHtml(m.person_id)}" ${m.person_id === defaultTo ? 'selected' : ''}>
                  ${escapeHtml(m.name)}${m.is_me ? ' (You)' : ''}
                </option>
              `
                )
                .join('')}
            </select>
          </div>
        </div>

        <!-- Amount Input (chunk 05 component) -->
        <div id="transferAmountContainer"></div>

        <!-- Payment Method Chips -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1.5">Payment Method</label>
          <div class="flex items-center gap-2 flex-wrap" id="methodChipsContainer">
            ${methods
              .map(
                (m) => `
              <button
                type="button"
                data-method="${escapeHtml(m)}"
                class="method-chip h-9 min-h-[36px] px-3.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  m === selectedMethod
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-semibold'
                    : 'bg-surface2 text-zinc-400 border-borderDark hover:text-zinc-200'
                }"
              >
                ${escapeHtml(m)}
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Date & Note -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Date</label>
            <input
              type="date"
              id="transferDateInput"
              value="${todayISO()}"
              ${isArchived ? 'disabled' : ''}
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Note (Optional)</label>
            <input
              type="text"
              id="transferNoteInput"
              placeholder="e.g. UPI / Google Pay"
              ${isArchived ? 'disabled' : ''}
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <!-- Submit & Cancel Actions -->
        <div class="pt-2 flex gap-3">
          <button
            type="button"
            id="cancelTransferBtn"
            class="flex-1 min-h-[44px] bg-surface2 hover:bg-zinc-800 text-zinc-300 font-medium rounded-xl border border-borderDark cursor-pointer active:scale-95 transition-all text-xs sm:text-sm"
          >
            Cancel
          </button>
          ${
            !isArchived
              ? `
            <button
              type="submit"
              id="submitTransferBtn"
              class="flex-1 min-h-[44px] bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl cursor-pointer shadow-lg shadow-emerald-500/10 active:scale-95 transition-all text-xs sm:text-sm"
            >
              Save Payment
            </button>
          `
              : ''
          }
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
  };

  modal.querySelector('#closeTransferSheetBtn')?.addEventListener('click', closeModal);
  modal.querySelector('#cancelTransferBtn')?.addEventListener('click', closeModal);

  // Close when clicking backdrop outside card
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Amount input instance
  const amountContainer = modal.querySelector('#transferAmountContainer') as HTMLElement;
  const amountComp = createAmountInput({
    initialPaise: prefill?.amount_paise,
    initialExpr: prefill?.amount_expr,
    label: 'Amount (₹) *',
    required: true,
  });
  amountContainer.appendChild(amountComp.el);

  // Method chip selection
  const chipsContainer = modal.querySelector('#methodChipsContainer') as HTMLElement;
  chipsContainer.querySelectorAll<HTMLButtonElement>('.method-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMethod = btn.dataset.method || 'UPI';
      chipsContainer.querySelectorAll<HTMLButtonElement>('.method-chip').forEach((b) => {
        if (b.dataset.method === selectedMethod) {
          b.className =
            'method-chip h-9 min-h-[36px] px-3.5 rounded-xl text-xs border transition-all cursor-pointer bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-semibold';
        } else {
          b.className =
            'method-chip h-9 min-h-[36px] px-3.5 rounded-xl text-xs border transition-all cursor-pointer bg-surface2 text-zinc-400 border-borderDark hover:text-zinc-200';
        }
      });
    });
  });

  // Form submit handler
  const form = modal.querySelector('#groupTransferForm') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fromSelect = modal.querySelector('#transferFromSelect') as HTMLSelectElement;
    const toSelect = modal.querySelector('#transferToSelect') as HTMLSelectElement;
    const fromPerson = fromSelect.value;
    const toPerson = toSelect.value;

    if (!fromPerson || !toPerson) {
      showToast('Please select both From and To members', 'error');
      return;
    }

    if (fromPerson === toPerson) {
      showToast('From and To members must be different', 'error');
      toSelect.focus();
      return;
    }

    const { paise: currentPaise, expr: currentExpr } = amountComp.getValue();
    if (!currentPaise || currentPaise <= 0) {
      showToast('Amount must be greater than zero', 'error');
      amountComp.focus();
      return;
    }

    const dateInput = modal.querySelector('#transferDateInput') as HTMLInputElement;
    const noteInput = modal.querySelector('#transferNoteInput') as HTMLInputElement;
    const submitBtn = modal.querySelector('#submitTransferBtn') as HTMLButtonElement | null;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    try {
      await createGroupTransferApi(group.id, {
        from_person: fromPerson,
        to_person: toPerson,
        amount_paise: currentPaise,
        amount_expr: currentExpr || null,
        method: selectedMethod,
        date: dateInput.value || todayISO(),
        note: noteInput.value.trim() || null,
      });

      showToast('Payment recorded');
      closeModal();
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Payment';
      }
    }
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

export interface TransferDetailModalOptions {
  detail: GroupDetailResponse;
  transfer: TimelineTransferItem;
  onDeleted: () => void;
}

export function openTransferDetailModal({
  detail,
  transfer,
  onDeleted,
}: TransferDetailModalOptions): void {
  const existingModal = document.getElementById('transferDetailModal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'transferDetailModal';
  modal.className =
    'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4';

  const isArchived = Boolean(detail.group.archived_at);

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[92dvh] overflow-y-auto">
      <div class="flex items-center justify-between pb-3 border-b border-borderDark">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <i data-lucide="arrow-left-right" class="w-4 h-4"></i>
          </div>
          <h3 class="text-base font-semibold text-white">Payment Details</h3>
        </div>
        <button type="button" id="closeTransferDetailBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-10 w-10 flex items-center justify-center rounded-lg cursor-pointer">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <div class="mt-4 space-y-4">
        <!-- Amount Hero -->
        <div class="p-4 bg-surface2/60 border border-borderDark rounded-2xl text-center space-y-1">
          <span class="text-xs text-zinc-400 font-medium">Payment Amount</span>
          <div class="text-2xl sm:text-3xl font-extrabold text-cyan-400 font-mono tracking-tight">
            ${formatPaise(transfer.amount_paise)}
          </div>
          ${
            transfer.amount_expr
              ? `<span class="text-xs text-zinc-500 font-mono block">${escapeHtml(transfer.amount_expr)}</span>`
              : ''
          }
        </div>

        <!-- Transfer Parties -->
        <div class="p-3.5 bg-surface border border-borderDark rounded-2xl space-y-2.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-zinc-400">Paid by</span>
            <span class="font-semibold text-white">${escapeHtml(transfer.from_name)}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-zinc-400">Paid to</span>
            <span class="font-semibold text-white">${escapeHtml(transfer.to_name)}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-zinc-400">Date</span>
            <span class="font-mono text-zinc-300">${escapeHtml(transfer.date)}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-zinc-400">Method</span>
            <span class="px-2 py-0.5 rounded-md bg-surface2 text-zinc-300 border border-borderDark font-medium">
              ${escapeHtml(transfer.method || 'Not specified')}
            </span>
          </div>
          ${
            transfer.note
              ? `
            <div class="pt-2 border-t border-borderDark/60">
              <span class="text-zinc-400 block mb-1">Note</span>
              <p class="text-zinc-200 italic bg-surface2/40 p-2.5 rounded-xl border border-borderDark/40">
                "${escapeHtml(transfer.note)}"
              </p>
            </div>
          `
              : ''
          }
        </div>

        <!-- Actions -->
        <div class="pt-2 space-y-2">
          ${
            !isArchived
              ? `
            <button
              type="button"
              id="deleteTransferBtn"
              class="w-full min-h-[44px] text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl border border-rose-500/20 active:scale-95 transition-all cursor-pointer"
            >
              Delete Transfer
            </button>
          `
              : ''
          }
          <button
            type="button"
            id="doneTransferDetailBtn"
            class="w-full min-h-[44px] text-xs font-semibold text-zinc-300 hover:text-white bg-surface2 hover:bg-zinc-800 rounded-xl border border-borderDark active:scale-95 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  const closeModal = () => {
    modal.remove();
    document.body.style.overflow = '';
  };

  modal.querySelector('#closeTransferDetailBtn')?.addEventListener('click', closeModal);
  modal.querySelector('#doneTransferDetailBtn')?.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  const deleteBtn = modal.querySelector('#deleteTransferBtn') as HTMLButtonElement | null;
  if (deleteBtn && !isArchived) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        `Delete payment of ${formatPaise(transfer.amount_paise)} from ${transfer.from_name} to ${transfer.to_name}?`
      );
      if (!confirmed) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';

      try {
        const res = await deleteGroupTransferApi(detail.group.id, transfer.id);
        closeModal();
        showToast('Transfer deleted', 'success', {
          label: 'Undo',
          onClick: async () => {
            if (res?.activity_id) {
              await restoreActivityApi(res.activity_id);
              showToast('Transfer restored');
              onDeleted();
            }
          },
        });
        onDeleted();
      } catch (err: any) {
        showToast(err.message || 'Failed to delete transfer', 'error');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Transfer';
      }
    });
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}
