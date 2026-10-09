import { toPlain } from '@site/lib/markdown.js';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { insertImage, insertLink, insertTable, selectRange } from '../lib/commands.js';
import { buildFile, parseFile } from '../lib/frontmatter.js';
import { countBacklinks, findProblems, useLinkIndex } from '../lib/links.js';
import { renderArticle } from '../lib/render.js';
import { editPath, formatAgo, go, plural, takeJump, toast, usePref } from '../lib/util.js';
import {
  deleteArticle,
  discardDraft,
  getAutoDate,
  keepMine,
  recreateFromDraft,
  saveArticle,
  setAutoDate,
  updateDraft,
} from '../store.js';
import { ArticleLinkDialog, ImageDialog, LinkDialog, TableDialog, uploadImage } from './InsertDialogs.jsx';
import { MoveDialog } from './ArticleDialogs.jsx';
import CheatSheet from './CheatSheet.jsx';
import { DiffDialog, HistoryDialog } from './History.jsx';
import Icon from './Icons.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';
import MetaPanel from './MetaPanel.jsx';
import { confirmDialog } from './Modal.jsx';
import Preview from './Preview.jsx';
import PublishButton from './Publish.jsx';
import Toolbar from './Toolbar.jsx';

function MoreMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="tb-menu" ref={ref}>
      <button className="btn icon-only" title="Ещё" aria-label="Ещё" onClick={() => setOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu right" onClick={() => setOpen(false)}>
          {items.filter(Boolean).map((it) => (
            <button key={it.label} className={`menu-item${it.danger ? ' danger' : ''}`} onClick={it.onClick}>
              <Icon name={it.icon} />
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Problems({ problems, onShow, onFix }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!problems.length) {
    return (
      <span className="status-ok" title="Все ссылки на статьи и заголовки ведут туда, куда нужно">
        <Icon name="check" size={13} /> ссылки в порядке
      </span>
    );
  }
  return (
    <div className="problems" ref={ref}>
      <button className="status-warn" onClick={() => setOpen((o) => !o)}>
        <Icon name="alert" size={13} /> {problems.length} {plural(problems.length, 'битая ссылка', 'битые ссылки', 'битых ссылок')}
      </button>
      {open && (
        <div className="problems-pop">
          {problems.map((p) => (
            <div className="problem" key={p.from}>
              <div>
                <div>{p.message}</div>
                <code>{p.href}</code>
              </div>
              <div className="problem-actions">
                {p.fix && (
                  <button className="btn small primary" onClick={() => onFix(p)} title={`Заменить на ${p.fix}`}>
                    Исправить
                  </button>
                )}
                <button className="btn small" onClick={() => (onShow(p), setOpen(false))}>
                  Показать
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ArticleEditor({ articleKey, state, theme, siteUrl, sitePublished }) {
  const article = state.articles[articleKey];
  const draft = state.drafts[articleKey];
  if (!article) return <MissingArticle articleKey={articleKey} draft={draft} />;
  return <EditorScreen article={article} draft={draft} state={state} theme={theme} siteUrl={siteUrl} sitePublished={sitePublished} />;
}

function MissingArticle({ articleKey, draft }) {
  const recreate = async () => {
    try {
      await recreateFromDraft(articleKey);
      toast('Статья восстановлена', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <div className="empty-page">
      <h1>Статья не найдена</h1>
      <p>
        Файла <code>src/content/{articleKey}.md</code> нет — возможно, его переименовали или удалили.
      </p>
      <div className="inline">
        {draft && (
          <button className="btn primary" onClick={recreate}>
            Создать заново из несохранённой версии
          </button>
        )}
        {draft && (
          <button className="btn" onClick={() => discardDraft(articleKey)}>
            Выбросить несохранённую версию
          </button>
        )}
        <button className="btn" onClick={() => go('/')}>
          На главную
        </button>
      </div>
    </div>
  );
}

function EditorScreen({ article, draft, state, theme, siteUrl, sitePublished }) {
  const key = article.key;
  const { fields, body } = draft ?? article;
  const dirty = Boolean(draft);
  const conflict = Boolean(draft && draft.baseHash !== article.hash);

  const [mode, setMode] = usePref('mode', 'split');
  const [metaOpen, setMetaOpen] = usePref('meta-open', true);
  const [device, setDevice] = usePref('device', 'desktop');
  const [sync, setSync] = usePref('sync-scroll', true);
  const [dialog, setDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1, selected: 0 });
  const [, rerender] = useState(0);

  const editorRef = useRef(null);
  const previewRef = useRef(null);
  const getView = () => editorRef.current?.view();

  const index = useLinkIndex(state);
  const section = index.sections.find((s) => s.id === article.section) ?? { icon: '📄', title: article.section };

  const dBody = useDeferredValue(body);
  const dFields = useDeferredValue(fields);
  const rendered = useMemo(() => renderArticle(dFields, dBody, article.slug), [dFields, dBody, article.slug]);
  const problems = useMemo(() => findProblems(dBody, key, index), [dBody, key, index]);
  const words = useMemo(() => dBody.match(/[\p{L}\p{N}]+/gu)?.length ?? 0, [dBody]);

  const currentRaw = () => buildFile(article.meta, article.fields, fields, body);

  // ---------- Сохранение ----------

  const save = async () => {
    if (!draft || saving) return;
    if (conflict) {
      setDialog('conflict');
      return;
    }
    setSaving(true);
    try {
      await saveArticle(key);
      toast('Сохранено', 'success');
    } catch (e) {
      toast(e.status === 409 ? 'Файл изменили в другой программе — сравните версии перед сохранением' : e.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS' && !e.defaultPrevented) {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Переход из поиска: выделяем найденное место. Редактор к этому моменту уже создан.
  useEffect(() => {
    const j = takeJump(key);
    const v = getView();
    if (j && v) selectRange(v, j.from, j.to);
  }, [key]);

  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${article.title} — редактор`;
  }, [article.title, dirty]);

  // ---------- Синхронная прокрутка превью за редактором ----------

  const syncFrame = useRef(0);
  const onScroll = (view) => {
    if (!sync || mode !== 'split') return;
    cancelAnimationFrame(syncFrame.current);
    syncFrame.current = requestAnimationFrame(() => {
      const dom = view.scrollDOM;
      const atEnd = dom.scrollTop + dom.clientHeight >= dom.scrollHeight - 4;
      const block = view.lineBlockAtHeight(dom.scrollTop);
      const doc = view.state.doc;
      const line = doc.lineAt(block.from).number + Math.max(0, Math.min(1, (dom.scrollTop - block.top) / (block.height || 1)));
      const marks = rendered.marks.map((m) => ({ id: m.id, line: doc.lineAt(Math.min(m.offset, doc.length)).number }));
      previewRef.current?.syncTo(dom.scrollTop < 4 ? 1 : line, doc.lines, marks, atEnd && dom.scrollTop > 0);
    });
  };

  // ---------- Команды ----------

  const selectedText = () => {
    const v = getView();
    if (!v) return '';
    const r = v.state.selection.main;
    return v.state.sliceDoc(r.from, r.to);
  };

  const onCommand = (name) => {
    if (name === 'save') save();
    else setDialog({ type: name, selected: selectedText() });
  };

  const insert = (fn) => {
    setDialog(null);
    const v = getView();
    if (v) fn(v);
  };

  const completions = () => {
    const opts = [];
    const self = index.byKey.get(key);
    for (const h of self?.headings ?? []) opts.push({ label: `#${h.id}`, detail: `здесь → ${toPlain(h.text)}`, boost: 2 });
    for (const [k, e] of index.byKey) {
      opts.push({ label: `#/${k}`, detail: e.title, boost: 1 });
      for (const h of e.headings) opts.push({ label: `#/${k}#${h.id}`, detail: `${e.title} → ${toPlain(h.text)}` });
    }
    return opts;
  };

  const openFromPreview = (href) => {
    const [path, anchor] = href.split('#');
    const [s, slug] = path.split('/').filter(Boolean);
    const target = slug ? `${s}/${slug}` : index.sections.find((x) => x.id === s)?.articles[0]?.key;
    if (target && state.articles[target]) {
      go(editPath(target));
      if (anchor) toast(`Открыта статья «${state.articles[target].title}»`);
    } else toast(`Статьи ${href} нет`, 'error');
  };

  const remove = async () => {
    const n = countBacklinks(key, state);
    const ok = await confirmDialog({
      title: 'Удалить статью?',
      message: (
        <>
          <p>
            «{article.title}» исчезнет с сайта. Файл переместится в корзину редактора — его можно вернуть на странице «Корзина».
          </p>
          {n > 0 && (
            <p className="form-error">
              На эту статью {plural(n, 'ссылается', 'ссылаются', 'ссылаются')} {n} {plural(n, 'статья', 'статьи', 'статей')} — эти ссылки станут битыми.
            </p>
          )}
        </>
      ),
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteArticle(key);
      go('/');
      toast('Статья перемещена в корзину');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const discard = async () => {
    const ok = await confirmDialog({
      title: 'Отменить правки?',
      message: 'Все несохранённые изменения этой статьи пропадут, вернётся сохранённая версия.',
      confirmText: 'Отменить правки',
      danger: true,
    });
    if (ok) discardDraft(key);
  };

  const restoreVersion = (raw) => {
    const v = parseFile(raw);
    updateDraft(key, { fields: v.fields, body: v.body });
    setDialog(null);
    toast('Версия загружена в редактор. Проверьте и сохраните, если всё верно.');
  };

  const fixProblem = (p) => {
    const v = getView();
    if (!v) return;
    v.dispatch({ changes: { from: p.from, to: p.to, insert: p.fix } });
    toast(`Ссылка исправлена: ${p.fix}`, 'success');
  };

  const siteLink = `${siteUrl.replace(/\/+$/, '')}/#/${key}`;

  return (
    <div className={`editor-screen mode-${mode}`}>
      <header className="doc-head">
        <div className="doc-title">
          <div className="crumbs">
            <span>{section.icon}</span>
            <span>{section.title}</span>
            <span className="sep">/</span>
            <span className="path" title={`src/content/${key}.md`}>
              {article.slug}.md
            </span>
          </div>
          <h1>
            {fields.title || rendered.title}
            {conflict ? (
              <span className="pill danger">конфликт</span>
            ) : dirty ? (
              <span className="pill warn">не сохранено</span>
            ) : (
              <span className="pill ok">сохранено</span>
            )}
          </h1>
        </div>
        <div className="doc-actions">
          {dirty && (
            <button className="btn" onClick={() => setDialog('changes')} title="Что изменилось с последнего сохранения">
              <Icon name="diff" /> Изменения
            </button>
          )}
          <button className="btn" onClick={() => setDialog('history')} title="Прежние версии статьи">
            <Icon name="history" /> История
          </button>
          <a
            className="btn"
            href={siteLink}
            target="_blank"
            rel="noreferrer"
            title={
              sitePublished
                ? 'Открыть статью на опубликованном сайте — там видна последняя опубликованная версия'
                : dirty
                  ? 'На сайте видна сохранённая версия'
                  : 'Открыть статью на сайте'
            }
          >
            <Icon name="external" /> На сайте
          </a>
          <MoreMenu
            items={[
              { icon: 'move', label: 'Переименовать или перенести', onClick: () => setDialog('move') },
              dirty && { icon: 'restore', label: 'Отменить несохранённые правки', onClick: discard },
              { icon: 'trash', label: 'Удалить статью', onClick: remove, danger: true },
            ]}
          />
          <button className="btn primary" onClick={save} disabled={!dirty || saving} title="Сохранить (Ctrl+S)">
            <Icon name="save" /> {saving ? 'Сохраняю…' : 'Сохранить'}
          </button>
          <PublishButton />
        </div>
      </header>

      {conflict && (
        <div className="banner danger">
          <Icon name="alert" />
          <span>Файл статьи изменили в другой программе, пока здесь были несохранённые правки.</span>
          <button className="btn small" onClick={() => setDialog('conflict')}>
            Сравнить
          </button>
          <button className="btn small" onClick={() => (discardDraft(key), toast('Загружена версия с диска'))}>
            Взять версию с диска
          </button>
          <button className="btn small" onClick={() => (keepMine(key), toast('Оставлены ваши правки — сохраните, чтобы записать их'))}>
            Оставить мои
          </button>
        </div>
      )}

      <MetaPanel
        fields={fields}
        titleFallback={rendered.title}
        onChange={(patch) => updateDraft(key, { fields: patch })}
        open={metaOpen}
        onToggle={() => setMetaOpen(!metaOpen)}
        autoDate={getAutoDate()}
        onAutoDate={(on) => (setAutoDate(on), rerender((n) => n + 1))}
      />

      <Toolbar getView={getView} onDialog={(name) => setDialog({ type: name, selected: selectedText() })} mode={mode} onMode={setMode} onHelp={() => setDialog('help')} />

      <div className="panes">
        <div className="pane pane-editor">
          <MarkdownEditor
            ref={editorRef}
            docKey={key}
            value={body}
            problems={problems}
            onChange={(text) => updateDraft(key, { body: text })}
            onCommand={onCommand}
            onUpload={(file) => uploadImage(file, article.slug)}
            completions={completions}
            onScroll={onScroll}
            onCursor={(s) => {
              const r = s.selection.main;
              const line = s.doc.lineAt(r.head);
              setCursor({ line: line.number, col: r.head - line.from + 1, selected: Math.abs(r.to - r.from) });
            }}
          />
        </div>
        <div className="pane pane-preview">
          <div className="preview-bar">
            <span className="preview-label">Превью</span>
            <div className="segmented small" role="group" aria-label="Ширина превью">
              <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')} title="Как на компьютере">
                <Icon name="monitor" size={14} />
              </button>
              <button className={device === 'phone' ? 'on' : ''} onClick={() => setDevice('phone')} title="Как на телефоне">
                <Icon name="phone" size={14} />
              </button>
            </div>
            {mode === 'split' && (
              <button className={`tb-btn${sync ? ' active' : ''}`} onClick={() => setSync(!sync)} title="Прокручивать превью вместе с текстом">
                <Icon name="sync" size={14} />
              </button>
            )}
          </div>
          <Preview ref={previewRef} rendered={rendered} fields={dFields} section={section} theme={theme} device={device} onOpenArticle={openFromPreview} />
        </div>
      </div>

      <footer className="status-bar">
        <span>
          Строка {cursor.line}, столбец {cursor.col}
          {cursor.selected > 0 && ` · выделено ${cursor.selected}`}
        </span>
        <span>
          {words.toLocaleString('ru-RU')} {plural(words, 'слово', 'слова', 'слов')}
        </span>
        <Problems problems={problems} onShow={(p) => getView() && selectRange(getView(), p.from, p.to)} onFix={fixProblem} />
        <span className="status-spacer" />
        <span className="muted" title={`Файл: src/content/${key}.md`}>
          {dirty ? 'Есть несохранённые правки' : `Сохранено ${formatAgo(article.mtime)}`}
        </span>
      </footer>

      {dialog === 'help' && <CheatSheet onClose={() => setDialog(null)} />}
      {dialog === 'move' && <MoveDialog article={article} onClose={() => setDialog(null)} />}
      {dialog === 'history' && <HistoryDialog article={article} currentRaw={currentRaw()} onRestore={restoreVersion} onClose={() => setDialog(null)} />}
      {dialog === 'changes' && (
        <DiffDialog
          title="Что изменилось"
          oldText={article.raw}
          newText={currentRaw()}
          oldLabel="сохранённая версия"
          newLabel="текст в редакторе"
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'conflict' && (
        <DiffDialog
          title="Версия на диске и ваши правки"
          oldText={article.raw}
          newText={currentRaw()}
          oldLabel="на диске"
          newLabel="ваши правки"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn" onClick={() => (discardDraft(key), setDialog(null))}>
                Взять версию с диска
              </button>
              <button className="btn primary" onClick={() => (keepMine(key), setDialog(null))}>
                Оставить мои правки
              </button>
            </>
          }
        />
      )}
      {dialog?.type === 'link' && (
        <LinkDialog selectedText={dialog.selected} onClose={() => setDialog(null)} onInsert={(href, text) => insert((v) => insertLink(v, href, text))} />
      )}
      {dialog?.type === 'articleLink' && (
        <ArticleLinkDialog
          index={index}
          currentKey={key}
          selectedText={dialog.selected}
          onClose={() => setDialog(null)}
          onInsert={(href, text) => insert((v) => insertLink(v, href, text))}
        />
      )}
      {dialog?.type === 'image' && (
        <ImageDialog
          slug={article.slug}
          selectedText={dialog.selected}
          onClose={() => setDialog(null)}
          onInsert={(url, alt, caption) => insert((v) => insertImage(v, url, alt, caption))}
        />
      )}
      {dialog?.type === 'table' && <TableDialog onClose={() => setDialog(null)} onInsert={(r, c) => insert((v) => insertTable(v, r, c))} />}
    </div>
  );
}
