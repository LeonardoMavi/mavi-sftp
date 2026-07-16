// ── Formatação ────────────────────────────────────────────────────────────────

export function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Manipulação de paths ──────────────────────────────────────────────────────

export function joinPath(...parts: string[]): string {
  return ('/' + parts.join('/').replace(/\/+/g, '/')).replace(/\/$/, '') || '/';
}

export function parentPath(p: string): string {
  const parts = p.replace(/\/$/, '').split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
}

// ── Ícones por extensão ───────────────────────────────────────────────────────

export function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const icons: Record<string, string> = {
    csv: '📊', xlsx: '📊', xls: '📊',
    pdf: '📄', txt: '📝', md: '📝',
    zip: '📦', gz: '📦', tar: '📦',
    js: '⚙️', ts: '⚙️', py: '⚙️', sh: '⚙️',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
    mp4: '🎬', mov: '🎬', avi: '🎬',
    mp3: '🎵', wav: '🎵',
  };
  return icons[ext || ''] || '📄';
}
