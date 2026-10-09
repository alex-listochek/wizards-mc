// Проверка внутренних ссылок: [текст](#/раздел/статья#заголовок) и [текст](#заголовок).
import { useMemo, useRef } from 'react';
import { buildSections } from '../store.js';
import { headingIds, slugify } from './render.js';

const LINK_RE = /\]\((#[^\s)]*)/g;

/**
 * Справочник статей для проверки ссылок и подсказок.
 * Заголовки пересчитываются только у статей, текст которых изменился.
 */
export function useLinkIndex(state) {
  const cache = useRef(new Map());
  return useMemo(() => {
    const sections = buildSections(state);
    const byKey = new Map();
    for (const s of sections) {
      for (const a of s.articles) {
        const cur = state.drafts[a.key] ?? state.articles[a.key];
        let c = cache.current.get(a.key);
        if (!c || c.body !== cur.body || c.title !== cur.fields.title) {
          c = { body: cur.body, title: cur.fields.title, headings: headingIds(cur.fields, cur.body) };
          cache.current.set(a.key, c);
        }
        byKey.set(a.key, { key: a.key, title: a.title, section: s, headings: c.headings, ids: new Set(c.headings.map((h) => h.id)) });
      }
    }
    return { sections, byKey };
  }, [state.articles, state.drafts, state.config, state.folders]);
}

function decode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Похожий заголовок: «двери-шёпота» → «двери-шепота».
function suggest(anchor, ids) {
  const s = slugify(anchor);
  return s !== anchor && ids.has(s) ? s : null;
}

function check(href, selfKey, index) {
  const target = decode(href.slice(1));
  if (!target.startsWith('/')) {
    const self = index.byKey.get(selfKey);
    if (!target || !self || self.ids.has(target)) return null;
    const fix = suggest(target, self.ids);
    return { message: `В этой статье нет заголовка «#${target}»`, fix: fix && `#${fix}` };
  }
  const [path, anchor] = target.split('#');
  const [section, slug] = path.split('/').filter(Boolean);
  if (!section) return null;
  let entry;
  if (slug) {
    entry = index.byKey.get(`${section}/${slug}`);
    if (!entry) return { message: `Нет статьи «${section}/${slug}»` };
  } else {
    const s = index.sections.find((x) => x.id === section);
    if (!s?.articles.length) return { message: `Нет раздела «${section}»` };
    entry = index.byKey.get(s.articles[0].key);
  }
  if (anchor && !entry.ids.has(anchor)) {
    const fix = suggest(anchor, entry.ids);
    return { message: `В статье «${entry.title}» нет заголовка «#${anchor}»`, fix: fix && `#${path}#${fix}` };
  }
  return null;
}

/** Битые ссылки в тексте: позиция, адрес, что не так и как исправить (если понятно). */
export function findProblems(body, selfKey, index) {
  const out = [];
  for (const m of body.matchAll(LINK_RE)) {
    const href = m[1];
    const p = check(href, selfKey, index);
    if (p) out.push({ from: m.index + 2, to: m.index + 2 + href.length, href, ...p });
  }
  return out;
}

/** Сколько статей ссылаются на данную. */
export function countBacklinks(key, state) {
  const re = new RegExp(`#/${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[)#\\s"'>]|$)`);
  return Object.values(state.articles).filter((a) => a.key !== key && re.test((state.drafts[a.key] ?? a).body)).length;
}
