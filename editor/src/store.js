import { useSyncExternalStore } from 'react';
import { api } from './api.js';
import { buildFile, parseFile, resolveTitle } from './lib/frontmatter.js';

// Состояние редактора: статьи с диска, настройки сайта и несохранённые черновики.
// Черновики живут в памяти и в localStorage, поэтому не теряются при переходах и случайной перезагрузке.

const DRAFTS_KEY = 'editor-drafts';
const AUTO_DATE_KEY = 'editor-auto-date';

let state = {
  status: 'loading',
  error: null,
  articles: {}, // 'раздел/статья' → статья
  folders: [],
  config: { server: {}, sections: [] },
  drafts: {}, // 'раздел/статья' → { fields, body, baseHash }
  siteRoot: '',
};

const listeners = new Set();
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getState = () => state;
export const useStore = () => useSyncExternalStore(subscribe, getState);

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let persistTimer;
function setDrafts(drafts) {
  set({ drafts });
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(state.drafts));
    } catch {}
  }, 300);
}

export const keyOf = (section, slug) => `${section}/${slug}`;
export const EMPTY_FIELDS = { title: '', description: '', order: '', tags: [], updated: '' };

function makeArticle(a) {
  const parsed = parseFile(a.raw);
  return { ...a, ...parsed, key: keyOf(a.section, a.slug), title: resolveTitle(parsed.fields, parsed.body, a.slug) };
}

const sameContent = (d, a) => d.body === a.body && JSON.stringify(d.fields) === JSON.stringify(a.fields);

/** Текущее содержимое статьи: черновик, если он есть, иначе версия с диска. */
export function current(key) {
  return state.drafts[key] ?? state.articles[key] ?? null;
}

// ---------- Загрузка ----------

export async function load({ initial = false } = {}) {
  let data;
  try {
    data = await api.load();
  } catch (e) {
    if (initial) set({ status: 'error', error: e.message });
    throw e;
  }
  const articles = Object.fromEntries(data.articles.map((a) => [keyOf(a.section, a.slug), makeArticle(a)]));
  let drafts = { ...state.drafts };
  if (initial) {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
      for (const [k, d] of Object.entries(saved)) {
        if (d && d.fields && typeof d.body === 'string') {
          drafts[k] = { ...d, fields: { ...EMPTY_FIELDS, ...d.fields } };
        }
      }
    } catch {}
  }
  // Черновик, совпавший с файлом (ту же правку сохранили в другой программе), больше не нужен.
  for (const [k, d] of Object.entries(drafts)) if (articles[k] && sameContent(d, articles[k])) delete drafts[k];
  set({ status: 'ready', error: null, articles, folders: data.folders, config: data.config, siteRoot: data.siteRoot });
  setDrafts(drafts);
  return { restored: initial ? Object.keys(drafts).length : 0 };
}

// ---------- Черновики ----------

export function updateDraft(key, patch) {
  const a = state.articles[key];
  if (!a) return;
  const base = state.drafts[key] ?? { fields: a.fields, body: a.body, baseHash: a.hash };
  const next = { ...base, ...patch, fields: patch.fields ? { ...base.fields, ...patch.fields } : base.fields };
  const drafts = { ...state.drafts };
  if (sameContent(next, a)) delete drafts[key];
  else drafts[key] = next;
  setDrafts(drafts);
}

export function discardDraft(key) {
  const drafts = { ...state.drafts };
  delete drafts[key];
  setDrafts(drafts);
}

/** Оставить свои правки поверх изменившегося на диске файла: следующее сохранение перезапишет его. */
export function keepMine(key) {
  const d = state.drafts[key];
  const a = state.articles[key];
  if (d && a) setDrafts({ ...state.drafts, [key]: { ...d, baseHash: a.hash } });
}

export const isConflict = (key) => {
  const d = state.drafts[key];
  const a = state.articles[key];
  return Boolean(d && a && d.baseHash !== a.hash);
};

// ---------- Дата обновления ----------

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function getAutoDate() {
  try {
    return localStorage.getItem(AUTO_DATE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAutoDate(on) {
  try {
    localStorage.setItem(AUTO_DATE_KEY, on ? '1' : '0');
  } catch {}
  listeners.forEach((l) => l());
}

// ---------- Операции со статьями ----------

export async function saveArticle(key, { force = false } = {}) {
  const a = state.articles[key];
  const d = state.drafts[key];
  if (!a || !d) return false;
  const fields = getAutoDate() ? { ...d.fields, updated: today() } : d.fields;
  const raw = buildFile(a.meta, a.fields, fields, d.body);
  try {
    const res = await api.save({ section: a.section, slug: a.slug, raw, baseHash: d.baseHash, force });
    const fresh = makeArticle({ section: a.section, slug: a.slug, raw, hash: res.hash, mtime: res.mtime });
    set({ articles: { ...state.articles, [key]: fresh } });
    const drafts = { ...state.drafts };
    // Пока шёл запрос, могли напечатать ещё — такие правки остаются черновиком.
    const later = drafts[key];
    if (later === d || !later || sameContent(later, fresh)) delete drafts[key];
    else drafts[key] = { ...later, baseHash: res.hash };
    setDrafts(drafts);
    return true;
  } catch (e) {
    if (e.status === 409) await load().catch(() => {});
    throw e;
  }
}

export async function saveAll() {
  const keys = Object.keys(state.drafts).filter((k) => state.articles[k] && !isConflict(k));
  for (const k of keys) await saveArticle(k);
  return keys.length;
}

export async function createArticle({ section, slug, title, description = '', body = '' }) {
  const siblings = Object.values(state.articles).filter((a) => a.section === section);
  const maxOrder = Math.max(siblings.length, ...siblings.map((a) => Number(a.fields.order) || 0));
  const fields = { ...EMPTY_FIELDS, title, description, order: String(maxOrder + 1) };
  const raw = buildFile({ bom: '', eol: '\n', lines: [], gap: '\n' }, EMPTY_FIELDS, fields, body);
  await api.create({ section, slug, raw });
  await load();
  return keyOf(section, slug);
}

/** Пересоздать удалённую с диска статью из её черновика. */
export async function recreateFromDraft(key) {
  const d = state.drafts[key];
  const [section, slug] = key.split('/');
  const raw = buildFile({ bom: '', eol: '\n', lines: [], gap: '\n' }, EMPTY_FIELDS, d.fields, d.body);
  await api.create({ section, slug, raw });
  discardDraft(key);
  await load();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function moveArticle(fromKey, to, updateLinks) {
  const a = state.articles[fromKey];
  if (state.drafts[fromKey] && !isConflict(fromKey)) await saveArticle(fromKey);
  const res = await api.move({ from: { section: a.section, slug: a.slug }, to, updateLinks });
  const toKey = keyOf(to.section, to.slug);
  const drafts = { ...state.drafts };
  if (drafts[fromKey]) {
    drafts[toKey] = drafts[fromKey];
    delete drafts[fromKey];
  }
  await load();
  // В черновиках других статей те же ссылки правим сами, иначе они разойдутся с диском.
  if (updateLinks) {
    const re = new RegExp(`#/${escapeRe(a.section)}/${escapeRe(a.slug)}(?=[)#\\s"'>]|$)`, 'g');
    for (const k of res.changed) {
      const d = drafts[k];
      if (d && state.articles[k]) drafts[k] = { ...d, body: d.body.replace(re, `#/${to.section}/${to.slug}`), baseHash: state.articles[k].hash };
    }
  }
  setDrafts(drafts);
  return { key: toKey, changed: res.changed };
}

export async function deleteArticle(key) {
  const a = state.articles[key];
  await api.remove(a.section, a.slug);
  discardDraft(key);
  await load();
}

export async function reorder(section, keys) {
  // Сразу показываем новый порядок, не дожидаясь сервера.
  const articles = { ...state.articles };
  keys.forEach((k, i) => {
    articles[k] = { ...articles[k], fields: { ...articles[k].fields, order: String(i + 1) } };
  });
  set({ articles });
  await api.reorder(section, keys.map((k) => state.articles[k].slug));
  await load();
  const drafts = { ...state.drafts };
  keys.forEach((k, i) => {
    if (drafts[k] && state.articles[k]) drafts[k] = { ...drafts[k], fields: { ...drafts[k].fields, order: String(i + 1) }, baseHash: state.articles[k].hash };
  });
  setDrafts(drafts);
}

export async function saveConfig(patch) {
  const { config } = await api.saveConfig(patch);
  set({ config });
  await load();
}

export async function deleteSection(id) {
  await api.deleteSection(id);
  await load();
}

export async function restoreFromTrash(id) {
  const res = await api.restore(id);
  await load();
  return keyOf(res.section, res.slug);
}

// ---------- Разделы для меню ----------

const byOrder = (a, b) => {
  const oa = a.fields.order === '' ? Infinity : Number(a.fields.order);
  const ob = b.fields.order === '' ? Infinity : Number(b.fields.order);
  return oa - ob || a.title.localeCompare(b.title, 'ru');
};

/** Разделы в том же порядке, что и в меню сайта. Пустые разделы тоже показываем — в них можно добавить статью. */
export function buildSections(s) {
  const all = Object.values(s.articles).map((a) => {
    const d = s.drafts[a.key];
    return d ? { ...a, title: resolveTitle(d.fields, d.body, a.slug), fields: { ...d.fields, order: a.fields.order } } : a;
  });
  const configured = s.config.sections;
  const ids = [...configured.map((c) => c.id)];
  for (const id of [...new Set([...s.folders, ...all.map((a) => a.section)])].sort()) if (!ids.includes(id)) ids.push(id);
  return ids.map((id) => {
    const c = configured.find((x) => x.id === id);
    return {
      id,
      configured: Boolean(c),
      title: c?.title ?? id,
      icon: c?.icon ?? '📄',
      description: c?.description ?? '',
      articles: all.filter((a) => a.section === id).sort(byOrder),
    };
  });
}
