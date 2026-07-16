// ── Log Panel ─────────────────────────────────────────────────────────────────

export type LogType = 'ok' | 'err' | 'info';

export function log(msg: string, type: LogType = 'info'): void {
  const panel = document.getElementById('log-panel')!;
  const now = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${now}] ${msg}`;
  panel.appendChild(entry);
  panel.scrollTop = panel.scrollHeight;
}
