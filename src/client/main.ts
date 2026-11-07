import { initPwa } from './pwa';
import { initDashboard, renderDashboard } from './views/dashboard';
import { initExpenseSheet } from './components/expense-sheet';
import { renderGroups } from './views/groups';
import { renderFriends } from './views/friends';
import { renderBills } from './views/bills';
import { renderActivity } from './views/activity';
import { setActiveTab } from './components/tab-bar';
import { updateBillsTabBadge } from './bills-api';

type RouteHandler = () => void | Promise<void>;

function switchView(activeViewId: string): HTMLElement | null {
  const views = ['view-dashboard', 'view-groups', 'view-friends', 'view-bills', 'view-activity'];
  for (const id of views) {
    const el = document.getElementById(id);
    if (el) {
      if (id === activeViewId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  }
  return document.getElementById(activeViewId);
}

const routes: Record<string, RouteHandler> = {
  '#/': () => {
    switchView('view-dashboard');
    setActiveTab('personal');
    renderDashboard();
  },
  '#/groups': () => {
    const container = switchView('view-groups');
    setActiveTab('groups');
    if (container) renderGroups(container);
  },
  '#/friends': () => {
    const container = switchView('view-friends');
    setActiveTab('friends');
    if (container) renderFriends(container);
  },
  '#/bills': () => {
    const container = switchView('view-bills');
    setActiveTab('bills');
    if (container) renderBills(container);
  },
  '#/activity': () => {
    const container = switchView('view-activity');
    setActiveTab('activity');
    if (container) renderActivity(container);
  },
};

export function registerRoute(path: string, handler: RouteHandler): void {
  routes[path] = handler;
}

export function handleRoute(): void {
  const rawHash = window.location.hash;
  const hash = !rawHash || rawHash === '#' ? '#/' : rawHash;
  if (hash.startsWith('#/groups/')) {
    const groupId = hash.slice('#/groups/'.length).trim();
    if (groupId) {
      const container = switchView('view-groups');
      setActiveTab('groups');
      if (container) renderGroups(container, groupId);
      if (window.lucide) {
        window.lucide.createIcons();
      }
      return;
    }
  }
  const handler = routes[hash] || routes['#/'];
  if (handler) {
    handler();
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

window.addEventListener('hashchange', handleRoute);

window.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  initPwa();
  initExpenseSheet(() => {
    renderDashboard();
  });
  initDashboard();
  handleRoute();
  updateBillsTabBadge();
});
