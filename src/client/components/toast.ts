export function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className =
    'px-4 py-2.5 rounded-xl text-xs font-medium border shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom duration-200 ' +
    (type === 'success'
      ? 'bg-zinc-900 border-emerald-500/30 text-emerald-300'
      : 'bg-zinc-900 border-rose-500/30 text-rose-300');
  toast.innerHTML = (type === 'success' ? '✓ ' : '✕ ') + msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}
