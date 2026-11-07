// TODO(chunk 07): Groups view implementation
export function renderGroups(container: HTMLElement): void {
  container.innerHTML = `
    <div class="py-16 text-center">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-surface2 border border-borderDark flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/5">
        <i data-lucide="users" class="w-7 h-7"></i>
      </div>
      <h2 class="text-lg font-bold text-white tracking-tight">Groups</h2>
      <p class="text-sm text-zinc-400 mt-1 max-w-sm mx-auto">Split expenses with flatmates, trips, and friends with automated debt simplification.</p>
      <span class="inline-block mt-4 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full">Coming in chunk 07</span>
    </div>
  `;
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
