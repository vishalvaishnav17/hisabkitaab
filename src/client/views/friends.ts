import {
  fetchFriendsBalancesApi,
  fetchGroupsApi,
  updatePersonApi,
  createPersonApi,
  FriendBalance,
  GroupItem,
} from '../api';
import { formatPaise, escapeHtml } from '../format';
import { showToast } from '../components/toast';

let cachedFriends: FriendBalance[] = [];
let cachedGroups: GroupItem[] = [];
const expandedFriendIds = new Set<string>();

export async function renderFriends(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="py-12 text-center" id="friendsLoading">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
      <p class="text-xs text-zinc-500 mt-2">Loading balances...</p>
    </div>
  `;

  try {
    const [friendsData, groupsData] = await Promise.all([
      fetchFriendsBalancesApi(),
      fetchGroupsApi(),
    ]);

    if (!friendsData || !groupsData) {
      return;
    }

    cachedFriends = friendsData;
    cachedGroups = groupsData;
    renderFriendsUI(container);
  } catch (err: any) {
    console.error('Failed to load friends view:', err);
    container.innerHTML = `
      <div class="py-12 text-center text-zinc-500">
        <p class="text-rose-400 text-sm">Failed to load balances</p>
        <button id="retryFriendsBtn" class="mt-4 px-4 py-2 bg-surface2 border border-borderDark rounded-xl text-xs text-zinc-300 hover:text-white">Retry</button>
      </div>
    `;
    const retryBtn = document.getElementById('retryFriendsBtn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => renderFriends(container));
    }
  }
}

function renderFriendsUI(container: HTMLElement): void {
  // Compute header totals from my own net across all groups:
  // positive into "You are owed", negative into "You owe"
  let totalOwedPaise = 0;
  let totalOwePaise = 0;

  for (const g of cachedGroups) {
    if (g.my_net_paise > 0) {
      totalOwedPaise += g.my_net_paise;
    } else if (g.my_net_paise < 0) {
      totalOwePaise += Math.abs(g.my_net_paise);
    }
  }

  const friendsListHtml = cachedFriends.length === 0
    ? `
      <div class="bg-surface border border-borderDark rounded-2xl p-8 text-center">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-surface2 border border-borderDark flex items-center justify-center text-zinc-500 mb-3">
          <i data-lucide="users" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-semibold text-zinc-300">No friends found</h3>
        <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Add friends or create a group to start tracking balances and splits.</p>
        <button id="addFriendEmptyBtn" class="mt-4 inline-flex items-center gap-1.5 h-11 px-4 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all shadow-md shadow-emerald-500/20">
          <i data-lucide="user-plus" class="w-4 h-4"></i>
          <span>Add Friend</span>
        </button>
      </div>
    `
    : `
      <div class="space-y-2.5">
        ${cachedFriends.map((f) => renderFriendCard(f)).join('')}
      </div>
    `;

  container.innerHTML = `
    <div class="space-y-4 sm:space-y-6">
      <!-- Header Summary Cards -->
      <div class="grid grid-cols-2 gap-3 sm:gap-4">
        <!-- You are owed -->
        <div class="bg-surface border border-borderDark rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-zinc-700/60 transition-all">
          <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
          <div class="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>You are owed</span>
            <span class="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <i data-lucide="arrow-down-left" class="w-4 h-4"></i>
            </span>
          </div>
          <div class="mt-3">
            <h3 class="text-xl sm:text-3xl font-extrabold text-white mono truncate">
              ${formatPaise(totalOwedPaise)}
            </h3>
            <p class="text-[11px] text-zinc-500 mt-1">Across all groups</p>
          </div>
        </div>

        <!-- You owe -->
        <div class="bg-surface border border-borderDark rounded-2xl p-4 sm:p-5 relative overflow-hidden group hover:border-zinc-700/60 transition-all">
          <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-all"></div>
          <div class="flex items-center justify-between text-zinc-400 text-xs font-medium">
            <span>You owe</span>
            <span class="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg">
              <i data-lucide="arrow-up-right" class="w-4 h-4"></i>
            </span>
          </div>
          <div class="mt-3">
            <h3 class="text-xl sm:text-3xl font-extrabold text-white mono truncate">
              ${formatPaise(totalOwePaise)}
            </h3>
            <p class="text-[11px] text-zinc-500 mt-1">Across all groups</p>
          </div>
        </div>
      </div>

      <!-- Friends Section Header -->
      <div class="flex items-center justify-between gap-2 pt-2">
        <div>
          <h2 class="text-base sm:text-lg font-bold text-white">Friends & Balances</h2>
          <p class="text-xs text-zinc-500">Track group standing and manage contact info</p>
        </div>
        <button id="addFriendBtn" class="flex items-center justify-center gap-1.5 h-11 px-3 sm:px-3.5 text-xs font-semibold bg-surface2 hover:bg-zinc-800 text-zinc-200 border border-borderDark hover:border-zinc-700 rounded-xl transition-all">
          <i data-lucide="user-plus" class="w-4 h-4 stroke-[2]"></i>
          <span>Add Friend</span>
        </button>
      </div>

      <!-- Friends List -->
      ${friendsListHtml}
    </div>

    <!-- Edit Friend Modal -->
    <div id="editFriendModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-end sm:items-center justify-center sm:p-4">
      <div class="bg-surface border border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[100dvh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 border-b border-borderDark">
          <h3 id="editFriendModalTitle" class="text-base font-semibold text-white">Edit Friend</h3>
          <button id="closeEditFriendModalBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-11 w-11 flex items-center justify-center rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <form id="editFriendForm" class="mt-4 space-y-4">
          <input type="hidden" id="editFriendId">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Name *</label>
            <input type="text" id="editFriendName" required placeholder="e.g. Rahul Sharma"
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">UPI ID (VPA)</label>
            <input type="text" id="editFriendUpi" placeholder="e.g. rahul@okaxis"
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Phone Number</label>
            <input type="tel" id="editFriendPhone" placeholder="e.g. +91 98765 43210"
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
          </div>
          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-borderDark">
            <button type="button" id="cancelEditFriendBtn" class="h-11 px-4 text-xs font-medium text-zinc-400 hover:text-white rounded-xl bg-surface2 hover:bg-zinc-800 transition-colors">Cancel</button>
            <button type="submit" id="saveEditFriendBtn" class="h-11 px-5 text-xs font-semibold text-black bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-md shadow-emerald-500/20">Save Changes</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Add Friend Modal -->
    <div id="addFriendModal" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-end sm:items-center justify-center sm:p-4">
      <div class="bg-surface border border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[100dvh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 border-b border-borderDark">
          <h3 class="text-base font-semibold text-white">Add Friend</h3>
          <button id="closeAddFriendModalBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-11 w-11 flex items-center justify-center rounded-lg">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <form id="addFriendForm" class="mt-4 space-y-4">
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Name *</label>
            <input type="text" id="newFriendName" required placeholder="e.g. Priya Patel"
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">UPI ID (VPA)</label>
            <input type="text" id="newFriendUpi" placeholder="e.g. priya@okhdfcbank"
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-400 mb-1">Phone Number</label>
            <input type="tel" id="newFriendPhone" placeholder="e.g. +91 91234 56789"
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors">
          </div>
          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-borderDark">
            <button type="button" id="cancelAddFriendBtn" class="h-11 px-4 text-xs font-medium text-zinc-400 hover:text-white rounded-xl bg-surface2 hover:bg-zinc-800 transition-colors">Cancel</button>
            <button type="submit" id="saveAddFriendBtn" class="h-11 px-5 text-xs font-semibold text-black bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-md shadow-emerald-500/20">Add Friend</button>
          </div>
        </form>
      </div>
    </div>
  `;

  attachFriendsEventListeners(container);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderFriendCard(friend: FriendBalance): string {
  const isExpanded = expandedFriendIds.has(friend.id);
  const initials = friend.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

  // Format net balance wording:
  // "gets back ₹X" if positive (group owes them)
  // "owes ₹X" if negative (they owe the group)
  // "settled up" if zero
  let balanceHtml = '';
  if (friend.net_paise > 0) {
    balanceHtml = `
      <div class="text-right">
        <div class="text-[11px] text-zinc-500">net across groups</div>
        <div class="text-sm sm:text-base font-semibold text-emerald-400 mono">
          gets back ${formatPaise(friend.net_paise)}
        </div>
      </div>
    `;
  } else if (friend.net_paise < 0) {
    balanceHtml = `
      <div class="text-right">
        <div class="text-[11px] text-zinc-500">net across groups</div>
        <div class="text-sm sm:text-base font-semibold text-rose-400 mono">
          owes ${formatPaise(Math.abs(friend.net_paise))}
        </div>
      </div>
    `;
  } else {
    balanceHtml = `
      <div class="text-right">
        <div class="text-[11px] text-zinc-500">net across groups</div>
        <div class="text-sm sm:text-base font-medium text-zinc-400 mono">
          settled up
        </div>
      </div>
    `;
  }

  const detailsList: string[] = [];
  if (friend.upi_vpa) {
    detailsList.push(escapeHtml(friend.upi_vpa));
  }
  if (friend.phone) {
    detailsList.push(escapeHtml(friend.phone));
  }
  const detailsHtml = detailsList.length > 0
    ? `<div class="text-xs text-zinc-500 truncate mt-0.5">${detailsList.join(' • ')}</div>`
    : `<div class="text-xs text-zinc-500 truncate mt-0.5">${friend.groups.length} ${friend.groups.length === 1 ? 'group' : 'groups'}</div>`;

  // Groups breakdown
  const groupsBreakdownHtml = isExpanded
    ? `
      <div class="mt-3 pt-3 border-t border-borderDark/60 space-y-2">
        <div class="text-[11px] uppercase tracking-wider font-semibold text-zinc-500">Group Breakdown</div>
        ${friend.groups.length === 0
          ? `<p class="text-xs text-zinc-500 italic py-1">No group activity recorded yet</p>`
          : friend.groups
              .map((g) => {
                let gBalanceText = '';
                if (g.net_paise > 0) {
                  gBalanceText = `<span class="text-emerald-400 mono font-semibold">gets back ${formatPaise(g.net_paise)}</span>`;
                } else if (g.net_paise < 0) {
                  gBalanceText = `<span class="text-rose-400 mono font-semibold">owes ${formatPaise(Math.abs(g.net_paise))}</span>`;
                } else {
                  gBalanceText = `<span class="text-zinc-500 mono font-medium">settled up</span>`;
                }

                return `
                  <a href="#/groups/${encodeURIComponent(g.group_id)}"
                     class="flex items-center justify-between p-2.5 rounded-xl bg-pitch hover:bg-zinc-900 border border-borderDark hover:border-zinc-700 transition-colors text-xs group">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors truncate">${escapeHtml(g.group_name || g.name)}</span>
                      <i data-lucide="arrow-up-right" class="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 shrink-0"></i>
                    </div>
                    <div class="text-right shrink-0">
                      ${gBalanceText}
                    </div>
                  </a>
                `;
              })
              .join('')}
      </div>
    `
    : '';

  return `
    <div class="bg-surface border border-borderDark rounded-2xl p-3.5 sm:p-4 hover:border-zinc-700/60 transition-all">
      <div class="flex items-center justify-between gap-3 cursor-pointer" data-friend-toggle="${escapeHtml(friend.id)}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-zinc-900 border border-borderDark flex items-center justify-center font-bold text-emerald-400 text-sm shrink-0">
            ${escapeHtml(initials)}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-white text-sm sm:text-base truncate">${escapeHtml(friend.name)}</div>
            ${detailsHtml}
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          ${balanceHtml}
          <button type="button" data-edit-friend="${escapeHtml(friend.id)}" aria-label="Edit ${escapeHtml(friend.name)}"
                  class="h-11 w-11 flex items-center justify-center text-zinc-400 hover:text-white rounded-xl hover:bg-surface2 transition-colors">
            <i data-lucide="edit-2" class="w-4 h-4"></i>
          </button>
          <div class="text-zinc-500 p-1">
            <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4"></i>
          </div>
        </div>
      </div>
      ${groupsBreakdownHtml}
    </div>
  `;
}

function attachFriendsEventListeners(container: HTMLElement): void {
  // Toggle accordion on row click
  container.querySelectorAll('[data-friend-toggle]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // Don't toggle if edit button was clicked
      if ((e.target as HTMLElement).closest('[data-edit-friend]')) {
        return;
      }
      const friendId = el.getAttribute('data-friend-toggle');
      if (!friendId) return;
      if (expandedFriendIds.has(friendId)) {
        expandedFriendIds.delete(friendId);
      } else {
        expandedFriendIds.add(friendId);
      }
      renderFriendsUI(container);
    });
  });

  // Edit Friend buttons
  container.querySelectorAll('[data-edit-friend]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const friendId = btn.getAttribute('data-edit-friend');
      if (!friendId) return;
      const friend = cachedFriends.find((f) => f.id === friendId);
      if (!friend) return;
      openEditFriendModal(friend);
    });
  });

  // Add Friend buttons
  const addBtn = document.getElementById('addFriendBtn');
  const addEmptyBtn = document.getElementById('addFriendEmptyBtn');
  if (addBtn) addBtn.addEventListener('click', () => openAddFriendModal());
  if (addEmptyBtn) addEmptyBtn.addEventListener('click', () => openAddFriendModal());

  // Edit modal buttons & form
  const editModal = document.getElementById('editFriendModal');
  const closeEditBtn = document.getElementById('closeEditFriendModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditFriendBtn');
  const editForm = document.getElementById('editFriendForm') as HTMLFormElement | null;

  const closeEditModal = () => {
    if (!editModal) return;
    editModal.classList.add('hidden');
    editModal.classList.remove('flex');
    document.body.style.overflow = '';
  };

  if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);

  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idInput = document.getElementById('editFriendId') as HTMLInputElement | null;
      const nameInput = document.getElementById('editFriendName') as HTMLInputElement | null;
      const upiInput = document.getElementById('editFriendUpi') as HTMLInputElement | null;
      const phoneInput = document.getElementById('editFriendPhone') as HTMLInputElement | null;

      if (!idInput || !nameInput) return;
      const id = idInput.value;
      const name = nameInput.value.trim();
      const upi_vpa = upiInput?.value.trim() || null;
      const phone = phoneInput?.value.trim() || null;

      if (!name) {
        showToast('Name is required', 'error');
        return;
      }

      try {
        const res = await updatePersonApi(id, { name, upi_vpa, phone });
        if (res && res.success) {
          showToast('Friend details updated');
          closeEditModal();
          renderFriends(container);
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to update friend', 'error');
      }
    });
  }

  // Add modal buttons & form
  const addModal = document.getElementById('addFriendModal');
  const closeAddBtn = document.getElementById('closeAddFriendModalBtn');
  const cancelAddBtn = document.getElementById('cancelAddFriendBtn');
  const addForm = document.getElementById('addFriendForm') as HTMLFormElement | null;

  const closeAddModal = () => {
    if (!addModal) return;
    addModal.classList.add('hidden');
    addModal.classList.remove('flex');
    document.body.style.overflow = '';
  };

  if (closeAddBtn) closeAddBtn.addEventListener('click', closeAddModal);
  if (cancelAddBtn) cancelAddBtn.addEventListener('click', closeAddModal);

  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('newFriendName') as HTMLInputElement | null;
      const upiInput = document.getElementById('newFriendUpi') as HTMLInputElement | null;
      const phoneInput = document.getElementById('newFriendPhone') as HTMLInputElement | null;

      if (!nameInput) return;
      const name = nameInput.value.trim();
      const upi_vpa = upiInput?.value.trim() || null;
      const phone = phoneInput?.value.trim() || null;

      if (!name) {
        showToast('Name is required', 'error');
        return;
      }

      try {
        const res = await createPersonApi({ name, upi_vpa, phone });
        if (res && res.success) {
          showToast('Friend added');
          closeAddModal();
          renderFriends(container);
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to add friend', 'error');
      }
    });
  }
}

function openEditFriendModal(friend: FriendBalance): void {
  const modal = document.getElementById('editFriendModal');
  const idInput = document.getElementById('editFriendId') as HTMLInputElement | null;
  const nameInput = document.getElementById('editFriendName') as HTMLInputElement | null;
  const upiInput = document.getElementById('editFriendUpi') as HTMLInputElement | null;
  const phoneInput = document.getElementById('editFriendPhone') as HTMLInputElement | null;

  if (!modal || !idInput || !nameInput || !upiInput || !phoneInput) return;

  idInput.value = friend.id;
  nameInput.value = friend.name;
  upiInput.value = friend.upi_vpa || '';
  phoneInput.value = friend.phone || '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function openAddFriendModal(): void {
  const modal = document.getElementById('addFriendModal');
  const form = document.getElementById('addFriendForm') as HTMLFormElement | null;
  if (!modal || !form) return;

  form.reset();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';

  if (window.lucide) {
    window.lucide.createIcons();
  }
}
