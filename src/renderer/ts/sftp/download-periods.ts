import type { SftpFile } from '../types.js';
import { showOptionsModal } from '../ui/modal.js';

export type DownloadPeriodChoice = {
  canceled: boolean;
  period?: string | null;
  fileNames?: string[];
  mode?: 'daily-sales';
  error?: string;
};

function isConvertible(name: string): boolean {
  return /\.(csv|txt)$/i.test(name);
}

function extractPeriodKey(name: string): string | null {
  const match = name.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\D|$)/);
  if (!match) return null;

  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;

  return `${year}${month}`;
}

function isDailySalesFile(name: string): boolean {
  return /^BR_(?:VENTAS|VENDAS_DIARIA_COCACOLA_GPA_ENERGETICOS_SEM_CONCORRENCIA)_\d{8}(?:\.(csv|txt))?$/i.test(name);
}

function extractFileDate(name: string): Date | null {
  const match = name.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\D|$)/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function periodFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatPeriodLabel(periodKey: string): string {
  return `${periodKey.slice(4, 6)}/${periodKey.slice(0, 4)}`;
}

function getAvailablePeriods(files: SftpFile[]): Map<string, string[]> {
  const periods = new Map<string, string[]>();

  files.forEach(file => {
    if (file.type === 'd' || !isConvertible(file.name)) return;

    const periodKey = extractPeriodKey(file.name);
    if (!periodKey) return;

    const fileNames = periods.get(periodKey) ?? [];
    fileNames.push(file.name);
    periods.set(periodKey, fileNames);
  });

  return new Map([...periods.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function getAvailableDailySalesPeriods(files: SftpFile[]): string[] {
  const periods = new Set<string>();

  files.forEach(file => {
    if (file.type === 'd' || !isDailySalesFile(file.name)) return;

    const fileDate = extractFileDate(file.name);
    if (!fileDate) return;

    periods.add(periodFromDate(fileDate));
    periods.add(periodFromDate(addDays(fileDate, -10)));
  });

  return [...periods].sort();
}

export async function selectFolderDownloadPeriod(remotePath: string): Promise<DownloadPeriodChoice> {
  const result = await window.sftp.list(remotePath);
  if (!result.ok) {
    return { canceled: false, error: result.error || 'Erro ao listar pasta' };
  }

  const periods = getAvailablePeriods(result.files ?? []);
  const dailySalesPeriods = getAvailableDailySalesPeriods(result.files ?? []);
  const choice = await showOptionsModal('Escolher download', [
    { label: 'Baixar Todos Arquivos', value: 'all' },
    ...[...periods.keys()].map(period => ({
      label: `Baixar periodo ${formatPeriodLabel(period)}`,
      value: `folder:${period}`,
    })),
    ...dailySalesPeriods.map(period => ({
      label: `Baixar Venda Diaria do mes ${formatPeriodLabel(period)}`,
      value: `daily:${period}`,
    })),
  ]);

  if (choice === null) return { canceled: true };
  if (choice.startsWith('daily:')) {
    return {
      canceled: false,
      period: choice.slice('daily:'.length),
      mode: 'daily-sales',
    };
  }

  const folderPeriod = choice.startsWith('folder:') ? choice.slice('folder:'.length) : null;
  return {
    canceled: false,
    period: folderPeriod,
    fileNames: folderPeriod ? periods.get(folderPeriod) : undefined,
  };
}
