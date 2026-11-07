import { fetchSettingsApi, updateSettingsApi } from '../api';
import { showToast } from '../components/toast';
import { escapeHtml } from '../format';

const UPI_REGEX = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

export async function renderSettings(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="py-12 text-center" id="settingsLoading">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
      <p class="text-xs text-zinc-500 mt-2">Loading settings...</p>
    </div>
  `;

  try {
    const settings = await fetchSettingsApi();
    if (!settings) return;

    renderSettingsForm(container, settings.my_name, settings.my_upi_vpa);
  } catch (err: any) {
    container.innerHTML = `
      <div class="py-12 text-center text-zinc-500">
        <p class="text-rose-400 text-sm">${escapeHtml(err.message || 'Failed to load settings')}</p>
        <button id="retrySettingsBtn" class="mt-4 px-4 py-2 bg-surface2 border border-borderDark rounded-xl text-xs text-zinc-300 hover:text-white">Retry</button>
      </div>
    `;
    container.querySelector('#retrySettingsBtn')?.addEventListener('click', () => {
      renderSettings(container);
    });
  }
}

function renderSettingsForm(container: HTMLElement, myName: string, myUpiVpa: string): void {
  container.innerHTML = `
    <div class="max-w-xl mx-auto space-y-6">
      <!-- Header -->
      <div class="flex items-center gap-3 pb-2 border-b border-borderDark/60">
        <a href="#/" aria-label="Back to dashboard"
           class="h-10 w-10 flex items-center justify-center rounded-xl bg-surface2 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-borderDark active:scale-95 transition-all">
          <i data-lucide="arrow-left" class="w-4 h-4"></i>
        </a>
        <div>
          <h1 class="text-lg sm:text-xl font-bold text-white tracking-tight">App Settings</h1>
          <p class="text-xs text-zinc-500">Manage your profile and payment credentials</p>
        </div>
      </div>

      <!-- Settings Card -->
      <div class="bg-surface border border-borderDark rounded-2xl p-5 sm:p-6 shadow-xl">
        <form id="settingsForm" class="space-y-5">
          <!-- Error alert -->
          <div id="settingsErrorAlert" class="hidden p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"></div>

          <!-- Display Name -->
          <div>
            <label for="settingsMyName" class="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Your Display Name *
            </label>
            <input
              type="text"
              id="settingsMyName"
              name="my_name"
              required
              value="${escapeHtml(myName)}"
              placeholder="e.g. Vishal Vaishnav"
              class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <p class="text-[11px] text-zinc-500 mt-1">
              Your name shown to friends in groups and on WhatsApp nudge statements.
            </p>
          </div>

          <!-- UPI ID (VPA) -->
          <div>
            <label for="settingsMyUpi" class="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              UPI ID (VPA)
            </label>
            <div class="relative">
              <input
                type="text"
                id="settingsMyUpi"
                name="my_upi_vpa"
                value="${escapeHtml(myUpiVpa)}"
                placeholder="e.g. vishal@okaxis or phone@upi"
                class="w-full bg-surface2 border border-borderDark rounded-xl px-3.5 h-11 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 mono text-sm transition-colors"
              />
              <div class="absolute right-3 top-3 text-zinc-500 pointer-events-none">
                <i data-lucide="qr-code" class="w-4 h-4"></i>
              </div>
            </div>
            <p class="text-[11px] text-zinc-500 mt-1">
              Used to generate instant UPI QR codes on nudge cards so friends can scan and pay you.
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="pt-3 border-t border-borderDark/60 flex items-center justify-end gap-3">
            <button
              type="submit"
              id="saveSettingsSubmitBtn"
              class="h-11 px-5 text-xs font-semibold text-black bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95 flex items-center gap-2"
            >
              <i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i>
              <span>Save Settings</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Info Card -->
      <div class="bg-surface2/60 border border-borderDark rounded-2xl p-4 flex items-start gap-3 text-xs text-zinc-400">
        <i data-lucide="info" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"></i>
        <p class="leading-relaxed">
          Nudge cards and UPI QR codes are rendered entirely on your phone via HTML5 Canvas. No card images or personal financial information are ever transmitted to any external server.
        </p>
      </div>
    </div>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const form = container.querySelector('#settingsForm') as HTMLFormElement;
  const nameInput = container.querySelector('#settingsMyName') as HTMLInputElement;
  const upiInput = container.querySelector('#settingsMyUpi') as HTMLInputElement;
  const errorAlert = container.querySelector('#settingsErrorAlert') as HTMLElement;
  const submitBtn = container.querySelector('#saveSettingsSubmitBtn') as HTMLButtonElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.classList.add('hidden');
    errorAlert.textContent = '';

    const newName = nameInput.value.trim();
    const newUpi = upiInput.value.trim();

    if (!newName) {
      errorAlert.textContent = 'Please enter your display name';
      errorAlert.classList.remove('hidden');
      nameInput.focus();
      return;
    }

    if (newUpi.length > 0 && !UPI_REGEX.test(newUpi)) {
      errorAlert.textContent = 'Please enter a valid UPI ID (e.g. username@okaxis or mobile@upi)';
      errorAlert.classList.remove('hidden');
      upiInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-black border-t-transparent"></div>
      <span>Saving...</span>
    `;

    try {
      const result = await updateSettingsApi({
        my_name: newName,
        my_upi_vpa: newUpi,
      });

      if (result) {
        showToast('Settings saved successfully');
        nameInput.value = result.my_name;
        upiInput.value = result.my_upi_vpa;
      }
    } catch (err: any) {
      errorAlert.textContent = err.message || 'Failed to update settings';
      errorAlert.classList.remove('hidden');
      showToast(err.message || 'Failed to update settings', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <i data-lucide="check" class="w-4 h-4 stroke-[2.5]"></i>
        <span>Save Settings</span>
      `;
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  });
}
