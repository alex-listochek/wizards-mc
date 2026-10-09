// Разбор и сборка файла статьи: шапка (frontmatter) + markdown.
// Правила разбора те же, что у сайта в src/lib/content.js.
// Модуль без зависимостей — его используют и браузер, и сервер редактора.

export const FIELDS = ['title', 'description', 'order', 'tags', 'updated'];

const FM = /^(﻿?)---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const LINE = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/;

const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');

function parseValue(v) {
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return unquote(v);
}

function toFields(data) {
  return {
    title: data.title != null ? String(data.title) : '',
    description: data.description != null ? String(data.description) : '',
    order: typeof data.order === 'number' ? String(data.order) : '',
    tags: Array.isArray(data.tags) ? data.tags.map(String) : data.tags ? [String(data.tags)] : [],
    updated: data.updated ? String(data.updated) : '',
  };
}

/** Разбирает файл на поля шапки и текст. meta хранит всё, чтобы собрать файл обратно без лишних правок. */
export function parseFile(raw) {
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.replace(/\r\n/g, '\n');
  const m = text.match(FM);
  const lines = m ? m[2].split('\n') : [];
  const data = {};
  for (const line of lines) {
    const kv = line.match(LINE);
    if (kv) data[kv[1]] = parseValue(kv[2]);
  }
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const rest = m ? text.slice(m[0].length) : text.slice(bom.length);
  const gap = m ? rest.match(/^\n*/)[0] : '';
  return { meta: { bom, eol, lines, gap }, fields: toFields(data), body: rest.slice(gap.length) };
}

/** Значение поля в том виде, как оно пишется в шапке. null — поле не пишем. */
export function formatField(key, v) {
  if (key === 'tags') {
    const tags = (v || []).map((s) => String(s).replace(/[,[\]]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return tags.length ? `[${tags.join(', ')}]` : null;
  }
  if (key === 'order') return v === '' || v == null || !Number.isFinite(Number(v)) ? null : String(Number(v));
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  // Иначе сайт прочитал бы значение как список или число либо снял бы с него кавычки.
  const quote = /^\[.*\]$/.test(s) || /^-?\d+(\.\d+)?$/.test(s) || /^(['"]).*\1$/.test(s);
  return quote ? `"${s}"` : s;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Собирает файл. Строки шапки, поля которых не менялись, остаются как были,
 * новые поля встают на привычное место: title, description, order, tags, updated.
 */
export function buildFile(meta, original, fields, body) {
  const lines = [];
  const seen = new Set();
  for (const line of meta.lines) {
    const key = line.match(LINE)?.[1];
    if (!FIELDS.includes(key) || seen.has(key)) {
      lines.push(line);
      continue;
    }
    seen.add(key);
    if (same(fields[key], original[key])) {
      lines.push(line);
      continue;
    }
    const v = formatField(key, fields[key]);
    if (v !== null) lines.push(`${key}: ${v}`);
  }

  FIELDS.forEach((key, idx) => {
    if (seen.has(key)) return;
    const v = formatField(key, fields[key]);
    if (v === null) return;
    const keyOf = (l) => l.match(LINE)?.[1];
    const before = FIELDS.slice(0, idx);
    let at = -1;
    lines.forEach((l, i) => {
      if (before.includes(keyOf(l))) at = i + 1;
    });
    if (at === -1) {
      const after = FIELDS.slice(idx + 1);
      at = lines.findIndex((l) => after.includes(keyOf(l)));
      if (at === -1) at = lines.length;
    }
    lines.splice(at, 0, `${key}: ${v}`);
  });

  const text = body.trim() ? body.replace(/\s*$/, '\n') : '';
  let out = lines.length ? `---\n${lines.join('\n')}\n---\n${meta.gap || '\n'}${text}` : text;
  if (meta.eol !== '\n') out = out.replace(/\n/g, meta.eol);
  return meta.bom + out;
}

/** Меняет одно поле шапки, остальной файл не трогает. */
export function setField(raw, key, value) {
  const { meta, fields, body } = parseFile(raw);
  return buildFile(meta, fields, { ...fields, [key]: value }, body);
}

/** Заголовок статьи так же, как его определяет сайт: поле title, иначе первый «# Заголовок», иначе имя файла. */
export function resolveTitle(fields, body, slug) {
  if (fields.title) return fields.title;
  const h1 = body.match(/^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/);
  return h1 ? h1[1] : slug;
}
