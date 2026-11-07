export function renderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HisabKitaab - Expense Tracker</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>₹</text></svg>">
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            black: '#000000',
            pitch: '#050505',
            surface: '#0a0a0c',
            surface2: '#121215',
            borderDark: '#1c1c22',
            accent: '#10b981',
          }
        }
      }
    }
  </script>
  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <!-- Lucide Icons -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
    
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: #000000;
      color: #fafafa;
    }
    .mono {
      font-family: 'JetBrains Mono', monospace;
    }
    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #000000;
    }
    ::-webkit-scrollbar-thumb {
      background: #27272a;
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #3f3f46;
    }
  </style>
</head>
<body class="min-h-screen bg-black text-zinc-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-400">
  <div class="min-h-screen flex flex-col">
    <!-- Navbar -->
    <header class="border-b border-borderDark bg-black/80 backdrop-blur sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-[1px] flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <div class="w-full h-full bg-black rounded-[11px] flex items-center justify-center font-bold text-emerald-400 text-xl mono">
              ₹
            </div>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-lg tracking-tight text-white">HisabKitaab</span>
              <span class="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full uppercase tracking-wider">INR</span>
            </div>
            <p class="text-xs text-zinc-500 hidden sm:block">Clean & fast personal expense management</p>
          </div>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <button id="exportCsvBtn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-surface2 hover:bg-zinc-800 text-zinc-300 border border-borderDark rounded-lg transition-all">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Export CSV</span>
          </button>
          
          <button id="openAddModalBtn" class="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-all shadow-md shadow-emerald-500/20 active:scale-95">
            <i data-lucide="plus" class="w-4 h-4 stroke-[2.5]"></i>
            <span>Add Expense</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      <!-- Metrics Overview -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Card 1: Total Spent -->
        <div class="bg-surface border border-borderDark rounded-2xl p-5 relative overflow-hidden group hover:border-zinc-700/60 transition-all">
          <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-all"></div>
          <div class="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Total Spent (Filtered)</span>
            <span class="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg"><i data-lucide="arrow-up-right" class="w-4 h-4"></i></span>
          </div>
          <div class="mt-3">
            <h3 id="statTotalSpend" class="text-2xl sm:text-3xl font-extrabold text-white mono">₹0</h3>
            <p id="statTxnCount" class="text-xs text-zinc-500 mt-1">0 transactions recorded</p>
          </div>
        </div>

        <!-- Card 2: Current Month -->
        <div class="bg-surface border border-borderDark rounded-2xl p-5 relative overflow-hidden group hover:border-zinc-700/60 transition-all">
          <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
          <div class="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>This Month</span>
            <span class="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg"><i data-lucide="calendar" class="w-4 h-4"></i></span>
          </div>
          <div class="mt-3">
            <h3 id="statMonthSpend" class="text-2xl sm:text-3xl font-extrabold text-white mono">₹0</h3>
            <p id="statMonthLabel" class="text-xs text-zinc-500 mt-1">Current billing cycle</p>
          </div>
        </div>

        <!-- Card 3: Daily Average -->
        <div class="bg-surface border border-borderDark rounded-2xl p-5 relative overflow-hidden group hover:border-zinc-700/60 transition-all">
          <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all"></div>
          <div class="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Daily Average</span>
            <span class="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg"><i data-lucide="activity" class="w-4 h-4"></i></span>
          </div>
          <div class="mt-3">
            <h3 id="statDailyAvg" class="text-2xl sm:text-3xl font-extrabold text-white mono">₹0</h3>
            <p class="text-xs text-zinc-500 mt-1">Average per active day</p>
          </div>
        </div>

        <!-- Card 4: Top Category -->
        <div class="bg-surface border border-borderDark rounded-2xl p-5 relative overflow-hidden group hover:border-zinc-700/60 transition-all">
          <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all"></div>
          <div class="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>Top Category</span>
            <span class="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><i data-lucide="pie-chart" class="w-4 h-4"></i></span>
          </div>
          <div class="mt-3">
            <h3 id="statTopCategory" class="text-xl sm:text-2xl font-bold text-white truncate">-</h3>
            <p id="statTopCategoryAmount" class="text-xs text-zinc-500 mt-1">₹0 total</p>
          </div>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Category Breakdown Chart -->
        <div class="bg-surface border border-borderDark rounded-2xl p-5 lg:col-span-1 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-sm font-semibold text-zinc-200">Category Breakdown</h4>
            <span class="text-xs text-zinc-500">Distribution</span>
          </div>
          <div class="flex-1 relative flex items-center justify-center min-h-[220px]">
            <canvas id="categoryChart"></canvas>
            <div id="noChartData" class="absolute text-center text-xs text-zinc-600 hidden">
              No expenses in this period
            </div>
          </div>
        </div>

        <!-- Daily / Trends Chart -->
        <div class="bg-surface border border-borderDark rounded-2xl p-5 lg:col-span-2 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-sm font-semibold text-zinc-200">Daily Spending Trend</h4>
            <span class="text-xs text-zinc-500">Last 14 Active Days</span>
          </div>
          <div class="flex-1 relative min-h-[220px]">
            <canvas id="trendChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Filters & Transaction Management -->
      <div class="bg-surface border border-borderDark rounded-2xl p-5 space-y-4">
        <!-- Search & Filter Controls -->
        <div class="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"></i>
            <input id="searchInput" type="text" placeholder="Search by note, description or category..." 
              class="w-full bg-surface2 border border-borderDark rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors">
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Category Filter -->
            <select id="categoryFilter" class="bg-surface2 border border-borderDark text-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50">
              <option value="">All Categories</option>
              <option value="Food & Dining">🍔 Food & Dining</option>
              <option value="Groceries">🛒 Groceries</option>
              <option value="Shopping">🛍️ Shopping</option>
              <option value="Bills & Utilities">⚡ Bills & Utilities</option>
              <option value="Rent & Housing">🏠 Rent & Housing</option>
              <option value="Transport & Fuel">⛽ Transport & Fuel</option>
              <option value="Entertainment">🎬 Entertainment</option>
              <option value="Health & Medical">💊 Health & Medical</option>
              <option value="Investments & Savings">📈 Investments</option>
              <option value="Others">📦 Others</option>
            </select>

            <!-- Payment Method Filter -->
            <select id="paymentFilter" class="bg-surface2 border border-borderDark text-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50">
              <option value="">All Payment Modes</option>
              <option value="UPI">UPI</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit Card">Debit Card</option>
              <option value="Cash">Cash</option>
              <option value="Net Banking">Net Banking</option>
            </select>

            <!-- Date Range Filter -->
            <select id="dateFilter" class="bg-surface2 border border-borderDark text-zinc-300 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50">
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="last_30">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>

        <!-- Transactions List -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-zinc-300">
            <thead class="text-xs text-zinc-500 uppercase border-b border-borderDark/60 bg-pitch">
              <tr>
                <th scope="col" class="py-3 px-4">Date</th>
                <th scope="col" class="py-3 px-4">Description</th>
                <th scope="col" class="py-3 px-4">Category</th>
                <th scope="col" class="py-3 px-4">Mode</th>
                <th scope="col" class="py-3 px-4 text-right">Amount (₹)</th>
                <th scope="col" class="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="transactionsBody" class="divide-y divide-borderDark/40">
              <!-- Dynamically populated rows -->
            </tbody>
          </table>

          <!-- Empty State -->
          <div id="emptyState" class="hidden py-12 text-center">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-surface2 border border-borderDark flex items-center justify-center text-zinc-500 mb-3">
              <i data-lucide="receipt" class="w-6 h-6"></i>
            </div>
            <h3 class="text-sm font-semibold text-zinc-300">No transactions found</h3>
            <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Click "Add Expense" above or adjust your search and filters to view records.</p>
          </div>

          <!-- Loading State -->
          <div id="loadingState" class="py-12 text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
            <p class="text-xs text-zinc-500 mt-2">Loading transactions...</p>
          </div>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-borderDark/60 bg-black py-4 text-center text-xs text-zinc-600">
      HisabKitaab &bull; Hosted on Cloudflare Workers &bull; Secured with Cloudflare D1
    </footer>
  </div>

  <!-- Add / Edit Expense Modal -->
  <div id="expenseModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="bg-surface border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between pb-4 border-b border-borderDark">
        <h3 id="modalTitle" class="text-base font-semibold text-white">Add New Expense</h3>
        <button id="closeModalBtn" class="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="expenseForm" class="mt-4 space-y-4">
        <input type="hidden" id="formExpenseId">

        <!-- Amount -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Amount (₹) *</label>
          <div class="relative">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold mono">₹</span>
            <input type="number" id="formAmount" step="0.01" min="0.01" required placeholder="0.00"
              class="w-full bg-surface2 border border-borderDark rounded-xl pl-9 pr-4 py-2.5 text-base font-semibold mono text-emerald-400 focus:outline-none focus:border-emerald-500 transition-colors">
          </div>
          <!-- Quick Amount Chips -->
          <div class="flex gap-2 mt-2">
            <button type="button" class="quick-amt text-[11px] px-2 py-0.5 rounded-md bg-surface2 border border-borderDark text-zinc-400 hover:text-white" data-amt="100">+₹100</button>
            <button type="button" class="quick-amt text-[11px] px-2 py-0.5 rounded-md bg-surface2 border border-borderDark text-zinc-400 hover:text-white" data-amt="500">+₹500</button>
            <button type="button" class="quick-amt text-[11px] px-2 py-0.5 rounded-md bg-surface2 border border-borderDark text-zinc-400 hover:text-white" data-amt="1000">+₹1,000</button>
            <button type="button" class="quick-amt text-[11px] px-2 py-0.5 rounded-md bg-surface2 border border-borderDark text-zinc-400 hover:text-white" data-amt="2000">+₹2,000</button>
          </div>
        </div>

        <!-- Description -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Description / Title *</label>
          <input type="text" id="formDescription" required placeholder="e.g. Swiggy Lunch, Metro Recharge, Groceries"
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
        </div>

        <!-- Category & Payment Method Grid -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Category *</label>
            <select id="formCategory" required class="w-full bg-surface2 border border-borderDark text-zinc-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500">
              <option value="Food & Dining">🍔 Food & Dining</option>
              <option value="Groceries">🛒 Groceries</option>
              <option value="Shopping">🛍️ Shopping</option>
              <option value="Bills & Utilities">⚡ Bills & Utilities</option>
              <option value="Rent & Housing">🏠 Rent & Housing</option>
              <option value="Transport & Fuel">⛽ Transport & Fuel</option>
              <option value="Entertainment">🎬 Entertainment</option>
              <option value="Health & Medical">💊 Health & Medical</option>
              <option value="Investments & Savings">📈 Investments</option>
              <option value="Others">📦 Others</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Payment Method</label>
            <select id="formPaymentMethod" class="w-full bg-surface2 border border-borderDark text-zinc-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500">
              <option value="UPI">UPI</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit Card">Debit Card</option>
              <option value="Cash">Cash</option>
              <option value="Net Banking">Net Banking</option>
            </select>
          </div>
        </div>

        <!-- Date -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Date *</label>
          <input type="date" id="formDate" required
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
        </div>

        <!-- Notes / Remarks -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Notes (Optional)</label>
          <textarea id="formNotes" rows="2" placeholder="Optional details, transaction ID, or bill reference"
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"></textarea>
        </div>

        <!-- Submit & Cancel buttons -->
        <div class="flex items-center justify-end gap-3 pt-3 border-t border-borderDark">
          <button type="button" id="cancelModalBtn" class="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" id="saveExpenseBtn" class="px-5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-all shadow-md shadow-emerald-500/20">
            Save Expense
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Toast Notification Container -->
  <div id="toastContainer" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2"></div>

  <!-- Client-side Logic -->
  <script>
    let expenses = [];
    let categoryChart = null;
    let trendChart = null;

    // INR Formatter
    const formatINR = (val) => {
      const num = Number(val) || 0;
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
        minimumFractionDigits: 0
      }).format(num);
    };

    // Category Color Mapping
    const categoryColors = {
      'Food & Dining': '#f59e0b',
      'Groceries': '#10b981',
      'Shopping': '#a855f7',
      'Bills & Utilities': '#eab308',
      'Rent & Housing': '#3b82f6',
      'Transport & Fuel': '#06b6d4',
      'Entertainment': '#ec4899',
      'Health & Medical': '#ef4444',
      'Investments & Savings': '#22c55e',
      'Others': '#71717a'
    };

    function showToast(msg, type = 'success') {
      const toast = document.createElement('div');
      toast.className = 'px-4 py-2.5 rounded-xl text-xs font-medium border shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom duration-200 ' +
        (type === 'success' ? 'bg-zinc-900 border-emerald-500/30 text-emerald-300' : 'bg-zinc-900 border-rose-500/30 text-rose-300');
      toast.innerHTML = (type === 'success' ? '✓ ' : '✕ ') + msg;
      document.getElementById('toastContainer').appendChild(toast);
      setTimeout(() => {
        toast.remove();
      }, 3500);
    }

    async function fetchExpenses() {
      const loading = document.getElementById('loadingState');
      const empty = document.getElementById('emptyState');
      const body = document.getElementById('transactionsBody');

      loading.classList.remove('hidden');
      empty.classList.add('hidden');

      const search = document.getElementById('searchInput').value;
      const category = document.getElementById('categoryFilter').value;
      const payment = document.getElementById('paymentFilter').value;
      const dateRange = document.getElementById('dateFilter').value;

      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (payment) params.set('payment_method', payment);
      if (dateRange) params.set('date_range', dateRange);

      try {
        const res = await fetch('/api/expenses?' + params.toString());
        const data = await res.json();
        expenses = data.expenses || [];
        renderTable();
        updateStats(data.stats);
        updateCharts(data.stats);
      } catch (err) {
        console.error('Error fetching expenses:', err);
        showToast('Failed to load expenses', 'error');
      } finally {
        loading.classList.add('hidden');
      }
    }

    function renderTable() {
      const body = document.getElementById('transactionsBody');
      const empty = document.getElementById('emptyState');
      body.innerHTML = '';

      if (!expenses || expenses.length === 0) {
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');

      expenses.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-surface2/60 transition-colors group';

        const color = categoryColors[item.category] || '#71717a';

        tr.innerHTML = \`
          <td class="py-3 px-4 text-xs text-zinc-400 whitespace-nowrap mono">\${item.date}</td>
          <td class="py-3 px-4">
            <div class="font-medium text-white text-sm">\${escapeHtml(item.description)}</div>
            \${item.notes ? \`<div class="text-[11px] text-zinc-500 truncate max-w-xs">\${escapeHtml(item.notes)}</div>\` : ''}
          </td>
          <td class="py-3 px-4 whitespace-nowrap">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border"
                  style="background-color: \${color}15; color: \${color}; border-color: \${color}30">
              \${escapeHtml(item.category)}
            </span>
          </td>
          <td class="py-3 px-4 whitespace-nowrap">
            <span class="text-xs text-zinc-400 bg-surface2 px-2 py-0.5 rounded border border-borderDark font-mono">\${escapeHtml(item.payment_method)}</span>
          </td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            <span class="font-semibold text-white mono">\${formatINR(item.amount)}</span>
          </td>
          <td class="py-3 px-4 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100">
              <button onclick="editExpense('\${item.id}')" class="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors" title="Edit">
                <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="deleteExpense('\${item.id}')" class="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        \`;
        body.appendChild(tr);
      });

      if (window.lucide) lucide.createIcons();
    }

    function updateStats(stats) {
      if (!stats) return;
      document.getElementById('statTotalSpend').innerText = formatINR(stats.totalSpend);
      document.getElementById('statTxnCount').innerText = \`\${stats.count} transactions recorded\`;
      document.getElementById('statMonthSpend').innerText = formatINR(stats.monthSpend);
      document.getElementById('statDailyAvg').innerText = formatINR(stats.dailyAverage);
      
      if (stats.topCategory && stats.topCategory.category) {
        document.getElementById('statTopCategory').innerText = stats.topCategory.category;
        document.getElementById('statTopCategoryAmount').innerText = formatINR(stats.topCategory.amount) + ' spent';
      } else {
        document.getElementById('statTopCategory').innerText = '-';
        document.getElementById('statTopCategoryAmount').innerText = '₹0 total';
      }
    }

    function updateCharts(stats) {
      if (!stats) return;

      // 1. Donut Chart: Categories
      const catCanvas = document.getElementById('categoryChart');
      const noData = document.getElementById('noChartData');
      const catData = stats.categoryBreakdown || [];

      if (categoryChart) categoryChart.destroy();

      if (catData.length === 0) {
        noData.classList.remove('hidden');
      } else {
        noData.classList.add('hidden');
        const labels = catData.map(c => c.category);
        const values = catData.map(c => c.total);
        const colors = catData.map(c => categoryColors[c.category] || '#71717a');

        categoryChart = new Chart(catCanvas, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: values,
              backgroundColor: colors,
              borderColor: '#000000',
              borderWidth: 2,
              hoverOffset: 4
            }]
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
                  padding: 8
                }
              },
              tooltip: {
                backgroundColor: '#09090b',
                titleColor: '#ffffff',
                bodyColor: '#10b981',
                borderColor: '#27272a',
                borderWidth: 1,
                callbacks: {
                  label: function(ctx) {
                    return ' ' + ctx.label + ': ' + formatINR(ctx.raw);
                  }
                }
              }
            },
            cutout: '70%'
          }
        });
      }

      // 2. Bar Chart: Trends
      const trendCanvas = document.getElementById('trendChart');
      const trends = stats.dailyTrends || [];

      if (trendChart) trendChart.destroy();

      const trendLabels = trends.map(t => t.date.slice(5)); // MM-DD
      const trendValues = trends.map(t => t.amount);

      trendChart = new Chart(trendCanvas, {
        type: 'bar',
        data: {
          labels: trendLabels,
          datasets: [{
            label: 'Daily Spend (₹)',
            data: trendValues,
            backgroundColor: '#10b981',
            borderRadius: 6,
            hoverBackgroundColor: '#34d399'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { color: '#18181b', display: false },
              ticks: { color: '#71717a', font: { size: 10 } }
            },
            y: {
              grid: { color: '#1c1c22' },
              ticks: {
                color: '#71717a',
                font: { size: 10, family: 'JetBrains Mono' },
                callback: (v) => '₹' + v
              }
            }
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
                label: function(ctx) {
                  return ' Spent: ' + formatINR(ctx.raw);
                }
              }
            }
          }
        }
      });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Modal Handlers
    const modal = document.getElementById('expenseModal');
    const form = document.getElementById('expenseForm');

    function openModal(isEdit = false) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      if (!isEdit) {
        form.reset();
        document.getElementById('formExpenseId').value = '';
        document.getElementById('modalTitle').innerText = 'Add New Expense';
        document.getElementById('formDate').value = new Date().toISOString().split('T')[0];
      }
      if (window.lucide) lucide.createIcons();
    }

    function closeModal() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    window.editExpense = function(id) {
      const item = expenses.find(e => e.id === id);
      if (!item) return;

      document.getElementById('formExpenseId').value = item.id;
      document.getElementById('formAmount').value = item.amount;
      document.getElementById('formDescription').value = item.description;
      document.getElementById('formCategory').value = item.category;
      document.getElementById('formPaymentMethod').value = item.payment_method;
      document.getElementById('formDate').value = item.date;
      document.getElementById('formNotes').value = item.notes || '';
      document.getElementById('modalTitle').innerText = 'Edit Expense';

      openModal(true);
    };

    window.deleteExpense = async function(id) {
      if (!confirm('Are you sure you want to delete this expense?')) return;
      try {
        const res = await fetch('/api/expenses/' + id, { method: 'DELETE' });
        if (res.ok) {
          showToast('Expense deleted successfully');
          fetchExpenses();
        } else {
          showToast('Failed to delete expense', 'error');
        }
      } catch (err) {
        showToast('Network error while deleting', 'error');
      }
    };

    // Quick Amount buttons
    document.querySelectorAll('.quick-amt').forEach(btn => {
      btn.addEventListener('click', () => {
        const add = parseFloat(btn.dataset.amt) || 0;
        const input = document.getElementById('formAmount');
        const curr = parseFloat(input.value) || 0;
        input.value = (curr + add).toFixed(2);
      });
    });

    // Event Listeners
    document.getElementById('openAddModalBtn').addEventListener('click', () => openModal(false));
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('formExpenseId').value;
      const payload = {
        amount: parseFloat(document.getElementById('formAmount').value),
        description: document.getElementById('formDescription').value.trim(),
        category: document.getElementById('formCategory').value,
        payment_method: document.getElementById('formPaymentMethod').value,
        date: document.getElementById('formDate').value,
        notes: document.getElementById('formNotes').value.trim()
      };

      try {
        const url = id ? '/api/expenses/' + id : '/api/expenses';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast(id ? 'Expense updated' : 'Expense recorded');
          closeModal();
          fetchExpenses();
        } else {
          const err = await res.json();
          showToast(err.error || 'Failed to save expense', 'error');
        }
      } catch (err) {
        showToast('Network error', 'error');
      }
    });

    // Export CSV
    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      const dateRange = document.getElementById('dateFilter').value;
      window.location.href = '/api/export?date_range=' + encodeURIComponent(dateRange);
    });

    // Filter listeners
    document.getElementById('searchInput').addEventListener('input', debounce(fetchExpenses, 300));
    document.getElementById('categoryFilter').addEventListener('change', fetchExpenses);
    document.getElementById('paymentFilter').addEventListener('change', fetchExpenses);
    document.getElementById('dateFilter').addEventListener('change', fetchExpenses);

    function debounce(fn, delay) {
      let timer;
      return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }

    // Init
    window.addEventListener('DOMContentLoaded', () => {
      if (window.lucide) lucide.createIcons();
      fetchExpenses();
    });
  </script>
</body>
</html>`;
}
