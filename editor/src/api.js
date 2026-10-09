// Запросы к локальному серверу редактора (server/api.js).

async function request(method, url, body) {
  const init = { method, headers: { 'X-Wiki-Editor': '1' } };
  if (body instanceof Blob) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Нет связи с редактором — похоже, его окно закрыли. Запустите редактор снова (ярлык или editor/start.cmd), правки не пропадут.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `Ошибка ${res.status}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

const qs = (params) => new URLSearchParams(params).toString();

export const api = {
  load: () => request('GET', '/api/load'),
  save: (data) => request('PUT', '/api/article', data),
  create: (data) => request('POST', '/api/article', data),
  remove: (section, slug) => request('DELETE', `/api/article?${qs({ section, slug })}`),
  move: (data) => request('POST', '/api/move', data),
  reorder: (section, slugs) => request('POST', '/api/reorder', { section, slugs }),
  saveConfig: (data) => request('PUT', '/api/config', data),
  deleteSection: (id) => request('POST', '/api/section/delete', { id }),
  history: (section, slug) => request('GET', `/api/history?${qs({ section, slug })}`),
  version: (section, slug, id) => request('GET', `/api/history/version?${qs({ section, slug, id })}`),
  trash: () => request('GET', '/api/trash'),
  restore: (id) => request('POST', '/api/trash/restore', { id }),
  upload: (file, name) => request('POST', `/api/upload?${qs({ name })}`, file),
  publishStatus: () => request('GET', '/api/publish/status'),
  publish: (message, resolve) => request('POST', '/api/publish', { message, resolve }),
};
