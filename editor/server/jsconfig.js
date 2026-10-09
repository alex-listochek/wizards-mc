// Точечная правка src/config.js: меняем только значения, которые изменились,
// комментарии и оформление остальных строк остаются как были.

const str = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`;
const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k));

/** Значение в стиле config.js: объект — в одну строку, массив объектов — по объекту на строку. */
export function literal(v, indent = '') {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every((x) => typeof x !== 'object' || x === null)) return `[${v.map((x) => literal(x)).join(', ')}]`;
    const inner = indent + '  ';
    return `[\n${v.map((x) => inner + literal(x, inner) + ',').join('\n')}\n${indent}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!entries.length) return '{}';
  return `{ ${entries.map(([k, x]) => `${key(k)}: ${literal(x, indent)}`).join(', ')} }`;
}

function skipString(src, i) {
  const q = src[i];
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === q) return i;
  }
  return i;
}

// Пропускает комментарий, если он начинается в позиции i. Возвращает позицию его последнего символа или -1.
function skipComment(src, i) {
  if (src[i] !== '/') return -1;
  if (src[i + 1] === '/') {
    const end = src.indexOf('\n', i);
    return end === -1 ? src.length : end;
  }
  if (src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    return end === -1 ? src.length : end + 1;
  }
  return -1;
}

// Позиция скобки, закрывающей ту, что стоит в start.
function matchBracket(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
      continue;
    }
    const comment = skipComment(src, i);
    if (comment !== -1) {
      i = comment;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if ((c === '}' || c === ']' || c === ')') && --depth === 0) return i;
  }
  throw new Error('config.js: не найдена закрывающая скобка');
}

// Где в файле стоит значение `export const name = …`.
function locate(src, name) {
  const m = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*`).exec(src);
  if (!m) throw new Error(`config.js: не найдено «export const ${name}»`);
  const start = m.index + m[0].length;
  if (!'{['.includes(src[start])) throw new Error(`config.js: «${name}» должен быть объектом или списком`);
  return { start, end: matchBracket(src, start) };
}

// Свойства верхнего уровня объекта: где начинается и кончается значение каждого.
function properties(src, start, end) {
  const props = [];
  let i = start + 1;
  while (i < end) {
    const c = src[i];
    if (/[\s,]/.test(c)) {
      i++;
      continue;
    }
    const comment = skipComment(src, i);
    if (comment !== -1) {
      i = comment + 1;
      continue;
    }
    const km = /^(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)")\s*:\s*/.exec(src.slice(i, end));
    if (!km) throw new Error('config.js: не удалось разобрать настройки сервера');
    const valueStart = i + km[0].length;
    let j = valueStart;
    for (; j < end; j++) {
      const ch = src[j];
      if (ch === '"' || ch === "'" || ch === '`') j = skipString(src, j);
      else if (ch === '{' || ch === '[' || ch === '(') j = matchBracket(src, j);
      else if (ch === ',' || skipComment(src, j) !== -1 || ch === '\n') break;
    }
    let valueEnd = j;
    while (/\s/.test(src[valueEnd - 1])) valueEnd--;
    props.push({ key: km[1] ?? km[2] ?? km[3], start: valueStart, end: valueEnd });
    i = j;
  }
  return props;
}

const applyEdits = (src, edits) =>
  edits.sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), src);

/** Заменяет список целиком: `export const name = [ … ];` */
export function replaceList(src, name, list) {
  const { start, end } = locate(src, name);
  return applyEdits(src, [{ start, end: end + 1, text: literal(list) }]);
}

/** Меняет в объекте `export const name = { … }` только изменившиеся свойства, новые дописывает в конец. */
export function updateObject(src, name, values, current) {
  const { start, end } = locate(src, name);
  const props = properties(src, start, end);
  const edits = [];
  const added = [];
  for (const [k, v] of Object.entries(values)) {
    if (JSON.stringify(v) === JSON.stringify(current[k])) continue;
    const p = props.find((x) => x.key === k);
    if (p) edits.push({ start: p.start, end: p.end, text: literal(v, '  ') });
    else added.push(`  ${key(k)}: ${literal(v, '  ')},\n`);
  }
  if (added.length) {
    const last = props.at(-1);
    if (last && !/^\s*,/.test(src.slice(last.end, end))) edits.push({ start: last.end, end: last.end, text: ',' });
    const at = src.lastIndexOf('\n', end) + 1;
    edits.push({ start: at, end: at, text: added.join('') });
  }
  return applyEdits(src, edits);
}
