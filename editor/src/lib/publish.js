// Публикация на GitHub Pages: что ещё не опубликовано и как идёт сборка сайта на GitHub.
import { useSyncExternalStore } from 'react';
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
export function refreshStatus() {
  refreshing ??= api
    .publishStatus()
    .then((status) => set({ status, error: null }))
    .catch((e) => set({ status: null, error: e.message }))
    .finally(() => (refreshing = null));
  return refreshing;
}

/** Сколько изменений ждёт публикации. */
export const pendingCount = (status) => (status ? status.files.length + (status.ahead ? 1 : 0) : 0);

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
  try {
    const { sha, repo } = await api.publish(message);
    set({ build: { phase: repo ? 'building' : 'unknown', sha, repo, at: Date.now() } });
    if (repo) watchBuild(sha, repo);
  } catch (e) {
    set({ build: null });
    throw e;
  } finally {
    refreshStatus();
  }
}
