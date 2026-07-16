import type { DownloadProgressPayload } from '../types.js';
import { log } from './log.js';

const COMPLETE_HIDE_DELAY_MS = 1400;

let hideTimer: number | undefined;

function getElements() {
  return {
    panel: document.getElementById('download-progress')!,
    title: document.getElementById('download-progress-title')!,
    info: document.getElementById('download-progress-info')!,
    fill: document.getElementById('download-progress-fill') as HTMLElement,
  };
}

function getProgressText(payload: DownloadProgressPayload): string {
  const total = Math.max(payload.total || 1, 1);
  const completed = Math.min(Math.max(payload.completed, 0), total);
  const label = payload.label ? ` ${payload.label}` : '';
  const errorText = payload.errors ? `, ${payload.errors} erro(s)` : '';
  const noun = total === 1 ? 'arquivo' : 'arquivos';
  const done = total === 1 ? 'baixado' : 'baixados';
  const currentFile = payload.fileName ? ` - ${payload.fileName}` : '';
  return `${completed}/${total} ${noun}${label} ${done}${errorText}${currentFile}`;
}

export function showDownloadProgress(payload: DownloadProgressPayload): void {
  const { panel, title, info, fill } = getElements();
  const total = Math.max(payload.total || 1, 1);
  const completed = Math.min(Math.max(payload.completed, 0), total);
  const percent = Math.round((completed / total) * 100);

  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }

  panel.classList.remove('hidden', 'done', 'error');
  panel.classList.toggle('done', payload.status === 'done');
  panel.classList.toggle('error', payload.status === 'error');
  title.textContent = payload.status === 'done'
    ? 'Download concluido'
    : payload.status === 'error'
      ? 'Falha no download'
      : payload.title || 'Baixando arquivos';
  info.textContent = getProgressText(payload);
  fill.style.width = `${percent}%`;
}

export function hideDownloadProgress(delayMs = COMPLETE_HIDE_DELAY_MS): void {
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    getElements().panel.classList.add('hidden');
    hideTimer = undefined;
  }, delayMs);
}

export function finishDownloadProgress(payload: DownloadProgressPayload): void {
  showDownloadProgress(payload);
  hideDownloadProgress(payload.status === 'error' ? COMPLETE_HIDE_DELAY_MS * 2 : COMPLETE_HIDE_DELAY_MS);
}

export function initDownloadProgressEvents(): void {
  window.sftp.onDownloadProgress(payload => {
    if (payload.fileName && payload.completed > 0) {
      const failed = payload.fileStatus === 'error';
      log(`${failed ? 'Erro ao baixar' : 'Arquivo baixado'}: ${payload.fileName}`, failed ? 'err' : 'ok');
    }

    if (payload.status === 'done' || payload.status === 'error') {
      finishDownloadProgress(payload);
      return;
    }
    showDownloadProgress(payload);
  });
}
