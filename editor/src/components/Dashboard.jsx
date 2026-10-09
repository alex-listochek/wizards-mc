import { useEffect, useMemo, useState } from 'react';
import { findProblems, useLinkIndex } from '../lib/links.js';
import { pendingCount, usePublish } from '../lib/publish.js';
import { editPath, formatAgo, go, plural, setJump, toast } from '../lib/util.js';
import { saveAll } from '../store.js';
import Icon from './Icons.jsx';
import PublishButton, { PublishDialog } from './Publish.jsx';

export default function Dashboard({ state, onNew, onSearch, siteUrl }) {
  const index = useLinkIndex(state);
  const articles = Object.values(state.articles);
  const drafts = Object.keys(state.drafts).filter((k) => state.articles[k]);
  const name = state.config.server?.name || 'База знаний';

  useEffect(() => {
    document.title = `Редактор — ${name}`;
  }, [name]);

  const problems = useMemo(() => {
    const out = [];
    for (const [key, entry] of index.byKey) {
      const cur = state.drafts[key] ?? state.articles[key];
      const list = findProblems(cur.body, key, index);
      if (list.length) out.push({ key, title: entry.title, icon: entry.section.icon, list });
    }
    return out;
  }, [index, state.drafts, state.articles]);
  const problemCount = problems.reduce((n, p) => n + p.list.length, 0);

  const recent = [...articles].sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  const publish = usePublish();
  const pending = pendingCount(publish.status);
  const [publishOpen, setPublishOpen] = useState(false);
  const visibleSections = index.sections.filter((s) => s.articles.length).length;

  const open = (key, p) => {
    if (p) setJump(key, p.from, p.to);
    go(editPath(key));
  };

  return (
    <div className="page-wrap dashboard">
      <header className="page-head">
        <div>
          <div className="eyebrow">Редактор базы знаний</div>
          <h1>{name}</h1>
          <p className="muted" title={`Папка сайта: ${state.siteRoot}`}>
            Пишите и сохраняйте здесь, а кнопка «Опубликовать» отправит изменения на сайт и в Telegram.
          </p>
        </div>
        <div className="inline">
          <button className="btn" onClick={onSearch}>
            <Icon name="search" /> Поиск <kbd>Ctrl P</kbd>
          </button>
          <a className="btn" href={siteUrl} target="_blank" rel="noreferrer">
            <Icon name="external" /> Открыть сайт
          </a>
          <button className="btn primary" onClick={() => onNew()}>
            <Icon name="plus" /> Новая статья
          </button>
          <PublishButton />
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{articles.length}</span>
          <span className="stat-label">
            {plural(articles.length, 'статья', 'статьи', 'статей')} в {visibleSections} {plural(visibleSections, 'разделе', 'разделах', 'разделах')}
          </span>
        </div>
        <div className={`stat${drafts.length ? ' warn' : ''}`}>
          <span className="stat-value">{drafts.length}</span>
          <span className="stat-label">не сохранено</span>
        </div>
        <button
          className={`stat stat-btn${pending ? ' info' : publish.status ? ' ok' : ''}`}
          onClick={() => setPublishOpen(true)}
          title={pending ? 'Сохранённые изменения, которых ещё нет на сайте. Нажмите, чтобы опубликовать' : 'Всё сохранённое уже на сайте'}
        >
          <span className="stat-value">{publish.status ? pending : '—'}</span>
          <span className="stat-label">{pending ? 'не опубликовано' : 'всё опубликовано'}</span>
        </button>
        <div className={`stat${problemCount ? ' danger' : ' ok'}`}>
          <span className="stat-value">{problemCount}</span>
          <span className="stat-label">{plural(problemCount, 'битая ссылка', 'битые ссылки', 'битых ссылок')}</span>
        </div>
      </div>

      {/* Две независимые колонки: короткий блок слева не оставляет пустоты под собой, как было бы в общей сетке. */}
      <div className="dash-grid">
        <div className="dash-col">
          {drafts.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Несохранённые правки</h2>
                <button
                  className="btn small primary"
                  onClick={async () => {
                    try {
                      const n = await saveAll();
                      toast(`Сохранено: ${n}`, 'success');
                    } catch (e) {
                      toast(e.message, 'error');
                    }
                  }}
                >
                  Сохранить все
                </button>
              </div>
              <ul className="plain-list">
                {drafts.map((k) => (
                  <li key={k}>
                    <a href={`#${editPath(k)}`}>{index.byKey.get(k)?.title ?? k}</a>
                    <span className="muted small">{k}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {problems.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2>Битые ссылки</h2>
                <span className="muted small">ведут на несуществующую статью или заголовок</span>
              </div>
              <ul className="plain-list problems-list">
                {problems.map((p) => (
                  <li key={p.key}>
                    <a href={`#${editPath(p.key)}`}>
                      {p.icon} {p.title}
                    </a>
                    {p.list.map((x) => (
                      <button key={x.from} className="problem-line" onClick={() => open(p.key, x)}>
                        <code>{x.href}</code>
                        <span className="muted small">{x.message}</span>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2>Недавно изменённые</h2>
            </div>
            <ul className="plain-list">
              {recent.map((a) => (
                <li key={a.key}>
                  <a href={`#${editPath(a.key)}`}>
                    {index.byKey.get(a.key)?.section.icon} {a.title}
                  </a>
                  <span className="muted small">{formatAgo(a.mtime)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="dash-col">
          <section className="panel help">
            <div className="panel-head">
              <h2>Как это работает</h2>
            </div>
            <ol>
              <li>
                <b>Пишите.</b> Превью справа показывает статью точно как на сайте. Несохранённый текст не пропадёт, даже если закрыть вкладку.
              </li>
              <li>
                <b>Сохраняйте</b> — кнопкой «Сохранить» или Ctrl+S. Правки записываются в файлы сайта на этом компьютере.
              </li>
              <li>
                <b>Публикуйте.</b> «Опубликовать» отправит сохранённое на сайт и в Telegram — через 1–2 минуты всё обновится. Статьи, которые ещё не на сайте,
                отмечены в меню кружком.
              </li>
              <li>
                Порядок статей меняется перетаскиванием в меню слева. Разделы и главная страница — внизу меню.
              </li>
              <li>Каждое сохранение кладёт прежнюю версию в «Историю», удалённые статьи — в «Корзину»: их можно вернуть.</li>
            </ol>
          </section>
        </div>
      </div>
      {publishOpen && <PublishDialog onClose={() => setPublishOpen(false)} />}
    </div>
  );
}
