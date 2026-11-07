import { escapeHtml } from '../../format';
import { fetchGroupsApi } from './api';
import { formatNetBalance } from './helpers';
import { openNewGroupSheet } from './new-group-sheet';
import { GroupListItem } from './types';

export function renderGroupsList(container: HTMLElement): void {
  let isArchived = false;
  let groups: GroupListItem[] = [];
  let isLoading = false;

  container.innerHTML = `
    <div class="space-y-4">
      <!-- Header bar with Title, Archived Toggle, and New Group Button -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-white tracking-tight">Groups</h2>
          <p class="text-xs text-zinc-400 mt-0.5">Split expenses and track shared balances</p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Archived Toggle -->
          <div class="p-0.5 bg-surface2 border border-borderDark rounded-xl flex items-center">
            <button
              type="button"
              id="toggleActiveGroups"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all bg-emerald-500 text-black shadow-sm"
            >
              Active
            </button>
            <button
              type="button"
              id="toggleArchivedGroups"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-zinc-400 hover:text-white"
            >
              Archived
            </button>
          </div>

          <!-- New Group Button -->
          <button
            type="button"
            id="openNewGroupBtn"
            class="h-10 px-3.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
          >
            <i data-lucide="plus" class="w-4 h-4 stroke-[2.5]"></i>
            <span>New group</span>
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div id="groupsLoading" class="py-16 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
        <p class="text-xs text-zinc-500 mt-2">Loading groups...</p>
      </div>

      <!-- Groups List Container -->
      <div id="groupsListGrid" class="space-y-3 hidden"></div>

      <!-- Empty State -->
      <div id="groupsEmpty" class="py-16 text-center hidden">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-surface2 border border-borderDark flex items-center justify-center text-zinc-500 mb-3 shadow-lg shadow-emerald-500/5">
          <i data-lucide="users" class="w-7 h-7"></i>
        </div>
        <h3 class="text-base font-bold text-white tracking-tight" id="emptyTitle">No groups yet</h3>
        <p class="text-xs text-zinc-400 mt-1 max-w-sm mx-auto" id="emptyDesc">
          Create a group to split expenses with flatmates, trips, and friends with automated debt simplification.
        </p>
        <button
          type="button"
          id="emptyNewGroupBtn"
          class="mt-4 h-11 px-5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
        >
          <i data-lucide="plus" class="w-4 h-4 stroke-[2.5]"></i>
          <span>Create New Group</span>
        </button>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const loadingEl = container.querySelector('#groupsLoading') as HTMLElement;
  const listGrid = container.querySelector('#groupsListGrid') as HTMLElement;
  const emptyEl = container.querySelector('#groupsEmpty') as HTMLElement;
  const emptyTitle = container.querySelector('#emptyTitle') as HTMLElement;
  const emptyDesc = container.querySelector('#emptyDesc') as HTMLElement;
  const emptyNewBtn = container.querySelector('#emptyNewGroupBtn') as HTMLElement;
  const openNewBtn = container.querySelector('#openNewGroupBtn') as HTMLElement;
  const toggleActiveBtn = container.querySelector('#toggleActiveGroups') as HTMLButtonElement;
  const toggleArchivedBtn = container.querySelector('#toggleArchivedGroups') as HTMLButtonElement;

  function handleOpenNewGroup() {
    openNewGroupSheet((newGroupId) => {
      window.location.hash = `#/groups/${newGroupId}`;
    });
  }

  openNewBtn.addEventListener('click', handleOpenNewGroup);
  emptyNewBtn.addEventListener('click', handleOpenNewGroup);

  toggleActiveBtn.addEventListener('click', () => {
    if (!isArchived) return;
    isArchived = false;
    toggleActiveBtn.className =
      'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all bg-emerald-500 text-black shadow-sm';
    toggleArchivedBtn.className =
      'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-zinc-400 hover:text-white';
    loadGroups();
  });

  toggleArchivedBtn.addEventListener('click', () => {
    if (isArchived) return;
    isArchived = true;
    toggleArchivedBtn.className =
      'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all bg-emerald-500 text-black shadow-sm';
    toggleActiveBtn.className =
      'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-zinc-400 hover:text-white';
    loadGroups();
  });

  async function loadGroups() {
    isLoading = true;
    loadingEl.classList.remove('hidden');
    listGrid.classList.add('hidden');
    emptyEl.classList.add('hidden');

    try {
      const data = await fetchGroupsApi(isArchived);
      groups = data || [];
      renderGroupCards();
    } catch (err: any) {
      loadingEl.innerHTML = `
        <div class="py-12 text-center text-rose-400 text-xs">
          ${escapeHtml(err.message || 'Failed to load groups')}
        </div>
      `;
    } finally {
      isLoading = false;
    }
  }

  function renderGroupCards() {
    loadingEl.classList.add('hidden');

    if (groups.length === 0) {
      listGrid.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      if (isArchived) {
        emptyTitle.textContent = 'No archived groups';
        emptyDesc.textContent = 'Groups that have been archived will appear here.';
        emptyNewBtn.classList.add('hidden');
      } else {
        emptyTitle.textContent = 'No groups yet';
        emptyDesc.textContent =
          'Create a group to split expenses with flatmates, trips, and friends with automated debt simplification.';
        emptyNewBtn.classList.remove('hidden');
      }
      return;
    }

    emptyEl.classList.add('hidden');
    listGrid.classList.remove('hidden');

    let html = '';
    for (const g of groups) {
      const balance = formatNetBalance(g.my_net_paise);
      const memberCountText = `${g.member_count} member${g.member_count === 1 ? '' : 's'}`;

      html += `
        <a
          href="#/groups/${escapeHtml(g.id)}"
          class="group-card block bg-surface hover:bg-surface2/70 border border-borderDark hover:border-zinc-700/60 rounded-2xl p-4 transition-all active:scale-[0.99] group cursor-pointer"
        >
          <div class="flex items-center justify-between gap-3">
            <!-- Left: Emoji & Info -->
            <div class="flex items-center gap-3.5 min-w-0">
              <div class="w-12 h-12 rounded-xl bg-surface2 border border-borderDark flex items-center justify-center text-2xl shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                ${escapeHtml(g.emoji || '👥')}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm sm:text-base font-semibold text-white tracking-tight truncate">
                    ${escapeHtml(g.name)}
                  </h3>
                  ${
                    g.archived_at
                      ? '<span class="px-1.5 py-0.2 text-[9px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 rounded uppercase">Archived</span>'
                      : ''
                  }
                </div>
                <div class="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                  <span>${escapeHtml(memberCountText)}</span>
                  ${g.kind ? `<span>&bull;</span><span class="capitalize">${escapeHtml(g.kind)}</span>` : ''}
                </div>
              </div>
            </div>

            <!-- Right: Net Balance & Chevron -->
            <div class="flex items-center gap-2.5 shrink-0 text-right">
              <div>
                <span class="text-xs sm:text-sm font-semibold block ${balance.colorClass}">
                  ${escapeHtml(balance.text)}
                </span>
              </div>
              <i data-lucide="chevron-right" class="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all"></i>
            </div>
          </div>
        </a>
      `;
    }

    listGrid.innerHTML = html;

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  loadGroups();
}
