import { allArticles, sectionById } from './content.js';

export const normalize = (s) => s.toLowerCase().replace(/ё/g, 'е');

export const queryTerms = (q) => normalize(q).split(/\s+/).filter(Boolean);

// Каждая статья разбита на куски: вступление + по куску на каждый заголовок h2/h3.
const index = allArticles.flatMap((article) =>
  article.chunks.map((c) => {
    const intro = c.id === null;
    const text = intro ? c.text || article.description : c.text;
    return {
      to: intro ? article.path : `${article.path}#${c.id}`,
      article,
      section: sectionById[article.section],
      heading: c.heading,
      text,
      nTitle: normalize(article.title),
      nHeading: normalize(c.heading || ''),
      nMeta: intro ? normalize([article.description, ...article.tags].join(' ')) : '',
      nText: normalize(text),
      intro,
    };
  }),
);

function snippet(text, nText, terms, size = 160) {
  if (!text) return '';
  let pos = -1;
  for (const t of terms) {
    const p = nText.indexOf(t);
    if (p !== -1 && (pos === -1 || p < pos)) pos = p;
  }
  if (pos === -1) return text.length > size ? text.slice(0, size).trimEnd() + '…' : text;
  let start = Math.max(0, pos - 50);
  if (start > 0) {
    const sp = text.indexOf(' ', start);
    if (sp !== -1 && sp < pos) start = sp + 1;
  }
  const end = Math.min(text.length, start + size);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

// Целое слово важнее начала слова, а начало — важнее середины: «порт» — это порт, а не «портал» или «телепортация».
const isWordChar = (ch) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function weight(hay, term, w) {
  let best = 0;
  for (let i = hay.indexOf(term); i !== -1; i = hay.indexOf(term, i + 1)) {
    if (isWordChar(hay[i - 1])) best = Math.max(best, w * 0.1);
    else if (isWordChar(hay[i + term.length])) best = Math.max(best, w);
    else return w * 2;
  }
  return best;
}

export function search(query, limit = 30) {
  const terms = queryTerms(query);
  if (!terms.length) return [];

  const results = [];
  for (const e of index) {
    let score = 0;
    let own = e.intro; // раздел статьи показываем, только если совпало в нём самом, а не в названии статьи
    for (const t of terms) {
      let s = 0;
      s += weight(e.nTitle, t, e.intro ? 10 : 2);
      s += weight(e.nHeading, t, 8);
      s += weight(e.nMeta, t, 5);
      s += weight(e.nText, t, 1);
      if (!s) {
        score = 0;
        break;
      }
      if (e.nHeading.includes(t) || e.nText.includes(t)) own = true;
      score += s;
    }
    if (score && own) results.push({ ...e, score, snippet: snippet(e.text, e.nText, terms) });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
