import { escapeHtml } from '../../format';
import { showToast } from '../../components/toast';
import { createGroupApi, createPersonApi, fetchPeopleApi } from './api';
import { GroupKind, PersonItem } from './types';

const EMOJI_PRESETS = ['🏖️', '🏠', '🍕', '✈️', '🍻', '🚗', '👥', '🧗', '☕', '🎉', '🛒', '⚡'];

export function openNewGroupSheet(onCreated?: (groupId: string) => void): void {
  let modal = document.getElementById('newGroupModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'newGroupModal';
    modal.className =
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4';
    document.body.appendChild(modal);
  }

  let selectedEmoji = '👥';
  let selectedKind: GroupKind = 'other';
  let selectedMemberIds = new Set<string>(['me']);
  let allPeople: PersonItem[] = [];

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[92dvh] overflow-y-auto">
      <div class="flex items-center justify-between pb-3 border-b border-borderDark">
        <h3 class="text-base font-semibold text-white">Create New Group</h3>
        <button type="button" id="closeNewGroupBtn" aria-label="Close" class="text-zinc-500 hover:text-zinc-300 h-10 w-10 flex items-center justify-center rounded-lg">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="newGroupForm" class="mt-4 space-y-4">
        <!-- Name -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Group Name *</label>
          <input
            type="text"
            id="newGroupName"
            required
            placeholder="e.g. Goa Trip, Flat 402, Weekend Brunch"
            class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <!-- Emoji Picker -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Group Icon / Emoji</label>
          <div class="flex items-center gap-2 mb-2">
            <span id="selectedEmojiDisplay" class="w-10 h-10 rounded-xl bg-surface2 border border-borderDark flex items-center justify-center text-xl shrink-0">
              👥
            </span>
            <input
              type="text"
              id="newGroupEmoji"
              maxlength="4"
              value="👥"
              placeholder="Emoji"
              class="w-20 bg-surface2 border border-borderDark rounded-xl px-3 h-10 text-center text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <span class="text-xs text-zinc-500">Pick below or type custom</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap" id="emojiPresets">
            ${EMOJI_PRESETS.map(
              (emo) => `
              <button
                type="button"
                data-emoji="${emo}"
                class="emoji-chip w-9 h-9 rounded-lg bg-surface2 hover:bg-zinc-800 border border-borderDark flex items-center justify-center text-base active:scale-95 transition-all"
              >
                ${emo}
              </button>
            `
            ).join('')}
          </div>
        </div>

        <!-- Kind -->
        <div>
          <label class="block text-xs font-medium text-zinc-400 mb-1">Type</label>
          <div class="grid grid-cols-4 gap-2" id="groupKindSelector">
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
                class="kind-btn flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs transition-all ${
                  k.kind === 'other'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-semibold'
                    : 'bg-surface2 text-zinc-400 border-borderDark hover:text-white'
                }"
              >
                <span class="text-base">${k.icon}</span>
                <span class="mt-0.5">${k.label}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Members Selection -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-xs font-medium text-zinc-400">Members</label>
            <span class="text-[11px] text-zinc-500">You are included automatically</span>
          </div>

          <div id="membersPickerList" class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            <div class="py-2 text-center text-xs text-zinc-500">Loading people...</div>
          </div>

          <!-- Add new person inline -->
          <div class="mt-2.5 pt-2.5 border-t border-borderDark/60 flex items-center gap-2">
            <input
              type="text"
              id="newMemberInlineName"
              placeholder="Add new person..."
              class="flex-1 bg-surface2 border border-borderDark rounded-xl px-3 h-10 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              id="addMemberInlineBtn"
              class="h-10 px-3.5 text-xs font-semibold rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-borderDark active:scale-95 transition-all"
            >
              + Add
            </button>
          </div>
        </div>

        <!-- Buttons -->
        <div class="flex items-center justify-end gap-2 pt-3 border-t border-borderDark">
          <button
            type="button"
            id="cancelNewGroupBtn"
            class="h-11 px-4 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            id="submitNewGroupBtn"
            class="h-11 px-5 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-all shadow-md shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
          >
            Create Group
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.style.overflow = 'hidden';

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const closeBtn = modal.querySelector('#closeNewGroupBtn') as HTMLButtonElement;
  const cancelBtn = modal.querySelector('#cancelNewGroupBtn') as HTMLButtonElement;
  const form = modal.querySelector('#newGroupForm') as HTMLFormElement;
  const nameInput = modal.querySelector('#newGroupName') as HTMLInputElement;
  const emojiInput = modal.querySelector('#newGroupEmoji') as HTMLInputElement;
  const emojiDisplay = modal.querySelector('#selectedEmojiDisplay') as HTMLElement;
  const membersListEl = modal.querySelector('#membersPickerList') as HTMLElement;
  const inlineNameInput = modal.querySelector('#newMemberInlineName') as HTMLInputElement;
  const inlineAddBtn = modal.querySelector('#addMemberInlineBtn') as HTMLButtonElement;
  const submitBtn = modal.querySelector('#submitNewGroupBtn') as HTMLButtonElement;

  function closeModal() {
    if (modal) {
      modal.remove();
    }
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Emoji presets
  modal.querySelectorAll<HTMLButtonElement>('.emoji-chip').forEach((btn) => {
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
  modal.querySelectorAll<HTMLButtonElement>('.kind-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = (btn.dataset.kind || 'other') as GroupKind;
      selectedKind = kind;
      modal.querySelectorAll<HTMLButtonElement>('.kind-btn').forEach((b) => {
        if (b.dataset.kind === kind) {
          b.className =
            'kind-btn flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-semibold transition-all';
        } else {
          b.className =
            'kind-btn flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-xs bg-surface2 text-zinc-400 border-borderDark hover:text-white transition-all';
        }
      });
    });
  });

  function renderMembersList() {
    let html = `
      <!-- Always include Me -->
      <label class="flex items-center justify-between p-2 rounded-xl bg-surface2/60 border border-borderDark text-xs cursor-not-allowed opacity-90">
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
            ME
          </span>
          <span class="text-zinc-200 font-medium">You (Me)</span>
        </div>
        <span class="text-[11px] text-emerald-400 font-medium">Included</span>
      </label>
    `;

    for (const p of allPeople) {
      if (p.id === 'me' || p.is_me) continue;
      const isChecked = selectedMemberIds.has(p.id);
      html += `
        <label class="flex items-center justify-between p-2 rounded-xl bg-surface2 hover:bg-zinc-800/80 border ${
          isChecked ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-borderDark'
        } text-xs cursor-pointer transition-all">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
              ${escapeHtml(p.name.charAt(0) || '?')}
            </span>
            <span class="text-zinc-200 truncate">${escapeHtml(p.name)}</span>
          </div>
          <input
            type="checkbox"
            data-person-id="${escapeHtml(p.id)}"
            class="member-toggle w-4 h-4 rounded text-emerald-500 bg-surface border-borderDark focus:ring-0 focus:ring-offset-0 cursor-pointer"
            ${isChecked ? 'checked' : ''}
          />
        </label>
      `;
    }

    membersListEl.innerHTML = html;

    membersListEl.querySelectorAll<HTMLInputElement>('.member-toggle').forEach((cb) => {
      cb.addEventListener('change', () => {
        const pid = cb.dataset.personId;
        if (!pid) return;
        if (cb.checked) {
          selectedMemberIds.add(pid);
        } else {
          selectedMemberIds.delete(pid);
        }
        renderMembersList();
      });
    });
  }

  // Fetch people
  fetchPeopleApi()
    .then((people) => {
      allPeople = people || [];
      renderMembersList();
    })
    .catch((err) => {
      membersListEl.innerHTML = `<div class="py-2 text-center text-xs text-rose-400">Failed to load people</div>`;
    });

  // Inline add person
  async function handleAddInlinePerson() {
    const name = inlineNameInput.value.trim();
    if (!name) return;

    inlineAddBtn.disabled = true;
    inlineAddBtn.textContent = '...';

    try {
      const created = await createPersonApi(name);
      if (created) {
        allPeople.push({
          id: created.id,
          name: created.name,
          upi_vpa: null,
          phone: null,
          is_me: 0,
          created_at: new Date().toISOString(),
        });
        selectedMemberIds.add(created.id);
        inlineNameInput.value = '';
        renderMembersList();
        showToast(`Added ${created.name}`);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to add person', 'error');
    } finally {
      inlineAddBtn.disabled = false;
      inlineAddBtn.textContent = '+ Add';
    }
  }

  inlineAddBtn.addEventListener('click', handleAddInlinePerson);
  inlineNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddInlinePerson();
    }
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
      const payload = {
        name,
        emoji: selectedEmoji || null,
        kind: selectedKind,
        member_ids: Array.from(selectedMemberIds),
      };

      const result = await createGroupApi(payload);
      if (result) {
        showToast(`Group "${name}" created`);
        closeModal();
        if (onCreated) {
          onCreated(result.id);
        } else {
          window.location.hash = `#/groups/${result.id}`;
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create group', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Group';
    }
  });

  setTimeout(() => nameInput.focus(), 100);
}
