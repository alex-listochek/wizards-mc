import { useEffect, useState } from 'react';
import { pendingCount, publish, refreshStatus, usePublish } from '../lib/publish.js';
import { plural, toast } from '../lib/util.js';
import { saveAll, useStore } from '../store.js';
import Icon from './Icons.jsx';
import { Modal } from './Modal.jsx';

const KIND = { added: 'новый', modified: 'изменён', deleted: 'удалён', renamed: 'переименован' };
const ARTICLE_KIND = { added: 'новая статья', modified: 'изменена', deleted: 'удалена', renamed: 'перенесена' };

// Файл из git → понятная строка списка.
function describe(file, articles) {
  const m = file.path.match(/^src\/content\/([^/]+)\/([^/]+)\.md$/);
  if (m) {
    const key = `${m[1]}/${m[2]}`;
    return { icon: 'file', title: articles[key]?.title ?? key, hint: ARTICLE_KIND[file.kind], article: true };
  }
  if (file.path === 'src/config.js') return { icon: 'settings', title: 'Главная страница и разделы', hint: 'настройки' };
  if (file.path.startsWith('public/images/')) return { icon: 'image', title: file.path.slice('public/images/'.length), hint: `картинка, ${KIND[file.kind]}` };
  return { icon: 'file', title: file.path, hint: KIND[file.kind] };
}

function defaultMessage(items) {
  const titles = items.filter((i) => i.article).map((i) => i.title);
  if (!titles.length) return items.some((i) => i.icon === 'settings') ? 'Настройки сайта' : 'Обновление сайта';
  const head = titles.slice(0, 4).join(', ');
  return `Обновлено: ${head}${titles.length > 4 ? ` и ещё ${titles.length - 4}` : ''}`;
}

const RECENT = 15 * 60 * 1000;

function BuildProgress({ build }) {
  const site = build.repo?.siteUrl;
  const steps = {
    sending: ['spin', 'Отправляю изменения на GitHub…'],
    building: ['spin', 'GitHub собирает сайт — обычно 1–2 минуты. Окно можно закрыть, редактор сообщит, когда всё будет готово.'],
    done: ['ok', 'Сайт обновлён.'],
    failed: ['fail', 'Сборка сайта на GitHub не удалась — на сайте пока прежняя версия.'],
    unknown: ['ok', 'Изменения отправлены. Сайт обновится через 1–2 минуты.'],
  };
  const [kind, text] = steps[build.phase];
  return (
    <div className={`publish-progress ${kind}`}>
      <div className="publish-step">
        {kind === 'spin' ? <span className="spinner" /> : <Icon name={kind === 'ok' ? 'check' : 'alert'} />}
        <span>{text}</span>
      </div>
      {build.phase !== 'sending' && (
        <div className="publish-links">
          {site && (
            <a href={site} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} /> Открыть сайт
            </a>
          )}
          {build.repo && (
            <a href={build.runUrl ?? build.repo.actionsUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} /> Сборка на GitHub
            </a>
          )}
        </div>
      )}
      {build.phase === 'done' && (
        <p className="muted small">
          В Telegram изменения видны при следующем открытии приложения. Если оно было открыто, перезагрузите его: ⋮ → «Перезагрузить страницу».
        </p>
      )}
    </div>
  );
}

function PublishDialog({ unsaved, onClose }) {
  const store = useStore();
  const { status, error, build } = usePublish();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    refreshStatus();
  }, []);

  const drafts = Object.keys(store.drafts).filter((k) => store.articles[k]);
  const items = (status?.files ?? []).map((f) => ({ ...describe(f, store.articles), path: f.path }));
  const pending = pendingCount(status);
  const inProgress = build?.phase === 'sending' || build?.phase === 'building';
  const showBuild = build && (inProgress || Date.now() - (build.at ?? 0) < RECENT);
  const canPublish = status && pending > 0 && !inProgress;
  const fallback = defaultMessage(items);

  const submit = async (e) => {
    e?.preventDefault();
    if (!canPublish || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await publish(message.trim() || fallback);
      setMessage('');
    } catch (err) {
      setFailure({ message: err.message, details: err.data?.details });
    } finally {
      setBusy(false);
    }
  };

  const onSaveAll = async () => {
    try {
      const n = await saveAll();
      const left = drafts.length - n;
      if (n) toast(`Сохранено: ${n} ${plural(n, 'статья', 'статьи', 'статей')}`, 'success');
      // Статьи с конфликтом сами не сохраняются: нужно открыть их и выбрать версию.
      if (left > 0) toast(`${left} ${plural(left, 'статью', 'статьи', 'статей')} изменили в другой программе — откройте и выберите, какую версию оставить`, 'error');
      refreshStatus();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Modal
      title="Опубликовать на сайт"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {canPublish ? 'Отмена' : 'Закрыть'}
          </button>
          {canPublish && (
            <button className="btn primary" type="submit" form="publish-form" disabled={busy}>
              <Icon name="upload" /> {busy ? 'Публикую…' : 'Опубликовать'}
            </button>
          )}
        </>
      }
    >
      <div className="publish">
        {showBuild && <BuildProgress build={build} />}

        {error && <div className="form-error">{error}</div>}
        {!status && !error && <div className="empty-note">Проверяю изменения…</div>}

        {failure && (
          <div className="publish-failure">
            <div className="form-error">{failure.message}</div>
            {failure.details && (
              <details>
                <summary>Подробности</summary>
                <pre>{failure.details}</pre>
              </details>
            )}
          </div>
        )}

        {(drafts.length > 0 || unsaved) && !inProgress && (
          <div className="publish-warn">
            <Icon name="alert" />
            <div>
              {drafts.length > 0 && (
                <p>
                  Несохранённые правки в {drafts.length} {plural(drafts.length, 'статье', 'статьях', 'статьях')} не попадут на сайт.{' '}
                  <button className="link-btn" onClick={onSaveAll}>
                    Сохранить {drafts.length > 1 ? 'все' : ''}
                  </button>
                </p>
              )}
              {unsaved && <p>На этой странице есть несохранённые изменения — сначала нажмите «Сохранить».</p>}
            </div>
          </div>
        )}

        {status && !inProgress && pending === 0 && !showBuild && (
          <div className="empty-note">
            Всё уже опубликовано — на сайте последняя сохранённая версия.
            {status.repo && (
              <div>
                <a href={status.repo.siteUrl} target="_blank" rel="noreferrer">
                  Открыть сайт
                </a>
              </div>
            )}
          </div>
        )}

        {canPublish && (
          <form id="publish-form" className="form" onSubmit={submit}>
            {items.length > 0 && (
              <div className="field">
                <span className="field-label">Что уйдёт на сайт</span>
                <ul className="publish-list">
                  {items.map((it) => (
                    <li key={it.path} title={it.path}>
                      <Icon name={it.icon} size={15} />
                      <span className="publish-title">{it.title}</span>
                      <span className="muted small">{it.hint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!items.length && status.ahead > 0 && <p className="muted">Прошлая публикация не дошла до GitHub — отправлю её ещё раз.</p>}
            {items.length > 0 && (
              <label className="field">
                <span className="field-label">Что изменили</span>
                <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={fallback} autoFocus />
                <span className="field-hint">Необязательно. Видно в истории изменений на GitHub.</span>
              </label>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
}

/** Кнопка «Опубликовать»: отправляет сохранённые изменения на GitHub, а GitHub обновляет сайт и Telegram Mini App. */
export default function PublishButton({ unsaved = false }) {
  const store = useStore();
  const { status, build } = usePublish();
  const [open, setOpen] = useState(false);

  // После сохранений и правок файлов пересчитываем, что не опубликовано.
  useEffect(() => {
    const t = setTimeout(refreshStatus, 400);
    return () => clearTimeout(t);
  }, [store.articles, store.config]);

  const pending = pendingCount(status);
  const inProgress = build?.phase === 'sending' || build?.phase === 'building';

  return (
    <>
      <button
        className="btn publish-btn"
        onClick={() => setOpen(true)}
        title={pending ? `Не опубликовано изменений: ${pending}. Отправить их на сайт` : 'Всё опубликовано'}
      >
        {inProgress ? <span className="spinner" /> : <Icon name="upload" />}
        {inProgress ? 'Публикуется…' : 'Опубликовать'}
        {!inProgress && pending > 0 && <span className="badge">{pending}</span>}
      </button>
      {open && <PublishDialog unsaved={unsaved} onClose={() => setOpen(false)} />}
    </>
  );
}
