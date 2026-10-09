import { useState } from 'react';
import { countBacklinks } from '../lib/links.js';
import { SLUG_RE, editPath, go, plural, toSlug, toast } from '../lib/util.js';
import { buildSections, createArticle, moveArticle, useStore } from '../store.js';
import { Modal } from './Modal.jsx';

function SlugField({ section, value, onChange, hint }) {
  return (
    <label className="field">
      <span className="field-label">Адрес</span>
      <div className="slug-input">
        <span className="slug-prefix">#/{section}/</span>
        <input value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} spellCheck={false} placeholder="imya-stati" />
      </div>
      <span className="field-hint">{hint ?? 'Имя файла и ссылка на статью. Латинские буквы, цифры и дефис.'}</span>
    </label>
  );
}

function slugError(slug, exists) {
  if (!slug) return 'Укажите адрес статьи';
  if (!SLUG_RE.test(slug)) return 'В адресе можно использовать только латинские буквы, цифры и дефис';
  if (exists) return 'Статья с таким адресом в этом разделе уже есть';
  return null;
}

export function NewArticleDialog({ section: initial, onClose }) {
  const state = useStore();
  const sections = buildSections(state);
  const [section, setSection] = useState(initial ?? sections[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const effSlug = slug ?? toSlug(title);
  const error = !title.trim() ? 'Введите заголовок' : slugError(effSlug, state.articles[`${section}/${effSlug}`]);

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (error || busy) return;
    setBusy(true);
    try {
      const key = await createArticle({ section, slug: effSlug, title: title.trim(), description: description.trim() });
      onClose();
      go(editPath(key));
      toast('Статья создана', 'success');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  if (!sections.length) {
    return (
      <Modal title="Новая статья" onClose={onClose} footer={<button className="btn primary" onClick={() => (onClose(), go('/sections'))}>Перейти к разделам</button>}>
        <p>Сначала создайте раздел — статьи лежат в разделах.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Новая статья"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" type="submit" form="new-article" disabled={busy}>
            Создать
          </button>
        </>
      }
    >
      <form id="new-article" className="form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Раздел</span>
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Заголовок</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Правила торговли" autoFocus />
        </label>
        <SlugField section={section} value={effSlug} onChange={setSlug} />
        <label className="field">
          <span className="field-label">Описание</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Одна строка под заголовком — необязательно" />
        </label>
        {tried && error && <div className="form-error">{error}</div>}
      </form>
    </Modal>
  );
}

export function MoveDialog({ article, onClose }) {
  const state = useStore();
  const sections = buildSections(state);
  const [section, setSection] = useState(article.section);
  const [slug, setSlug] = useState(article.slug);
  const [updateLinks, setUpdateLinks] = useState(true);
  const [busy, setBusy] = useState(false);
  const backlinks = countBacklinks(article.key, state);
  const same = section === article.section && slug === article.slug;
  const error = same ? null : slugError(slug, state.articles[`${section}/${slug}`]);

  const submit = async (e) => {
    e.preventDefault();
    if (same) return onClose();
    if (error || busy) return;
    setBusy(true);
    try {
      const res = await moveArticle(article.key, { section, slug }, updateLinks);
      onClose();
      go(editPath(res.key));
      const n = res.changed.filter((c) => c !== res.key).length;
      toast(n ? `Статья перенесена, ссылки обновлены в ${n} ${plural(n, 'файле', 'файлах', 'файлах')}` : 'Статья перенесена', 'success');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Переименовать или перенести"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" type="submit" form="move-article" disabled={busy || Boolean(error)}>
            Сохранить
          </button>
        </>
      }
    >
      <form id="move-article" className="form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Раздел</span>
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.title}
              </option>
            ))}
          </select>
        </label>
        <SlugField section={section} value={slug} onChange={setSlug} />
        <label className="check">
          <input type="checkbox" checked={updateLinks} onChange={(e) => setUpdateLinks(e.target.checked)} />
          <span>
            Обновить ссылки на статью
            {backlinks > 0 ? ` (${backlinks} ${plural(backlinks, 'статья ссылается', 'статьи ссылаются', 'статей ссылаются')})` : ' — сейчас на неё никто не ссылается'}
          </span>
        </label>
        {error && <div className="form-error">{error}</div>}
        <p className="muted small">Несохранённые правки будут сохранены перед переносом. Старый адрес перестанет открываться на сайте.</p>
      </form>
    </Modal>
  );
}
