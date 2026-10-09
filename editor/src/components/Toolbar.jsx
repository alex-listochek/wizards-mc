import { redo, undo } from '@codemirror/commands';
import { useEffect, useRef, useState } from 'react';
import { applyColor, insertCallout, insertCodeBlock, setHeading, stripColors, toggleLines, toggleWrap } from '../lib/commands.js';
import { CALLOUTS, MC_COLORS } from '../lib/mc.js';
import Icon from './Icons.jsx';

// mousedown не уводит фокус из редактора — выделение остаётся на месте.
const keepFocus = (e) => e.preventDefault();

function Btn({ icon, title, onClick, active, disabled, children }) {
  return (
    <button className={`tb-btn${active ? ' active' : ''}`} title={title} aria-label={title} onMouseDown={keepFocus} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

function Menu({ icon, title, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const key = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="tb-menu" ref={ref}>
      <button className={`tb-btn has-caret${open ? ' active' : ''}`} title={title} aria-label={title} aria-expanded={open} onMouseDown={keepFocus} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} />
        <Icon name="chevronDown" size={12} className="caret" />
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function Toolbar({ getView, onDialog, mode, onMode, onHelp, canUndo, canRedo }) {
  const act = (fn) => () => {
    const v = getView();
    if (v) fn(v);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Форматирование">
      <div className="tb-group">
        <Btn
          icon="undo"
          title={canUndo ? 'Отменить последнее действие (Ctrl+Z)' : 'Отменять нечего. Несохранённые правки можно посмотреть и вернуть как было — кнопка «не сохранено» рядом с названием'}
          disabled={!canUndo}
          onClick={act((v) => (undo(v), v.focus()))}
        />
        <Btn icon="redo" title={canRedo ? 'Повторить отменённое (Ctrl+Y)' : 'Повторить отменённое (Ctrl+Y) — сейчас нечего'} disabled={!canRedo} onClick={act((v) => (redo(v), v.focus()))} />
      </div>
      <div className="tb-group">
        <Btn icon="h2" title="Раздел статьи (## Заголовок)" onClick={act((v) => setHeading(v, 2))} />
        <Btn icon="h3" title="Подраздел (### Заголовок)" onClick={act((v) => setHeading(v, 3))} />
      </div>
      <div className="tb-group">
        <Btn icon="bold" title="Жирный (Ctrl+B)" onClick={act((v) => toggleWrap(v, '**'))} />
        <Btn icon="italic" title="Курсив (Ctrl+I)" onClick={act((v) => toggleWrap(v, '*'))} />
        <Btn icon="strike" title="Зачёркнутый" onClick={act((v) => toggleWrap(v, '~~'))} />
        <Btn icon="code" title="Команда в тексте: `/home` — копируется по клику" onClick={act((v) => toggleWrap(v, '`', '`', '/команда'))} />
      </div>
      <div className="tb-group">
        <Btn icon="list" title="Список" onClick={act((v) => toggleLines(v, 'ul'))} />
        <Btn icon="listOrdered" title="Нумерованный список" onClick={act((v) => toggleLines(v, 'ol'))} />
        <Btn icon="quote" title="Цитата" onClick={act((v) => toggleLines(v, 'quote'))} />
      </div>
      <div className="tb-group">
        <Btn icon="link" title="Ссылка (Ctrl+K)" onClick={() => onDialog('link')} />
        <Btn icon="book" title="Ссылка на статью (Ctrl+Shift+K)" onClick={() => onDialog('articleLink')} />
        <Btn icon="image" title="Картинка" onClick={() => onDialog('image')} />
        <Btn icon="table" title="Таблица" onClick={() => onDialog('table')} />
        <Btn icon="codeBlock" title="Блок кода" onClick={act(insertCodeBlock)} />
      </div>
      <div className="tb-group">
        <Menu icon="callout" title="Плашка: примечание, совет, внимание">
          {CALLOUTS.map((c) => (
            <button key={c.type} className={`menu-item callout-item ${c.type.toLowerCase()}`} onMouseDown={keepFocus} onClick={act((v) => insertCallout(v, c.type))}>
              <span className="callout-dot" />
              <span>{c.name}</span>
              <code>[!{c.type}]</code>
            </button>
          ))}
        </Menu>
        <Menu icon="palette" title="Цвет Minecraft (&b…)">
          <div className="color-grid">
            {MC_COLORS.map((c) => (
              <button key={c.code} className="color-swatch" style={{ background: c.hex }} title={`${c.name} — &${c.code}`} onMouseDown={keepFocus} onClick={act((v) => applyColor(v, c.code))}>
                <span>{c.code}</span>
              </button>
            ))}
          </div>
          <button className="menu-item" onMouseDown={keepFocus} onClick={act((v) => stripColors(v))}>
            Убрать цвета из выделения
          </button>
        </Menu>
        <Btn icon="gavel" title="Наказание — красная метка в правилах" onClick={act((v) => toggleWrap(v, '<span class="penalty">', '</span>', 'пред + мут'))} />
      </div>

      <div className="tb-spacer" />

      <div className="segmented" role="group" aria-label="Вид">
        <button className={mode === 'edit' ? 'on' : ''} onClick={() => onMode('edit')} title="Только текст">
          <Icon name="pencil" />
        </button>
        <button className={mode === 'split' ? 'on' : ''} onClick={() => onMode('split')} title="Текст и превью">
          <Icon name="split" />
        </button>
        <button className={mode === 'preview' ? 'on' : ''} onClick={() => onMode('preview')} title="Только превью">
          <Icon name="eye" />
        </button>
      </div>
      <Btn icon="help" title="Шпаргалка по разметке" onClick={onHelp} />
    </div>
  );
}
