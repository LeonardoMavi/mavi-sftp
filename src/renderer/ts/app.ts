import { connect, disconnect, getIsConnected } from './sftp/connection.js';
import { initFileSearchControl, initFileSortControls, navigate, getCurrentPath } from './sftp/file-browser.js';
import { selectFolderDownloadPeriod } from './sftp/download-periods.js';
import { renderFavorites, addFavorite, loadFavorites } from './sftp/favorites.js';
import { showModal, initModalOverlayClose } from './ui/modal.js';
import { toast } from './ui/toast.js';
import { log } from './ui/log.js';
import { finishDownloadProgress, hideDownloadProgress, initDownloadProgressEvents } from './ui/download-progress.js';
import { parentPath } from './utils.js';

// ── Toolbar de arquivos ───────────────────────────────────────────────────────

function initFileBrowserToolbar(): void {
  document.getElementById('btn-up')!.addEventListener('click', () => {
    const path = getCurrentPath();
    if (path !== '/') navigate(parentPath(path));
  });

  document.getElementById('btn-refresh')!.addEventListener('click', () => {
    navigate(getCurrentPath());
  });

  // ── Download da pasta atual ───────────────────────────────────────────────

  async function downloadCurrentFolder(asCsv: boolean, asXlsx: boolean): Promise<void> {
    const path = getCurrentPath();
    const modo = asCsv && asXlsx ? 'CSV + XLSX' : asCsv ? 'CSV' : 'XLSX';
    const periodChoice = await selectFolderDownloadPeriod(path);
    if (periodChoice.canceled) return;
    if (periodChoice.error) {
      toast('Erro: ' + periodChoice.error, 'err');
      log('Erro ao listar periodos: ' + periodChoice.error, 'err');
      return;
    }

    const periodLabel = periodChoice.period
      ? ` periodo ${periodChoice.period.slice(4, 6)}/${periodChoice.period.slice(0, 4)}`
      : '';
    const actionLabel = periodChoice.mode === 'daily-sales'
      ? `Extraindo venda diaria da pasta atual como ${modo}${periodLabel}`
      : `Baixando pasta atual como ${modo}${periodLabel}`;
    log(`${actionLabel}...`, 'info');
    const result = await window.sftp.downloadFolder(path, asCsv, asXlsx, periodChoice.period, periodChoice.fileNames, periodChoice.mode);
    if (result.ok) {
      const msg = `${result.downloaded} arquivo(s) baixado(s)${result.errors ? `, ${result.errors} erro(s)` : ''}`;
      toast(msg, result.errors ? 'err' : 'ok');
      log(`Pasta ${path}: ${msg}`, result.errors ? 'err' : 'ok');
      result.logs?.forEach(message => log(message, 'ok'));
      result.warnings?.forEach(warning => log(warning, 'info'));
    } else if (result.error === 'Cancelado') {
      hideDownloadProgress(0);
    } else {
      finishDownloadProgress({ completed: 0, total: 1, label: modo, status: 'error', errors: 1 });
      toast('Erro: ' + result.error, 'err');
      log('Erro download pasta: ' + result.error, 'err');
    }
  }

  document.getElementById('btn-download-folder-csv')!.addEventListener('click', () => {
    downloadCurrentFolder(true, false);
  });

  document.getElementById('btn-download-folder-xlsx')!.addEventListener('click', () => {
    downloadCurrentFolder(false, true);
  });

  document.getElementById('btn-download-folder-both')!.addEventListener('click', () => {
    downloadCurrentFolder(true, true);
  });
}

// ── Conexão ───────────────────────────────────────────────────────────────────

function initConnectionControls(): void {
  document.getElementById('btn-connect')!.addEventListener('click', connect);
  document.getElementById('btn-disconnect')!.addEventListener('click', disconnect);

  ['input-host', 'input-port', 'input-user', 'input-pass'].forEach(id => {
    document.getElementById(id)!.addEventListener('keydown', e => {
      if ((e as KeyboardEvent).key === 'Enter') connect();
    });
  });
}

// ── Favoritos ─────────────────────────────────────────────────────────────────

function initFavoritesControls(): void {
  document.getElementById('btn-save-favorite')!.addEventListener('click', async () => {
    if (!getIsConnected()) {
      toast('Conecte primeiro', 'err');
      return;
    }
    const host  = (document.getElementById('input-host') as HTMLInputElement).value.trim();
    const port  = parseInt((document.getElementById('input-port') as HTMLInputElement).value) || 22;
    const user  = (document.getElementById('input-user') as HTMLInputElement).value.trim();
    const label = await showModal('Salvar favorito', 'Nome para identificar', host);
    if (!label) return;
    addFavorite({ label, host, port, username: user });
    renderFavorites();
    toast('Favorito salvo!', 'ok');
  });
}

function initWindowControls(): void {
  document.getElementById('btn-download-manual')!.addEventListener('click', async () => {
    const result = await window.manual.download();
    if (result.ok) {
      toast('Manual salvo com sucesso!', 'ok');
      log(`Manual salvo em: ${result.localPath}`, 'ok');
    } else if (!result.canceled) {
      toast('Erro ao salvar manual: ' + result.error, 'err');
      log('Erro ao salvar manual: ' + result.error, 'err');
    }
  });

  document.getElementById('btn-window-minimize')!.addEventListener('click', () => {
    window.windowControls.minimize();
  });

  document.getElementById('btn-window-maximize')!.addEventListener('click', async () => {
    const maximized = await window.windowControls.toggleMaximize();
    const button = document.getElementById('btn-window-maximize')!;
    button.textContent = maximized ? '❐' : '□';
    button.setAttribute('title', maximized ? 'Restaurar' : 'Maximizar');
    button.setAttribute('aria-label', maximized ? 'Restaurar' : 'Maximizar');
  });

  document.getElementById('btn-window-close')!.addEventListener('click', () => {
    window.windowControls.close();
  });
}

// ── Inicialização ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initWindowControls();
  renderFavorites();
  initConnectionControls();
  initFileBrowserToolbar();
  initFileSortControls();
  initFileSearchControl();
  initFavoritesControls();
  initModalOverlayClose();
  initDownloadProgressEvents();
});
