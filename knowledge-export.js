import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { server, sections } from './src/config.js';

// База знаний для игрового плагина PetPetAI (жаба-помощник): все статьи одним файлом kb.json.
// Файл собирается вместе с сайтом и публикуется рядом с index.html, поэтому плагин
// сам подхватывает изменения после каждой публикации — отдельный сервер не нужен.

const CONTENT = fileURLToPath(new URL('./src/content', import.meta.url));

// Тот же разбор шапки статьи, что и в src/lib/content.js.
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

function readArticles() {
  const titles = new Map(sections.map((s, i) => [s.id, { title: s.title, index: i }]));
  const articles = [];
  for (const section of readdirSync(CONTENT)) {
    const dir = join(CONTENT, section);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const slug = file.slice(0, -3);
      const { data, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));

      // Как на сайте: без title берётся первый «# Заголовок».
      let title = data.title;
      let text = body;
      const h1 = text.match(/^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/);
      if (h1 && (!title || h1[1] === title)) {
        title ||= h1[1];
        text = text.slice(h1[0].length);
      }

      articles.push({
        section,
        sectionTitle: titles.get(section)?.title ?? section,
        slug,
        path: `/${section}/${slug}`,
        title: String(title || slug),
        description: data.description ? String(data.description) : '',
        tags: Array.isArray(data.tags) ? data.tags.map(String) : data.tags ? [String(data.tags)] : [],
        updated: data.updated ? String(data.updated) : '',
        order: typeof data.order === 'number' ? data.order : 1e9,
        sectionOrder: titles.get(section)?.index ?? 1e9,
        body: text.trim(),
      });
    }
  }
  articles.sort(
    (a, b) => a.sectionOrder - b.sectionOrder || a.section.localeCompare(b.section) || a.order - b.order || a.title.localeCompare(b.title, 'ru'),
  );
  return articles.map(({ order, sectionOrder, ...a }) => a);
}

// Адреса и ссылки из src/config.js — отдельной статьёй: «какой айпи», «где поддержка».
function serverArticle() {
  const rows = server.addresses.map(
    (a) => `| ${a.edition} | \`${a.address}\`${a.port ? ` (порт \`${a.port}\`)` : ''} | ${a.versions || ''} |`,
  );
  const links = server.links.map((l) => `- ${l.label}: ${l.url}`);
  const body = [
    `${server.description}`,
    '',
    '## Как зайти на сервер',
    '',
    '| Издание | Адрес | Версии |',
    '|---|---|---|',
    ...rows,
    '',
    '## Ссылки сообщества',
    '',
    ...links,
    ...(server.siteUrl ? [`- База знаний (сайт): ${server.siteUrl}`] : []),
  ].join('\n');
  return {
    section: 'server',
    sectionTitle: 'Сервер',
    slug: '',
    path: '/',
    title: `О сервере ${server.name}`,
    description: 'Адрес сервера для Java и Bedrock, версии, поддержка, новости, донат',
    tags: ['айпи', 'ip', 'адрес', 'порт', 'версия', 'зайти', 'java', 'bedrock', 'поддержка', 'новости', 'беседа', 'донат', 'сайт'],
    updated: '',
    body,
  };
}

export function buildKnowledge() {
  return JSON.stringify({
    format: 1,
    generated: new Date().toISOString(),
    site: { name: server.name, url: (server.siteUrl || '').replace(/\/+$/, ''), description: server.description },
    articles: [serverArticle(), ...readArticles()],
  });
}

export function knowledgeExport() {
  return {
    name: 'knowledge-export',
    // npm run dev: http://localhost:5173/kb.json — всегда свежий.
    configureServer(dev) {
      dev.middlewares.use('/kb.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(buildKnowledge());
      });
    },
    // npm run build: dist/kb.json
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'kb.json', source: buildKnowledge() });
    },
  };
}
