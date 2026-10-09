import { useEffect, useMemo, useRef, useState } from 'react';
import { SLUG_RE, plural, toSlug, toast } from '../lib/util.js';
import { buildSections, deleteSection, saveConfig } from '../store.js';
import Icon from './Icons.jsx';
import { confirmDialog } from './Modal.jsx';
import PublishButton from './Publish.jsx';

const EMOJI = ['🚀', '📜', '⌨️', '🧙', '🌍', '⚔️', '⚒️', '✨', '👑', '📄', '📚', '🗺️', '🏰', '💎', '🛡️', '🏹', '🧪', '🐉', '🎮', '🎁', '📦', '🔮', '⚙️', '❓', '💬', '🏆', '🌲', '⛏️', '🪄', '🧭', '📌', '🔥'];

function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="emoji-picker" ref={ref}>
      <button className="emoji-btn" onClick={() => setOpen((o) => !o)} title="Иконка раздела">
        {value || '📄'}
      </button>
      {open && (
        <div className="menu emoji-menu">
          <div className="emoji-grid">
            {EMOJI.map((e) => (
              <button key={e} onClick={() => (onChange(e), setOpen(false))}>
                {e}
              </button>
            ))}
          </div>
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Свой эмодзи" maxLength={8} />
        </div>
      )}
    </div>
  );
}

const toRows = (sections) =>
  sections.map((s) => ({
    id: s.id,
    title: s.configured ? s.title : '',
    icon: s.configured ? s.icon : '📄',
    description: s.description,
    configured: s.configured,
    count: s.articles.length,
    isNew: false,
  }));

const clean = (rows) => rows.filter((r) => r.configured).map(({ id, title, icon, description }) => ({ id, title, icon, description }));

/** Разделы меню: порядок, названия, иконки и описания для главной. Хранятся в src/config.js. */
export default function SectionsPage({ state }) {
  const sections = useMemo(() => buildSections(state), [state]);
  const initial = useMemo(() => toRows(sections), [sections]);
  const [rows, setRows] = useState(initial);
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(null);
  const [tried, setTried] = useState(false);

  const dirty = JSON.stringify(clean(rows)) !== JSON.stringify(clean(initial)) || removed.length > 0;

  // Файлы поменялись снаружи, а здесь правок нет — показываем свежие данные.
  useEffect(() => {
    if (!dirty) setRows(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    document.title = 'Разделы — редактор';
  }, []);

  const update = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (from, to) =>
    setRows((rs) => {
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      const [r] = next.splice(from, 1);
      next.splice(to, 0, r);
      return next;
    });

  const errors = rows.map((r, i) => {
    if (!r.configured) return null;
    if (!r.title.trim()) return 'Введите название';
    if (r.isNew) {
      if (!r.id) return 'Укажите папку';
      if (!SLUG_RE.test(r.id)) return 'Папка: только латинские буквы, цифры и дефис';
      if (rows.some((x, j) => j !== i && x.id === r.id)) return 'Такая папка уже есть';
    }
    return null;
  });

  const save = async () => {
    setTried(true);
    if (errors.some(Boolean)) return toast('Исправьте ошибки в разделах', 'error');
    setBusy(true);
    try {
      await saveConfig({ sections: clean(rows).map((r) => ({ ...r, title: r.title.trim(), description: r.description.trim() })) });
      for (const id of removed) await deleteSection(id);
      setRemoved([]);
      setTried(false);
      toast('Разделы сохранены', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (i) => {
    const r = rows[i];
    if (r.count) return;
    if (!r.isNew) {
      const ok = await confirmDialog({
        title: 'Удалить раздел?',
        message: `Раздел «${r.title || r.id}» пуст. Он исчезнет из настроек, пустая папка src/content/${r.id} будет удалена. Изменение запишется, когда вы нажмёте «Сохранить».`,
        confirmText: 'Удалить',
        danger: true,
      });
      if (!ok) return;
      setRemoved((x) => [...x, r.id]);
    }
    setRows((rs) => rs.filter((_, j) => j !== i));
  };

  const add = () => setRows((rs) => [...rs, { id: '', title: '', icon: '📄', description: '', configured: true, count: 0, isNew: true, autoId: true }]);

  return (
    <div className="page-wrap">
      <header className="page-head sticky">
        <div>
          <h1>Разделы</h1>
          <p className="muted">
            Порядок, названия и иконки разделов в меню сайта и карточки на главной. Хранятся в <code>src/config.js</code>.
          </p>
        </div>
        <div className="inline">
          {dirty && (
            <button className="btn" onClick={() => (setRows(initial), setRemoved([]), setTried(false))}>
              Отменить
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={!dirty || busy}>
            <Icon name="save" /> {busy ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <PublishButton unsaved={dirty} />
        </div>
      </header>

      <div className="section-rows">
        {rows.map((r, i) => (
          <div
            key={r.isNew ? `new-${i}` : r.id}
            className={`section-row${r.configured ? '' : ' unconfigured'}${drag === i ? ' dragging' : ''}`}
            onDragOver={(e) => {
              if (drag === null) return;
              e.preventDefault();
              if (drag !== i) {
                move(drag, i);
                setDrag(i);
              }
            }}
            onDragEnd={() => setDrag(null)}
          >
            <div className="row-order">
              <span
                className="drag-handle"
                title="Перетащите, чтобы поменять порядок"
                draggable
                onDragStart={(e) => {
                  setDrag(i);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', r.id);
                  e.dataTransfer.setDragImage(e.currentTarget.closest('.section-row'), 24, 24);
                }}
              >
                <Icon name="grip" />
              </span>
              <button className="icon-btn small" onClick={() => move(i, i - 1)} disabled={i === 0} title="Выше">
                <Icon name="arrowUp" size={14} />
              </button>
              <button className="icon-btn small" onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} title="Ниже">
                <Icon name="arrowDown" size={14} />
              </button>
            </div>

            {r.configured ? (
              <>
                <EmojiPicker value={r.icon} onChange={(icon) => update(i, { icon })} />
                <div className="row-fields">
                  <div className="row-line">
                    <input
                      className="row-title"
                      value={r.title}
                      placeholder="Название раздела"
                      onChange={(e) => update(i, { title: e.target.value, ...(r.autoId ? { id: toSlug(e.target.value) } : {}) })}
                    />
                    {r.isNew ? (
                      <label className="row-id">
                        <span>папка</span>
                        <input value={r.id} onChange={(e) => update(i, { id: e.target.value.toLowerCase(), autoId: false })} placeholder="papka" spellCheck={false} />
                      </label>
                    ) : (
                      <span className="row-id-static" title="Имя папки в src/content — менять нельзя, иначе сломаются ссылки">
                        src/content/{r.id}
                      </span>
                    )}
                  </div>
                  <input className="row-desc" value={r.description} placeholder="Описание на карточке главной страницы" onChange={(e) => update(i, { description: e.target.value })} />
                  {tried && errors[i] && <div className="form-error">{errors[i]}</div>}
                </div>
              </>
            ) : (
              <div className="row-fields">
                <div className="row-line">
                  <span className="row-title static">📄 {r.id}</span>
                  <span className="row-id-static">src/content/{r.id}</span>
                </div>
                <div className="muted small">
                  Папки нет в настройках: на сайте раздел будет в конце меню под именем «{r.id}».{' '}
                  <button className="link-btn" onClick={() => update(i, { configured: true, title: r.id })}>
                    Настроить
                  </button>
                </div>
              </div>
            )}

            <div className="row-meta">
              <span className="muted small">
                {r.count} {plural(r.count, 'статья', 'статьи', 'статей')}
              </span>
              <button className="icon-btn small" onClick={() => remove(i)} disabled={r.count > 0} title={r.count ? 'Сначала перенесите или удалите статьи раздела' : 'Удалить раздел'}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn add-row" onClick={add}>
        <Icon name="plus" /> Добавить раздел
      </button>
      <p className="muted small">Раздел без статей на сайте не показывается — после сохранения добавьте в него статью кнопкой «+» в меню слева.</p>
    </div>
  );
}
