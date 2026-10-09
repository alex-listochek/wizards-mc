// Превью статьи собирается тем же кодом, что и сайт, — поэтому выглядит точно как на сайте.
import { analyze, escapeHtml, slugify, toHtml } from '@site/lib/markdown.js';

export { escapeHtml, slugify };

const H1 = /^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/;

// Как на сайте: если title не задан или совпадает с первым «# Заголовком», этот заголовок становится названием статьи.
function split(fields, body) {
  const h1 = body.match(H1);
  if (h1 && (!fields.title || h1[1] === fields.title)) return { title: fields.title || h1[1], skip: h1[0].length };
  return { title: fields.title, skip: 0 };
}

/** HTML статьи и позиции заголовков в тексте (для синхронной прокрутки). */
export function renderArticle(fields, body, slug) {
  const { title, skip } = split(fields, body);
  const content = body.slice(skip);
  const { tokens, headings } = analyze(content);
  const marks = [];
  let pos = 0;
  for (const t of tokens) {
    const at = content.indexOf(t.raw, pos);
    if (at === -1) continue;
    if (t.type === 'heading') marks.push({ id: t.id, offset: skip + at });
    pos = at + t.raw.length;
  }
  return { title: title || slug, html: toHtml(tokens), headings, marks };
}

/** id всех заголовков статьи — по ним работают ссылки вида #/раздел/статья#заголовок. */
export function headingIds(fields, body) {
  const { skip } = split(fields, body);
  const { tokens } = analyze(body.slice(skip));
  return tokens.filter((t) => t.type === 'heading').map((t) => ({ id: t.id, text: t.text, depth: t.depth }));
}
