import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import { registerConnectionHandlers, endClient } from './ipc/connection.js';
import { registerFileHandlers } from './ipc/file-operations.js';

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

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
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
