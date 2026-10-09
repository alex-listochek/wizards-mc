import { useEffect, useRef, useState } from 'react';
import { editPath, plural, toast, usePref } from '../lib/util.js';
import { buildSections, reorder, saveAll } from '../store.js';
import Icon from './Icons.jsx';

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

function SiteStatus({ siteUrl, onChange }) {
  const [online, setOnline] = useState(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(siteUrl);

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch(siteUrl, { mode: 'no-cors', cache: 'no-store' }).then(
        () => alive && setOnline(true),
        () => alive && setOnline(false),
      );
    check();
    const t = setInterval(check, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [siteUrl]);

  if (editing) {
    return (
      <form
        className="site-status editing"
        onSubmit={(e) => {
          e.preventDefault();
          onChange(value.trim() || 'http://localhost:5173/');
          setEditing(false);
        }}
      >
        <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus spellCheck={false} onBlur={() => setEditing(false)} />
      </form>
    );
  }

  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return (
    <div className="site-status">
      <span className={`dot ${online ? 'on' : online === false ? 'off' : ''}`} />
      <a
        href={siteUrl}
        target="_blank"
        rel="noreferrer"
        title={online === false ? 'Сайт не запущен. В папке сайта выполните: npm run dev' : 'Открыть сайт в новой вкладке'}
      >
        {online === false ? 'Сайт не запущен' : 'Сайт'} · {host}
      </a>
      <button className="icon-btn small" title="Изменить адрес сайта" onClick={() => (setValue(siteUrl), setEditing(true))}>
        <Icon name="settings" size={13} />
      </button>
    </div>
  );
}

export default function Sidebar({ state, route, onNew, onSearch, siteUrl, onSiteUrl, theme, onTheme }) {
  const sections = buildSections(state);
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = usePref('collapsed', []);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const nav = useRef(null);
  const f = norm(filter.trim());
  const drafts = Object.keys(state.drafts).filter((k) => state.articles[k]);
  const name = state.config.server?.name || 'База знаний';

  // Открытая статья всегда видна в меню.
  useEffect(() => {
    nav.current?.querySelector('.side-link.active')?.scrollIntoView({ block: 'nearest' });
  }, [route.key]);

  const toggle = (id) => setCollapsed(collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]);

  const drop = async (s) => {
    if (!drag || !over || drag.key === over.key) return;
    const keys = s.articles.map((a) => a.key).filter((k) => k !== drag.key);
    const at = keys.indexOf(over.key) + (over.after ? 1 : 0);
    keys.splice(at, 0, drag.key);
    if (keys.join() === s.articles.map((a) => a.key).join()) return;
    try {
      await reorder(s.id, keys);
      toast('Порядок статей сохранён', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const onSaveAll = async () => {
    try {
      const n = await saveAll();
      toast(`Сохранено: ${n} ${plural(n, 'статья', 'статьи', 'статей')}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <aside className="sidebar">
      <div className="side-brand">
        <img src="/site-public/logo.jpg" alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <div>
          <div className="side-name">{name}</div>
          <div className="side-sub">Редактор базы знаний</div>
        </div>
        <button className="icon-btn" onClick={onTheme} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>

      <div className="side-actions">
        <button className="btn primary grow" onClick={() => onNew()} title="Новая статья (Alt+N)">
          <Icon name="plus" /> Новая статья
        </button>
        <button className="btn icon-only" onClick={onSearch} title="Поиск по всем статьям (Ctrl+P)">
          <Icon name="search" />
        </button>
      </div>

      <div className="side-filter">
        <Icon name="search" size={14} />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Фильтр по названию" />
        {filter && (
          <button className="icon-btn small" onClick={() => setFilter('')} aria-label="Очистить">
            <Icon name="x" size={13} />
          </button>
        )}
      </div>

      <nav className="side-nav" ref={nav}>
        {!f && (
          <a className={`side-link top${route.page === 'home' ? ' active' : ''}`} href="#/">
            <Icon name="home" size={15} /> Обзор
          </a>
        )}
        {sections.map((s) => {
          const items = f ? s.articles.filter((a) => norm(`${a.title} ${a.slug}`).includes(f)) : s.articles;
          if (f && !items.length) return null;
          const closed = !f && collapsed.includes(s.id);
          return (
            <div className="side-section" key={s.id}>
              <div className="side-section-head">
                <button className="side-section-toggle" onClick={() => toggle(s.id)} aria-expanded={!closed}>
                  <Icon name={closed ? 'chevronRight' : 'chevronDown'} size={13} />
                  <span className="side-icon">{s.icon}</span>
                  <span className="side-section-title">{s.title}</span>
                  {!s.configured && (
                    <span className="badge" title="Раздела нет в настройках — на сайте он появится в конце меню под именем папки">
                      ?
                    </span>
                  )}
                </button>
                <button className="icon-btn small" title={`Новая статья в разделе «${s.title}»`} onClick={() => onNew(s.id)}>
                  <Icon name="plus" size={14} />
                </button>
              </div>
              {!closed && (
                <ul>
                  {items.map((a) => {
                    const dirty = Boolean(state.drafts[a.key]);
                    const cls = [
                      'side-link',
                      route.key === a.key && 'active',
                      drag?.key === a.key && 'dragging',
                      over?.key === a.key && drag?.key !== a.key && (over.after ? 'drop-after' : 'drop-before'),
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <li
                        key={a.key}
                        draggable={!f}
                        onDragStart={(e) => {
                          setDrag({ section: s.id, key: a.key });
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', a.key);
                        }}
                        onDragOver={(e) => {
                          if (drag?.section !== s.id) return;
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          const after = e.clientY > r.top + r.height / 2;
                          if (over?.key !== a.key || over.after !== after) setOver({ key: a.key, after });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          drop(s);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                      >
                        <a className={cls} href={`#${editPath(a.key)}`} title={`src/content/${a.key}.md`} draggable={false}>
                          <span className="side-link-text">{a.title}</span>
                          {dirty && <span className="dirty-dot" title="Есть несохранённые правки" />}
                        </a>
                      </li>
                    );
                  })}
                  {!items.length && <li className="side-empty">Пусто — на сайте раздел не виден</li>}
                </ul>
              )}
            </div>
          );
        })}
        {f && !sections.some((s) => s.articles.some((a) => norm(`${a.title} ${a.slug}`).includes(f))) && (
          <div className="side-empty">
            Не нашлось.{' '}
            <button className="link-btn" onClick={onSearch}>
              Искать в тексте статей
            </button>
          </div>
        )}
      </nav>

      <div className="side-foot">
        {drafts.length > 0 && (
          <button className="btn small save-all" onClick={onSaveAll}>
            <Icon name="save" size={14} /> Сохранить все ({drafts.length})
          </button>
        )}
        <a className={`side-link${route.page === 'sections' ? ' active' : ''}`} href="#/sections">
          <Icon name="layers" size={15} /> Разделы
        </a>
        <a className={`side-link${route.page === 'site' ? ' active' : ''}`} href="#/site">
          <Icon name="settings" size={15} /> Главная страница
        </a>
        <a className={`side-link${route.page === 'trash' ? ' active' : ''}`} href="#/trash">
          <Icon name="trash" size={15} /> Корзина
        </a>
        <SiteStatus siteUrl={siteUrl} onChange={onSiteUrl} />
      </div>
    </aside>
  );
}
