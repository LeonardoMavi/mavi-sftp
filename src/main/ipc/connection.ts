import { ipcMain } from 'electron';
import SftpClient from 'ssh2-sftp-client';

// ── Estado global da conexão ──────────────────────────────────────────────────

let sftpClient: SftpClient | null = null;

export function getSftpClient(): SftpClient | null {
  return sftpClient;
}

async function endClient(): Promise<void> {
  if (sftpClient) {
    try { await sftpClient.end(); } catch { /* ignora erro ao fechar */ }
    sftpClient = null;
  }
}

// ── Registro dos handlers ─────────────────────────────────────────────────────

export function registerConnectionHandlers(): void {
  ipcMain.handle('sftp:connect', async (_event, config: {
    host: string; port: number; username: string; password: string;
  }) => {
    try {
      await endClient();
      sftpClient = new SftpClient();
      await sftpClient.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        readyTimeout: 10000,
      });
      return { ok: true };
    } catch (err: any) {
      sftpClient = null;
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sftp:disconnect', async () => {
    await endClient();
    return { ok: true };
  });
}

export { endClient };
