import { createExpenseApi, updateExpenseApi, Expense } from '../api';
import { todayISO } from '../format';
import { showToast } from './toast';

export function openExpenseModal(expense?: Expense): void {
  const modal = document.getElementById('expenseModal');
  const form = document.getElementById('expenseForm') as HTMLFormElement | null;
  const modalTitle = document.getElementById('modalTitle');
  const idInput = document.getElementById('formExpenseId') as HTMLInputElement | null;
  const amountInput = document.getElementById('formAmount') as HTMLInputElement | null;
  const descInput = document.getElementById('formDescription') as HTMLInputElement | null;
  const catInput = document.getElementById('formCategory') as HTMLSelectElement | null;
  const payInput = document.getElementById('formPaymentMethod') as HTMLSelectElement | null;
  const dateInput = document.getElementById('formDate') as HTMLInputElement | null;
  const notesInput = document.getElementById('formNotes') as HTMLTextAreaElement | null;

  if (!modal || !form || !modalTitle || !idInput || !amountInput || !descInput || !catInput || !payInput || !dateInput || !notesInput) {
    return;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';

  if (expense) {
    idInput.value = expense.id;
    amountInput.value = String(expense.amount);
    descInput.value = expense.description;
    catInput.value = expense.category;
    payInput.value = expense.payment_method;
    dateInput.value = expense.date;
    notesInput.value = expense.notes || '';
    modalTitle.innerText = 'Edit Expense';
  } else {
    form.reset();
    idInput.value = '';
    modalTitle.innerText = 'Add New Expense';
    dateInput.value = todayISO();
  }

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

  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => openExpenseModal());
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', closeExpenseModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeExpenseModal);
  }

  // Quick Amount buttons
  document.querySelectorAll<HTMLButtonElement>('.quick-amt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const add = parseFloat(btn.dataset.amt || '0') || 0;
      const input = document.getElementById('formAmount') as HTMLInputElement | null;
      if (!input) return;
      const curr = parseFloat(input.value) || 0;
      input.value = (curr + add).toFixed(2);
    });
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idInput = document.getElementById('formExpenseId') as HTMLInputElement | null;
      const amountInput = document.getElementById('formAmount') as HTMLInputElement | null;
      const descInput = document.getElementById('formDescription') as HTMLInputElement | null;
      const catInput = document.getElementById('formCategory') as HTMLSelectElement | null;
      const payInput = document.getElementById('formPaymentMethod') as HTMLSelectElement | null;
      const dateInput = document.getElementById('formDate') as HTMLInputElement | null;
      const notesInput = document.getElementById('formNotes') as HTMLTextAreaElement | null;

      if (!amountInput || !descInput || !catInput || !payInput || !dateInput) return;

      const id = idInput?.value || '';
      const payload = {
        amount: parseFloat(amountInput.value),
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
            showToast('Expense updated');
            closeExpenseModal();
            onSaveSuccess();
          }
        } else {
          const res = await createExpenseApi(payload);
          if (res) {
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
