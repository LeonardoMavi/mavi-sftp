import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron';
import electronUpdater from 'electron-updater';
import * as path from 'path';
import { registerConnectionHandlers, endClient } from './ipc/connection.js';
import { registerFileHandlers } from './ipc/file-operations.js';

const { autoUpdater } = electronUpdater;

// Deve ser definido antes da criacao da janela para o Windows nao usar o
// AppUserModelId e o icone padrao do executavel Electron.
app.setName('Mavi SFTP');
app.setAppUserModelId(app.isPackaged
  ? 'com.mavi.sftp-client'
  : 'com.mavi.sftp-client.development.icon2');

if (!app.isPackaged) {
  const electronReload = require('electron-reload');
  electronReload(path.join(__dirname, '../..'), {
    ignored: /node_modules|[\/\\]\./,
  });
}

// ── Janela principal ──────────────────────────────────────────────────────────

let mainWindow: BrowserWindow;

function getWindowIcon() {
  const iconPath = path.join(app.getAppPath(), 'build', 'icon-taskbar.png');
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    throw new Error(`Icone da janela nao encontrado: ${iconPath}`);
  }
  return icon;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    show: false,
    icon: getWindowIcon(),
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/html/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

function configureAutoUpdater(): void {
  // O updater so funciona no aplicativo instalado. Durante `npm start`, ele
  // fica desligado para nao consultar o GitHub a cada alteracao do codigo.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Verificando atualizacoes...');
  });

  autoUpdater.on('update-available', info => {
    console.log(`[updater] Versao ${info.version} disponivel. Iniciando download...`);
  });

  autoUpdater.on('update-not-available', info => {
    console.log(`[updater] Aplicativo atualizado (${info.version}).`);
  });

  autoUpdater.on('download-progress', progress => {
    console.log(`[updater] Download: ${progress.percent.toFixed(1)}%`);
  });

  autoUpdater.on('update-downloaded', info => {
    console.log(`[updater] Versao ${info.version} pronta para instalar.`);

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Atualizacao disponivel',
      message: `A versao ${info.version} do Mavi SFTP foi baixada.`,
      detail: 'Reinicie o aplicativo para concluir a atualizacao.',
      buttons: ['Reiniciar e atualizar', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', error => {
    // Falha de internet ou GitHub indisponivel nao impede o uso do aplicativo.
    console.error('[updater] Falha ao verificar/baixar atualizacao:', error);
  });

  // Aguarda a janela terminar de abrir para nao disputar recursos com a
  // conexao inicial e para garantir que os avisos tenham uma janela proprietaria.
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(error => {
      console.error('[updater] Falha na verificacao inicial:', error);
    });
  }, 3000);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdater();
  registerConnectionHandlers();
  registerFileHandlers(() => mainWindow);

  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.handle('window:toggleMaximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle('window:close', () => {
    mainWindow.close();
  });
});

app.on('window-all-closed', async () => {
  await endClient();
  app.quit();
});
