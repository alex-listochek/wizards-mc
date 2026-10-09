import { useEffect, useMemo, useState } from 'react';
import { toast } from '../lib/util.js';
import { buildSections, saveConfig } from '../store.js';
import Icon from './Icons.jsx';

const KEYS = ['name', 'tagline', 'description', 'siteUrl', 'addresses', 'helpArticle', 'startArticle', 'links'];

function fromConfig(server) {
  return {
    name: server.name ?? '',
    tagline: server.tagline ?? '',
    description: server.description ?? '',
    siteUrl: server.siteUrl ?? '',
    addresses: (server.addresses ?? []).map((a) => ({ edition: '', address: '', port: '', versions: '', ...a })),
    helpArticle: server.helpArticle ?? '',
    startArticle: server.startArticle ?? '',
    links: (server.links ?? []).map((l) => ({ label: '', url: '', ...l })),
  };
}

// Пустой порт не пишем — у Java-адреса его обычно нет.
function toConfig(v) {
  const out = { ...v };
  out.addresses = v.addresses
    .filter((a) => a.address.trim())
    .map(({ edition, address, port, versions, ...rest }) => ({
      edition: edition.trim(),
      address: address.trim(),
      ...(String(port ?? '').trim() ? { port: String(port).trim() } : {}),
      versions: versions.trim(),
      ...rest,
    }));
  out.links = v.links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ ...l, label: l.label.trim(), url: l.url.trim() }));
  for (const k of ['name', 'tagline', 'description', 'siteUrl']) out[k] = v[k].trim();
  return out;
}

function ListEditor({ items, onChange, render, empty, addLabel, blank }) {
  const set = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="list-editor">
      {items.map((it, i) => (
        <div className="list-row" key={i}>
          {render(it, (patch) => set(i, patch))}
          <div className="list-row-actions">
            <button className="icon-btn small" onClick={() => move(i, -1)} disabled={i === 0} title="Выше">
              <Icon name="arrowUp" size={14} />
            </button>
            <button className="icon-btn small" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Ниже">
              <Icon name="arrowDown" size={14} />
            </button>
            <button className="icon-btn small" onClick={() => onChange(items.filter((_, j) => j !== i))} title="Убрать">
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      ))}
      {!items.length && <div className="muted small">{empty}</div>}
      <button className="btn small" onClick={() => onChange([...items, { ...blank }])}>
        <Icon name="plus" size={14} /> {addLabel}
      </button>
    </div>
  );
}

function ArticleSelect({ value, onChange, sections }) {
  const known = sections.some((s) => s.articles.some((a) => `/${a.key}` === value));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— не показывать —</option>
      {!known && value && <option value={value}>{value} (статьи нет)</option>}
      {sections
        .filter((s) => s.articles.length)
        .map((s) => (
          <optgroup key={s.id} label={`${s.icon} ${s.title}`}>
            {s.articles.map((a) => (
              <option key={a.key} value={`/${a.key}`}>
                {a.title}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  );
}

/** Главная страница и общие настройки сайта: название, адреса сервера, ссылки сообщества. */
export default function SitePage({ state }) {
  const initial = useMemo(() => fromConfig(state.config.server ?? {}), [state.config]);
  const sections = useMemo(() => buildSections(state), [state]);
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(toConfig(v)) !== JSON.stringify(toConfig(initial));

  useEffect(() => {
    if (!dirty) setV(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    document.title = 'Главная страница — редактор';
  }, []);

  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target ? e.target.value : e }));

  const save = async () => {
    if (!v.name.trim()) return toast('Введите название сервера', 'error');
    setBusy(true);
    try {
      const out = toConfig(v);
      await saveConfig({ server: Object.fromEntries(KEYS.map((k) => [k, out[k]])) });
      toast('Настройки сохранены', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-wrap narrow">
      <header className="page-head">
        <div>
          <h1>Главная страница</h1>
          <p className="muted">
            Название, адреса сервера и ссылки сообщества. Хранятся в <code>src/config.js</code>.
          </p>
        </div>
        <div className="inline">
          {dirty && (
            <button className="btn" onClick={() => setV(initial)}>
              Отменить
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={!dirty || busy}>
            <Icon name="save" /> {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </header>

      <section className="panel form">
        <h2>Шапка главной</h2>
        <label className="field">
          <span className="field-label">Название сервера</span>
          <input value={v.name} onChange={set('name')} />
          <span className="field-hint">Крупно на главной, в шапке сайта и в заголовке вкладки</span>
        </label>
        <label className="field">
          <span className="field-label">Подзаголовок</span>
          <input value={v.tagline} onChange={set('tagline')} />
        </label>
        <label className="field">
          <span className="field-label">Статья для новичков</span>
          <ArticleSelect value={v.startArticle} onChange={set('startArticle')} sections={sections} />
          <span className="field-hint">Ссылка «Впервые на сервере? Первые шаги →» на главной</span>
        </label>
      </section>

      <section className="panel form">
        <h2>Адреса для входа</h2>
        <p className="muted small">Первый адрес показывается в шапке сайта.</p>
        <ListEditor
          items={v.addresses}
          onChange={set('addresses')}
          addLabel="Добавить адрес"
          empty="Адресов нет — блок «Как зайти» на главной не покажется."
          blank={{ edition: '', address: '', port: '', versions: '' }}
          render={(a, upd) => (
            <div className="addr-grid">
              <input value={a.edition} onChange={(e) => upd({ edition: e.target.value })} placeholder="Java / Bedrock" />
              <input value={a.address} onChange={(e) => upd({ address: e.target.value })} placeholder="play.example.ru:25565" spellCheck={false} />
              <input value={a.port} onChange={(e) => upd({ port: e.target.value })} placeholder="порт" spellCheck={false} />
              <input value={a.versions} onChange={(e) => upd({ versions: e.target.value })} placeholder="1.21 – 1.21.4" />
            </div>
          )}
        />
        <label className="field">
          <span className="field-label">Статья «Не удаётся зайти?»</span>
          <ArticleSelect value={v.helpArticle} onChange={set('helpArticle')} sections={sections} />
        </label>
      </section>

      <section className="panel form">
        <h2>Ссылки сообщества</h2>
        <p className="muted small">Кнопки под поиском на главной.</p>
        <ListEditor
          items={v.links}
          onChange={set('links')}
          addLabel="Добавить ссылку"
          empty="Ссылок нет."
          blank={{ label: '', url: '' }}
          render={(l, upd) => (
            <div className="link-grid">
              <input value={l.label} onChange={(e) => upd({ label: e.target.value })} placeholder="Название кнопки" />
              <input value={l.url} onChange={(e) => upd({ url: e.target.value })} placeholder="https://t.me/…" spellCheck={false} />
            </div>
          )}
        />
      </section>

      <section className="panel form">
        <h2>Превью ссылки</h2>
        <label className="field">
          <span className="field-label">Описание</span>
          <textarea rows={2} value={v.description} onChange={set('description')} />
          <span className="field-hint">Текст под заголовком, когда ссылку на сайт присылают в Telegram, VK или Discord</span>
        </label>
        <label className="field">
          <span className="field-label">Адрес сайта после публикации</span>
          <input value={v.siteUrl} onChange={set('siteUrl')} placeholder="https://wiki.example.ru" spellCheck={false} />
          <span className="field-hint">Без него Telegram не покажет картинку в превью ссылки. Применится после пересборки сайта.</span>
        </label>
      </section>
    </div>
  );
}
