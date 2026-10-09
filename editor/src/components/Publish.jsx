import { useEffect, useState } from 'react';
import { isPublishing, pendingCount, publish, refreshStatus, usePublish } from '../lib/publish.js';
import { plural } from '../lib/util.js';
import { isConflict, saveAll, useStore } from '../store.js';
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


/** Окно публикации. Несохранённые правки статей сохраняются перед отправкой. */
export function PublishDialog({ unsaved, onClose }) {
  const store = useStore();
  const { status, error, build } = usePublish();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(null); // 'saving' | 'publishing'
  const [failure, setFailure] = useState(null);

  useEffect(() => {
    refreshStatus();
  }, []);

  const drafts = Object.keys(store.drafts).filter((k) => store.articles[k]);
  // Статьи с конфликтом сами не сохраняются: нужно открыть их и выбрать, какую версию оставить.
  const savable = drafts.filter((k) => !isConflict(k));
  const conflicts = drafts.length - savable.length;

  const items = (status?.files ?? []).map((f) => ({ ...describe(f, store.articles), path: f.path }));
  for (const k of savable) {
    const path = `src/content/${k}.md`;
    const it = items.find((i) => i.path === path);
    if (it) it.hint = `${it.hint}, сохранится`;
    else items.push({ icon: 'file', title: store.articles[k].title, hint: 'сохранится', article: true, path });
  }

  // Сначала статьи, потом настройки и картинки; служебные файлы (код сайта и редактора) — одной строкой в конце.
  const technical = items.filter((i) => !i.article && i.icon === 'file');
  const visible = [...items.filter((i) => i.article), ...items.filter((i) => !i.article && i.icon !== 'file')];

  const pending = pendingCount(status);
  const inProgress = isPublishing(build);
  const showBuild = build && (inProgress || Date.now() - (build.at ?? 0) < RECENT);
  const canPublish = Boolean(status) && !inProgress && (pending > 0 || savable.length > 0);
  const fallback = defaultMessage(items);

  const submit = async (e) => {
    e?.preventDefault();
    if (!canPublish || busy) return;
    setFailure(null);
    try {
      if (savable.length) {
        setBusy('saving');
        await saveAll();
      }
      setBusy('publishing');
      await publish(message.trim() || fallback);
      setMessage('');
    } catch (err) {
      setFailure({ message: err.message, details: err.data?.details });
    } finally {
      setBusy(null);
    }
  };

  const action = savable.length ? 'Сохранить и опубликовать' : 'Опубликовать';

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
            <button className="btn primary" type="submit" form="publish-form" disabled={Boolean(busy)}>
              <Icon name="upload" /> {busy === 'saving' ? 'Сохраняю…' : busy === 'publishing' ? 'Публикую…' : action}
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

        {(conflicts > 0 || unsaved) && !inProgress && (
          <div className="publish-warn">
            <Icon name="alert" />
            <div>
              {conflicts > 0 && (
                <p>
                  {conflicts} {plural(conflicts, 'статью', 'статьи', 'статей')} изменили в другой программе, пока здесь были правки. Откройте{' '}
                  {plural(conflicts, 'её', 'их', 'их')} и выберите, какую версию оставить, — иначе правки не попадут на сайт.
                </p>
              )}
              {unsaved && <p>На этой странице есть несохранённые изменения — сначала нажмите «Сохранить».</p>}
            </div>
          </div>
        )}

        {status && !canPublish && !inProgress && !showBuild && (
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
                  {visible.map((it) => (
                    <li key={it.path} title={it.path}>
                      <Icon name={it.icon} size={15} />
                      <span className="publish-title">{it.title}</span>
                      <span className="muted small">{it.hint}</span>
                    </li>
                  ))}
                  {technical.length > 0 && (
                    <li title={technical.map((t) => t.path).join('\n')}>
                      <Icon name="settings" size={15} />
                      <span className="publish-title">Служебные файлы сайта и редактора</span>
                      <span className="muted small">{technical.length}</span>
                    </li>
                  )}
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
  const { status, build } = usePublish();
  const [open, setOpen] = useState(false);

  const pending = pendingCount(status);
  const inProgress = isPublishing(build);

  return (
    <>
      <button
        className="btn publish-btn"
        onClick={() => setOpen(true)}
        title={pending ? `Не опубликовано изменений: ${pending}. Отправить их на сайт` : 'Опубликовать на сайт'}
      >
        {inProgress ? <span className="spinner" /> : <Icon name="upload" />}
        <span className="btn-label">{inProgress ? 'Публикуется…' : 'Опубликовать'}</span>
        {!inProgress && pending > 0 && <span className="badge">{pending}</span>}
      </button>
      {open && <PublishDialog unsaved={unsaved} onClose={() => setOpen(false)} />}
    </>
  );
}
