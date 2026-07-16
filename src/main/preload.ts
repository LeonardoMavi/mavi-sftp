const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sftp', {
  connect:            (config: any)                      => ipcRenderer.invoke('sftp:connect', config),
  disconnect:         ()                                 => ipcRenderer.invoke('sftp:disconnect'),
  list:               (path: string)                     => ipcRenderer.invoke('sftp:list', path),
  recentFiles:        (path: string, limit: number)      => ipcRenderer.invoke('sftp:recentFiles', path, limit),
  download:           (remotePath: string, name: string) => ipcRenderer.invoke('sftp:download', remotePath, name),
  downloadAsXlsx:     (remotePath: string, name: string) => ipcRenderer.invoke('sftp:downloadAsXlsx', remotePath, name),
  downloadFolder:     (remotePath: string, asCsv: boolean, asXlsx: boolean, period?: string | null, fileNames?: string[], mode?: string) => ipcRenderer.invoke('sftp:downloadFolder', remotePath, asCsv, asXlsx, period, fileNames, mode),
  onDownloadProgress: (callback: any) => {
    const listener = (_event: any, payload: any) => callback(payload);
    ipcRenderer.on('sftp:download-progress', listener);
    return () => ipcRenderer.removeListener('sftp:download-progress', listener);
  },
  upload:             (remotePath: string)               => ipcRenderer.invoke('sftp:upload', remotePath),
  mkdir:              (path: string)                     => ipcRenderer.invoke('sftp:mkdir', path),
  delete:             (path: string, isDir: boolean)     => ipcRenderer.invoke('sftp:delete', path, isDir),
  rename:             (oldPath: string, newPath: string) => ipcRenderer.invoke('sftp:rename', oldPath, newPath),
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize:       () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  close:          () => ipcRenderer.invoke('window:close'),
});
