import {
  fetchExpensesApi,
  deleteExpenseApi,
  getExportCsvUrl,
  Expense,
  Stats,
} from '../api';
import { formatINR, escapeHtml } from '../format';
import { openExpenseModal } from '../components/expense-sheet';
import { showToast } from '../components/toast';

export const categoryColors: Record<string, string> = {
  'Food & Dining': '#f59e0b',
  'Groceries': '#10b981',
  'Shopping': '#a855f7',
  'Bills & Utilities': '#eab308',
  'Rent & Housing': '#3b82f6',
  'Transport & Fuel': '#06b6d4',
  'Entertainment': '#ec4899',
  'Health & Medical': '#ef4444',
  'Investments & Savings': '#22c55e',
  'Others': '#71717a',
};

let cachedExpenses: Expense[] = [];
let categoryChart: any = null;
let trendChart: any = null;

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: any;
  return function (...args: Parameters<T>) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function updateStats(stats?: Stats): void {
  if (!stats) return;

  const totalEl = document.getElementById('statTotalSpend');
  const countEl = document.getElementById('statTxnCount');
  const monthEl = document.getElementById('statMonthSpend');
  const avgEl = document.getElementById('statDailyAvg');
  const topCatEl = document.getElementById('statTopCategory');
  const topCatAmtEl = document.getElementById('statTopCategoryAmount');

  if (totalEl) totalEl.innerText = formatINR(stats.totalSpend);
  if (countEl) countEl.innerText = `${stats.count} transactions recorded`;
  if (monthEl) monthEl.innerText = formatINR(stats.monthSpend);
  if (avgEl) avgEl.innerText = formatINR(stats.dailyAverage);

  if (stats.topCategory && stats.topCategory.category) {
    if (topCatEl) topCatEl.innerText = stats.topCategory.category;
    const amount = stats.topCategory.amount ?? stats.topCategory.total ?? 0;
    if (topCatAmtEl) topCatAmtEl.innerText = formatINR(amount) + ' spent';
  } else {
    if (topCatEl) topCatEl.innerText = '-';
    if (topCatAmtEl) topCatAmtEl.innerText = '₹0 total';
  }
}

export function updateCharts(stats?: Stats): void {
  if (!stats) return;

  // 1. Donut Chart: Categories
  const catCanvas = document.getElementById('categoryChart') as HTMLCanvasElement | null;
  const noData = document.getElementById('noChartData');
  const catData = stats.categoryBreakdown || [];

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  if (catData.length === 0) {
    if (noData) noData.classList.remove('hidden');
  } else {
    if (noData) noData.classList.add('hidden');
    const labels = catData.map((c) => c.category);
    const values = catData.map((c) => c.total);
    const colors = catData.map((c) => categoryColors[c.category] || '#71717a');

    if (catCanvas && typeof Chart !== 'undefined') {
      categoryChart = new Chart(catCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              borderColor: '#000000',
              borderWidth: 2,
              hoverOffset: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: '#a1a1aa',
                font: { size: 10, family: 'Plus Jakarta Sans' },
                boxWidth: 10,
                padding: 8,
              },
            },
            tooltip: {
              backgroundColor: '#09090b',
              titleColor: '#ffffff',
              bodyColor: '#10b981',
              borderColor: '#27272a',
              borderWidth: 1,
              callbacks: {
                label: function (ctx: any) {
                  return ' ' + ctx.label + ': ' + formatINR(ctx.raw);
                },
              },
            },
          },
          cutout: '70%',
        },
      });
    }
  }

  // 2. Bar Chart: Trends
  const trendCanvas = document.getElementById('trendChart') as HTMLCanvasElement | null;
  const trends = stats.dailyTrends || [];

  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }

  const trendLabels = trends.map((t) => t.date.slice(5)); // MM-DD
  const trendValues = trends.map((t) => t.amount);

  if (trendCanvas && typeof Chart !== 'undefined') {
    trendChart = new Chart(trendCanvas, {
      type: 'bar',
      data: {
        labels: trendLabels,
        datasets: [
          {
            label: 'Daily Spend (₹)',
            data: trendValues,
            backgroundColor: '#10b981',
            borderRadius: 6,
            hoverBackgroundColor: '#34d399',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: '#18181b', display: false },
            ticks: { color: '#71717a', font: { size: 10 } },
          },
          y: {
            grid: { color: '#1c1c22' },
            ticks: {
              color: '#71717a',
              font: { size: 10, family: 'JetBrains Mono' },
              callback: (v: any) => '₹' + v,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#09090b',
            titleColor: '#ffffff',
            bodyColor: '#34d399',
            borderColor: '#27272a',
            borderWidth: 1,
            callbacks: {
              label: function (ctx: any) {
                return ' Spent: ' + formatINR(ctx.raw);
              },
            },
          },
        },
      },
    });
  }
}

export function renderTable(expenses: Expense[]): void {
  const body = document.getElementById('transactionsBody');
  const cards = document.getElementById('transactionsCards');
  const empty = document.getElementById('emptyState');

  if (!body || !cards || !empty) return;

  body.innerHTML = '';
  cards.innerHTML = '';

  if (!expenses || expenses.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  expenses.forEach((item) => {
    const color = categoryColors[item.category] || '#71717a';
    const notes = item.notes
      ? `<div class="text-[11px] text-zinc-500 truncate mt-0.5">${escapeHtml(item.notes)}</div>`
      : '';
    const categoryPill = `
      <span class="inline-flex items-center max-w-[11rem] truncate px-2.5 py-1 rounded-full text-[11px] font-medium border"
            style="background-color: ${color}15; color: ${color}; border-color: ${color}30">
        ${escapeHtml(item.category)}
      </span>`;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-surface2/60 transition-colors group';
    tr.innerHTML = `
      <td class="py-3 px-4 text-xs text-zinc-400 whitespace-nowrap mono">${item.date}</td>
      <td class="py-3 px-4">
        <div class="font-medium text-white text-sm">${escapeHtml(item.description)}</div>
        ${notes}
      </td>
      <td class="py-3 px-4 whitespace-nowrap">${categoryPill}</td>
      <td class="py-3 px-4 whitespace-nowrap">
        <span class="text-xs text-zinc-400 bg-surface2 px-2 py-0.5 rounded border border-borderDark font-mono">${escapeHtml(item.payment_method)}</span>
      </td>
      <td class="py-3 px-4 text-right whitespace-nowrap">
        <span class="font-semibold text-white mono">${formatINR(item.amount)}</span>
      </td>
      <td class="py-3 px-4 text-right whitespace-nowrap">
        <div class="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100">
          <button onclick="editExpense('${item.id}')" class="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors" title="Edit">
            <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteExpense('${item.id}')" class="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    `;
    body.appendChild(tr);

    const card = document.createElement('article');
    card.className = 'rounded-xl border border-borderDark bg-black/30 p-3';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="font-medium text-white text-sm truncate">${escapeHtml(item.description)}</div>
          ${notes}
        </div>
        <div class="font-semibold text-white mono shrink-0">${formatINR(item.amount)}</div>
      </div>
      <div class="mt-2 flex items-center gap-1.5 min-w-0">
        ${categoryPill}
        <span class="text-[11px] text-zinc-400 bg-surface2 px-2 py-0.5 rounded border border-borderDark font-mono shrink-0">${escapeHtml(item.payment_method)}</span>
      </div>
      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[11px] text-zinc-500 mono">${item.date}</span>
        <div class="flex items-center">
          <button onclick="editExpense('${item.id}')" aria-label="Edit" class="h-11 w-11 flex items-center justify-center text-zinc-400 hover:text-white rounded-lg">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteExpense('${item.id}')" aria-label="Delete" class="h-11 w-11 flex items-center justify-center text-zinc-400 hover:text-rose-400 rounded-lg">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
    cards.appendChild(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

export async function fetchExpenses(): Promise<void> {
  const loading = document.getElementById('loadingState');
  const empty = document.getElementById('emptyState');

  if (loading) loading.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');

  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  const categoryFilter = document.getElementById('categoryFilter') as HTMLSelectElement | null;
  const paymentFilter = document.getElementById('paymentFilter') as HTMLSelectElement | null;
  const dateFilter = document.getElementById('dateFilter') as HTMLSelectElement | null;

  const search = searchInput?.value || '';
  const category = categoryFilter?.value || '';
  const payment = paymentFilter?.value || '';
  const dateRange = dateFilter?.value || '';

  try {
    const data = await fetchExpensesApi({
      search,
      category,
      payment_method: payment,
      date_range: dateRange,
    });
    if (!data) return;
    cachedExpenses = data.expenses || [];
    renderTable(cachedExpenses);
    updateStats(data.stats);
    updateCharts(data.stats);
  } catch (err) {
    console.error('Error fetching expenses:', err);
    showToast('Failed to load expenses', 'error');
  } finally {
    if (loading) loading.classList.add('hidden');
  }
}

export function renderDashboard(): void {
  fetchExpenses();
}

export function initDashboard(): void {
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const paymentFilter = document.getElementById('paymentFilter');
  const dateFilter = document.getElementById('dateFilter') as HTMLSelectElement | null;
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(fetchExpenses, 300));
  }
  if (categoryFilter) {
    categoryFilter.addEventListener('change', fetchExpenses);
  }
  if (paymentFilter) {
    paymentFilter.addEventListener('change', fetchExpenses);
  }
  if (dateFilter) {
    dateFilter.addEventListener('change', fetchExpenses);
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      const dateRange = dateFilter?.value || 'this_month';
      window.location.href = getExportCsvUrl(dateRange);
    });
  }

  window.editExpense = function (id: string) {
    const item = cachedExpenses.find((e) => e.id === id);
    if (!item) return;
    openExpenseModal(item);
  };

  window.deleteExpense = async function (id: string) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      const ok = await deleteExpenseApi(id);
      if (ok) {
        showToast('Expense deleted successfully');
        fetchExpenses();
      } else {
        showToast('Failed to delete expense', 'error');
      }
    } catch {
      showToast('Network error while deleting', 'error');
    }
  };
}
