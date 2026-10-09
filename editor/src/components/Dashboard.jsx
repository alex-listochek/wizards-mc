import { useEffect, useMemo } from 'react';
import { findProblems, useLinkIndex } from '../lib/links.js';
import { editPath, formatAgo, go, plural, setJump, toast } from '../lib/util.js';
import { saveAll } from '../store.js';
import Icon from './Icons.jsx';

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
          <p className="muted">
            Правки сохраняются прямо в файлы сайта: <code>{state.siteRoot}</code>
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
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{articles.length}</span>
          <span className="stat-label">{plural(articles.length, 'статья', 'статьи', 'статей')}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{visibleSections}</span>
          <span className="stat-label">{plural(visibleSections, 'раздел', 'раздела', 'разделов')} на сайте</span>
        </div>
        <div className={`stat${drafts.length ? ' warn' : ''}`}>
          <span className="stat-value">{drafts.length}</span>
          <span className="stat-label">не сохранено</span>
        </div>
        <div className={`stat${problemCount ? ' danger' : ' ok'}`}>
          <span className="stat-value">{problemCount}</span>
          <span className="stat-label">{plural(problemCount, 'битая ссылка', 'битые ссылки', 'битых ссылок')}</span>
        </div>
      </div>

      <div className="dash-grid">
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

        <section className="panel help">
          <div className="panel-head">
            <h2>Как это работает</h2>
          </div>
          <ol>
            <li>
              Статьи — это файлы <code>src/content/&lt;раздел&gt;/&lt;статья&gt;.md</code>. Редактор правит их напрямую, превью собирается тем же кодом, что и сайт.
            </li>
            <li>
              Если сайт запущен (<code>npm run dev</code> в папке сайта), он обновится сам сразу после сохранения.
            </li>
            <li>
              Порядок статей меняется перетаскиванием в меню слева. Разделы и главная страница — внизу меню.
            </li>
            <li>
              Каждое сохранение откладывает прежнюю версию в историю, удалённые статьи попадают в корзину — их можно вернуть.
            </li>
            <li>
              Чтобы опубликовать изменения, соберите сайт (<code>npm run build</code>) и загрузите на хостинг, как обычно.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
