// ── Status bar ────────────────────────────────────────────────────────────────

export function setStatus(connected: boolean, host?: string): void {
  const el = document.getElementById('status-indicator')!;
  if (connected && host) {
    el.textContent = host;
    el.classList.add('connected');
  } else {
    el.textContent = 'Desconectado';
    el.classList.remove('connected');
  }
}
