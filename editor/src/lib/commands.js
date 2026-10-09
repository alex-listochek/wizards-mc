// Команды панели инструментов: разметка markdown и особые вставки сайта (плашки, цвета, наказания).
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

function run(view, spec) {
  // Выделение, целиком попавшее в заменённый кусок, CodeMirror переносит «наизнанку» (начало после конца),
  // и следующая команда падает. Такое выделение превращаем в курсор.
  const { newSelection } = view.state.update(spec);
  if (!spec.selection && newSelection.ranges.some((r) => r.from > r.to)) {
    spec = { ...spec, selection: EditorSelection.create(newSelection.ranges.map((r) => (r.from > r.to ? EditorSelection.cursor(r.from) : r)), newSelection.mainIndex) };
  }
  view.dispatch(view.state.update(spec, { scrollIntoView: true, userEvent: 'input' }));
  view.focus();
}

// Сколько символов c подряд в начале строки s или в её конце (atEnd).
function repeats(s, c, atEnd) {
  let n = 0;
  while (n < s.length && s[atEnd ? s.length - 1 - n : n] === c) n++;
  return n;
}

/** Обернуть выделение маркерами: **жирный**, *курсив*, `код`. Повторное нажатие снимает их. */
export function toggleWrap(view, before, after = before, placeholder = 'текст') {
  const { state } = view;
  // Маркер из одинаковых символов: считаем их подряд, ведь «**» — это жирный, а не курсив: *курсив*, **жирный**, ***оба***.
  const c = before[0];
  const uniform = before === after && before === c.repeat(before.length);
  const isOn = (left, right) => {
    const n = Math.min(left, right);
    return n >= before.length && !(before === '*' && n === 2);
  };
  run(
    view,
    state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to);
      const outside = uniform
        ? isOn(repeats(state.sliceDoc(Math.max(0, r.from - 3), r.from), c, true), repeats(state.sliceDoc(r.to, r.to + 3), c, false))
        : state.sliceDoc(r.from - before.length, r.from) === before && state.sliceDoc(r.to, r.to + after.length) === after;
      if (outside) {
        return {
          changes: [
            { from: r.from - before.length, to: r.from },
            { from: r.to, to: r.to + after.length },
          ],
          range: EditorSelection.range(r.from - before.length, r.to - before.length),
        };
      }
      const inside = uniform ? isOn(repeats(text, c, false), repeats(text, c, true)) : text.startsWith(before) && text.endsWith(after);
      if (text.length >= before.length + after.length && inside) {
        const inner = text.slice(before.length, text.length - after.length);
        return { changes: { from: r.from, to: r.to, insert: inner }, range: EditorSelection.range(r.from, r.from + inner.length) };
      }
      const inner = text || placeholder;
      return {
        changes: { from: r.from, to: r.to, insert: before + inner + after },
        range: EditorSelection.range(r.from + before.length, r.from + before.length + inner.length),
      };
    }),
  );
}

function selectedLines(state) {
  const seen = new Set();
  const lines = [];
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (!seen.has(n)) {
        seen.add(n);
        lines.push(state.doc.line(n));
      }
    }
  }
  return lines.sort((a, b) => a.number - b.number);
}

const PREFIX = { ul: /^(\s*)[-*+] /, ol: /^(\s*)\d+[.)] /, quote: /^>\s?/ };

/** Список или цитата для выделенных строк. Если все строки уже такие — разметка снимается. */
export function toggleLines(view, kind) {
  const { state } = view;
  const lines = selectedLines(state);
  const filled = lines.filter((l) => l.text.trim());
  const all = filled.length > 0 && filled.every((l) => PREFIX[kind].test(l.text));
  const changes = [];
  let n = 1;
  for (const line of lines) {
    const m = line.text.match(PREFIX[kind]);
    if (all) {
      if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: kind === 'quote' ? '' : m[1] });
      continue;
    }
    if (!line.text.trim() && lines.length > 1) continue;
    const prefix = kind === 'ul' ? '- ' : kind === 'ol' ? `${n++}. ` : '> ';
    if (m && kind !== 'ol') continue;
    const other = kind !== 'quote' && line.text.match(/^(\s*)([-*+]|\d+[.)]) /);
    if (other) changes.push({ from: line.from + other[1].length, to: line.from + other[0].length, insert: prefix });
    else changes.push({ from: line.from, insert: prefix });
  }
  run(view, { changes });
}

/** Заголовок ## или ###. Повторное нажатие превращает строку обратно в текст. */
export function setHeading(view, level) {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  const m = line.text.match(/^(#{1,6})\s+/);
  const prefix = '#'.repeat(level) + ' ';
  if (m && m[1].length === level) {
    run(view, { changes: { from: line.from, to: line.from + m[0].length } });
    return;
  }
  if (!line.text.trim()) {
    const text = 'Заголовок';
    run(view, {
      changes: { from: line.from, to: line.to, insert: prefix + text },
      selection: EditorSelection.single(line.from + prefix.length, line.from + prefix.length + text.length),
    });
    return;
  }
  run(view, { changes: { from: line.from, to: line.from + (m ? m[0].length : 0), insert: prefix } });
}

/**
 * Вставить блок (таблицу, плашку, картинку) отдельным абзацем — с пустыми строками вокруг.
 * select — какую часть вставки выделить после: [начало, конец] внутри text.
 */
export function insertBlock(view, text, select, at = null) {
  const { state } = view;
  const pos = at ?? state.selection.main.to;
  const line = state.doc.lineAt(pos);
  let from;
  let before = '';
  if (!line.text.trim()) {
    from = line.from;
    const prev = line.number > 1 ? state.doc.line(line.number - 1) : null;
    if (prev?.text.trim()) before = '\n';
  } else {
    from = line.to;
    before = '\n\n';
  }
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const after = next?.text.trim() ? '\n' : '';
  const to = line.text.trim() ? from : line.to;
  const start = from + before.length;
  const [s, e] = select ?? [text.length, text.length];
  run(view, {
    changes: { from, to, insert: before + text + after },
    selection: EditorSelection.single(start + s, start + e),
  });
}

/** Плашка > [!NOTE]. Выделенный текст становится её содержимым. */
export function insertCallout(view, type) {
  const { state } = view;
  const r = state.selection.main;
  const head = `> [!${type}]\n`;
  if (!r.empty) {
    const from = state.doc.lineAt(r.from).from;
    const to = state.doc.lineAt(r.to).to;
    const body = state
      .sliceDoc(from, to)
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .map((l) => (l ? `> ${l}` : '>'))
      .join('\n');
    run(view, { changes: { from, to, insert: head + body }, selection: EditorSelection.single(from + head.length, from + head.length + body.length) });
    return;
  }
  const text = 'Текст';
  insertBlock(view, `${head}> ${text}`, [head.length + 2, head.length + 2 + text.length]);
}

/** Блок кода ``` … ```. */
export function insertCodeBlock(view) {
  const { state } = view;
  const r = state.selection.main;
  if (!r.empty) {
    const from = state.doc.lineAt(r.from).from;
    const to = state.doc.lineAt(r.to).to;
    const code = state.sliceDoc(from, to);
    run(view, { changes: { from, to, insert: '```\n' + code + '\n```' }, selection: EditorSelection.single(from + 4, from + 4 + code.length) });
    return;
  }
  insertBlock(view, '```\nкод\n```', [4, 7]);
}

const ALNUM = /[a-z0-9]$/i;

/**
 * Цвет Minecraft: &bТекст. На сайте цвет действует до следующего кода, &r или конца абзаца.
 * Код после латинской буквы или цифры сайт не считает кодом, поэтому &r ставим после ближайшего пробела.
 */
export function applyColor(view, code) {
  const { state } = view;
  run(
    view,
    state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to) || 'текст';
      const line = state.doc.lineAt(r.to);
      const rest = state.sliceDoc(r.to, line.to);
      const changes = [{ from: r.from, to: r.to, insert: `&${code}${text}` }];
      if (rest.trim()) {
        if (!ALNUM.test(text)) changes.push({ from: r.to, insert: '&r' });
        else {
          const space = rest.search(/\s/);
          changes.push({ from: space === -1 ? line.to : r.to + space + 1, insert: '&r' });
        }
      }
      const start = r.from + 2;
      return { changes, range: EditorSelection.range(start, start + text.length) };
    }),
  );
}

/** Убрать цветовые коды из выделения. */
export function stripColors(view) {
  const { state } = view;
  run(
    view,
    state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to).replace(/&[0-9a-fr]/gi, '');
      return { changes: { from: r.from, to: r.to, insert: text }, range: EditorSelection.range(r.from, r.from + text.length) };
    }),
  );
}

/** Ссылка: выделенный текст становится её текстом. */
export function insertLink(view, href, label) {
  const { state } = view;
  const r = state.selection.main;
  const text = state.sliceDoc(r.from, r.to) || label || href;
  const insert = `[${text}](${href})`;
  run(view, { changes: { from: r.from, to: r.to, insert }, selection: EditorSelection.cursor(r.from + insert.length) });
}

/** Картинка отдельным абзацем — на сайте она показывается с подписью и открывается по клику. */
export function imageMarkdown(url, alt = '', caption = '') {
  const title = caption ? ` "${caption.replace(/"/g, '“')}"` : '';
  return `![${alt.replace(/[[\]]/g, '')}](${url.replace(/ /g, '%20')}${title})`;
}

export function insertImage(view, url, alt, caption, at = null) {
  insertBlock(view, imageMarkdown(url, alt, caption), null, at);
}

export function tableMarkdown(rows, cols) {
  const head = Array.from({ length: cols }, (_, i) => `Колонка ${i + 1}`);
  const row = (cells) => `| ${cells.join(' | ')} |`;
  return [
    row(head),
    row(head.map((h) => '-'.repeat(h.length))),
    ...Array.from({ length: rows }, () => row(head.map((h) => ' '.repeat(h.length)))),
  ].join('\n');
}

export function insertTable(view, rows, cols) {
  insertBlock(view, tableMarkdown(rows, cols), [2, 11]);
}

/** Выделить кусок текста и прокрутить к нему. */
export function selectRange(view, from, to = from) {
  const len = view.state.doc.length;
  view.dispatch({
    selection: EditorSelection.single(Math.min(from, len), Math.min(to, len)),
    effects: EditorView.scrollIntoView(Math.min(from, len), { y: 'center' }),
  });
  view.focus();
}
