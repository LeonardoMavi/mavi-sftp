// ── Toast (notificações) ──────────────────────────────────────────────────────

export type ToastType = 'ok' | 'err' | 'info';

const ICONS: Record<ToastType, string> = { ok: '✓', err: '✕', info: '⌁' };
const DURATION_MS = 3500;

export function toast(msg: string, type: ToastType = 'info'): void {
  const container = document.getElementById('toast-container')!;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${ICONS[type]}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), DURATION_MS);
}
