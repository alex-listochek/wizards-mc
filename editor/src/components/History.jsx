import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { diffLines, diffStats, hunks } from '../lib/diff.js';
import { formatAgo, formatTime, plural } from '../lib/util.js';
import { Modal } from './Modal.jsx';

export function DiffView({ oldText, newText, oldLabel, newLabel }) {
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  const stats = diffStats(lines);
  if (!stats.added && !stats.removed) return <div className="empty-note">Версии не отличаются</div>;
  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-count del">−{stats.removed}</span>
        <span className="diff-count add">+{stats.added}</span>
        <span className="muted">
          {oldLabel} → {newLabel}
        </span>
      </div>
      <div className="diff-body">
        {hunks(lines).map((l, i) =>
          l.type === 'skip' ? (
            <div key={i} className="diff-skip">
              ⋯ {l.count} {plural(l.count, 'строка', 'строки', 'строк')} без изменений
            </div>
          ) : (
            <div key={i} className={`diff-line ${l.type}`}>
              <span className="ln">{l.oldNo ?? ''}</span>
              <span className="ln">{l.newNo ?? ''}</span>
              <span className="sign">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ''}</span>
              <span className="text">{l.text || ' '}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** Сравнение двух текстов в окне: «Что изменилось», «Файл изменён на диске». */
export function DiffDialog({ title, oldText, newText, oldLabel, newLabel, footer, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width={960} className="diff-modal" footer={footer}>
      <DiffView oldText={oldText} newText={newText} oldLabel={oldLabel} newLabel={newLabel} />
    </Modal>
  );
}

/**
 * История версий статьи. Каждое сохранение из редактора откладывает прежнюю версию в editor/.history.
 * Выбранную версию можно сравнить с текущим текстом и вернуть в редактор.
 */
export function HistoryDialog({ article, currentRaw, onRestore, onClose }) {
  const [versions, setVersions] = useState(null);
  const [selected, setSelected] = useState(null);
  const [texts, setTexts] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .history(article.section, article.slug)
      .then(({ versions }) => {
        setVersions(versions);
        if (versions.length) setSelected(versions[0].id);
      })
      .catch((e) => setError(e.message));
  }, [article.section, article.slug]);

  useEffect(() => {
    if (!selected || texts[selected] !== undefined) return;
    api
      .version(article.section, article.slug, selected)
      .then(({ raw }) => setTexts((t) => ({ ...t, [selected]: raw })))
      .catch((e) => setError(e.message));
  }, [selected, texts, article.section, article.slug]);

  const raw = selected ? texts[selected] : undefined;
  const isDraft = currentRaw !== article.raw;

  return (
    <Modal
      title={`История: ${article.title}`}
      onClose={onClose}
      width={1080}
      className="history-modal"
      footer={
        <>
          <span className="muted small foot-note">Версии хранятся в папке editor/.history — по 50 последних на статью.</span>
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
          <button className="btn primary" disabled={raw === undefined} onClick={() => onRestore(raw)}>
            Вернуть эту версию
          </button>
        </>
      }
    >
      <div className="history">
        <div className="history-list">
          {error && <div className="form-error">{error}</div>}
          {versions === null && !error && <div className="empty-note">Загружаю…</div>}
          {versions?.length === 0 && (
            <div className="empty-note">
              Пока пусто. Прежние версии появятся здесь после первого сохранения статьи в редакторе.
            </div>
          )}
          {versions?.map((v) => (
            <button key={v.id} className={`history-item${v.id === selected ? ' active' : ''}`} onClick={() => setSelected(v.id)}>
              <span>{formatTime(v.time)}</span>
              <span className="muted small">
                {formatAgo(v.time)} · {(v.size / 1024).toFixed(1)} КБ
              </span>
            </button>
          ))}
        </div>
        <div className="history-diff">
          {raw === undefined ? (
            selected && <div className="empty-note">Загружаю…</div>
          ) : (
            <DiffView oldText={raw} newText={currentRaw} oldLabel="выбранная версия" newLabel={isDraft ? 'текст в редакторе' : 'сохранённая версия'} />
          )}
        </div>
      </div>
    </Modal>
  );
}
