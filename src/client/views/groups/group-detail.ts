import { escapeHtml } from '../../format';
import { showToast } from '../../components/toast';
import { renderActivityList } from '../activity';
import {
  addGroupMemberApi,
  deleteGroupTransferApi,
  fetchGroupDetailApi,
  fetchGroupTimelineApi,
  fetchPeopleApi,
  removeGroupMemberApi,
} from './api';
import { formatNetBalance, formatPaise } from './helpers';
import { openGroupExpenseSheet } from './group-expense-sheet';
import { openGroupSettingsSheet } from './settings-sheet';
import { shareFriendNudge, shareGroupSummaryNudge } from './share-nudge';
import {
  GroupDetailResponse,
  PersonItem,
  TimelineExpenseItem,
  TimelineItem,
  TimelineTransferItem,
} from './types';

export function renderGroupDetail(container: HTMLElement, groupId: string): void {
  let detail: GroupDetailResponse | null = null;
  let activeTab: 'expenses' | 'members' | 'activity' | 'balances' = 'expenses';
  let timelineItems: TimelineItem[] = [];
  let nextCursor: string | null = null;
  let isLoadingTimeline = false;
  let hasMoreTimeline = true;
  let activityHandle: { refresh: () => void } | null = null;

  container.innerHTML = `
    <div class="py-12 text-center" id="groupDetailLoading">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
      <p class="text-xs text-zinc-500 mt-2">Loading group...</p>
    </div>
    <div id="groupDetailContent" class="hidden space-y-4"></div>
  `;

  const loadingEl = container.querySelector('#groupDetailLoading') as HTMLElement;
  const contentEl = container.querySelector('#groupDetailContent') as HTMLElement;

  async function loadData() {
    try {
      const data = await fetchGroupDetailApi(groupId);
      if (!data) {
        showToast('Group not found', 'error');
        window.location.hash = '#/groups';
        return;
      }
      detail = data;
      loadingEl.classList.add('hidden');
      contentEl.classList.remove('hidden');
      renderMain();
      loadTimeline(true);
    } catch (err: any) {
      loadingEl.innerHTML = `
        <div class="py-12 text-center">
          <p class="text-sm text-rose-400">${escapeHtml(err.message || 'Failed to load group')}</p>
          <a href="#/groups" class="inline-block mt-4 text-xs text-emerald-400 underline">Back to groups</a>
        </div>
      `;
    }
  }

  function renderMain() {
    if (!detail) return;
    const group = detail.group;
    const isArchived = Boolean(group.archived_at);
    const balanceInfo = formatNetBalance(detail.my_net_paise);

    // Compute next payer label
    let nextPayerHtml = '';
    if (detail.next_payer) {
      const nextPayerId = detail.next_payer;
      const isMe = nextPayerId === 'me';
      const payerMember = detail.members.find((m) => m.person_id === nextPayerId);
      const payerName = isMe ? 'You' : payerMember ? payerMember.name : 'Unknown';
      const rawDebtPaise = detail.balances[nextPayerId] ?? 0;
      const debtPaise = Math.abs(rawDebtPaise);

      nextPayerHtml = `
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
          <i data-lucide="sparkles" class="w-3.5 h-3.5 text-emerald-400"></i>
          <span>Next to pay: <strong class="text-white">${escapeHtml(payerName)}</strong> (${isMe ? 'owe' : 'owes'} ${formatPaise(debtPaise)})</span>
        </div>
      `;
    }

    contentEl.innerHTML = `
      <!-- Top Navigation & Actions Bar -->
      <div class="flex items-center justify-between gap-2 pb-1 border-b border-borderDark/60">
        <div class="flex items-center gap-2 min-w-0">
          <a
            href="#/groups"
            class="h-10 w-10 flex items-center justify-center rounded-xl bg-surface2 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-borderDark active:scale-95 transition-all"
            aria-label="Back to groups"
          >
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
          </a>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xl sm:text-2xl">${escapeHtml(group.emoji || '👥')}</span>
              <h1 class="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                ${escapeHtml(group.name)}
              </h1>
              ${
                isArchived
                  ? '<span class="px-2 py-0.5 text-[10px] font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-full uppercase">Archived</span>'
                  : ''
              }
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- TODO(chunk 10): Settle up button slot -->
          <div id="headerSettleUpSlot" class="hidden sm:block">
            <!-- Chunk 10 will render Settle Up header action here -->
          </div>

          ${
            !isArchived
              ? `
            <button
              type="button"
              id="headerAddExpenseBtn"
              class="h-10 px-3 sm:px-3.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
            >
              <i data-lucide="plus" class="w-4 h-4 stroke-[2.5]"></i>
              <span class="hidden min-[380px]:inline">Add Expense</span>
            </button>
          `
              : ''
          }

          <button
            type="button"
            id="groupShareSummaryBtn"
            class="h-10 px-3 text-xs font-medium bg-surface2 hover:bg-zinc-800 text-zinc-300 border border-borderDark rounded-xl flex items-center gap-1.5 active:scale-95 transition-all"
            aria-label="Share summary"
          >
            <i data-lucide="share-2" class="w-4 h-4"></i>
            <span class="hidden sm:inline">Share summary</span>
          </button>

          <button
            type="button"
            id="groupSettingsBtn"
            class="h-10 w-10 flex items-center justify-center rounded-xl bg-surface2 hover:bg-zinc-800 text-zinc-300 border border-borderDark active:scale-95 transition-all"
            aria-label="Group settings"
          >
            <i data-lucide="settings" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Group Summary Banner (Balance & Next Payer) -->
      <div class="bg-surface border border-borderDark rounded-2xl p-4 sm:p-5 relative overflow-hidden">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span class="text-xs text-zinc-400 font-medium block">Your Net Balance</span>
            <div class="text-xl sm:text-2xl font-extrabold tracking-tight mt-0.5 ${balanceInfo.colorClass}">
              ${escapeHtml(balanceInfo.text)}
            </div>
          </div>
          ${nextPayerHtml ? `<div>${nextPayerHtml}</div>` : ''}
        </div>
      </div>

      <!-- Sub-Tabs Navigation -->
      <div class="flex items-center gap-1.5 border-b border-borderDark overflow-x-auto no-scrollbar pt-1">
        <button
          type="button"
          data-tab="expenses"
          class="sub-tab-btn min-h-[42px] px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'expenses'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }"
        >
          Expenses
        </button>

        <button
          type="button"
          data-tab="members"
          class="sub-tab-btn min-h-[42px] px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'members'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }"
        >
          Members (${detail.members.filter((m) => !m.left_at).length})
        </button>

        <!-- TODO(chunk 10): Balances / Settle up tab -->
        <button
          type="button"
          data-tab="balances"
          class="sub-tab-btn min-h-[42px] px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'balances'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }"
        >
          Balances
        </button>

        <button
          type="button"
          data-tab="activity"
          class="sub-tab-btn min-h-[42px] px-4 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'activity'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-white'
          }"
        >
          Activity
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="groupTabContent" class="pt-2"></div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Attach Share summary button listener
    const shareSummaryBtn = contentEl.querySelector('#groupShareSummaryBtn');
    shareSummaryBtn?.addEventListener('click', () => {
      shareGroupSummaryNudge(groupId);
    });

    // Attach Settings button listener
    const settingsBtn = contentEl.querySelector('#groupSettingsBtn');
    settingsBtn?.addEventListener('click', () => {
      openGroupSettingsSheet(detail!, (action) => {
        if (action === 'deleted') {
          // Handled inside settings sheet
        } else {
          loadData();
        }
      });
    });

    // Attach Add Expense header button listener
    const addExpenseBtn = contentEl.querySelector('#headerAddExpenseBtn');
    addExpenseBtn?.addEventListener('click', () => {
      openGroupExpenseSheet({
        detail: detail!,
        onSaved: () => {
          loadData();
        },
      });
    });

    // Sub-tab switching
    contentEl.querySelectorAll<HTMLButtonElement>('.sub-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as any;
        if (tab === activeTab) return;
        activeTab = tab;
        contentEl.querySelectorAll<HTMLButtonElement>('.sub-tab-btn').forEach((b) => {
          if (b.dataset.tab === activeTab) {
            b.className =
              'sub-tab-btn min-h-[42px] px-4 text-xs font-semibold border-b-2 border-emerald-500 text-emerald-400 transition-all';
          } else {
            b.className =
              'sub-tab-btn min-h-[42px] px-4 text-xs font-semibold border-b-2 border-transparent text-zinc-400 hover:text-white transition-all';
          }
        });
        renderCurrentTab();
      });
    });

    renderCurrentTab();
  }

  function renderCurrentTab() {
    const tabContainer = contentEl.querySelector('#groupTabContent') as HTMLElement;
    if (!tabContainer || !detail) return;

    if (activeTab === 'expenses') {
      renderExpensesTab(tabContainer);
    } else if (activeTab === 'members') {
      renderMembersTab(tabContainer);
    } else if (activeTab === 'balances') {
      renderBalancesTab(tabContainer);
    } else if (activeTab === 'activity') {
      renderActivityTab(tabContainer);
    }
  }

  // --- Expenses Tab ---
  async function loadTimeline(reset = false) {
    if (isLoadingTimeline) return;
    if (!reset && !hasMoreTimeline) return;

    isLoadingTimeline = true;
    if (reset) {
      timelineItems = [];
      nextCursor = null;
      hasMoreTimeline = true;
    }

    try {
      const res = await fetchGroupTimelineApi(groupId, nextCursor || undefined, 30);
      if (res) {
        if (reset) {
          timelineItems = res.items || [];
        } else {
          timelineItems = [...timelineItems, ...(res.items || [])];
        }
        nextCursor = res.next_cursor;
        hasMoreTimeline = Boolean(res.next_cursor);
      }
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      isLoadingTimeline = false;
      if (activeTab === 'expenses') {
        const tabContainer = contentEl.querySelector('#groupTabContent') as HTMLElement;
        if (tabContainer) renderExpensesTab(tabContainer);
      }
    }
  }

  function renderExpensesTab(container: HTMLElement) {
    if (!detail) return;
    const isArchived = Boolean(detail.group.archived_at);

    if (timelineItems.length === 0 && !isLoadingTimeline) {
      container.innerHTML = `
        <div class="py-16 text-center">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-surface2 border border-borderDark flex items-center justify-center text-zinc-500 mb-3">
            <i data-lucide="receipt" class="w-7 h-7"></i>
          </div>
          <h3 class="text-base font-bold text-zinc-200">No expenses yet</h3>
          <p class="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Add group expenses to split bills with members automatically.
          </p>
          ${
            !isArchived
              ? `
            <button
              type="button"
              id="emptyAddExpenseBtn"
              class="mt-4 px-4 h-11 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-md shadow-emerald-500/20"
            >
              <i data-lucide="plus" class="w-4 h-4 stroke-[2.5]"></i>
              <span>Add Expense</span>
            </button>
          `
              : ''
          }
        </div>
      `;

      if (window.lucide) {
        window.lucide.createIcons();
      }

      container.querySelector('#emptyAddExpenseBtn')?.addEventListener('click', () => {
        openGroupExpenseSheet({
          detail: detail!,
          onSaved: () => loadData(),
        });
      });
      return;
    }

    let itemsHtml = '';
    for (const item of timelineItems) {
      if (item.type === 'expense') {
        const exp = item as TimelineExpenseItem;
        const myShare = exp.shares.find((s) => s.person_id === 'me');
        const myShareText = myShare
          ? `Your share: ${formatPaise(myShare.amount_paise)}`
          : 'Not in this expense';

        itemsHtml += `
          <div
            data-expense-id="${escapeHtml(exp.id)}"
            class="timeline-expense-card bg-surface hover:bg-surface2/60 border border-borderDark hover:border-zinc-700/60 rounded-2xl p-4 transition-all cursor-pointer space-y-2 group"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-0.5 text-[10px] font-semibold bg-surface2 text-zinc-400 border border-borderDark rounded-md">
                    ${escapeHtml(exp.category || 'General')}
                  </span>
                  <span class="text-xs text-zinc-500 font-mono">
                    ${escapeHtml(exp.date)}
                  </span>
                </div>
                <h4 class="text-sm font-semibold text-zinc-100 mt-1 truncate">
                  ${escapeHtml(exp.description)}
                </h4>
              </div>

              <div class="text-right shrink-0">
                <span class="text-sm sm:text-base font-bold text-white mono block">
                  ${formatPaise(exp.amount_paise)}
                </span>
                ${
                  exp.amount_expr
                    ? `
                  <span class="text-[11px] text-zinc-500 font-mono block">
                    ${escapeHtml(exp.amount_expr)}
                  </span>
                `
                    : ''
                }
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-zinc-400 pt-1 border-t border-borderDark/40">
              <span class="truncate">
                Paid by <strong class="text-zinc-200">${escapeHtml(exp.paid_by_name || 'Someone')}</strong>
              </span>
              <span class="text-[11px] font-medium ${myShare ? 'text-emerald-400' : 'text-zinc-500'} shrink-0">
                ${escapeHtml(myShareText)}
              </span>
            </div>
          </div>
        `;
      } else if (item.type === 'transfer') {
        const tr = item as TimelineTransferItem;
        itemsHtml += `
          <div
            data-transfer-id="${escapeHtml(tr.id)}"
            class="timeline-transfer-card bg-surface2/40 border border-cyan-500/20 rounded-2xl p-3.5 sm:p-4 space-y-2 relative"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
                  <i data-lucide="arrow-left-right" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                  <span class="text-xs font-semibold text-zinc-200 block truncate">
                    ${escapeHtml(tr.from_name)} paid ${escapeHtml(tr.to_name)}
                  </span>
                  <span class="text-[11px] text-zinc-500 mono block">
                    ${escapeHtml(tr.date)} ${tr.method ? `&bull; ${escapeHtml(tr.method)}` : ''}
                  </span>
                </div>
              </div>

              <div class="text-right shrink-0">
                <span class="text-sm font-bold text-cyan-400 mono">
                  ${formatPaise(tr.amount_paise)}
                </span>
              </div>
            </div>
            ${
              tr.note
                ? `
              <p class="text-xs text-zinc-400 pl-10 italic">
                "${escapeHtml(tr.note)}"
              </p>
            `
                : ''
            }
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="space-y-3">
        ${itemsHtml}

        ${
          hasMoreTimeline
            ? `
          <div class="py-4 text-center">
            <button
              type="button"
              id="loadMoreTimelineBtn"
              class="h-10 px-5 text-xs font-semibold bg-surface2 hover:bg-zinc-800 text-zinc-300 border border-borderDark rounded-xl active:scale-95 transition-all"
            >
              ${isLoadingTimeline ? 'Loading older items...' : 'Load older expenses'}
            </button>
          </div>
        `
            : ''
        }
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Attach click listeners to expenses
    container.querySelectorAll<HTMLElement>('.timeline-expense-card').forEach((card) => {
      card.addEventListener('click', () => {
        const eid = card.dataset.expenseId;
        if (!eid) return;
        const expItem = timelineItems.find((i) => i.id === eid && i.type === 'expense') as
          | TimelineExpenseItem
          | undefined;
        if (expItem) {
          openGroupExpenseSheet({
            detail: detail!,
            expense: expItem,
            onSaved: () => loadData(),
          });
        }
      });
    });

    // Load more timeline button
    container.querySelector('#loadMoreTimelineBtn')?.addEventListener('click', () => {
      loadTimeline(false);
    });
  }

  // --- Members Tab ---
  function renderMembersTab(container: HTMLElement) {
    if (!detail) return;
    const isArchived = Boolean(detail.group.archived_at);
    const activeMembers = detail.members.filter((m) => !m.left_at);

    let membersListHtml = '';
    for (const m of activeMembers) {
      const net = detail.balances[m.person_id] ?? 0;
      let balanceLabel = 'settled up';
      let balanceColor = 'text-zinc-500';

      if (net > 0) {
        balanceLabel = `gets back ${formatPaise(net)}`;
        balanceColor = 'text-emerald-400';
      } else if (net < 0) {
        balanceLabel = `owes ${formatPaise(Math.abs(net))}`;
        balanceColor = 'text-rose-400';
      }

      membersListHtml += `
        <div class="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface border border-borderDark">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-surface2 border border-borderDark flex items-center justify-center text-xs font-bold text-zinc-200 uppercase shrink-0">
              ${escapeHtml(m.name.charAt(0) || '?')}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-semibold text-white truncate">
                  ${escapeHtml(m.name)}
                </span>
                ${m.is_me ? '<span class="px-1.5 py-0.2 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded">You</span>' : ''}
              </div>
              <span class="text-xs font-medium ${balanceColor} block mt-0.5">
                ${escapeHtml(balanceLabel)}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            ${
              !m.is_me
                ? `
              <button
                type="button"
                data-share-person-id="${escapeHtml(m.person_id)}"
                class="share-member-btn h-9 px-2.5 text-xs font-semibold text-zinc-300 hover:text-white bg-surface2 hover:bg-zinc-800 rounded-xl border border-borderDark active:scale-95 transition-all flex items-center gap-1.5"
                title="Share card"
              >
                <i data-lucide="share-2" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span class="hidden min-[380px]:inline">Share</span>
              </button>
            `
                : ''
            }
            ${
              !m.is_me && !isArchived
                ? `
              <button
                type="button"
                data-remove-person-id="${escapeHtml(m.person_id)}"
                data-person-name="${escapeHtml(m.name)}"
                class="remove-member-btn h-9 px-3 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/20 active:scale-95 transition-all"
              >
                Remove
              </button>
            `
                : ''
            }
          </div>

        </div>
      `;
    }

    container.innerHTML = `
      <div class="space-y-4">
        <!-- Add Member Bar -->
        ${
          !isArchived
            ? `
          <div class="bg-surface border border-borderDark rounded-2xl p-3.5 space-y-3">
            <h4 class="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Add Member</h4>
            
            <div class="flex flex-col sm:flex-row gap-2">
              <select
                id="existingPeopleSelect"
                class="flex-1 bg-surface2 border border-borderDark text-zinc-200 rounded-xl px-3 h-11 text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select an existing person...</option>
              </select>
              <button
                type="button"
                id="addExistingMemberBtn"
                class="h-11 px-4 text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-borderDark active:scale-95 transition-all shrink-0"
              >
                Add Person
              </button>
            </div>

            <div class="flex items-center gap-2">
              <div class="flex-1 border-t border-borderDark/60"></div>
              <span class="text-[11px] text-zinc-500 uppercase tracking-wider">or new person</span>
              <div class="flex-1 border-t border-borderDark/60"></div>
            </div>

            <div class="flex gap-2">
              <input
                type="text"
                id="newMemberNameInput"
                placeholder="Type a new person's name..."
                class="flex-1 bg-surface2 border border-borderDark rounded-xl px-3 h-11 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                id="addNewMemberBtn"
                class="h-11 px-5 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95 transition-all shrink-0 shadow-md shadow-emerald-500/20"
              >
                + Add
              </button>
            </div>
          </div>
        `
            : ''
        }

        <!-- Members List -->
        <div class="space-y-2">
          ${membersListHtml}
        </div>
      </div>
    `;

    // Populate existing people dropdown
    const peopleSelect = container.querySelector('#existingPeopleSelect') as HTMLSelectElement | null;
    if (peopleSelect) {
      fetchPeopleApi().then((people) => {
        if (!people) return;
        const currentActiveIds = new Set(activeMembers.map((m) => m.person_id));
        const available = people.filter((p) => !currentActiveIds.has(p.id));

        peopleSelect.innerHTML =
          '<option value="">Select an existing person...</option>' +
          available
            .map(
              (p) => `
            <option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>
          `
            )
            .join('');
      });
    }

    // Add existing person button
    const addExistingBtn = container.querySelector('#addExistingMemberBtn') as HTMLButtonElement | null;
    addExistingBtn?.addEventListener('click', async () => {
      const pid = peopleSelect?.value;
      if (!pid) {
        showToast('Please select a person', 'error');
        return;
      }
      addExistingBtn.disabled = true;
      try {
        await addGroupMemberApi(groupId, { person_id: pid });
        showToast('Member added');
        loadData();
      } catch (err: any) {
        showToast(err.message || 'Failed to add member', 'error');
        addExistingBtn.disabled = false;
      }
    });

    // Add new person by name button
    const newNameInput = container.querySelector('#newMemberNameInput') as HTMLInputElement | null;
    const addNewBtn = container.querySelector('#addNewMemberBtn') as HTMLButtonElement | null;
    const handleAddNewMember = async () => {
      const name = newNameInput?.value.trim();
      if (!name) return;
      if (addNewBtn) addNewBtn.disabled = true;
      try {
        await addGroupMemberApi(groupId, { name });
        showToast(`Added ${name} to group`);
        loadData();
      } catch (err: any) {
        showToast(err.message || 'Failed to add member', 'error');
        if (addNewBtn) addNewBtn.disabled = false;
      }
    };
    addNewBtn?.addEventListener('click', handleAddNewMember);
    newNameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddNewMember();
      }
    });

    // Remove member buttons
    container.querySelectorAll<HTMLButtonElement>('.remove-member-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.removePersonId;
        const name = btn.dataset.personName || 'member';
        if (!pid) return;

        const confirmed = confirm(`Remove ${name} from this group?`);
        if (!confirmed) return;

        btn.disabled = true;
        btn.textContent = '...';

        try {
          await removeGroupMemberApi(groupId, pid);
          showToast(`Removed ${name}`);
          loadData();
        } catch (err: any) {
          // Spec: the error from the API is shown when blocked (e.g. non-zero balance)
          showToast(err.message || 'Failed to remove member', 'error');
          btn.disabled = false;
          btn.textContent = 'Remove';
        }
      });
    });

    // Share member nudge card buttons
    container.querySelectorAll<HTMLButtonElement>('.share-member-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.sharePersonId;
        if (pid) {
          shareFriendNudge(groupId, pid);
        }
      });
    });
  }


  // --- Balances Tab (TODO(chunk 10) slot) ---
  function renderBalancesTab(container: HTMLElement) {
    // TODO(chunk 10): Full Balances, Settlements, and Settle up sheet implementation
    container.innerHTML = `
      <div class="py-12 text-center bg-surface border border-borderDark rounded-2xl p-6">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
          <i data-lucide="scale" class="w-6 h-6"></i>
        </div>
        <h3 class="text-base font-bold text-white tracking-tight">Balances & Settle Up</h3>
        <p class="text-xs text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
          Simplified debt settlements and direct transfers are part of the settlement workflow.
        </p>
        <span class="inline-block mt-4 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
          Coming in Chunk 10
        </span>
      </div>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Activity Tab ---
  function renderActivityTab(container: HTMLElement) {
    container.innerHTML = '<div id="groupActivityContainer"></div>';
    const actBox = container.querySelector('#groupActivityContainer') as HTMLElement;
    activityHandle = renderActivityList(actBox, { group_id: groupId });
  }

  loadData();
}
