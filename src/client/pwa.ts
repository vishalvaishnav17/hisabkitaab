export function setupInstallHint(): void {
  const hint = document.getElementById('installHint');
  if (!hint) return;

  const standalone =
    (navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  let dismissed = false;
  try {
    dismissed = localStorage.getItem('hk-hide-install') === '1';
  } catch {}

  if (ios && !standalone && !dismissed) {
    hint.classList.remove('hidden');
  }

  const dismissBtn = document.getElementById('dismissInstallHint');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      try {
        localStorage.setItem('hk-hide-install', '1');
      } catch {}
      hint.classList.add('hidden');
    });
  }
}

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

export function initPwa(): void {
  setupInstallHint();
  registerServiceWorker();
}
