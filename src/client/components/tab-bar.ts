export type TabName = 'personal' | 'groups' | 'friends' | 'bills' | 'activity';

export function setActiveTab(tab: TabName | null | ''): void {
  const tabs = document.querySelectorAll<HTMLElement>('#bottomTabBar [data-tab]');
  tabs.forEach((t) => {
    const isCurrent = t.dataset.tab === tab;
    if (isCurrent) {
      t.classList.remove('text-zinc-500', 'hover:text-zinc-300');
      t.classList.add('text-emerald-400', 'font-semibold');
    } else {
      t.classList.remove('text-emerald-400', 'font-semibold');
      t.classList.add('text-zinc-500', 'hover:text-zinc-300');
    }
  });
}

export function setTabBadge(tab: TabName, count: number | null): void {
  const badgeEl = document.querySelector<HTMLElement>(`#bottomTabBar [data-tab="${tab}"] .tab-badge`);
  if (!badgeEl) return;

  if (count && count > 0) {
    badgeEl.textContent = count > 99 ? '99+' : String(count);
    badgeEl.classList.remove('hidden');
  } else {
    badgeEl.textContent = '';
    badgeEl.classList.add('hidden');
  }
}

// Expose globally for convenience and future chunk integrations (chunk 09 bills badge)
if (typeof window !== 'undefined') {
  (window as any).setTabBadge = setTabBadge;
}
