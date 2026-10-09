import { sections as sectionConfig } from '../config.js';
import { analyze, toHtml } from './markdown.js';

// Все статьи: src/content/<раздел>/<статья>.md
const files = import.meta.glob('../content/*/*.md', { query: '?raw', import: 'default', eager: true });

function parseFrontmatter(raw) {
  const m = raw.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (kv) data[kv[1]] = parseValue(kv[2]);
  }
  return { data, body: raw.slice(m[0].length) };
}

const unquote = (s) => s.replace(/^(['"])(.*)\1$/, '$2');

function parseValue(v) {
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return unquote(v);
}

const articles = [];

for (const [file, raw] of Object.entries(files)) {
  const [, section, slug] = file.match(/\/content\/([^/]+)\/([^/]+)\.md$/);
  const { data, body } = parseFrontmatter(raw);

  // Если title не задан — берём первый "# Заголовок" из текста.
  let title = data.title;
  let content = body;
  const h1 = content.match(/^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/);
  if (h1 && (!title || h1[1] === title)) {
    title ||= h1[1];
    content = content.slice(h1[0].length);
  }

  articles.push({
    section,
    slug,
    path: `/${section}/${slug}`,
    title: String(title || slug),
    description: data.description ? String(data.description) : '',
    tags: Array.isArray(data.tags) ? data.tags : data.tags ? [String(data.tags)] : [],
    updated: data.updated ? String(data.updated) : '',
    order: typeof data.order === 'number' ? data.order : Infinity,
    ...analyze(content),
  });
}

const byOrder = (a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ru');

const configured = new Map(sectionConfig.map((s) => [s.id, s]));
const extraIds = [...new Set(articles.map((a) => a.section))].filter((id) => !configured.has(id)).sort();

export const sections = [...configured.keys(), ...extraIds]
  .map((id) => ({
    id,
    title: configured.get(id)?.title ?? id,
    icon: configured.get(id)?.icon ?? '📄',
    description: configured.get(id)?.description ?? '',
    articles: articles.filter((a) => a.section === id).sort(byOrder),
  }))
  .filter((s) => s.articles.length > 0);

export const sectionById = Object.fromEntries(sections.map((s) => [s.id, s]));

// Плоский список в порядке меню — для кнопок «назад / далее».
export const allArticles = sections.flatMap((s) => s.articles);

export function findArticle(sectionId, slug) {
  const section = sectionById[sectionId];
  if (!section) return null;
  return slug ? section.articles.find((a) => a.slug === slug) ?? null : section.articles[0];
}

const htmlCache = new Map();
export function articleHtml(article) {
  if (!htmlCache.has(article)) htmlCache.set(article, toHtml(article.tokens));
  return htmlCache.get(article);
}
