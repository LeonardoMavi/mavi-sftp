// ── Tipos de domínio ──────────────────────────────────────────────────────────

export interface SftpFile {
  name: string;
  path?: string;
  size: number;
  type: string; // 'd' = dir, '-' = file
  modifyTime: number;
}

export interface Favorite {
  label: string;
  host: string;
  port: number;
  username: string;
}

export interface ConnectConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface SftpResult {
  ok: boolean;
  error?: string;
}

export interface SftpListResult extends SftpResult {
  files?: SftpFile[];
}

export interface SftpDownloadResult extends SftpResult {
  localPath?: string;
  localPaths?: string[];
  warnings?: string[];
  logs?: string[];
}

export interface SftpUploadResult extends SftpResult {
  uploaded?: string;
}

export interface DownloadProgressPayload {
  completed: number;
  total: number;
  label: string;
  status?: 'running' | 'done' | 'error';
  errors?: number;
  fileName?: string;
  fileStatus?: 'done' | 'error';
  title?: string;
}

// ── Declaração da API exposta pelo preload ────────────────────────────────────

declare global {
  interface Window {
    sftp: {
      connect:        (config: ConnectConfig)                    => Promise<SftpResult>;
      disconnect:     ()                                         => Promise<SftpResult>;
      list:           (path: string)                             => Promise<SftpListResult>;
      recentFiles:    (path: string, limit: number)              => Promise<SftpListResult>;
      download:       (remotePath: string, name: string)         => Promise<SftpDownloadResult>;
      downloadAsXlsx: (remotePath: string, name: string)         => Promise<SftpDownloadResult>;
      downloadFolder: (remotePath: string, asCsv: boolean, asXlsx: boolean, period?: string | null, fileNames?: string[], mode?: string) => Promise<{ ok: boolean; downloaded?: number; errors?: number; error?: string; localPaths?: string[]; warnings?: string[]; logs?: string[]; }>;
      onDownloadProgress: (callback: (payload: DownloadProgressPayload) => void) => () => void;
      upload:         (remotePath: string)                       => Promise<SftpUploadResult>;
      mkdir:          (path: string)                             => Promise<SftpResult>;
      delete:         (path: string, isDir: boolean)             => Promise<SftpResult>;
      rename:         (oldPath: string, newPath: string)         => Promise<SftpResult>;
    };
    windowControls: {
      minimize:       () => Promise<void>;
      toggleMaximize: () => Promise<boolean>;
      close:          () => Promise<void>;
    };
  }
}
