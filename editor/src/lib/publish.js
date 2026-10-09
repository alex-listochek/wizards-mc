// Публикация на GitHub Pages: что ещё не опубликовано и как идёт сборка сайта на GitHub.
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api.js';
import { toast } from './util.js';

let state = {
  status: null, // { files, ahead, repo } с сервера
  error: null,
  // Последняя публикация: phase — sending | building | done | failed | unknown.
  build: null,
};

const listeners = new Set();
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const getState = () => state;
export const usePublish = () => useSyncExternalStore(subscribe, getState);

let refreshing = null;
let queued = null;
export function refreshStatus() {
  // Запрос уже идёт — его ответ может не учитывать последние правки: повторим, когда он вернётся.
  if (refreshing) {
    queued ??= refreshing.then(() => {
      queued = null;
      return refreshStatus();
    });
    return queued;
  }
  const at = Date.now();
  refreshing = api
    .publishStatus()
    .then((status) => set({ status: { ...status, at }, error: null }))
    .catch((e) => set({ status: null, error: e.message }))
    .finally(() => (refreshing = null));
  return refreshing;
}

/** Сколько изменений ждёт публикации. */
export const pendingCount = (status) => (status ? status.files.length + (status.ahead ? 1 : 0) : 0);

/**
 * Статьи («раздел/статья»), сохранённые, но ещё не опубликованные.
 * Сохранённые уже после проверки тоже считаем такими — свежий ответ сервера придёт чуть позже.
 */
export function unpublishedKeys(status, articles) {
  const keys = new Set();
  if (!status) return keys;
  for (const f of status.files) {
    const m = f.path.match(/^src\/content\/(.+)\.md$/);
    if (m && f.kind !== 'deleted') keys.add(m[1]);
  }
  for (const a of Object.values(articles)) if (a.mtime > status.at) keys.add(a.key);
  return keys;
}

export const isPublishing = (build) => build?.phase === 'sending' || build?.phase === 'building';

/** После сохранений и правок файлов пересчитываем, что не опубликовано. Вызывается один раз в App. */
export function useStatusRefresh(store) {
  useEffect(() => {
    const t = setTimeout(refreshStatus, 400);
    return () => clearTimeout(t);
  }, [store.articles, store.config]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Сайт собирает GitHub Actions (.github/workflows/deploy.yml). Следим за сборкой этой версии через открытый API GitHub.
async function watchBuild(sha, repo) {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.name}/actions/runs?head_sha=${sha}&per_page=1`;
  for (let i = 0; i < 40; i++) {
    await sleep(i < 2 ? 8000 : 12000);
    if (state.build?.sha !== sha) return;
    let run;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      // 403 — GitHub ограничил число проверок в час. Сайт при этом всё равно обновится.
      if (!res.ok) break;
      run = (await res.json()).workflow_runs?.[0];
    } catch {
      continue;
    }
    if (!run) continue;
    if (run.status !== 'completed') {
      if (state.build.runUrl !== run.html_url) set({ build: { ...state.build, runUrl: run.html_url } });
      continue;
    }
    const ok = run.conclusion === 'success';
    set({ build: { ...state.build, phase: ok ? 'done' : 'failed', runUrl: run.html_url } });
    toast(ok ? 'Сайт обновлён — изменения уже на сайте и в Telegram' : 'Сборка сайта на GitHub не удалась — подробности в окне «Опубликовать»', ok ? 'success' : 'error');
    return;
  }
  if (state.build?.sha === sha) set({ build: { ...state.build, phase: 'unknown' } });
}

export async function publish(message) {
  set({ build: { phase: 'sending' } });
  let res;
  try {
    res = await api.publish(message);
  } catch (e) {
    set({ build: null });
    refreshStatus();
    throw e;
  }
  // Сначала свежий список изменений, потом итог — иначе окно на миг снова покажет уже отправленное.
  await refreshStatus();
  const { sha, repo } = res;
  set({ build: { phase: repo ? 'building' : 'unknown', sha, repo, at: Date.now() } });
  if (repo) watchBuild(sha, repo);
}
