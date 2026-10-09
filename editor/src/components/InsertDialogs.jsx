import { toPlain } from '@site/lib/markdown.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { plural, toSlug, toast } from '../lib/util.js';
import Icon from './Icons.jsx';
import { Modal } from './Modal.jsx';

const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

// ---------- Внешняя ссылка ----------

export function LinkDialog({ selectedText, onInsert, onClose }) {
  const [url, setUrl] = useState('https://');
  const [text, setText] = useState(selectedText);
  const submit = (e) => {
    e.preventDefault();
    if (!url.trim() || url === 'https://') return;
    onInsert(url.trim(), text.trim());
  };
  return (
    <Modal
      title="Ссылка"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" type="submit" form="link-form">
            Вставить
          </button>
        </>
      }
    >
      <form id="link-form" className="form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Адрес</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} autoFocus onFocus={(e) => e.target.select()} spellCheck={false} />
        </label>
        <label className="field">
          <span className="field-label">Текст ссылки</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Если пусто — покажется адрес" />
        </label>
        <p className="muted small">Ссылки на сайты открываются в новой вкладке. Для ссылки на статью базы знаний есть отдельная кнопка.</p>
      </form>
    </Modal>
  );
}

// ---------- Ссылка на статью или её раздел ----------

export function ArticleLinkDialog({ index, currentKey, selectedText, onInsert, onClose }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set([currentKey]));
  const [active, setActive] = useState(0);
  const list = useRef(null);

  const rows = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    const match = (s) => terms.every((t) => norm(s).includes(t));
    const out = [];
    for (const s of index.sections) {
      for (const a of s.articles) {
        const entry = index.byKey.get(a.key);
        const heads = entry.headings.filter((h) => h.depth <= 3).map((h) => ({ ...h, plain: toPlain(h.text) }));
        const titleHit = !terms.length || match(`${a.title} ${s.title} ${a.key}`);
        const headHits = terms.length ? heads.filter((h) => match(h.plain)) : open.has(a.key) ? heads : [];
        if (!titleHit && !headHits.length) continue;
        out.push({ type: 'article', key: a.key, title: a.title, icon: s.icon, count: heads.length });
        for (const h of headHits) out.push({ type: 'heading', key: a.key, id: h.id, title: h.plain, depth: h.depth });
      }
    }
    return out;
  }, [q, index, open]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (row) => {
    let href;
    if (row.type === 'heading') href = row.key === currentKey ? `#${row.id}` : `#/${row.key}#${row.id}`;
    else href = `#/${row.key}`;
    onInsert(href, selectedText || row.title);
  };

  const toggle = (key) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[active]) pick(rows[active]);
    } else if (e.key === 'ArrowRight' && rows[active]?.type === 'article' && !q) {
      toggle(rows[active].key);
    }
  };

  return (
    <Modal title="Ссылка на статью" onClose={onClose} width={560} className="picker-modal">
      <div className="picker-search">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Название статьи или заголовка…" autoFocus />
      </div>
      <div className="picker-list" ref={list}>
        {rows.map((r, i) => (
          <div
            key={r.type + r.key + (r.id ?? '')}
            className={`picker-row ${r.type}${i === active ? ' active' : ''}${r.depth === 3 ? ' depth-3' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(r)}
          >
            {r.type === 'article' ? (
              <>
                <span className="picker-icon">{r.icon}</span>
                <span className="picker-title">{r.title}</span>
                <span className="picker-path">#/{r.key}</span>
                {!q && r.count > 0 && (
                  <button
                    className="icon-btn small"
                    title="Показать заголовки"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(r.key);
                    }}
                  >
                    <Icon name={open.has(r.key) ? 'chevronDown' : 'chevronRight'} size={14} />
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="picker-hash">#</span>
                <span className="picker-title">{r.title}</span>
              </>
            )}
          </div>
        ))}
        {!rows.length && <div className="empty-note">Ничего не нашлось</div>}
      </div>
      <div className="picker-foot muted small">
        <kbd>↑</kbd> <kbd>↓</kbd> выбор · <kbd>Enter</kbd> вставить · <kbd>→</kbd> заголовки статьи
      </div>
    </Modal>
  );
}

// ---------- Картинка ----------

export const previewSrc = (url) => (/^(https?:|data:|\/)/.test(url) ? url : `/site-public/${url}`);

const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg' };

export async function uploadImage(file, slug) {
  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase().replace('.jpeg', '.jpg') || IMAGE_EXT[file.type] || '.png';
  // У вставленных из буфера картинок имя «image.png» — даём им понятное имя по статье. Русское имя файла пишем латиницей.
  const named = file.name && !/^image\.\w+$/i.test(file.name) ? toSlug(file.name.replace(/\.[^.]+$/, '')) : '';
  const base = named || `${slug}-${Date.now().toString(36)}`;
  try {
    const { url } = await api.upload(file, base + ext);
    toast(`Картинка сохранена: public/${url}`, 'success');
    return url;
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

export function ImageDialog({ slug, selectedText, onInsert, onClose }) {
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState(selectedText);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    const u = await uploadImage(file, slug);
    setBusy(false);
    if (u) setUrl(u);
  };

  const submit = (e) => {
    e.preventDefault();
    if (url.trim()) onInsert(url.trim(), alt.trim(), caption.trim());
  };

  return (
    <Modal
      title="Картинка"
      onClose={onClose}
      width={540}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" type="submit" form="image-form" disabled={!url.trim() || busy}>
            Вставить
          </button>
        </>
      }
    >
      <form id="image-form" className="form" onSubmit={submit}>
        <div
          className={`dropzone${drag ? ' over' : ''}`}
          onClick={() => input.current.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            upload(e.dataTransfer.files[0]);
          }}
        >
          {url ? (
            <img src={previewSrc(url)} alt="" referrerPolicy="no-referrer" />
          ) : (
            <>
              <Icon name="upload" size={22} />
              <span>{busy ? 'Загружаю…' : 'Перетащите картинку сюда или нажмите, чтобы выбрать файл'}</span>
              <span className="muted small">Файл сохранится в папку сайта public/images</span>
            </>
          )}
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0])} />
        </div>
        <label className="field">
          <span className="field-label">Или адрес картинки</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://i.ibb.co/…/image.png" spellCheck={false} />
        </label>
        <label className="field">
          <span className="field-label">Описание</span>
          <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Что на картинке — для поиска и если она не загрузится" />
        </label>
        <label className="field">
          <span className="field-label">Подпись</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Текст под картинкой — необязательно" />
        </label>
        <p className="muted small">Совет: картинку можно просто вставить в текст через Ctrl+V или перетащить в редактор.</p>
      </form>
    </Modal>
  );
}

// ---------- Таблица ----------

export function TableDialog({ onInsert, onClose }) {
  const [hover, setHover] = useState([3, 3]);
  const ROWS = 8;
  const COLS = 6;
  return (
    <Modal title="Таблица" onClose={onClose} width={360}>
      <div className="table-picker" onMouseLeave={() => setHover([3, 3])}>
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => (
            <button
              key={`${r}-${c}`}
              className={`tp-cell${r < hover[0] && c < hover[1] ? ' on' : ''}`}
              onMouseEnter={() => setHover([r + 1, c + 1])}
              onFocus={() => setHover([r + 1, c + 1])}
              onClick={() => onInsert(r + 1, c + 1)}
              aria-label={`${r + 1} × ${c + 1}`}
            />
          )),
        )}
      </div>
      <div className="table-picker-label">
        {hover[1]} {plural(hover[1], 'колонка', 'колонки', 'колонок')} × {hover[0]} {plural(hover[0], 'строка', 'строки', 'строк')}
      </div>
      <p className="muted small">
        На телефоне широкие таблицы показываются карточками: первая колонка становится заголовком карточки — ставьте в неё название.
      </p>
    </Modal>
  );
}
