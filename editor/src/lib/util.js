// Мелкие помощники: адреса статей, даты, хэш-маршруты.

import { useEffect, useState } from 'react';

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** «Правила чата» → «pravila-chata»: имя файла и адрес статьи. */
export const toSlug = (s) =>
  [...String(s).toLowerCase()]
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const formatTime = (t) =>
  new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return formatTime(t);
}

// ---------- Маршруты: #/edit/раздел/статья, #/sections, #/site, #/trash ----------

const read = () => {
  try {
    return decodeURIComponent(location.hash.slice(1)) || '/';
  } catch {
    return location.hash.slice(1) || '/';
  }
};

export function useRoute() {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'edit' && parts.length >= 3) return { page: 'edit', key: `${parts[1]}/${parts[2]}` };
  return { page: parts[0] || 'home' };
}

export const go = (path) => {
  location.hash = path;
};

export const editPath = (key) => `/edit/${key}`;

// Куда поставить курсор после открытия статьи (из поиска или списка проблем).
let pendingJump = null;
export const setJump = (key, from, to = from) => {
  pendingJump = { key, from, to };
};
export const takeJump = (key) => {
  if (pendingJump?.key !== key) return null;
  const j = pendingJump;
  pendingJump = null;
  return j;
};

// ---------- Настройки редактора в браузере ----------

export function usePref(name, initial) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(`editor-${name}`);
      return v === null ? initial : JSON.parse(v);
    } catch {
      return initial;
    }
  });
  const update = (v) => {
    setValue(v);
    try {
      localStorage.setItem(`editor-${name}`, JSON.stringify(v));
    } catch {}
  };
  return [value, update];
}

// ---------- Уведомления ----------

export const toast = (message, type = 'info') => window.dispatchEvent(new CustomEvent('editor-toast', { detail: { message, type } }));
