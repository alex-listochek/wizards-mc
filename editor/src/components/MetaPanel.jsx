import { useState } from 'react';
import { plural } from '../lib/util.js';
import { today } from '../store.js';
import Icon from './Icons.jsx';

function TagInput({ value, onChange }) {
  const [text, setText] = useState('');

  const add = (raw) => {
    const parts = raw
      .split(',')
      .map((s) => s.replace(/[[\]]/g, '').trim())
      .filter(Boolean);
    setText('');
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
  };

  return (
    <div className="tags-input" onClick={(e) => e.currentTarget.querySelector('input').focus()}>
      {value.map((t, i) => (
        <span className="tag" key={t + i}>
          {t}
          <button type="button" aria-label={`Убрать тег ${t}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => add(text)}
        placeholder={value.length ? '' : 'Слова для поиска: Enter или запятая после каждого'}
      />
    </div>
  );
}

export default function MetaPanel({ fields, titleFallback, onChange, open, onToggle, autoDate, onAutoDate }) {
  const set = (k) => (e) => onChange({ [k]: e.target.value });

  return (
    <section className={`meta-panel${open ? ' open' : ''}`}>
      <button className="meta-toggle" onClick={onToggle} aria-expanded={open}>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        <span>Свойства статьи</span>
        {!open && (
          <span className="meta-summary">
            {fields.description ? 'описание' : 'без описания'} · {fields.tags.length} {plural(fields.tags.length, 'тег', 'тега', 'тегов')}
            {fields.order !== '' && ` · порядок ${fields.order}`}
            {fields.updated && ` · обновлено ${fields.updated}`}
          </span>
        )}
      </button>

      {open && (
        <div className="meta-grid">
          <label className="field">
            <span className="field-label">Заголовок</span>
            <input className="title-input" value={fields.title} onChange={set('title')} placeholder={titleFallback} />
          </label>
          <label className="field">
            <span className="field-label">Описание</span>
            <input value={fields.description} onChange={set('description')} placeholder="Подзаголовок под названием статьи, тоже участвует в поиске" />
          </label>
          <div className="meta-row">
            <div className="field">
              <span className="field-label">Теги</span>
              <TagInput value={fields.tags} onChange={(tags) => onChange({ tags })} />
            </div>
            <div className="field">
              <span className="field-label">Дата обновления</span>
              <div className="inline nowrap">
                <input type="date" value={fields.updated} onChange={set('updated')} />
                <button className="btn small" type="button" onClick={() => onChange({ updated: today() })}>
                  Сегодня
                </button>
                {fields.updated && (
                  <button className="icon-btn small" type="button" title="Убрать дату" onClick={() => onChange({ updated: '' })}>
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              <label className="check small" title="Дата обновления будет меняться на сегодняшнюю при каждом сохранении любой статьи">
                <input type="checkbox" checked={autoDate} onChange={(e) => onAutoDate(e.target.checked)} />
                <span>ставить при сохранении</span>
              </label>
            </div>
            <label className="field" title="Меньше — выше. Проще перетащить статью в меню слева.">
              <span className="field-label">Порядок</span>
              <input type="number" value={fields.order} onChange={set('order')} placeholder="—" className="order-input" />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
