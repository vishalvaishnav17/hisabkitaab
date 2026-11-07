export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export function showToast(
  msg: string,
  type: 'success' | 'error' = 'success',
  action?: ToastAction
): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className =
    'px-4 py-2.5 rounded-xl text-xs font-medium border shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200 ' +
    (type === 'success'
      ? 'bg-zinc-900 border-emerald-500/30 text-emerald-300'
      : 'bg-zinc-900 border-rose-500/30 text-rose-300');

  const textWrap = document.createElement('div');
  textWrap.className = 'flex items-center gap-2 truncate';
  textWrap.innerHTML = (type === 'success' ? '✓ ' : '✕ ') + msg;
  toast.appendChild(textWrap);

  let timer: any = null;

  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className =
      'shrink-0 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95 transition-all shadow-sm';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (timer) clearTimeout(timer);
      toast.remove();
      try {
        await action.onClick();
      } catch (err) {
        console.error('Toast action failed:', err);
      }
    });
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);
  timer = setTimeout(() => {
    toast.remove();
  }, action ? 6000 : 3500);
}
