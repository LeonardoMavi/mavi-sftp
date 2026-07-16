import type { Favorite } from '../types.js';

// ── Persistência ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sftp_favorites';

export function loadFavorites(): Favorite[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveFavorites(favs: Favorite[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
}

export function addFavorite(fav: Favorite): void {
  const favs = loadFavorites();
  favs.push(fav);
  saveFavorites(favs);
}

export function removeFavorite(index: number): void {
  const favs = loadFavorites();
  favs.splice(index, 1);
  saveFavorites(favs);
}

// ── Renderização ──────────────────────────────────────────────────────────────

function fillConnectionForm(fav: Favorite): void {
  (document.getElementById('input-host') as HTMLInputElement).value = fav.host;
  (document.getElementById('input-port') as HTMLInputElement).value = String(fav.port);
  (document.getElementById('input-user') as HTMLInputElement).value = fav.username;
}

export function renderFavorites(): void {
  const list = document.getElementById('favorites-list')!;
  const favs = loadFavorites();
  list.innerHTML = '';

  if (favs.length === 0) {
    list.innerHTML = '<span class="empty-hint">Nenhum favorito ainda</span>';
    return;
  }

  favs.forEach((fav, i) => {
    const item = document.createElement('div');
    item.className = 'favorite-item';
    item.innerHTML = `
      <span class="favorite-name">${fav.label || fav.host}</span>
      <button class="btn-icon" data-remove="${i}" title="Remover">✕</button>
    `;

    item.addEventListener('click', e => {
      if ((e.target as HTMLElement).dataset.remove !== undefined) return;
      fillConnectionForm(fav);
    });

    item.querySelector('[data-remove]')?.addEventListener('click', () => {
      removeFavorite(i);
      renderFavorites();
    });

    list.appendChild(item);
  });
}
