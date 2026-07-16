import { toast } from '../ui/toast.js';
import { log } from '../ui/log.js';
import { setStatus } from '../ui/status.js';
import { navigate } from './file-browser.js';

// ── Estado de conexão ─────────────────────────────────────────────────────────

let isConnected = false;

export function getIsConnected(): boolean {
  return isConnected;
}

// ── Helpers de UI ─────────────────────────────────────────────────────────────

function setConnectedUI(connected: boolean): void {
  document.getElementById('btn-connect')!.classList.toggle('hidden', connected);
  document.getElementById('btn-disconnect')!.classList.toggle('hidden', !connected);
  document.getElementById('empty-state')!.classList.toggle('hidden', connected);
  document.getElementById('file-browser')!.classList.toggle('hidden', !connected);
}

// ── Conectar ──────────────────────────────────────────────────────────────────

export async function connect(): Promise<void> {
  const host = (document.getElementById('input-host') as HTMLInputElement).value.trim();
  const port = parseInt((document.getElementById('input-port') as HTMLInputElement).value) || 22;
  const user = (document.getElementById('input-user') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('input-pass') as HTMLInputElement).value;

  if (!host || !user) {
    toast('Preencha host e usuário', 'err');
    return;
  }

  const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement;
  btnConnect.textContent = 'Conectando...';
  btnConnect.disabled    = true;

  log(`Conectando em ${user}@${host}:${port}...`, 'info');

  const result = await window.sftp.connect({ host, port, username: user, password: pass });

  btnConnect.disabled    = false;
  btnConnect.textContent = 'Conectar';

  if (result.ok) {
    isConnected = true;
    setStatus(true, `${user}@${host}`);
    setConnectedUI(true);
    toast(`Conectado em ${host}`, 'ok');
    log('Conectado com sucesso', 'ok');
    await navigate('/');
  } else {
    toast('Falha na conexão: ' + result.error, 'err');
    log('Falha: ' + result.error, 'err');
  }
}

// ── Desconectar ───────────────────────────────────────────────────────────────

export async function disconnect(): Promise<void> {
  await window.sftp.disconnect();
  isConnected = false;
  setStatus(false);
  setConnectedUI(false);
  toast('Desconectado', 'info');
  log('Desconectado', 'info');
}
