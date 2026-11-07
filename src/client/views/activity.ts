import {
  fetchActivityApi,
  fetchEntityActivityApi,
  restoreActivityApi,
  ActivityItem,
} from '../api';
import { escapeHtml } from '../format';
import { computeFieldDiffs } from '../diff';
import { showToast } from '../components/toast';

export interface ActivityListOptions {
  group_id?: string;
}

export function formatRelativeTime(isoString: string): string {
  try {
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));

    if (diffSec < 45) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    const days = Math.floor(diffSec / 86400);
    if (days < 7) return `${days}d ago`;

    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return isoString;
  }
}

export function formatDayHeader(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();

    if (isToday) return 'Today';

    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return 'Yesterday';

    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function getActionMeta(action: string) {
  switch (action) {
    case 'create':
      return {
        label: 'Created',
        textColor: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    case 'update':
      return {
        label: 'Updated',
        textColor: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/20',
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      };
    case 'delete':
      return {
        label: 'Deleted',
        textColor: 'text-rose-400',
        bgColor: 'bg-rose-500/10',
        borderColor: 'border-rose-500/20',
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      };
    case 'restore':
      return {
        label: 'Restored',
        textColor: 'text-cyan-400',
        bgColor: 'bg-cyan-500/10',
        borderColor: 'border-cyan-500/20',
        badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      };
    default:
      return {
        label: action,
        textColor: 'text-zinc-400',
        bgColor: 'bg-zinc-800',
        borderColor: 'border-zinc-700',
        badge: 'bg-zinc-800 text-zinc-400 border-zinc-700',
      };
  }
}

export function getEntityIcon(entityType: string): string {
  switch (entityType) {
    case 'expense':
      return 'receipt';
    case 'group':
      return 'users';
    case 'transfer':
      return 'arrow-left-right';
    default:
      return 'activity';
  }
}

type FilterKey = 'all' | 'expense' | 'group' | 'transfer' | 'delete';

interface FilterOption {
  key: FilterKey;
  label: string;
  entity_type?: string;
  action?: string;
}

const FILTERS: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses', entity_type: 'expense' },
  { key: 'group', label: 'Groups', entity_type: 'group' },
  { key: 'transfer', label: 'Transfers', entity_type: 'transfer' },
  { key: 'delete', label: 'Deletes only', action: 'delete' },
];

export function renderActivityList(
  container: HTMLElement,
  options?: ActivityListOptions
): { refresh: () => void } {
  let activeFilter: FilterKey = 'all';
  let items: ActivityItem[] = [];
  let nextCursor: string | null = null;
  let isLoading = false;
  let hasMore = true;
  let observer: IntersectionObserver | null = null;

  container.innerHTML = `
    <div class="space-y-4">
      <!-- Filter Chips -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar" id="activityFilters">
        ${FILTERS.map(
          (f) => `
          <button
            type="button"
            data-filter="${f.key}"
            class="filter-chip shrink-0 min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all ${
              f.key === activeFilter
                ? 'bg-emerald-500 text-black font-semibold border-emerald-500 shadow-sm shadow-emerald-500/20'
                : 'bg-surface2 text-zinc-400 border-borderDark hover:text-white hover:border-zinc-700'
            }"
          >
            ${escapeHtml(f.label)}
          </button>
        `
        ).join('')}
      </div>

      <!-- Activity Items Container -->
      <div id="activityFeed" class="space-y-5 min-h-[200px]"></div>

      <!-- Loading Indicator -->
      <div id="activityLoading" class="hidden py-8 text-center">
        <div class="inline-block animate-spin rounded-full h-7 w-7 border-2 border-emerald-500 border-t-transparent"></div>
        <p class="text-xs text-zinc-500 mt-2">Loading activity...</p>
      </div>

      <!-- Sentinel for Infinite Scroll -->
      <div id="activitySentinel" class="h-4"></div>

      <!-- Empty State -->
      <div id="activityEmpty" class="hidden py-16 text-center">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-surface2 border border-borderDark flex items-center justify-center text-zinc-500 mb-3">
          <i data-lucide="history" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-semibold text-zinc-300">No activity found</h3>
        <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Actions, modifications, and restorations will be logged here.</p>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const feedEl = container.querySelector('#activityFeed') as HTMLElement;
  const loadingEl = container.querySelector('#activityLoading') as HTMLElement;
  const emptyEl = container.querySelector('#activityEmpty') as HTMLElement;
  const sentinelEl = container.querySelector('#activitySentinel') as HTMLElement;
  const filterBtns = container.querySelectorAll<HTMLButtonElement>('.filter-chip');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filterKey = btn.dataset.filter as FilterKey;
      if (filterKey === activeFilter) return;

      activeFilter = filterKey;
      filterBtns.forEach((b) => {
        const isCurrent = b.dataset.filter === activeFilter;
        if (isCurrent) {
          b.className =
            'filter-chip shrink-0 min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-full border bg-emerald-500 text-black border-emerald-500 shadow-sm shadow-emerald-500/20 transition-all';
        } else {
          b.className =
            'filter-chip shrink-0 min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-full border bg-surface2 text-zinc-400 border-borderDark hover:text-white hover:border-zinc-700 transition-all';
        }
      });

      refresh();
    });
  });

  async function loadData(reset = false) {
    if (isLoading) return;
    if (!reset && !hasMore) return;

    isLoading = true;
    if (reset) {
      items = [];
      nextCursor = null;
      hasMore = true;
      feedEl.innerHTML = '';
      emptyEl.classList.add('hidden');
    }
    loadingEl.classList.remove('hidden');

    try {
      const activeDef = FILTERS.find((f) => f.key === activeFilter);
      const params: any = {
        limit: 30,
        group_id: options?.group_id,
        entity_type: activeDef?.entity_type,
        action: activeDef?.action,
        before: reset ? undefined : nextCursor || undefined,
      };

      const res = await fetchActivityApi(params);
      if (!res) return;

      const newItems = res.items || [];
      if (reset) {
        items = newItems;
      } else {
        items.push(...newItems);
      }

      nextCursor = res.next_cursor;
      hasMore = Boolean(nextCursor && newItems.length > 0);

      renderFeed();
    } catch (err) {
      console.error('Error fetching activity:', err);
      showToast('Failed to load activity', 'error');
    } finally {
      isLoading = false;
      loadingEl.classList.add('hidden');
    }
  }

  function renderFeed() {
    if (items.length === 0) {
      feedEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    // Group items by local calendar day (YYYY-MM-DD)
    const groups = new Map<string, ActivityItem[]>();
    for (const item of items) {
      const dayKey = item.at ? item.at.split('T')[0] : 'unknown';
      if (!groups.has(dayKey)) {
        groups.set(dayKey, []);
      }
      groups.get(dayKey)!.push(item);
    }

    let html = '';
    groups.forEach((dayItems, dayKey) => {
      const headerTitle = formatDayHeader(dayKey);
      html += `
        <div class="day-group space-y-2">
          <div class="sticky top-14 sm:top-16 z-10 py-1.5 px-1 bg-black/95 backdrop-blur flex items-center gap-3">
            <span class="text-xs font-semibold uppercase tracking-wider text-zinc-400">${escapeHtml(headerTitle)}</span>
            <div class="flex-1 h-px bg-borderDark/60"></div>
          </div>
          <div class="space-y-2">
      `;

      dayItems.forEach((item) => {
        const meta = getActionMeta(item.action);
        const icon = getEntityIcon(item.entity_type);
        const relTime = formatRelativeTime(item.at);

        html += `
          <div
            data-activity-id="${escapeHtml(item.id)}"
            role="button"
            tabindex="0"
            class="activity-card w-full text-left bg-surface hover:bg-surface2 border border-borderDark/70 hover:border-zinc-700/80 rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-3.5 transition-all cursor-pointer group active:scale-[0.99] min-h-[52px]"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div class="w-10 h-10 shrink-0 rounded-xl ${meta.bgColor} ${meta.borderColor} border flex items-center justify-center ${meta.textColor}">
                <i data-lucide="${icon}" class="w-5 h-5"></i>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded border ${meta.badge}">
                    ${escapeHtml(meta.label)}
                  </span>
                  <span class="text-[11px] font-medium text-zinc-400 capitalize truncate">
                    ${escapeHtml(item.entity_type)}
                  </span>
                </div>
                <p class="text-sm font-medium text-zinc-100 truncate mt-0.5 group-hover:text-emerald-300 transition-colors">
                  ${escapeHtml(item.summary || 'Activity record')}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs text-zinc-500 mono">${escapeHtml(relTime)}</span>
              <i data-lucide="chevron-right" class="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors"></i>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    feedEl.innerHTML = html;

    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Attach click handlers to open entry detail sheet
    feedEl.querySelectorAll<HTMLElement>('.activity-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.activityId;
        const item = items.find((i) => i.id === id);
        if (item) {
          openActivityDetail(item, () => refresh());
        }
      });
    });
  }

  // Setup infinite scroll observer
  if ('IntersectionObserver' in window && sentinelEl) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadData(false);
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(sentinelEl);
  }

  function refresh() {
    loadData(true);
  }

  // Initial load
  loadData(true);

  return { refresh };
}

export function renderActivity(container: HTMLElement): void {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between pb-2 border-b border-borderDark/40">
        <div>
          <h1 class="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <i data-lucide="history" class="w-5 h-5 text-emerald-400"></i>
            Activity Log
          </h1>
          <p class="text-xs text-zinc-400 mt-0.5">Audit history, change diffs, and instant version rollback</p>
        </div>
      </div>
      <div id="activityListInner"></div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const inner = container.querySelector('#activityListInner') as HTMLElement;
  if (inner) {
    renderActivityList(inner);
  }
}

// -------------------------------------------------------------
// Entry Detail Bottom Sheet & Version History Modals
// -------------------------------------------------------------

function ensureDetailModal(): {
  modal: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  closeBtn: HTMLElement;
} {
  let modal = document.getElementById('activityDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'activityDetailModal';
    modal.className =
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-end sm:items-center justify-center sm:p-4';
    modal.innerHTML = `
      <div class="bg-surface border border-zinc-800 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[90dvh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between pb-4 border-b border-borderDark shrink-0">
          <div class="min-w-0 pr-2">
            <h3 id="activityModalTitle" class="text-base font-semibold text-white truncate">Activity Details</h3>
            <p id="activityModalSubtitle" class="text-xs text-zinc-500 mt-0.5"></p>
          </div>
          <button id="closeActivityModalBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-11 w-11 flex items-center justify-center rounded-lg shrink-0">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>

        <div id="activityModalBody" class="mt-4 overflow-y-auto flex-1 space-y-4 pr-1"></div>

        <div id="activityModalFooter" class="pt-4 border-t border-borderDark shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const title = modal.querySelector('#activityModalTitle') as HTMLElement;
  const body = modal.querySelector('#activityModalBody') as HTMLElement;
  const footer = modal.querySelector('#activityModalFooter') as HTMLElement;
  const closeBtn = modal.querySelector('#closeActivityModalBtn') as HTMLElement;

  return { modal, title, body, footer, closeBtn };
}

export function closeActivityDetail(): void {
  const modal = document.getElementById('activityDetailModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  }
}

export async function openActivityDetail(
  item: ActivityItem,
  onRefresh?: () => void
): Promise<void> {
  const { modal, title, body, footer, closeBtn } = ensureDetailModal();
  const subtitle = modal.querySelector('#activityModalSubtitle') as HTMLElement;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';

  closeBtn.onclick = closeActivityDetail;

  const meta = getActionMeta(item.action);
  const diffs = computeFieldDiffs(item.before, item.after);
  const formattedTime = new Date(item.at).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  title.innerText = item.summary || 'Activity Detail';
  subtitle.innerText = `${meta.label} on ${formattedTime}`;

  // Build field diff table
  let tableHtml = '';
  if (diffs.length === 0) {
    tableHtml = `
      <div class="py-6 text-center text-xs text-zinc-500 bg-surface2/50 rounded-xl border border-borderDark">
        No field changes recorded for this entry.
      </div>
    `;
  } else {
    tableHtml = `
      <div class="border border-borderDark rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-surface2 text-zinc-400 border-b border-borderDark">
                <th class="py-2.5 px-3 font-semibold w-1/4">Field</th>
                <th class="py-2.5 px-3 font-semibold w-3/8">Before</th>
                <th class="py-2.5 px-3 font-semibold w-3/8">After</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-borderDark/40">
              ${diffs
                .map((d) => {
                  const isChanged = d.changed;
                  return `
                  <tr class="${isChanged ? 'bg-emerald-500/[0.04]' : ''} hover:bg-zinc-800/30 transition-colors">
                    <td class="py-2.5 px-3 font-medium text-zinc-300 align-top">
                      <div class="flex items-center gap-1.5">
                        ${isChanged ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>' : ''}
                        <span>${escapeHtml(d.field)}</span>
                      </div>
                    </td>
                    <td class="py-2.5 px-3 font-mono text-zinc-400 align-top break-words">
                      ${escapeHtml(d.beforeVal)}
                    </td>
                    <td class="py-2.5 px-3 font-mono ${isChanged ? 'text-emerald-300 font-semibold' : 'text-zinc-300'} align-top break-words">
                      ${escapeHtml(d.afterVal)}
                    </td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  body.innerHTML = `
    <!-- Summary Header Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <div class="bg-surface2 border border-borderDark rounded-xl p-2.5">
        <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block">Action</span>
        <span class="mt-0.5 inline-block px-2 py-0.5 text-xs font-bold uppercase rounded border ${meta.badge}">
          ${escapeHtml(meta.label)}
        </span>
      </div>
      <div class="bg-surface2 border border-borderDark rounded-xl p-2.5">
        <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block">Entity</span>
        <span class="mt-0.5 inline-block text-xs font-semibold text-zinc-200 capitalize">
          ${escapeHtml(item.entity_type)}
        </span>
      </div>
      <div class="bg-surface2 border border-borderDark rounded-xl p-2.5 col-span-2 sm:col-span-1">
        <span class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider block">Timestamp</span>
        <span class="mt-0.5 inline-block text-xs font-mono text-zinc-300 truncate">
          ${escapeHtml(formatRelativeTime(item.at))}
        </span>
      </div>
    </div>

    <!-- Field Diff Table -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Field Changes</h4>
        <span class="text-[11px] text-zinc-500">${diffs.filter((d) => d.changed).length} modified</span>
      </div>
      ${tableHtml}
    </div>
  `;

  // Determine if this entry is the current version of the entity
  // If item is delete, it's definitely restorable!
  // If item is create or update, fetch entity history to see if it's items[0]
  let isCurrentVersion = false;

  footer.innerHTML = `
    <button
      id="modalVersionHistoryBtn"
      type="button"
      class="min-h-[44px] px-4 py-2 text-xs font-medium bg-surface2 hover:bg-zinc-800 text-zinc-300 border border-borderDark rounded-xl transition-all flex items-center justify-center gap-1.5"
    >
      <i data-lucide="history" class="w-4 h-4"></i>
      <span>Version history</span>
    </button>

    <button
      id="modalRestoreBtn"
      type="button"
      disabled
      class="min-h-[44px] px-5 py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 bg-zinc-800 text-zinc-500 cursor-not-allowed"
    >
      <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
      <span>Checking version...</span>
    </button>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const versionHistoryBtn = footer.querySelector('#modalVersionHistoryBtn') as HTMLButtonElement;
  const restoreBtn = footer.querySelector('#modalRestoreBtn') as HTMLButtonElement;

  versionHistoryBtn.onclick = () => {
    openVersionHistory(item.entity_type, item.entity_id, item.summary, onRefresh);
  };

  try {
    const historyRes = await fetchEntityActivityApi(item.entity_type, item.entity_id);
    const history = historyRes?.items || [];

    if (history.length > 0) {
      const latest = history[0];
      // If latest action is delete, any version (including the delete entry) can be restored
      // If latest action is not delete, the latest entry is the current live version
      if (latest.action !== 'delete' && latest.id === item.id) {
        isCurrentVersion = true;
      }
    }
  } catch (err) {
    console.warn('Could not determine current version status:', err);
  }

  if (isCurrentVersion) {
    restoreBtn.disabled = true;
    restoreBtn.className =
      'min-h-[44px] px-5 py-2 text-xs font-semibold rounded-xl bg-zinc-800 text-zinc-500 cursor-not-allowed flex items-center justify-center gap-1.5';
    restoreBtn.innerHTML = `
      <i data-lucide="check" class="w-4 h-4 text-zinc-500"></i>
      <span>Current version</span>
    `;
  } else {
    restoreBtn.disabled = false;
    restoreBtn.className =
      'min-h-[44px] px-5 py-2 text-xs font-semibold rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black shadow-md shadow-cyan-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5';
    restoreBtn.innerHTML = `
      <i data-lucide="rotate-ccw" class="w-4 h-4 stroke-[2.5]"></i>
      <span>Restore this version</span>
    `;
    restoreBtn.onclick = async () => {
      const confirmed = confirm('Are you sure you want to restore this version?');
      if (!confirmed) return;

      restoreBtn.disabled = true;
      restoreBtn.innerText = 'Restoring...';

      try {
        const res = await restoreActivityApi(item.id);
        if (res && res.success) {
          showToast('Version restored successfully');
          closeActivityDetail();
          if (onRefresh) onRefresh();
        } else {
          showToast('Failed to restore version', 'error');
          restoreBtn.disabled = false;
          restoreBtn.innerText = 'Restore this version';
        }
      } catch (err: any) {
        showToast(err.message || 'Error restoring version', 'error');
        restoreBtn.disabled = false;
        restoreBtn.innerText = 'Restore this version';
      }
    };
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// -------------------------------------------------------------
// Version History Modal
// -------------------------------------------------------------

export async function openVersionHistory(
  entityType: string,
  entityId: string,
  itemTitle?: string,
  onRefresh?: () => void
): Promise<void> {
  const { modal, title, body, footer, closeBtn } = ensureDetailModal();
  const subtitle = modal.querySelector('#activityModalSubtitle') as HTMLElement;

  title.innerText = itemTitle ? `${itemTitle} - History` : 'Version History';
  subtitle.innerText = `${entityType} #${entityId}`;

  body.innerHTML = `
    <div class="py-8 text-center" id="historyLoading">
      <div class="inline-block animate-spin rounded-full h-7 w-7 border-2 border-emerald-500 border-t-transparent"></div>
      <p class="text-xs text-zinc-500 mt-2">Loading version history...</p>
    </div>
    <div id="historyList" class="space-y-3"></div>
  `;

  footer.innerHTML = `
    <button
      id="historyCloseBtn"
      type="button"
      class="w-full sm:w-auto min-h-[44px] px-5 py-2 text-xs font-semibold bg-surface2 hover:bg-zinc-800 text-zinc-300 border border-borderDark rounded-xl transition-all"
    >
      Close
    </button>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const historyCloseBtn = footer.querySelector('#historyCloseBtn') as HTMLElement;
  historyCloseBtn.onclick = closeActivityDetail;

  try {
    const res = await fetchEntityActivityApi(entityType, entityId);
    const loadingEl = body.querySelector('#historyLoading') as HTMLElement;
    const listEl = body.querySelector('#historyList') as HTMLElement;
    if (loadingEl) loadingEl.classList.add('hidden');

    const history = res?.items || [];
    if (history.length === 0) {
      listEl.innerHTML = `
        <div class="py-8 text-center text-xs text-zinc-500">
          No version history available for this item.
        </div>
      `;
      return;
    }

    const isLive = history[0].action !== 'delete';

    let html = '';
    history.forEach((ver, index) => {
      const isCurrent = isLive && index === 0;
      const meta = getActionMeta(ver.action);
      const formattedTime = new Date(ver.at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      html += `
        <div class="bg-surface2/60 border ${isCurrent ? 'border-emerald-500/40 bg-emerald-500/[0.02]' : 'border-borderDark'} rounded-xl p-3.5 space-y-2.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded border ${meta.badge}">
                  ${escapeHtml(meta.label)}
                </span>
                ${isCurrent ? '<span class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Current Version</span>' : ''}
              </div>
              <p class="text-xs font-medium text-zinc-200 mt-1 truncate">
                ${escapeHtml(ver.summary || 'Version record')}
              </p>
              <span class="text-[11px] text-zinc-500 mono block mt-0.5">
                ${escapeHtml(formattedTime)} (${escapeHtml(formatRelativeTime(ver.at))})
              </span>
            </div>

            <div class="shrink-0 flex items-center gap-2">
              ${
                isCurrent
                  ? `
                <button
                  type="button"
                  disabled
                  class="min-h-[36px] px-3 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-500 cursor-not-allowed"
                >
                  Current
                </button>
              `
                  : `
                <button
                  type="button"
                  data-restore-id="${escapeHtml(ver.id)}"
                  class="history-restore-btn min-h-[36px] px-3 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black active:scale-95 transition-all shadow-sm"
                >
                  Restore
                </button>
              `
              }
            </div>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll<HTMLButtonElement>('.history-restore-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.restoreId;
        if (!id) return;

        const confirmed = confirm('Are you sure you want to restore this version?');
        if (!confirmed) return;

        btn.disabled = true;
        btn.innerText = 'Restoring...';

        try {
          const restoreRes = await restoreActivityApi(id);
          if (restoreRes && restoreRes.success) {
            showToast('Version restored successfully');
            closeActivityDetail();
            if (onRefresh) onRefresh();
          } else {
            showToast('Failed to restore version', 'error');
            btn.disabled = false;
            btn.innerText = 'Restore';
          }
        } catch (err: any) {
          showToast(err.message || 'Error restoring version', 'error');
          btn.disabled = false;
          btn.innerText = 'Restore';
        }
      });
    });
  } catch (err) {
    console.error('Failed to load version history:', err);
    showToast('Failed to load version history', 'error');
  }
}
