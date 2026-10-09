// Локальный API редактора: читает и пишет файлы сайта.
// Работает внутри dev-сервера Vite, наружу не открыт (только localhost).

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setField } from '../src/lib/frontmatter.js';
import { replaceList, updateObject } from './jsconfig.js';

const KEEP_VERSIONS = 50;
const MAX_UPLOAD = 15 * 1024 * 1024;

// Имя папки раздела или файла статьи: буквы, цифры, «-» и «_».
const NAME = /^[\p{L}\p{N}_][\p{L}\p{N}_-]*$/u;

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'];

const hashOf = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const exists = (p) => fs.access(p).then(() => true, () => false);

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function checkName(name, what) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new HttpError(400, `Недопустимое имя ${what}: «${name}»`);
  return name;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Ссылка вида #/раздел/статья, за которой идёт якорь, конец ссылки или кавычка.
const linkRe = (section, slug) => new RegExp(`#/${escapeRe(section)}/${escapeRe(slug)}(?=[)#\\s"'>]|$)`, 'g');

export function wikiApi({ siteRoot, dataDir }) {
  const contentDir = path.join(siteRoot, 'src', 'content');
  const configFile = path.join(siteRoot, 'src', 'config.js');
  const publicDir = path.join(siteRoot, 'public');
  const historyDir = path.join(dataDir, '.history');
  const trashDir = path.join(dataDir, '.trash');

  const articleFile = (section, slug) =>
    path.join(contentDir, checkName(section, 'раздела'), checkName(slug, 'статьи') + '.md');

  // Свои записи помечаем, чтобы не принять их за правки из другой программы.
  const ownWrites = new Map();
  const markOwn = (file) => ownWrites.set(path.resolve(file).toLowerCase(), Date.now());

  async function write(file, text) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    markOwn(file);
    await fs.writeFile(file, text);
  }

  // ---------- История версий ----------

  async function snapshot(section, slug, raw) {
    const dir = path.join(historyDir, section, slug);
    await fs.mkdir(dir, { recursive: true });
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md')).sort();
    if (names.length && (await fs.readFile(path.join(dir, names.at(-1)), 'utf8')) === raw) return;
    await fs.writeFile(path.join(dir, `${stamp()}.md`), raw);
    for (const n of names.slice(0, Math.max(0, names.length + 1 - KEEP_VERSIONS))) await fs.rm(path.join(dir, n));
  }

  async function snapshotConfig(src) {
    const dir = path.join(historyDir, '_config');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${stamp()}.js`), src);
  }

  // ---------- Чтение ----------

  async function listArticles() {
    const articles = [];
    const folders = [];
    const dirs = await fs.readdir(contentDir, { withFileTypes: true }).catch(() => []);
    for (const d of dirs) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      folders.push(d.name);
      for (const f of await fs.readdir(path.join(contentDir, d.name), { withFileTypes: true })) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue;
        const file = path.join(contentDir, d.name, f.name);
        const [raw, stat] = await Promise.all([fs.readFile(file, 'utf8'), fs.stat(file)]);
        articles.push({ section: d.name, slug: f.name.slice(0, -3), raw, hash: hashOf(raw), mtime: stat.mtimeMs });
      }
    }
    return { articles, folders };
  }

  async function readConfig() {
    // Каждый раз новый адрес модуля, иначе Node отдаст закешированную версию.
    const mod = await import(`${pathToFileURL(configFile).href}?t=${Date.now()}`);
    return { server: mod.server ?? {}, sections: mod.sections ?? [] };
  }

  // ---------- Ссылки между статьями ----------

  async function rewriteLinks(from, to) {
    const { articles } = await listArticles();
    const re = linkRe(from.section, from.slug);
    const changed = [];
    for (const a of articles) {
      const next = a.raw.replace(re, `#/${to.section}/${to.slug}`);
      if (next === a.raw) continue;
      await snapshot(a.section, a.slug, a.raw);
      await write(path.join(contentDir, a.section, `${a.slug}.md`), next);
      changed.push(`${a.section}/${a.slug}`);
    }
    // Ссылки на статьи в настройках сервера (helpArticle, startArticle).
    const { server } = await readConfig();
    const fixes = {};
    for (const k of ['helpArticle', 'startArticle']) {
      if (server[k] === `/${from.section}/${from.slug}`) fixes[k] = `/${to.section}/${to.slug}`;
    }
    if (Object.keys(fixes).length) {
      const src = await fs.readFile(configFile, 'utf8');
      await snapshotConfig(src);
      await write(configFile, updateObject(src, 'server', fixes, server));
      changed.push('config.js');
    }
    return changed;
  }

  // ---------- Публикация через git ----------

  // Git для Windows не всегда добавлен в PATH — тогда ищем его в обычном месте установки.
  const gitCommands = ['git', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe')];

  function gitOnce(args, { input, timeout = 30_000 } = {}) {
    const run = (i) =>
      new Promise((resolve, reject) => {
        const child = execFile(
          gitCommands[i],
          ['-c', 'core.quotepath=false', '-c', 'core.safecrlf=false', ...args],
          // Без терминала git не должен ничего спрашивать, иначе запрос зависнет.
          // GIT_OPTIONAL_LOCKS=0: проверка изменений (git status) не занимает папку и не мешает другим программам.
          { cwd: siteRoot, timeout, windowsHide: true, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } },
          (err, stdout, stderr) => {
            if (err?.code === 'ENOENT' && i + 1 < gitCommands.length) return resolve(run(i + 1));
            if (err?.code === 'ENOENT') return reject(new HttpError(500, 'Не найден Git. Установите Git для Windows: https://git-scm.com'));
            if (err) return reject(Object.assign(err, { stderr: String(stderr || err.message).trim() }));
            resolve(stdout);
          },
        );
        if (input !== undefined) child.stdin.end(input);
      });
    return run(0);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isLocked = (e) => /index\.lock'?: File exists|another git process/i.test(e?.stderr || '');

  // Все вызовы git идут по очереди: два git сразу в одной папке мешают друг другу (index.lock).
  // Если папку ненадолго заняла другая программа (VS Code, GitHub Desktop), ждём и повторяем — git в таком случае ничего не успевает изменить.
  let gitQueue = Promise.resolve();
  function git(args, options) {
    const run = gitQueue.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await gitOnce(args, options);
        } catch (e) {
          if (!isLocked(e) || attempt >= 6) throw e;
          await sleep(500);
        }
      }
    });
    gitQueue = run.catch(() => {});
    return run;
  }

  // owner/repo из адреса вида https://github.com/owner/repo.git или git@github.com:owner/repo.git
  async function githubRepo() {
    const url = (await git(['remote', 'get-url', 'origin']).catch(() => '')).trim();
    const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    return m ? { owner: m[1], name: m[2], siteUrl: `https://${m[1]}.github.io/${m[2]}/`, actionsUrl: `https://github.com/${m[1]}/${m[2]}/actions` } : null;
  }

  // Изменённые файлы: XY путь\0, у переименований следом идёт старый путь.
  async function changedFiles() {
    const out = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const parts = out.split('\0');
    const files = [];
    for (let i = 0; i < parts.length; i++) {
      const e = parts[i];
      if (e.length < 4) continue;
      const [x, y] = e;
      if (x === 'R' || x === 'C') i++;
      const kind = x === '?' || x === 'A' ? 'added' : x === 'D' || y === 'D' ? 'deleted' : x === 'R' ? 'renamed' : 'modified';
      files.push({ path: e.slice(3), kind });
    }
    return files;
  }

  // Сколько сохранённых в git версий ещё не отправлено на GitHub. null — у ветки нет пары на GitHub.
  const unpushed = () =>
    git(['rev-list', '--count', '@{u}..HEAD']).then(
      (out) => Number(out.trim()),
      () => null,
    );

  // На новом компьютере в git может быть не указан автор — тогда подписываем версию так же, как прошлую.
  async function authorArgs() {
    const get = (key) => git(['config', key]).then((s) => s.trim(), () => '');
    const [name, email] = await Promise.all([get('user.name'), get('user.email')]);
    if (name && email) return [];
    const [lastName, lastEmail] = (await git(['log', '-1', '--format=%an%n%ae']).catch(() => '')).trim().split('\n');
    return ['-c', `user.name=${name || lastName || 'Редактор базы знаний'}`, '-c', `user.email=${email || lastEmail || 'editor@localhost'}`];
  }

  // Если прошлая публикация оборвалась посреди совмещения правок (git rebase), откатываем его — иначе git так и застрянет.
  async function abortLeftoverRebase() {
    const gitDir = path.resolve(siteRoot, (await git(['rev-parse', '--git-dir'])).trim());
    if ((await exists(path.join(gitDir, 'rebase-merge'))) || (await exists(path.join(gitDir, 'rebase-apply')))) {
      await git(['rebase', '--abort']).catch(() => {});
    }
  }

  // При запуске подтягиваем свежие правки с GitHub — например, сделанные на другом компьютере.
  // Только «перемотка вперёд»: если здесь есть свои неопубликованные правки к тем же файлам, git ничего не тронет.
  async function syncOnStart(logger) {
    try {
      await git(['rev-parse', '--is-inside-work-tree']);
      await abortLeftoverRebase();
      if ((await unpushed()) === null) return;
      const before = (await git(['rev-parse', 'HEAD'])).trim();
      await git(['pull', '--ff-only', '-q'], { timeout: 60_000 });
      if ((await git(['rev-parse', 'HEAD'])).trim() !== before) logger.info('[wiki] Подтянуты свежие правки с GitHub');
    } catch {
      // Нет интернета, нет git или здесь свои правки — работаем с тем, что есть на диске.
    }
  }

  // Понятное объяснение частых ошибок git.
  function gitError(e, action) {
    if (e instanceof HttpError) return e;
    const text = e.stderr || e.message;
    let hint = '';
    if (e.killed) hint = 'GitHub слишком долго не отвечал. Проверьте интернет и попробуйте ещё раз.';
    else if (isLocked(e))
      hint = 'Папку сайта занял другой git — например, VS Code или GitHub Desktop. Закройте их и попробуйте ещё раз. Если не поможет — удалите файл .git/index.lock в папке сайта.';
    else if (/could not resolve host|unable to access|failed to connect|timed out/i.test(text)) hint = 'Нет связи с GitHub. Проверьте интернет и попробуйте ещё раз.';
    else if (/authentication|could not read username|permission denied|403/i.test(text)) hint = 'GitHub не пустил: нужно заново войти в аккаунт. Выполните «git push» в папке сайта — откроется окно входа.';
    else if (/not a git repository/i.test(text)) hint = 'Папка сайта не подключена к GitHub (нет git-репозитория).';
    else if (/repository not found|does not appear to be a git repository/i.test(text)) hint = 'Репозиторий на GitHub не найден — проверьте адрес: git remote -v в папке сайта.';
    return new HttpError(500, `${action}. ${hint}`.trim(), { details: text });
  }

  let publishing = false;
  // Подтягивание правок при запуске: публикация ждёт его окончания, чтобы два git не работали одновременно.
  let startupSync = Promise.resolve();

  // ---------- Обработчики ----------

  const routes = {
    async 'GET /api/load'() {
      const [{ articles, folders }, config] = await Promise.all([listArticles(), readConfig()]);
      return { articles, folders, config, siteRoot };
    },

    async 'PUT /api/article'({ body }) {
      const { section, slug, raw, baseHash, force } = body;
      const file = articleFile(section, slug);
      const current = await fs.readFile(file, 'utf8').catch(() => null);
      if (current === null) throw new HttpError(404, 'Статья не найдена на диске — возможно, её удалили или переименовали');
      if (!force && baseHash && hashOf(current) !== baseHash) {
        throw new HttpError(409, 'Файл изменён на диске после того, как вы начали правку', { raw: current, hash: hashOf(current) });
      }
      if (current !== raw) {
        await snapshot(section, slug, current);
        await write(file, raw);
      }
      return { hash: hashOf(raw), mtime: Date.now() };
    },

    async 'POST /api/article'({ body }) {
      const { section, slug, raw } = body;
      const file = articleFile(section, slug);
      if (await exists(file)) throw new HttpError(409, `Статья «${section}/${slug}» уже есть`);
      await write(file, raw);
      return { hash: hashOf(raw) };
    },

    async 'DELETE /api/article'({ query }) {
      const { section, slug } = query;
      const file = articleFile(section, slug);
      const raw = await fs.readFile(file, 'utf8').catch(() => null);
      if (raw === null) throw new HttpError(404, 'Статья не найдена');
      await snapshot(section, slug, raw);
      await fs.mkdir(trashDir, { recursive: true });
      markOwn(file);
      await fs.rename(file, path.join(trashDir, `${stamp()}__${section}__${slug}.md`));
      // Пустую папку раздела убираем, чтобы не мешалась.
      const dir = path.dirname(file);
      if (!(await fs.readdir(dir)).length) await fs.rmdir(dir);
      return { ok: true };
    },

    async 'POST /api/move'({ body }) {
      const { from, to, updateLinks } = body;
      const src = articleFile(from.section, from.slug);
      const dst = articleFile(to.section, to.slug);
      if (src === dst) return { changed: [] };
      if (!(await exists(src))) throw new HttpError(404, 'Статья не найдена');
      if (await exists(dst)) throw new HttpError(409, `Статья «${to.section}/${to.slug}» уже есть`);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      markOwn(src);
      markOwn(dst);
      await fs.rename(src, dst);
      const dir = path.dirname(src);
      if (!(await fs.readdir(dir)).length) await fs.rmdir(dir);
      // История переезжает вместе со статьёй.
      const oldHistory = path.join(historyDir, from.section, from.slug);
      const newHistory = path.join(historyDir, to.section, to.slug);
      if ((await exists(oldHistory)) && !(await exists(newHistory))) {
        await fs.mkdir(path.dirname(newHistory), { recursive: true });
        await fs.rename(oldHistory, newHistory);
      }
      const changed = updateLinks ? await rewriteLinks(from, to) : [];
      return { changed };
    },

    // Порядок статей в разделе: проставляет order = 1, 2, 3… тем, у кого он изменился.
    async 'POST /api/reorder'({ body }) {
      const { section, slugs } = body;
      let n = 0;
      for (const [i, slug] of slugs.entries()) {
        const file = articleFile(section, slug);
        const raw = await fs.readFile(file, 'utf8');
        const next = setField(raw, 'order', String(i + 1));
        if (next === raw) continue;
        await snapshot(section, slug, raw);
        await write(file, next);
        n++;
      }
      return { changed: n };
    },

    async 'PUT /api/config'({ body }) {
      const current = await readConfig();
      let src = await fs.readFile(configFile, 'utf8');
      const before = src;
      if (body.sections) src = replaceList(src, 'sections', body.sections);
      if (body.server) src = updateObject(src, 'server', body.server, current.server);
      if (src !== before) {
        await snapshotConfig(before);
        await write(configFile, src);
      }
      // Папки для новых разделов, чтобы в них сразу можно было создавать статьи.
      for (const s of body.sections ?? []) await fs.mkdir(path.join(contentDir, checkName(s.id, 'раздела')), { recursive: true });
      return { config: await readConfig() };
    },

    async 'POST /api/section/delete'({ body }) {
      const id = checkName(body.id, 'раздела');
      const dir = path.join(contentDir, id);
      if (await exists(dir)) {
        if ((await fs.readdir(dir)).some((n) => n.endsWith('.md'))) throw new HttpError(409, 'В разделе есть статьи — сначала перенесите или удалите их');
        await fs.rm(dir, { recursive: true });
      }
      const current = await readConfig();
      if (current.sections.some((s) => s.id === id)) {
        const src = await fs.readFile(configFile, 'utf8');
        await snapshotConfig(src);
        await write(configFile, replaceList(src, 'sections', current.sections.filter((s) => s.id !== id)));
      }
      return { ok: true };
    },

    async 'GET /api/history'({ query }) {
      const dir = path.join(historyDir, checkName(query.section, 'раздела'), checkName(query.slug, 'статьи'));
      const names = await fs.readdir(dir).catch(() => []);
      const versions = [];
      for (const n of names.filter((x) => x.endsWith('.md')).sort().reverse()) {
        const stat = await fs.stat(path.join(dir, n));
        const iso = n.slice(0, -3).replace(/^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, '$1:$2:$3.$4Z');
        versions.push({ id: n.slice(0, -3), time: Date.parse(iso) || stat.mtimeMs, size: stat.size });
      }
      return { versions };
    },

    async 'GET /api/history/version'({ query }) {
      const id = String(query.id);
      if (!/^[\dTZ-]+$/.test(id)) throw new HttpError(400, 'Неверная версия');
      const file = path.join(historyDir, checkName(query.section, 'раздела'), checkName(query.slug, 'статьи'), `${id}.md`);
      return { raw: await fs.readFile(file, 'utf8') };
    },

    async 'GET /api/trash'() {
      const names = await fs.readdir(trashDir).catch(() => []);
      const items = [];
      for (const n of names) {
        const m = n.match(/^(.+?)__(.+?)__(.+)\.md$/);
        if (!m) continue;
        const raw = await fs.readFile(path.join(trashDir, n), 'utf8');
        const title = raw.match(/^title:\s*(.+)$/m)?.[1].replace(/^(['"])(.*)\1$/, '$2') ?? m[3];
        const iso = m[1].replace(/^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, '$1:$2:$3.$4Z');
        items.push({ id: n, section: m[2], slug: m[3], title, time: Date.parse(iso) });
      }
      return { items: items.sort((a, b) => b.time - a.time) };
    },

    async 'POST /api/trash/restore'({ body }) {
      const name = path.basename(String(body.id));
      const m = name.match(/^(.+?)__(.+?)__(.+)\.md$/);
      if (!m) throw new HttpError(400, 'Неверный файл');
      const dst = articleFile(m[2], m[3]);
      if (await exists(dst)) throw new HttpError(409, `Статья «${m[2]}/${m[3]}» уже есть — сначала переименуйте её`);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      markOwn(dst);
      await fs.rename(path.join(trashDir, name), dst);
      return { section: m[2], slug: m[3] };
    },

    // Что изменилось с последней публикации.
    async 'GET /api/publish/status'() {
      try {
        await git(['rev-parse', '--is-inside-work-tree']);
      } catch (e) {
        throw gitError(e, 'Публикация недоступна');
      }
      const [files, ahead, repo] = await Promise.all([changedFiles(), unpushed(), githubRepo()]);
      return { files, ahead: ahead ?? 0, hasUpstream: ahead !== null, repo, publishing };
    },

    // Сохраняет все изменения в git и отправляет на GitHub — дальше GitHub сам соберёт и выложит сайт.
    async 'POST /api/publish'({ body }) {
      if (publishing) throw new HttpError(409, 'Публикация уже идёт');
      publishing = true;
      try {
        await startupSync;
        await abortLeftoverRebase().catch(() => {});
        await git(['add', '-A']).catch((e) => Promise.reject(gitError(e, 'Не удалось подготовить файлы')));
        const staged = await git(['diff', '--cached', '--name-only']);
        const author = await authorArgs();
        if (staged.trim()) {
          const message = String(body.message || '').trim() || 'Обновление сайта';
          await git([...author, 'commit', '-q', '-F', '-'], { input: message }).catch((e) => Promise.reject(gitError(e, 'Не удалось сохранить версию')));
        }
        const hasUpstream = (await unpushed()) !== null;
        const push = () => git(hasUpstream ? ['push', '-q'] : ['push', '-q', '-u', 'origin', 'HEAD'], { timeout: 180_000 });
        try {
          await push();
        } catch (e) {
          // На GitHub есть правки, которых здесь нет (например, файл поменяли на сайте github.com): подтягиваем их и пробуем ещё раз.
          if (!/rejected|fetch first|non-fast-forward/i.test(e.stderr || '')) throw gitError(e, 'Не удалось отправить на GitHub');
          // «Оставить мою версию»: в пересёкшихся местах побеждают здешние правки (при rebase свои правки — это theirs).
          const strategy = body.resolve === 'mine' ? ['-X', 'theirs'] : [];
          try {
            await git([...author, 'pull', '-q', '--rebase', ...strategy], { timeout: 180_000 });
          } catch (pullError) {
            // Какие файлы правили и здесь, и на GitHub в одних и тех же местах — до отмены, пока git о них помнит.
            const conflicts = (await git(['diff', '--name-only', '--diff-filter=U']).catch(() => '')).split('\n').filter(Boolean);
            await git(['rebase', '--abort']).catch(() => {});
            const e = gitError(pullError, 'Эти файлы изменили и здесь, и на другом компьютере (или на github.com) в одних и тех же местах');
            e.extra = { ...e.extra, conflicts };
            throw e;
          }
          await push().catch((e2) => Promise.reject(gitError(e2, 'Не удалось отправить на GitHub')));
        }
        const sha = (await git(['rev-parse', 'HEAD'])).trim();
        return { sha, repo: await githubRepo() };
      } finally {
        publishing = false;
      }
    },

    // Картинка сохраняется в public/images сайта. Одинаковые файлы не дублируются.
    async 'POST /api/upload'({ query, buffer }) {
      if (!buffer.length) throw new HttpError(400, 'Пустой файл');
      if (buffer.length > MAX_UPLOAD) throw new HttpError(413, 'Файл больше 15 МБ');
      const ext = path.extname(String(query.name || '')).toLowerCase();
      if (!IMAGE_EXT.includes(ext)) throw new HttpError(400, 'Можно загружать только картинки: PNG, JPG, GIF, WebP, AVIF, SVG');
      const base =
        path
          .basename(String(query.name), path.extname(String(query.name)))
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'image';
      const dir = path.join(publicDir, 'images');
      await fs.mkdir(dir, { recursive: true });
      const hash = hashOf(buffer);
      for (let i = 0; ; i++) {
        const name = `${base}${i ? `-${i}` : ''}${ext}`;
        const file = path.join(dir, name);
        const old = await fs.readFile(file).catch(() => null);
        if (old && hashOf(old) !== hash) continue;
        if (!old) await fs.writeFile(file, buffer);
        return { url: `images/${name}` };
      }
    },
  };

  // Файлы из public сайта — для картинок в превью.
  async function servePublic(pathname, res) {
    const rel = decodeURIComponent(pathname.slice('/site-public/'.length));
    const file = path.resolve(publicDir, rel);
    if (!file.startsWith(path.resolve(publicDir) + path.sep)) throw new HttpError(403, 'Нет доступа');
    const data = await fs.readFile(file).catch(() => null);
    if (!data) throw new HttpError(404, 'Файл не найден');
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(data);
  }

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_UPLOAD + 1024) reject(new HttpError(413, 'Слишком большой запрос'));
        else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  const sendJson = (res, status, data) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
  };

  return {
    name: 'wiki-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const isApi = url.pathname.startsWith('/api/');
        if (!isApi && !url.pathname.startsWith('/site-public/')) return next();
        try {
          if (!isApi) return await servePublic(url.pathname, res);
          // Без этого заголовка запрос мог прийти со стороннего сайта — такие не принимаем.
          if (req.headers['x-wiki-editor'] !== '1') throw new HttpError(403, 'Запрос не от редактора');
          const handler = routes[`${req.method} ${url.pathname}`];
          if (!handler) throw new HttpError(404, 'Неизвестный запрос');
          const buffer = req.method === 'GET' || req.method === 'DELETE' ? Buffer.alloc(0) : await readBody(req);
          const isJson = (req.headers['content-type'] || '').startsWith('application/json');
          const body = isJson && buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
          sendJson(res, 200, (await handler({ query: Object.fromEntries(url.searchParams), body, buffer })) ?? { ok: true });
        } catch (e) {
          if (!e.status) server.config.logger.error(`[wiki-api] ${e.stack || e}`);
          sendJson(res, e.status || 500, { error: e.message, ...e.extra });
        }
      });

      startupSync = syncOnStart(server.config.logger);

      // Правки из других программ (VS Code, Блокнот) — сообщаем редактору, чтобы он перечитал файлы.
      server.watcher.add([contentDir, configFile]);
      let timer;
      const onFs = (file) => {
        const abs = path.resolve(file).toLowerCase();
        const inContent = abs.startsWith(contentDir.toLowerCase() + path.sep) && abs.endsWith('.md');
        if (!inContent && abs !== configFile.toLowerCase()) return;
        const own = ownWrites.get(abs);
        if (own && Date.now() - own < 1500) return;
        clearTimeout(timer);
        timer = setTimeout(() => server.ws.send({ type: 'custom', event: 'wiki:changed' }), 200);
      };
      server.watcher.on('add', onFs).on('change', onFs).on('unlink', onFs);
    },
  };
}
