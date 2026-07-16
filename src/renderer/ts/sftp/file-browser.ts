import type { SftpFile } from '../types.js';
import { formatSize, formatDate, joinPath, getFileIcon } from '../utils.js';
import { toast } from '../ui/toast.js';
import { log } from '../ui/log.js';
import { showModal } from '../ui/modal.js';
import { finishDownloadProgress, hideDownloadProgress, showDownloadProgress } from '../ui/download-progress.js';
import { selectFolderDownloadPeriod } from './download-periods.js';

let currentPath = '/';
let currentFiles: SftpFile[] = [];
let searchTerm = '';

type SortKey = 'name' | 'size' | 'modifyTime';
type SortDirection = 'asc' | 'desc';

const sortState: { key: SortKey; direction: SortDirection } = {
  key: 'name',
  direction: 'asc',
};

export function getCurrentPath(): string {
  return currentPath;
}

function sortFiles(files: SftpFile[]): SftpFile[] {
  return [...files].sort((a, b) => {
    if (a.type === 'd' && b.type !== 'd') return -1;
    if (a.type !== 'd' && b.type === 'd') return 1;

    let result = 0;
    if (sortState.key === 'name') {
      result = a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
    } else if (sortState.key === 'size') {
      result = (a.size || 0) - (b.size || 0);
    } else {
      result = (a.modifyTime || 0) - (b.modifyTime || 0);
    }

    return sortState.direction === 'asc' ? result : -result;
  });
}

function filterFiles(files: SftpFile[]): SftpFile[] {
  const term = searchTerm.trim().toLocaleLowerCase('pt-BR');
  if (!term) return files;
  return files.filter(file => file.name.toLocaleLowerCase('pt-BR').includes(term));
}

function updateSortHeader(): void {
  document.querySelectorAll<HTMLButtonElement>('.file-sort-btn').forEach(button => {
    const isActive = button.dataset.sort === sortState.key;
    button.classList.toggle('active', isActive);
    button.classList.toggle('asc', isActive && sortState.direction === 'asc');
    button.classList.toggle('desc', isActive && sortState.direction === 'desc');
  });
}

function setSort(key: SortKey): void {
  if (sortState.key === key) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.key = key;
    sortState.direction = 'asc';
  }

  updateSortHeader();
  renderCurrentFiles();
}

export function initFileSortControls(): void {
  document.querySelectorAll<HTMLButtonElement>('.file-sort-btn').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.sort as SortKey | undefined;
      if (key) setSort(key);
    });
  });
  updateSortHeader();
}

export function initFileSearchControl(): void {
  const input = document.getElementById('file-search') as HTMLInputElement;
  input.addEventListener('input', () => {
    searchTerm = input.value;
    renderCurrentFiles();
  });
}

function isConvertible(name: string): boolean {
  return /\.(csv|txt)$/i.test(name);
}

function hasCsvFiles(files: SftpFile[]): boolean {
  return files.some(f => f.type !== 'd' && isConvertible(f.name));
}

function getDownloadLabel(fileName: string): string {
  const ext = fileName.split('.').pop()?.toUpperCase();
  return ext || 'arquivo';
}

function getFolderIcon(): string {
  return `
    <svg class="folder-icon" viewBox="0 0 20 16" aria-hidden="true">
      <path d="M1.8 2.5h5.6l1.7 2h9.1v9.2c0 .9-.7 1.6-1.6 1.6H3.4c-.9 0-1.6-.7-1.6-1.6V2.5Z" />
      <path d="M1.8 4.4h16.4v1.9H1.8z" />
    </svg>
  `;
}

function buildFileRow(file: SftpFile, folderHasCsv: boolean, options: { showPath?: boolean } = {}): HTMLElement {
  const isDir = file.type === 'd';
  const displayName = options.showPath && file.path ? file.path : file.name;
  const row = document.createElement('div');
  row.className = 'file-item';
  row.innerHTML = `
    <span class="file-icon">${isDir ? getFolderIcon() : getFileIcon(file.name)}</span>
    <span class="file-name ${isDir ? 'is-dir' : ''}" title="${displayName}">${displayName}</span>
    <span class="file-size">${isDir ? '-' : formatSize(file.size)}</span>
    <span class="file-date">${formatDate(file.modifyTime)}</span>
    <span class="file-actions">
      ${!isDir ? `<button class="btn-icon" data-action="download" title="Download">down</button>` : ''}
      ${!isDir && isConvertible(file.name) ? `<button class="btn-icon" data-action="download-xlsx" title="Baixar como Excel">xlsx</button>` : ''}
      ${isDir && folderHasCsv ? `<button class="btn-icon" data-action="download-folder-csv" title="Baixar todos">csv</button>` : ''}
      ${isDir && folderHasCsv ? `<button class="btn-icon" data-action="download-folder-xlsx" title="Baixar todos como Excel">xlsx</button>` : ''}
      ${isDir && folderHasCsv ? `<button class="btn-icon" data-action="download-folder-both" title="Baixar CSV e Excel">ambos</button>` : ''}
      <button class="btn-icon" data-action="rename" title="Renomear">ren</button>
      <button class="btn-icon" data-action="delete" title="Deletar">del</button>
    </span>
  `;
  return row;
}

async function handleDownload(file: SftpFile): Promise<void> {
  const remotePath = file.path || joinPath(currentPath, file.name);
  const label = getDownloadLabel(file.name);
  showDownloadProgress({ completed: 0, total: 1, label, status: 'running' });
  log(`Baixando ${file.name}...`, 'info');

  const result = await window.sftp.download(remotePath, file.name);
  if (result.ok) {
    toast(`Download concluido: ${file.name}`, 'ok');
    log(`Download ok: ${result.localPath}`, 'ok');
  } else if (result.error?.startsWith('Cancelado')) {
    hideDownloadProgress(0);
  } else {
    finishDownloadProgress({ completed: 0, total: 1, label, status: 'error', errors: 1 });
    toast('Erro no download: ' + result.error, 'err');
    log('Erro download: ' + result.error, 'err');
  }
}

async function handleDownloadXlsx(file: SftpFile): Promise<void> {
  const remotePath = file.path || joinPath(currentPath, file.name);
  showDownloadProgress({ completed: 0, total: 1, label: 'XLSX', status: 'running' });
  log(`Convertendo ${file.name} para Excel...`, 'info');

  const result = await window.sftp.downloadAsXlsx(remotePath, file.name);
  if (result.ok) {
    toast(`Excel salvo: ${result.localPath}`, 'ok');
    log(`Excel ok: ${result.localPath}`, 'ok');
    result.logs?.forEach(message => log(message, 'ok'));
    result.warnings?.forEach(warning => log(warning, 'info'));
  } else if (result.error?.startsWith('Cancelado')) {
    hideDownloadProgress(0);
  } else {
    finishDownloadProgress({ completed: 0, total: 1, label: 'XLSX', status: 'error', errors: 1 });
    toast('Erro ao converter: ' + result.error, 'err');
    log('Erro xlsx: ' + result.error, 'err');
  }
}

async function handleDownloadFolder(folder: SftpFile, asCsv: boolean, asXlsx: boolean): Promise<void> {
  const remotePath = joinPath(currentPath, folder.name);
  const mode = asCsv && asXlsx ? 'CSV + XLSX' : asCsv ? 'CSV' : 'XLSX';
  const periodChoice = await selectFolderDownloadPeriod(remotePath);
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
    ? `Extraindo venda diaria da pasta ${folder.name} como ${mode}${periodLabel}`
    : `Baixando pasta ${folder.name} como ${mode}${periodLabel}`;
  log(`${actionLabel}...`, 'info');

  const result = await window.sftp.downloadFolder(remotePath, asCsv, asXlsx, periodChoice.period, periodChoice.fileNames, periodChoice.mode);
  if (result.ok) {
    const msg = `${result.downloaded} arquivo(s) baixado(s)${result.errors ? `, ${result.errors} erro(s)` : ''}`;
    toast(msg, result.errors ? 'err' : 'ok');
    log(`Pasta ${folder.name}: ${msg}`, result.errors ? 'err' : 'ok');
    result.logs?.forEach(message => log(message, 'ok'));
    result.warnings?.forEach(warning => log(warning, 'info'));
  } else if (result.error === 'Cancelado') {
    hideDownloadProgress(0);
  } else {
    finishDownloadProgress({ completed: 0, total: 1, label: mode, status: 'error', errors: 1 });
    toast('Erro: ' + result.error, 'err');
    log('Erro pasta: ' + result.error, 'err');
  }
}

async function handleRename(file: SftpFile): Promise<void> {
  const newName = await showModal('Renomear', 'Novo nome', file.name);
  if (!newName || newName === file.name) return;

  const oldPath = file.path || joinPath(currentPath, file.name);
  const parent = oldPath.split('/').slice(0, -1).join('/') || '/';
  const newPath = joinPath(parent, newName);
  const result = await window.sftp.rename(oldPath, newPath);

  if (result.ok) {
    toast(`Renomeado para ${newName}`, 'ok');
    log(`Renomeado: ${file.name} -> ${newName}`, 'ok');
    navigate(currentPath);
  } else {
    toast('Erro ao renomear: ' + result.error, 'err');
    log('Erro renomear: ' + result.error, 'err');
  }
}

async function handleDelete(file: SftpFile): Promise<void> {
  const isDir = file.type === 'd';
  const confirmed = await showModal(
    `Deletar ${isDir ? 'pasta' : 'arquivo'}`,
    'Digite o nome para confirmar',
    '',
  );
  if (confirmed !== file.name) {
    toast('Nome nao confere. Operacao cancelada.', 'info');
    return;
  }

  const remotePath = file.path || joinPath(currentPath, file.name);
  const result = await window.sftp.delete(remotePath, isDir);

  if (result.ok) {
    toast(`${file.name} deletado`, 'ok');
    log(`Deletado: ${remotePath}`, 'ok');
    navigate(currentPath);
  } else {
    toast('Erro ao deletar: ' + result.error, 'err');
    log('Erro delete: ' + result.error, 'err');
  }
}

function attachRowEvents(row: HTMLElement, file: SftpFile): void {
  if (file.type === 'd') {
    row.addEventListener('dblclick', () => navigate(joinPath(currentPath, file.name)));
  }

  row.querySelector('[data-action="download"]')?.addEventListener('click', e => {
    e.stopPropagation();
    handleDownload(file);
  });

  row.querySelector('[data-action="download-xlsx"]')?.addEventListener('click', e => {
    e.stopPropagation();
    handleDownloadXlsx(file);
  });

  row.querySelector('[data-action="download-folder-csv"]')?.addEventListener('click', e => {
    e.stopPropagation();
    handleDownloadFolder(file, true, false);
  });

  row.querySelector('[data-action="download-folder-xlsx"]')?.addEventListener('click', e => {
    e.stopPropagation();
    handleDownloadFolder(file, false, true);
  });

  row.querySelector('[data-action="download-folder-both"]')?.addEventListener('click', e => {
    e.stopPropagation();
    handleDownloadFolder(file, true, true);
  });

  row.querySelector('[data-action="rename"]')?.addEventListener('click', e => {
    e.stopPropagation();
    handleRename(file);
  });

  row.querySelector('[data-action="delete"]')?.addEventListener('click', e => {
    e.stopPropagation();
    handleDelete(file);
  });
}

async function loadRecentFiles(remotePath: string, limit: number): Promise<{ ok: boolean; files?: SftpFile[]; error?: string }> {
  try {
    if (typeof window.sftp.recentFiles === 'function') {
      return await window.sftp.recentFiles(remotePath, limit);
    }
  } catch (err: any) {
    log('Recentes via main indisponivel: ' + err.message, 'info');
  }

  return collectRecentFilesFromList(remotePath, limit);
}

async function collectRecentFilesFromList(remotePath: string, limit: number): Promise<{ ok: boolean; files?: SftpFile[]; error?: string }> {
  const recent: SftpFile[] = [];
  const pending = [remotePath];

  while (pending.length) {
    const current = pending.shift()!;
    const result = await window.sftp.list(current);
    if (!result.ok) continue;

    for (const entry of result.files ?? []) {
      const entryPath = joinPath(current, entry.name);
      if (entry.type === 'd') {
        pending.push(entryPath);
        continue;
      }

      recent.push({ ...entry, path: entryPath });
    }

    recent.sort((a, b) => b.modifyTime - a.modifyTime);
    if (recent.length > limit * 4) recent.length = limit * 4;
  }

  return {
    ok: true,
    files: recent.sort((a, b) => b.modifyTime - a.modifyTime).slice(0, limit),
  };
}

async function renderRecentFiles(fileList: HTMLElement): Promise<void> {
  const section = document.createElement('section');
  section.className = 'recent-files-section';
  section.innerHTML = `
    <h3 class="recent-files-title">Recentes</h3>
    <div class="recent-files-body">
      <div class="loading-spinner">Carregando recentes...</div>
    </div>
  `;
  fileList.appendChild(section);

  const body = section.querySelector('.recent-files-body') as HTMLElement;
  const result = await loadRecentFiles('/', 30);
  body.innerHTML = '';

  if (!result.ok) {
    const error = document.createElement('div');
    error.className = 'loading-spinner';
    error.textContent = 'Erro ao carregar recentes';
    body.appendChild(error);
    log('Erro recentes: ' + result.error, 'err');
    return;
  }

  const recentFiles = result.files ?? [];
  if (!recentFiles.length) {
    const empty = document.createElement('div');
    empty.className = 'loading-spinner';
    empty.textContent = 'Nenhum arquivo recente';
    body.appendChild(empty);
    return;
  }

  recentFiles.forEach(file => {
    const row = buildFileRow(file, false, { showPath: true });
    attachRowEvents(row, file);
    body.appendChild(row);
  });
}

async function renderCurrentFiles(): Promise<void> {
  const fileList = document.getElementById('file-list')!;
  fileList.innerHTML = '';

  const files = sortFiles(filterFiles(currentFiles));

  if (files.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-spinner';
    empty.textContent = searchTerm.trim() ? 'Nenhum arquivo encontrado' : 'Pasta vazia';
    fileList.appendChild(empty);
  } else {
    files.forEach(file => {
      const row = buildFileRow(file, hasCsvFiles(files));
      attachRowEvents(row, file);
      fileList.appendChild(row);
    });
  }

  if (currentPath === '/') {
    await renderRecentFiles(fileList);
  }
}

export async function navigate(path: string): Promise<void> {
  currentPath = path;
  searchTerm = '';

  const breadcrumb = document.getElementById('breadcrumb')!;
  const fileList = document.getElementById('file-list')!;
  const searchInput = document.getElementById('file-search') as HTMLInputElement | null;

  breadcrumb.textContent = path;
  if (searchInput) searchInput.value = '';
  fileList.innerHTML = '';

  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.textContent = 'Carregando...';
  fileList.appendChild(spinner);

  const result = await window.sftp.list(path);
  fileList.innerHTML = '';

  if (!result.ok) {
    toast('Erro ao listar: ' + result.error, 'err');
    log('Erro ao listar ' + path + ': ' + result.error, 'err');
    return;
  }

  currentFiles = result.files ?? [];
  await renderCurrentFiles();
}
