import { createExpenseApi, updateExpenseApi, Expense, ExpensePayload } from '../api';
import { todayISO } from '../format';
import { showToast } from './toast';
import {
  createAmountInput,
  saveMultiplierFromExpr,
  AmountInputComponent,
} from './amount-input';

let amountComp: AmountInputComponent | null = null;

function getAmountComponent(): AmountInputComponent | null {
  if (!amountComp) {
    const container = document.getElementById('formAmountContainer');
    if (container) {
      amountComp = createAmountInput({
        quickChips: true,
        id: 'formAmount',
      });
      container.appendChild(amountComp.el);
    }
  }
  return amountComp;
}

export function openExpenseModal(expense?: Expense): void {
  const modal = document.getElementById('expenseModal');
  const form = document.getElementById('expenseForm') as HTMLFormElement | null;
  const modalTitle = document.getElementById('modalTitle');
  const idInput = document.getElementById('formExpenseId') as HTMLInputElement | null;
  const descInput = document.getElementById('formDescription') as HTMLInputElement | null;
  const catInput = document.getElementById('formCategory') as HTMLSelectElement | null;
  const payInput = document.getElementById('formPaymentMethod') as HTMLSelectElement | null;
  const dateInput = document.getElementById('formDate') as HTMLInputElement | null;
  const notesInput = document.getElementById('formNotes') as HTMLTextAreaElement | null;

  const amountInput = getAmountComponent();

  if (
    !modal ||
    !form ||
    !modalTitle ||
    !idInput ||
    !amountInput ||
    !descInput ||
    !catInput ||
    !payInput ||
    !dateInput ||
    !notesInput
  ) {
    return;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';

  if (expense) {
    idInput.value = expense.id;
    if (expense.amount_expr) {
      amountInput.setValue(null, expense.amount_expr);
    } else {
      amountInput.setValue(expense.amount_paise ?? Math.round((expense.amount || 0) * 100), null);
    }
    descInput.value = expense.description;
    catInput.value = expense.category;
    payInput.value = expense.payment_method;
    dateInput.value = expense.date;
    notesInput.value = expense.notes || '';
    modalTitle.innerText = 'Edit Expense';
  } else {
    form.reset();
    idInput.value = '';
    amountInput.setValue(null, null);
    modalTitle.innerText = 'Add New Expense';
    dateInput.value = todayISO();
  }

  amountInput.updateRateChip();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

export function closeExpenseModal(): void {
  const modal = document.getElementById('expenseModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

export function initExpenseSheet(onSaveSuccess: () => void): void {
  const openAddBtn = document.getElementById('openAddModalBtn');
  const closeBtn = document.getElementById('closeModalBtn');
  const cancelBtn = document.getElementById('cancelModalBtn');
  const form = document.getElementById('expenseForm') as HTMLFormElement | null;

  // Mount amount input component eagerly
  getAmountComponent();

  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => openExpenseModal());
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeExpenseModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeExpenseModal);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idInput = document.getElementById('formExpenseId') as HTMLInputElement | null;
      const descInput = document.getElementById('formDescription') as HTMLInputElement | null;
      const catInput = document.getElementById('formCategory') as HTMLSelectElement | null;
      const payInput = document.getElementById('formPaymentMethod') as HTMLSelectElement | null;
      const dateInput = document.getElementById('formDate') as HTMLInputElement | null;
      const notesInput = document.getElementById('formNotes') as HTMLTextAreaElement | null;

      const amountInput = getAmountComponent();
      if (!amountInput || !descInput || !catInput || !payInput || !dateInput) return;

      const { paise, expr } = amountInput.getValue();
      if (!paise || paise <= 0) {
        showToast('Please enter a valid amount', 'error');
        amountInput.focus();
        return;
      }

      const id = idInput?.value || '';
      const payload: ExpensePayload = {
        amount_paise: paise,
        amount: paise,
        amount_expr: expr,
        description: descInput.value.trim(),
        category: catInput.value,
        payment_method: payInput.value,
        date: dateInput.value,
        notes: notesInput ? notesInput.value.trim() : null,
      };

      try {
        if (id) {
          const res = await updateExpenseApi(id, payload);
          if (res) {
            saveMultiplierFromExpr(expr || amountInput.inputEl.value);
            amountInput.updateRateChip();
            showToast('Expense updated');
            closeExpenseModal();
            onSaveSuccess();
          }
        } else {
          const res = await createExpenseApi(payload);
          if (res) {
            saveMultiplierFromExpr(expr || amountInput.inputEl.value);
            amountInput.updateRateChip();
            showToast('Expense recorded');
            closeExpenseModal();
            onSaveSuccess();
          }
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to save expense', 'error');
      }
    });
  }
}
