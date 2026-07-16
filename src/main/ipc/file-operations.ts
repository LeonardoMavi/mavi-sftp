import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { once } from 'events';
import { execFile } from 'child_process';
import { getSftpClient } from './connection.js';

type DownloadProgressPayload = {
  completed: number;
  total: number;
  label: string;
  status?: 'running' | 'done' | 'error';
  errors?: number;
  fileName?: string;
  fileStatus?: 'done' | 'error';
  title?: string;
};

type RecentSftpFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  modifyTime: number;
};

type XlsxConversionResult = {
  files: string[];
  warnings: string[];
  logs: string[];
  rows: number;
  encoding?: string;
  separator?: string;
};

type DailySalesSplitResult = {
  files: string[];
  warnings: string[];
  logs: string[];
  days: string[];
  rows: number;
  encoding?: string;
  separator?: string;
};

const PYTHON_CONVERSION_TIMEOUT_MS = 5 * 60 * 1000;

const NOT_CONNECTED = { ok: false, error: 'Não conectado' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function sendDownloadProgress(getMainWindow: () => BrowserWindow, payload: DownloadProgressPayload): void {
  getMainWindow().webContents.send('sftp:download-progress', payload);
}

function waitForUi(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function getDownloadLabel(fileName: string): string {
  const ext = path.extname(fileName).replace('.', '').toUpperCase();
  return ext || 'arquivo';
}

function getPythonScriptPath(scriptName: string): string {
  const candidates = [
    path.join(process.cwd(), 'src/main/python', scriptName),
    path.join(process.cwd(), 'dist/main/python', scriptName),
    path.join(__dirname, '../python', scriptName),
    path.join(__dirname, 'python', scriptName),
  ];

  const scriptPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!scriptPath) {
    throw new Error(`Script Python nao encontrado. Caminhos testados: ${candidates.join(' | ')}`);
  }

  return scriptPath;
}

function getPythonCandidates(): Array<{ command: string; args: string[] }> {
  const candidates: Array<{ command: string; args: string[] }> = [];
  if (process.env.MAVI_PYTHON_PATH) {
    candidates.push({ command: process.env.MAVI_PYTHON_PATH, args: [] });
  }

  // O instalador leva a distribuicao portatil do Python em resources/python.
  // Em desenvolvimento, o mesmo runtime fica em build/python-runtime.
  candidates.push({
    command: path.join(process.resourcesPath, 'python', 'python.exe'),
    args: [],
  });
  candidates.push({
    command: path.join(process.cwd(), 'build', 'python-runtime', 'python.exe'),
    args: [],
  });

  candidates.push({
    command: path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'),
    args: [],
  });
  candidates.push({ command: 'python', args: [] });
  candidates.push({ command: 'py', args: ['-3'] });
  return candidates;
}

function runPythonJson(command: string, args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 20,
      timeout: PYTHON_CONVERSION_TIMEOUT_MS,
    }, (error, stdout, stderr) => {
      const output = stdout.trim();
      if (error) {
        const timeoutMsg = (error as any).killed
          ? `Conversao excedeu ${Math.round(PYTHON_CONVERSION_TIMEOUT_MS / 60000)} minutos`
          : '';
        reject(new Error(timeoutMsg || stderr.trim() || output || error.message));
        return;
      }

      try {
        const parsed = JSON.parse(output);
        if (parsed.ok === false) {
          reject(new Error(parsed.error || 'Falha ao converter CSV'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(output || 'Conversor Python nao retornou JSON valido'));
      }
    });
  });
}

async function convertAndSaveXlsx(csvPath: string, xlsxPath: string): Promise<XlsxConversionResult> {
  const scriptPath = getPythonScriptPath('csv_to_xlsx.py');
  let lastError: Error | null = null;

  for (const candidate of getPythonCandidates()) {
    try {
      const result = await runPythonJson(candidate.command, [...candidate.args, scriptPath, csvPath, xlsxPath]);
      return {
        files: result.files ?? [xlsxPath],
        warnings: result.warnings ?? [],
        logs: result.logs ?? [],
        rows: result.rows ?? 0,
        encoding: result.encoding,
        separator: result.separator,
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(
    'Nao foi possivel executar o conversor Python. ' +
    'O runtime interno do aplicativo nao foi encontrado. Reinstale o Mavi SFTP. ' +
    (lastError ? `Ultimo erro: ${lastError.message}` : '')
  );
}

async function splitDailySalesCsv(csvPath: string, outputDir: string, period: string): Promise<DailySalesSplitResult> {
  const scriptPath = getPythonScriptPath('split_daily_sales.py');
  let lastError: Error | null = null;

  for (const candidate of getPythonCandidates()) {
    try {
      const result = await runPythonJson(candidate.command, [...candidate.args, scriptPath, csvPath, outputDir, period]);
      return {
        files: result.files ?? [],
        warnings: result.warnings ?? [],
        logs: result.logs ?? [],
        days: result.days ?? [],
        rows: result.rows ?? 0,
        encoding: result.encoding,
        separator: result.separator,
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new Error(
    'Nao foi possivel executar o separador de vendas diarias. ' +
    'O runtime interno do aplicativo nao foi encontrado. Reinstale o Mavi SFTP. ' +
    (lastError ? `Ultimo erro: ${lastError.message}` : '')
  );
}

function joinRemotePath(parent: string, name: string): string {
  return parent.endsWith('/') ? parent + name : parent + '/' + name;
}

function extractPeriodKey(fileName: string): string | null {
  const match = fileName.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\D|$)/);
  if (!match) return null;

  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return null;

  return `${year}${month}`;
}

function formatPeriodLabel(periodKey: string): string {
  return `${periodKey.slice(4, 6)}/${periodKey.slice(0, 4)}`;
}

function getXlsxFileName(fileName: string): string {
  return fileName.replace(/\.(csv|txt)$/i, '') + '.xlsx';
}

function isDailySalesFile(fileName: string): boolean {
  return /^BR_(?:VENTAS|VENDAS_DIARIA_COCACOLA_GPA_ENERGETICOS_SEM_CONCORRENCIA)_\d{8}(?:\.(csv|txt))?$/i.test(fileName);
}

function extractFileDate(fileName: string): Date | null {
  const match = fileName.match(/(?:^|_)(\d{4})(\d{2})(\d{2})(?=\D|$)/);
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getDailySalesSourceRange(period: string): { start: Date; end: Date } {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = addDays(new Date(Date.UTC(year, month, 0)), 10);
  return { start, end };
}

function dailySalesFileIsInSourceRange(fileName: string, period: string): boolean {
  const fileDate = extractFileDate(fileName);
  if (!fileDate) return false;

  const sourceRange = getDailySalesSourceRange(period);
  return fileDate >= sourceRange.start && fileDate <= sourceRange.end;
}

function getDailySalesDayFromPath(filePath: string): string | null {
  const match = path.basename(filePath).match(/_DIA_(\d{8})\.csv$/i);
  return match ? match[1] : null;
}

async function writeChunk(output: fs.WriteStream, chunk: Buffer): Promise<void> {
  if (!output.write(chunk)) {
    await once(output, 'drain');
  }
}

async function appendCsvFile(inputPath: string, output: fs.WriteStream, includeHeader: boolean): Promise<void> {
  const input = fs.createReadStream(inputPath);
  let skippingHeader = !includeHeader;

  for await (const chunk of input) {
    const buffer = chunk as Buffer;
    if (!skippingHeader) {
      await writeChunk(output, buffer);
      continue;
    }

    const newlineIndex = buffer.indexOf(10);
    if (newlineIndex === -1) continue;

    skippingHeader = false;
    const rest = buffer.subarray(newlineIndex + 1);
    if (rest.length) await writeChunk(output, rest);
  }
}

async function concatenateCsvFiles(inputPaths: string[], outputPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const output = fs.createWriteStream(outputPath);
  try {
    for (let i = 0; i < inputPaths.length; i++) {
      await appendCsvFile(inputPaths[i], output, i === 0);
    }
  } finally {
    output.end();
    await once(output, 'finish');
  }
}

async function listRecentFiles(remotePath: string, limit: number): Promise<RecentSftpFile[]> {
  const client = getSftpClient();
  if (!client) return [];

  const recent: RecentSftpFile[] = [];
  const pending = [remotePath];

  while (pending.length) {
    const current = pending.shift()!;
    let entries: any[] = [];

    try {
      entries = await client.list(current);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = joinRemotePath(current, entry.name);
      if (entry.type === 'd') {
        pending.push(entryPath);
        continue;
      }

      recent.push({
        name: entry.name,
        path: entryPath,
        size: entry.size,
        type: entry.type,
        modifyTime: entry.modifyTime,
      });
    }

    recent.sort((a, b) => b.modifyTime - a.modifyTime);
    if (recent.length > limit * 4) recent.length = limit * 4;
    await waitForUi();
  }

  return recent.sort((a, b) => b.modifyTime - a.modifyTime).slice(0, limit);
}

// ── Registro dos handlers ─────────────────────────────────────────────────────

export function registerFileHandlers(getMainWindow: () => BrowserWindow): void {

  ipcMain.handle('sftp:list', async (_event, remotePath: string) => {
    const client = getSftpClient();
    if (!client) return NOT_CONNECTED;
    try {
      const list = await client.list(remotePath);
      return {
        ok: true,
        files: list.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type,
          modifyTime: f.modifyTime,
        })),
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sftp:recentFiles', async (_event, remotePath: string, limit = 30) => {
    const client = getSftpClient();
    if (!client) return NOT_CONNECTED;
    try {
      return {
        ok: true,
        files: await listRecentFiles(remotePath, limit),
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sftp:download', async (_event, remotePath: string, fileName: string) => {
    const client = getSftpClient();
    if (!client) return NOT_CONNECTED;

    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: fileName,
      title: 'Salvar arquivo',
    });

    if (!filePath) return { ok: false, error: 'Cancelado pelo usuário' };

    try {
      await client.fastGet(remotePath, filePath);
      sendDownloadProgress(getMainWindow, {
        completed: 1,
        total: 1,
        label: getDownloadLabel(fileName),
        status: 'done',
      });
      return { ok: true, localPath: filePath };
    } catch (err: any) {
      sendDownloadProgress(getMainWindow, {
        completed: 0,
        total: 1,
        label: getDownloadLabel(fileName),
        status: 'error',
        errors: 1,
      });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sftp:downloadAsXlsx', async (_event, remotePath: string, fileName: string) => {
    const client = getSftpClient();
    if (!client) return NOT_CONNECTED;

    const xlsxName = getXlsxFileName(fileName);
    const { filePath } = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: xlsxName,
      title: 'Salvar como Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });

    if (!filePath) return { ok: false, error: 'Cancelado pelo usuário' };

    const tmpPath = path.join(os.tmpdir(), `mavi_sftp_${Date.now()}.csv`);
    try {
      await client.fastGet(remotePath, tmpPath);
      const conversion = await convertAndSaveXlsx(tmpPath, filePath);
      fs.unlinkSync(tmpPath);
      sendDownloadProgress(getMainWindow, {
        completed: 1,
        total: 1,
        label: 'XLSX',
        status: 'done',
      });
      return {
        ok: true,
        localPath: conversion.files[0] ?? filePath,
        localPaths: conversion.files,
        warnings: conversion.warnings,
        logs: conversion.logs,
      };
    } catch (err: any) {
      try { fs.unlinkSync(tmpPath); } catch {}
      sendDownloadProgress(getMainWindow, {
        completed: 0,
        total: 1,
        label: 'XLSX',
        status: 'error',
        errors: 1,
      });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sftp:downloadFolder', async (_event, remotePath: string, asCsv: boolean, asXlsx: boolean, period?: string | null, fileNames?: string[], mode?: 'daily-sales') => {
    const client = getSftpClient();
    if (!client) return NOT_CONNECTED;

    // Escolhe pasta de destino
    const { filePaths } = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Escolher pasta de destino',
      properties: ['openDirectory'],
    });

    if (!filePaths?.length) return { ok: false, error: 'Cancelado' };

    const destDir = filePaths[0];

    try {
      const list = await client.list(remotePath);

      if (mode === 'daily-sales') {
        if (!period) return { ok: false, error: 'Periodo nao informado para vendas diarias' };

        const dailyFiles = list.filter(f => (
          f.type === '-' &&
          isDailySalesFile(f.name) &&
          dailySalesFileIsInSourceRange(f.name, period)
        )).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
        if (!dailyFiles.length) {
          return { ok: false, error: `Nenhuma base de vendas diarias encontrada para ${formatPeriodLabel(period)}` };
        }

        const totalFiles = dailyFiles.length;
        const labelBase = asCsv && asXlsx ? 'Venda diaria CSV + XLSX' : asCsv ? 'Venda diaria CSV' : 'Venda diaria XLSX';
        const label = `${labelBase} ${formatPeriodLabel(period)}`;
        let completedFiles = 0;
        let errors = 0;
        const warnings: string[] = [];
        const logs: string[] = [];
        const generatedFiles: string[] = [];
        const latestCsvByDay = new Map<string, string>();
        const splitWorkDir = path.join(os.tmpdir(), `mavi_sftp_daily_split_${Date.now()}_${Math.random().toString(16).slice(2)}`);
        await fs.promises.mkdir(splitWorkDir, { recursive: true });

        sendDownloadProgress(getMainWindow, {
          completed: 0,
          total: totalFiles,
          label,
          status: 'running',
          title: 'Baixando e tratando bases',
        });
        await waitForUi();

        for (const f of dailyFiles) {
          const remote = remotePath.endsWith('/') ? remotePath + f.name : remotePath + '/' + f.name;
          const tmpDir = path.join(os.tmpdir(), `mavi_sftp_daily_${Date.now()}_${Math.random().toString(16).slice(2)}`);
          await fs.promises.mkdir(tmpDir, { recursive: true });
          const tmpPath = path.join(tmpDir, f.name);

          try {
            await client.fastGet(remote, tmpPath);
            const split = await splitDailySalesCsv(tmpPath, splitWorkDir, period);
            warnings.push(...split.warnings);
            logs.push(...split.logs);

            if (!split.files.length) {
              warnings.push(`${f.name}: nenhum dia encontrado para ${formatPeriodLabel(period)}.`);
            }

            for (const csvFile of split.files) {
              const day = getDailySalesDayFromPath(csvFile);
              if (!day) {
                try { fs.unlinkSync(csvFile); } catch {}
                continue;
              }
              const previousCsv = latestCsvByDay.get(day);
              if (previousCsv && previousCsv !== csvFile) {
                try { fs.unlinkSync(previousCsv); } catch {}
              }
              latestCsvByDay.set(day, csvFile);
            }

            fs.unlinkSync(tmpPath);
            try { fs.rmdirSync(tmpDir); } catch {}
            completedFiles++;
            sendDownloadProgress(getMainWindow, {
              completed: completedFiles,
              total: totalFiles,
              label,
              status: 'running',
              errors,
              fileName: f.name,
              fileStatus: 'done',
              title: 'Baixando e tratando bases',
            });
            await waitForUi();
          } catch (err: any) {
            try { fs.unlinkSync(tmpPath); } catch {}
            try { fs.rmdirSync(tmpDir); } catch {}
            errors++;
            warnings.push(`${f.name}: ${err.message || 'falha ao processar vendas diarias'}`);
            completedFiles++;
            sendDownloadProgress(getMainWindow, {
              completed: completedFiles,
              total: totalFiles,
              label,
              status: 'running',
              errors,
              fileName: f.name,
              fileStatus: 'error',
              title: 'Baixando e tratando bases',
            });
            await waitForUi();
          }
        }

        const finalCsvFiles = [...latestCsvByDay.entries()]
          .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
          .map(([, csvFile]) => csvFile);
        let completedOutputs = completedFiles;
        const hasConcatenated = finalCsvFiles.length > 0;
        const totalWithOutputs = totalFiles + finalCsvFiles.length + Number(hasConcatenated);

        sendDownloadProgress(getMainWindow, {
          completed: completedOutputs,
          total: totalWithOutputs,
          label,
          status: 'running',
          errors,
          title: 'Salvando dias finais',
        });
        await waitForUi();

        for (const csvFile of finalCsvFiles) {
          const outputName = path.basename(csvFile);
          const destCsv = path.join(destDir, outputName);

          try {
            if (asCsv) {
              await fs.promises.copyFile(csvFile, destCsv);
              generatedFiles.push(destCsv);
            }

            if (asXlsx) {
              const xlsxPath = path.join(destDir, outputName.replace(/\.csv$/i, '.xlsx'));
              const conversion = await convertAndSaveXlsx(csvFile, xlsxPath);
              generatedFiles.push(...conversion.files);
              warnings.push(...conversion.warnings);
              logs.push(...conversion.logs);
            }

            completedOutputs++;
            sendDownloadProgress(getMainWindow, {
              completed: completedOutputs,
              total: totalWithOutputs,
              label,
              status: 'running',
              errors,
              fileName: outputName,
              fileStatus: 'done',
              title: 'Salvando dias finais',
            });
            await waitForUi();
          } catch (err: any) {
            errors++;
            warnings.push(`${outputName}: ${err.message || 'falha ao salvar venda diaria'}`);
            completedOutputs++;
            sendDownloadProgress(getMainWindow, {
              completed: completedOutputs,
              total: totalWithOutputs,
              label,
              status: 'running',
              errors,
              fileName: outputName,
              fileStatus: 'error',
              title: 'Salvando dias finais',
            });
            await waitForUi();
          }
        }

        if (hasConcatenated) {
          const concatName = `CONCATENADO_${period}.csv`;
          const concatCsv = asCsv
            ? path.join(destDir, concatName)
            : path.join(splitWorkDir, concatName);

          try {
            sendDownloadProgress(getMainWindow, {
              completed: completedOutputs,
              total: totalWithOutputs,
              label,
              status: 'running',
              errors,
              fileName: concatName,
              title: 'Gerando concatenado',
            });
            await waitForUi();

            await concatenateCsvFiles(finalCsvFiles, concatCsv);
            logs.push(`${concatName} salvo com ${finalCsvFiles.length} dia(s) concatenado(s).`);

            if (asCsv) generatedFiles.push(concatCsv);

            if (asXlsx) {
              const concatXlsx = path.join(destDir, `CONCATENADO_${period}.xlsx`);
              const conversion = await convertAndSaveXlsx(concatCsv, concatXlsx);
              generatedFiles.push(...conversion.files);
              warnings.push(...conversion.warnings);
              logs.push(...conversion.logs);
            }

            if (!asCsv) {
              try { fs.unlinkSync(concatCsv); } catch {}
            }

            completedOutputs++;
            sendDownloadProgress(getMainWindow, {
              completed: completedOutputs,
              total: totalWithOutputs,
              label,
              status: 'running',
              errors,
              fileName: concatName,
              fileStatus: 'done',
              title: 'Gerando concatenado',
            });
            await waitForUi();
          } catch (err: any) {
            errors++;
            warnings.push(`${concatName}: ${err.message || 'falha ao gerar concatenado'}`);
            completedOutputs++;
            sendDownloadProgress(getMainWindow, {
              completed: completedOutputs,
              total: totalWithOutputs,
              label,
              status: 'running',
              errors,
              fileName: concatName,
              fileStatus: 'error',
              title: 'Gerando concatenado',
            });
            await waitForUi();
          }
        }

        finalCsvFiles.forEach(csvFile => {
          try { fs.unlinkSync(csvFile); } catch {}
        });

        try { fs.rmdirSync(splitWorkDir); } catch {}

        sendDownloadProgress(getMainWindow, {
          completed: totalWithOutputs,
          total: totalWithOutputs,
          label,
          status: 'done',
          errors,
        });

        return { ok: true, downloaded: generatedFiles.length, errors, warnings, logs, localPaths: generatedFiles };
      }

      const selectedNames = Array.isArray(fileNames) && fileNames.length
        ? new Set(fileNames)
        : null;
      const csvFiles = list.filter(f => (
        f.type === '-' &&
        /\.(csv|txt)$/i.test(f.name) &&
        (selectedNames ? selectedNames.has(f.name) : (!period || extractPeriodKey(f.name) === period))
      ));
      if (!csvFiles.length) {
        const suffix = period ? ` para o periodo ${formatPeriodLabel(period)}` : '';
        return { ok: false, error: `Nenhum arquivo CSV encontrado na pasta${suffix}` };
      }

      const outputsPerFile = Number(asCsv) + Number(asXlsx);
      const totalFiles = csvFiles.length;
      const labelBase = asCsv && asXlsx ? 'CSV + XLSX' : asCsv ? 'CSV' : 'XLSX';
      const label = period ? `${labelBase} ${formatPeriodLabel(period)}` : labelBase;
      let downloaded = 0;
      let errors = 0;
      let completedFiles = 0;
      const warnings: string[] = [];
      const logs: string[] = [];
      const generatedFiles: string[] = [];

      sendDownloadProgress(getMainWindow, {
        completed: 0,
        total: totalFiles,
        label,
        status: 'running',
      });
      await waitForUi();

      for (const f of csvFiles) {
        const remote = remotePath.endsWith('/') ? remotePath + f.name : remotePath + '/' + f.name;
        const tmpPath = path.join(os.tmpdir(), `mavi_sftp_${Date.now()}_${f.name}`);

        try {
          await client.fastGet(remote, tmpPath);

          if (asCsv) {
            const destCsv = path.join(destDir, f.name);
            await fs.promises.copyFile(tmpPath, destCsv);
            generatedFiles.push(destCsv);
          }

          if (asXlsx) {
            const xlsxName = getXlsxFileName(f.name);
            const destXlsx = path.join(destDir, xlsxName);
            const conversion = await convertAndSaveXlsx(tmpPath, destXlsx);
            generatedFiles.push(...conversion.files);
            warnings.push(...conversion.warnings);
            logs.push(...conversion.logs);
          }

          fs.unlinkSync(tmpPath);
          downloaded++;
          completedFiles++;
          sendDownloadProgress(getMainWindow, {
            completed: completedFiles,
            total: totalFiles,
            label,
            status: completedFiles === totalFiles ? 'done' : 'running',
            errors,
            fileName: f.name,
            fileStatus: 'done',
          });
          await waitForUi();
        } catch {
          try { fs.unlinkSync(tmpPath); } catch {}
          errors++;
          completedFiles++;
          sendDownloadProgress(getMainWindow, {
            completed: completedFiles,
            total: totalFiles,
            label,
            status: completedFiles === totalFiles ? 'done' : 'running',
            errors,
            fileName: f.name,
            fileStatus: 'error',
          });
          await waitForUi();
        }
      }

      sendDownloadProgress(getMainWindow, {
        completed: totalFiles,
        total: totalFiles,
        label,
        status: 'done',
        errors,
      });

      return { ok: true, downloaded, errors, warnings, logs, localPaths: generatedFiles };
    } catch (err: any) {
      sendDownloadProgress(getMainWindow, {
        completed: 0,
        total: 1,
        label: 'Download',
        status: 'error',
        errors: 1,
      });
      return { ok: false, error: err.message };
    }
  });

}
