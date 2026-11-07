import { escapeHtml } from '../../format';
import { showToast } from '../../components/toast';
import { archiveGroupApi, deleteGroupApi, unarchiveGroupApi, updateGroupApi } from './api';
import { GroupDetailResponse, GroupKind } from './types';

const EMOJI_PRESETS = ['🏖️', '🏠', '🍕', '✈️', '🍻', '🚗', '👥', '🧗', '☕', '🎉', '🛒', '⚡'];

export function openGroupSettingsSheet(
  detail: GroupDetailResponse,
  onUpdated: (action?: 'updated' | 'archived' | 'deleted') => void
): void {
  let modal = document.getElementById('groupSettingsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupSettingsModal';
    modal.className =
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4';
    document.body.appendChild(modal);
  }

  const group = detail.group;
  const isArchived = Boolean(group.archived_at);

  let selectedEmoji = group.emoji || '👥';
  let selectedKind: GroupKind = group.kind || 'other';
  let simplifyDebts = group.simplify_debts === 1;

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[92dvh] overflow-y-auto">
      <div class="flex items-center justify-between pb-3 border-b border-borderDark">
        <h3 class="text-base font-semibold text-white">Group Settings</h3>
        <button type="button" id="closeSettingsBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-10 w-10 flex items-center justify-center rounded-lg">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="groupSettingsForm" class="mt-4 space-y-4">
        <!-- Name -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Group Name *</label>
          <input
            type="text"
            id="settingsGroupName"
            required
            value="${escapeHtml(group.name)}"
            ${isArchived ? 'disabled' : ''}
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60"
          />
        </div>

        <!-- Emoji Picker -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Group Icon / Emoji</label>
          <div class="flex items-center gap-2 mb-2">
            <span id="settingsEmojiDisplay" class="w-10 h-10 rounded-xl bg-surface2 border border-borderDark flex items-center justify-center text-xl shrink-0">
              ${escapeHtml(selectedEmoji)}
            </span>
            <input
              type="text"
              id="settingsGroupEmoji"
              maxlength="4"
              value="${escapeHtml(selectedEmoji)}"
              ${isArchived ? 'disabled' : ''}
              class="w-20 bg-surface2 border border-borderDark rounded-xl px-3 h-10 text-center text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
            />
          </div>
          ${
            !isArchived
              ? `
          <div class="flex items-center gap-1.5 flex-wrap" id="settingsEmojiPresets">
            ${EMOJI_PRESETS.map(
              (emo) => `
              <button
                type="button"
                data-emoji="${emo}"
                class="settings-emoji-chip w-9 h-9 rounded-lg bg-surface2 hover:bg-zinc-800 border border-borderDark flex items-center justify-center text-base active:scale-95 transition-all"
              >
                ${emo}
              </button>
            `
            ).join('')}
          </div>
          `
              : ''
          }
        </div>

        <!-- Kind -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Type</label>
          <div class="grid grid-cols-4 gap-2" id="settingsKindSelector">
            ${[
              { kind: 'trip', label: 'Trip', icon: '✈️' },
              { kind: 'home', label: 'Home', icon: '🏠' },
              { kind: 'couple', label: 'Couple', icon: '👥' },
              { kind: 'other', label: 'Other', icon: '📦' },
            ]
              .map(
                (k) => `
              <button
                type="button"
                data-kind="${k.kind}"
                ${isArchived ? 'disabled' : ''}
                class="settings-kind-btn flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs transition-all ${
                  k.kind === selectedKind
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-semibold'
                    : 'bg-surface2 text-zinc-400 border-borderDark hover:text-white'
                } disabled:opacity-60"
              >
                <span class="text-base">${k.icon}</span>
                <span class="mt-0.5">${k.label}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Simplify Debts Toggle -->
        <div class="p-3 bg-surface2/60 border border-borderDark rounded-xl">
          <label class="flex items-start justify-between gap-3 cursor-pointer">
            <div class="min-w-0">
              <span class="text-xs font-semibold text-zinc-200 block">Simplify Debts</span>
              <p class="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                Minimizes the total number of transactions needed to settle debts between all group members.
              </p>
            </div>
            <input
              type="checkbox"
              id="settingsSimplifyDebts"
              ${simplifyDebts ? 'checked' : ''}
              ${isArchived ? 'disabled' : ''}
              class="w-5 h-5 rounded text-emerald-500 bg-surface border-borderDark focus:ring-0 focus:ring-offset-0 cursor-pointer mt-0.5 disabled:opacity-60"
            />
          </label>
        </div>

        ${
          !isArchived
            ? `
        <!-- Save Changes Button -->
        <div class="pt-2">
          <button
            type="submit"
            id="saveSettingsBtn"
            class="w-full h-11 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95"
          >
            Save Changes
          </button>
        </div>
        `
            : ''
        }

        <!-- Archive & Delete Actions -->
        <div class="pt-4 border-t border-borderDark space-y-2.5">
          <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Group Actions</h4>

          <!-- Archive / Unarchive Button -->
          <button
            type="button"
            id="toggleArchiveBtn"
            class="w-full h-11 px-4 text-xs font-semibold rounded-xl border border-zinc-700 bg-surface2 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <i data-lucide="${isArchived ? 'archive-restore' : 'archive'}" class="w-4 h-4"></i>
            <span>${isArchived ? 'Unarchive Group' : 'Archive Group'}</span>
          </button>

          <!-- Delete Group Button -->
          <button
            type="button"
            id="deleteGroupBtn"
            class="w-full h-11 px-4 text-xs font-semibold rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <i data-lucide="trash-2" class="w-4 h-4"></i>
            <span>Delete Group</span>
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.style.overflow = 'hidden';

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const closeBtn = modal.querySelector('#closeSettingsBtn') as HTMLButtonElement;
  const form = modal.querySelector('#groupSettingsForm') as HTMLFormElement;
  const nameInput = modal.querySelector('#settingsGroupName') as HTMLInputElement;
  const emojiInput = modal.querySelector('#settingsGroupEmoji') as HTMLInputElement;
  const emojiDisplay = modal.querySelector('#settingsEmojiDisplay') as HTMLElement;
  const simplifyInput = modal.querySelector('#settingsSimplifyDebts') as HTMLInputElement;
  const toggleArchiveBtn = modal.querySelector('#toggleArchiveBtn') as HTMLButtonElement;
  const deleteGroupBtn = modal.querySelector('#deleteGroupBtn') as HTMLButtonElement;
  const saveBtn = modal.querySelector('#saveSettingsBtn') as HTMLButtonElement | null;

  function closeModal() {
    if (modal) {
      modal.remove();
    }
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeModal);

  // Emoji presets
  modal.querySelectorAll<HTMLButtonElement>('.settings-emoji-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const em = btn.dataset.emoji || '👥';
      selectedEmoji = em;
      emojiInput.value = em;
      emojiDisplay.textContent = em;
    });
  });

  emojiInput.addEventListener('input', () => {
    const val = emojiInput.value.trim() || '👥';
    selectedEmoji = val;
    emojiDisplay.textContent = val;
  });

  // Kind selector
  modal.querySelectorAll<HTMLButtonElement>('.settings-kind-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = (btn.dataset.kind || 'other') as GroupKind;
      selectedKind = kind;
      modal.querySelectorAll<HTMLButtonElement>('.settings-kind-btn').forEach((b) => {
        if (b.dataset.kind === kind) {
          b.className =
            'settings-kind-btn flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-semibold transition-all';
        } else {
          b.className =
            'settings-kind-btn flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs bg-surface2 text-zinc-400 border-borderDark hover:text-white transition-all';
        }
      });
    });
  });

  // Save Settings
  if (saveBtn) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        await updateGroupApi(group.id, {
          name,
          emoji: selectedEmoji || null,
          kind: selectedKind,
          simplify_debts: simplifyInput.checked ? 1 : 0,
        });

        showToast('Group settings updated');
        closeModal();
        onUpdated('updated');
      } catch (err: any) {
        showToast(err.message || 'Failed to update settings', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    });
  }

  // Archive / Unarchive
  toggleArchiveBtn.addEventListener('click', async () => {
    toggleArchiveBtn.disabled = true;
    toggleArchiveBtn.textContent = isArchived ? 'Unarchiving...' : 'Archiving...';

    try {
      if (isArchived) {
        await unarchiveGroupApi(group.id);
        showToast('Group unarchived');
      } else {
        await archiveGroupApi(group.id);
        showToast('Group archived');
      }
      closeModal();
      onUpdated('archived');
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
      toggleArchiveBtn.disabled = false;
      toggleArchiveBtn.textContent = isArchived ? 'Unarchive Group' : 'Archive Group';
    }
  });

  // Delete Group
  deleteGroupBtn.addEventListener('click', async () => {
    const confirmed = confirm(
      `Are you sure you want to delete "${group.name}"? All balances must be zero to delete.`
    );
    if (!confirmed) return;

    deleteGroupBtn.disabled = true;
    deleteGroupBtn.textContent = 'Deleting...';

    try {
      await deleteGroupApi(group.id);
      showToast('Group deleted');
      closeModal();
      window.location.hash = '#/groups';
      onUpdated('deleted');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete group', 'error');
      deleteGroupBtn.disabled = false;
      deleteGroupBtn.textContent = 'Delete Group';
    }
  });
}
