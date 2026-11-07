import { initPwa } from './pwa';
import { initDashboard, renderDashboard } from './views/dashboard';
import { initExpenseSheet } from './components/expense-sheet';

type RouteHandler = () => void | Promise<void>;

const routes: Record<string, RouteHandler> = {
  '#/': () => renderDashboard(),
  // Later chunks add routes here (e.g. '#/groups': renderGroups)
};

export function registerRoute(path: string, handler: RouteHandler): void {
  routes[path] = handler;
}

export function handleRoute(): void {
  const hash = window.location.hash || '#/';
  const handler = routes[hash] || routes['#/'];
  if (handler) {
    handler();
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
});
