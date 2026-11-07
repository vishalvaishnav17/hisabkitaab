import { showToast } from '../../components/toast';
import { escapeHtml } from '../../format';

export interface OpenPreviewOptions {
  blob: Blob;
  groupName: string;
  title?: string;
}

export function openPreviewSheet({ blob, groupName, title = 'Card Preview' }: OpenPreviewOptions): void {
  let modal = document.getElementById('nudgeCardPreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'nudgeCardPreviewModal';
    modal.className =
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm hidden items-end sm:items-center justify-center sm:p-4';
    document.body.appendChild(modal);
  }

  const groupSlug = groupName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const filename = `hisabkitaab-${groupSlug}.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  const imageUrl = URL.createObjectURL(blob);

  // Determine if navigator.canShare supports file sharing
  let canShareFiles = false;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      canShareFiles = true;
    }
  } catch {
    canShareFiles = false;
  }

  modal.innerHTML = `
    <div class="bg-surface border border-zinc-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative max-h-[92dvh] flex flex-col">
      <!-- Sheet Header -->
      <div class="flex items-center justify-between pb-3 border-b border-borderDark shrink-0">
        <h3 class="text-base font-semibold text-white">${escapeHtml(title)}</h3>
        <button type="button" id="closePreviewBtn" aria-label="Close"
          class="text-zinc-500 hover:text-zinc-300 h-10 w-10 flex items-center justify-center rounded-lg transition-colors">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- Preview Image Container -->
      <div class="my-4 overflow-y-auto flex-1 flex items-center justify-center min-h-0 bg-pitch rounded-2xl border border-borderDark/60 p-2">
        <img
          src="${imageUrl}"
          alt="Nudge Card"
          class="max-w-full max-h-[55dvh] object-contain rounded-xl shadow-lg"
        />
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2.5 pt-2 border-t border-borderDark shrink-0">
        <button
          type="button"
          id="downloadCardBtn"
          class="flex-1 h-11 px-3 text-xs font-medium rounded-xl bg-surface2 hover:bg-zinc-800 text-zinc-300 border border-borderDark flex items-center justify-center gap-1.5 active:scale-95 transition-all"
        >
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Download</span>
        </button>

        <button
          type="button"
          id="shareCardBtn"
          class="flex-1 h-11 px-4 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <i data-lucide="share-2" class="w-4 h-4 stroke-[2.5]"></i>
          <span>${canShareFiles ? 'Share Card' : 'Share / Download'}</span>
        </button>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  if (window.lucide) {
    window.lucide.createIcons();
  }

  function downloadImage() {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Image downloaded');
  }

  async function shareImage() {
    try {
      if (canShareFiles) {
        // WhatsApp on iOS often drops share text with images, so we share only files
        await navigator.share({
          files: [file],
        });
      } else {
        downloadImage();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
        downloadImage();
      }
    }
  }

  function closeModal() {
    modal!.classList.remove('flex');
    modal!.classList.add('hidden');
    URL.revokeObjectURL(imageUrl);
  }

  modal.querySelector('#closePreviewBtn')?.addEventListener('click', closeModal);
  modal.querySelector('#downloadCardBtn')?.addEventListener('click', downloadImage);
  modal.querySelector('#shareCardBtn')?.addEventListener('click', shareImage);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}
