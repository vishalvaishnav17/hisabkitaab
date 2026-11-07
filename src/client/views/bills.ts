import {
  deleteBillApi,
  fetchBillsApi,
  RecurringBillItem,
  updateBillsTabBadge,
} from '../bills-api';
import {
  openBillModal,
  openPayBillConfirm,
  openSkipBillConfirm,
} from '../components/bill-sheet';
import { showToast } from '../components/toast';
import { escapeHtml, formatINR, todayISO } from '../format';

function formatBillAmount(paise: number | null): string {
  if (paise === null || paise === undefined) {
    return '<span class="text-zinc-400 font-sans text-xs">Varies</span>';
  }
  return formatINR(paise / 100);
}

function formatDisplayDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dateStr;
  }
}

export async function renderBills(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="space-y-6 pb-20">
      <!-- Top Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Recurring Bills</span>
            <span id="billsDueCountBadge" class="hidden px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30"></span>
          </h2>
          <p class="text-xs text-zinc-400 mt-1">Manage subscriptions, utilities, and shared periodic dues</p>
        </div>
        <button id="addBillBtn" class="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/10">
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>Add Bill</span>
        </button>
      </div>

      <!-- Filter Tabs: All, Personal, Shared -->
      <div class="flex items-center gap-2 bg-surface p-1 rounded-xl border border-borderDark max-w-xs select-none">
        <button type="button" data-filter="all" class="filter-tab flex-1 min-h-[36px] text-xs font-medium rounded-lg transition-colors bg-zinc-800 text-white cursor-pointer">
          All
        </button>
        <button type="button" data-filter="personal" class="filter-tab flex-1 min-h-[36px] text-xs font-medium rounded-lg transition-colors text-zinc-400 hover:text-white cursor-pointer">
          Personal
        </button>
        <button type="button" data-filter="shared" class="filter-tab flex-1 min-h-[36px] text-xs font-medium rounded-lg transition-colors text-zinc-400 hover:text-white cursor-pointer">
          Shared
        </button>
      </div>

      <!-- Loading State -->
      <div id="billsLoading" class="py-16 text-center text-zinc-500 text-sm flex flex-col items-center gap-3">
        <div class="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading bills...</span>
      </div>

      <!-- Main Content Container -->
      <div id="billsContent" class="hidden space-y-8">
        <!-- Personal Section -->
        <section id="sectionPersonal" class="space-y-4">
          <div class="flex items-center justify-between border-b border-borderDark pb-2.5">
            <h3 class="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>Personal Bills</span>
            </h3>
            <span id="personalCountTag" class="text-xs text-zinc-500"></span>
          </div>

          <!-- Personal Due -->
          <div class="space-y-2.5">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Due & Overdue</h4>
            <div id="personalDueList" class="space-y-2.5"></div>
          </div>

          <!-- Personal Upcoming -->
          <div class="space-y-2.5 pt-2">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Upcoming</h4>
            <div id="personalUpcomingList" class="space-y-2.5"></div>
          </div>
        </section>

        <!-- Shared Section -->
        <section id="sectionShared" class="space-y-4">
          <div class="flex items-center justify-between border-b border-borderDark pb-2.5">
            <h3 class="text-base font-semibold text-zinc-200 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              <span>Shared Bills</span>
            </h3>
            <span id="sharedCountTag" class="text-xs text-zinc-500"></span>
          </div>

          <!-- Shared Due -->
          <div class="space-y-2.5">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Due & Overdue</h4>
            <div id="sharedDueList" class="space-y-2.5"></div>
          </div>

          <!-- Shared Upcoming -->
          <div class="space-y-2.5 pt-2">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Upcoming</h4>
            <div id="sharedUpcomingList" class="space-y-2.5"></div>
          </div>
        </section>

        <!-- Empty Overall State -->
        <div id="billsEmptyAll" class="hidden py-16 text-center">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-surface2 border border-borderDark flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/5">
            <i data-lucide="receipt" class="w-7 h-7"></i>
          </div>
          <h3 class="text-base font-bold text-white tracking-tight">No recurring bills yet</h3>
          <p class="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
            Add recurring subscriptions, monthly rent, Wi-Fi or electricity to track dues and split automatically.
          </p>
          <button id="emptyAddBillBtn" class="mt-4 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs inline-flex items-center gap-2 cursor-pointer shadow-md">
            <i data-lucide="plus" class="w-4 h-4"></i>
            <span>Add First Bill</span>
          </button>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  container.querySelector('#addBillBtn')?.addEventListener('click', () => {
    openBillModal(null, () => loadData());
  });

  container.querySelector('#emptyAddBillBtn')?.addEventListener('click', () => {
    openBillModal(null, () => loadData());
  });

  // Filter tab interactions
  let activeFilter: 'all' | 'personal' | 'shared' = 'all';
  const filterTabs = container.querySelectorAll<HTMLButtonElement>('.filter-tab');
  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeFilter = (tab.dataset.filter as any) || 'all';
      filterTabs.forEach((t) => {
        if (t === tab) {
          t.className =
            'filter-tab flex-1 min-h-[36px] text-xs font-medium rounded-lg transition-colors bg-zinc-800 text-white cursor-pointer';
        } else {
          t.className =
            'filter-tab flex-1 min-h-[36px] text-xs font-medium rounded-lg transition-colors text-zinc-400 hover:text-white cursor-pointer';
        }
      });
      applyFilterVisibility();
    });
  });

  function applyFilterVisibility(): void {
    const secPersonal = container.querySelector('#sectionPersonal') as HTMLElement;
    const secShared = container.querySelector('#sectionShared') as HTMLElement;
    if (!secPersonal || !secShared) return;

    if (activeFilter === 'all') {
      secPersonal.classList.remove('hidden');
      secShared.classList.remove('hidden');
    } else if (activeFilter === 'personal') {
      secPersonal.classList.remove('hidden');
      secShared.classList.add('hidden');
    } else {
      secPersonal.classList.add('hidden');
      secShared.classList.remove('hidden');
    }
  }

  async function loadData(): Promise<void> {
    const loadingEl = container.querySelector('#billsLoading');
    const contentEl = container.querySelector('#billsContent');
    const emptyAllEl = container.querySelector('#billsEmptyAll');
    const badgeEl = container.querySelector('#billsDueCountBadge');

    try {
      const data = await fetchBillsApi();
      await updateBillsTabBadge();

      if (loadingEl) loadingEl.classList.add('hidden');
      if (!data || !contentEl) return;
      contentEl.classList.remove('hidden');

      const allItems = [...data.due, ...data.upcoming];
      if (allItems.length === 0) {
        if (emptyAllEl) emptyAllEl.classList.remove('hidden');
        container.querySelector('#sectionPersonal')?.classList.add('hidden');
        container.querySelector('#sectionShared')?.classList.add('hidden');
        if (badgeEl) badgeEl.classList.add('hidden');
        return;
      } else {
        if (emptyAllEl) emptyAllEl.classList.add('hidden');
        applyFilterVisibility();
      }

      // Update Due Badge in heading
      if (badgeEl) {
        if (data.due.length > 0) {
          badgeEl.textContent = `${data.due.length} Due`;
          badgeEl.classList.remove('hidden');
        } else {
          badgeEl.classList.add('hidden');
        }
      }

      // Partition into Personal & Shared
      const personalDue = data.due.filter((b) => b.kind === 'personal');
      const personalUpcoming = data.upcoming.filter((b) => b.kind === 'personal');
      const sharedDue = data.due.filter((b) => b.kind === 'shared');
      const sharedUpcoming = data.upcoming.filter((b) => b.kind === 'shared');

      const personalCountTag = container.querySelector('#personalCountTag');
      if (personalCountTag) {
        personalCountTag.textContent = `${personalDue.length + personalUpcoming.length} total`;
      }

      const sharedCountTag = container.querySelector('#sharedCountTag');
      if (sharedCountTag) {
        sharedCountTag.textContent = `${sharedDue.length + sharedUpcoming.length} total`;
      }

      // Render lists
      renderBillList(
        container.querySelector('#personalDueList'),
        personalDue,
        true,
        'No personal bills due'
      );
      renderBillList(
        container.querySelector('#personalUpcomingList'),
        personalUpcoming,
        false,
        'No upcoming personal bills'
      );
      renderBillList(
        container.querySelector('#sharedDueList'),
        sharedDue,
        true,
        'No shared bills due'
      );
      renderBillList(
        container.querySelector('#sharedUpcomingList'),
        sharedUpcoming,
        false,
        'No upcoming shared bills'
      );

      if (window.lucide) {
        window.lucide.createIcons();
      }
    } catch (err: any) {
      if (loadingEl) {
        loadingEl.innerHTML = `<span class="text-rose-400 text-xs">Failed to load bills: ${escapeHtml(err.message)}</span>`;
      }
    }
  }

  function renderBillList(
    listContainer: HTMLElement | null,
    bills: RecurringBillItem[],
    isDueSection: boolean,
    emptyMessage: string
  ): void {
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (bills.length === 0) {
      listContainer.innerHTML = `
        <div class="bg-surface/50 border border-borderDark/60 rounded-xl p-4 text-center text-xs text-zinc-500">
          ${isDueSection ? '<span class="text-emerald-400 font-mono">✓</span> ' : ''}${escapeHtml(emptyMessage)}
        </div>
      `;
      return;
    }

    const today = todayISO();

    for (const bill of bills) {
      const card = document.createElement('div');
      card.className =
        'bg-surface border border-borderDark hover:border-zinc-700/80 rounded-2xl p-4 transition-all shadow-sm';

      let statusBadge = '';
      if (isDueSection) {
        if (bill.periods_due > 1) {
          statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-300">${bill.periods_due} periods due</span>`;
        } else if (bill.is_overdue) {
          statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-300">Overdue</span>`;
        } else {
          statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">Due</span>`;
        }
      }

      const cadenceLabel =
        bill.cadence.charAt(0).toUpperCase() + bill.cadence.slice(1);

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <h4 class="text-base font-bold text-white tracking-tight truncate">${escapeHtml(bill.title)}</h4>
              ${statusBadge}
            </div>

            <div class="flex items-center gap-2 flex-wrap text-xs text-zinc-400 mt-1">
              <span class="px-2 py-0.5 rounded-md bg-surface2 border border-borderDark font-mono text-[11px]">${cadenceLabel}</span>
              ${
                bill.group_name
                  ? `<span class="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px]">${escapeHtml(bill.group_name)}</span>`
                  : ''
              }
              <span>${escapeHtml(bill.category)}</span>
              ${bill.payment_method ? `<span class="text-zinc-600">&bull;</span><span>${escapeHtml(bill.payment_method)}</span>` : ''}
            </div>
          </div>

          <div class="text-right shrink-0">
            <div class="text-base sm:text-lg font-bold mono text-emerald-400">
              ${formatBillAmount(bill.amount_paise)}
            </div>
            <div class="text-xs text-zinc-400 mt-0.5">
              ${isDueSection ? (bill.next_due < today ? `<span class="text-rose-400">Was due ${formatDisplayDate(bill.next_due)}</span>` : `Due today`) : `Due ${formatDisplayDate(bill.next_due)}`}
            </div>
          </div>
        </div>

        <!-- Action bar -->
        <div class="mt-4 pt-3 border-t border-borderDark/60 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button class="edit-bill-btn h-9 px-3 rounded-lg bg-surface2 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-borderDark text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
              <span>Edit</span>
            </button>
            <button class="delete-bill-btn h-9 w-9 rounded-lg bg-surface2 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 border border-borderDark flex items-center justify-center transition-colors cursor-pointer" title="Delete Bill">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button class="skip-bill-btn min-h-[36px] px-3.5 rounded-lg bg-surface2 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-borderDark text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer">
              <i data-lucide="skip-forward" class="w-3.5 h-3.5"></i>
              <span>Skip</span>
            </button>
            <button class="pay-bill-btn min-h-[36px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm">
              <i data-lucide="check" class="w-3.5 h-3.5"></i>
              <span>Mark Paid</span>
            </button>
          </div>
        </div>
      `;

      // Event handlers
      card.querySelector('.edit-bill-btn')?.addEventListener('click', () => {
        openBillModal(bill, () => loadData());
      });

      card.querySelector('.delete-bill-btn')?.addEventListener('click', async () => {
        if (!confirm(`Delete recurring bill "${bill.title}"?`)) return;
        try {
          await deleteBillApi(bill.id);
          showToast(`Deleted ${bill.title}`);
          loadData();
        } catch (err: any) {
          showToast(err.message || 'Failed to delete bill', 'error');
        }
      });

      card.querySelector('.skip-bill-btn')?.addEventListener('click', () => {
        openSkipBillConfirm(bill, () => loadData());
      });

      card.querySelector('.pay-bill-btn')?.addEventListener('click', () => {
        openPayBillConfirm(bill, () => loadData());
      });

      listContainer.appendChild(card);
    }
  }

  // Initial load
  loadData();
}
