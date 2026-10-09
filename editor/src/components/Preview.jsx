import siteCss from '@site/styles.css?inline';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { escapeHtml } from '../lib/render.js';

// Превью — отдельная страничка со стилями сайта, поэтому статья выглядит ровно как на сайте.
const FRAME_CSS = `
  html { scrollbar-width: thin; }
  body { min-height: 100vh; }
  .main { padding-top: 28px; }
  .page { grid-template-columns: minmax(0, 1fr); max-width: 760px; }
  .prose a, .prose img { cursor: pointer; }
  .preview-empty { color: var(--text-3); font-style: italic; }
`;

const frameDoc = (theme) => `<!doctype html>
<html lang="ru" data-theme="${theme}">
<head>
<meta charset="utf-8">
<base href="${location.origin}/site-public/">
<style>${siteCss}</style>
<style>${FRAME_CSS}</style>
</head>
<body><main class="main"><div class="page"><article class="article" id="article"></article></div></main></body>
</html>`;

const formatDate = (s) => {
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Обновляем только изменившиеся блоки, чтобы картинки не перезагружались и не мигали при каждом символе.
function patch(container, html) {
  const tpl = container.ownerDocument.createElement('template');
  tpl.innerHTML = html;
  const next = [...tpl.content.childNodes];
  const prev = [...container.childNodes];
  let s = 0;
  while (s < next.length && s < prev.length && prev[s].isEqualNode(next[s])) s++;
  let e = 0;
  while (e < next.length - s && e < prev.length - s && prev[prev.length - 1 - e].isEqualNode(next[next.length - 1 - e])) e++;
  const ref = prev[prev.length - e] ?? null;
  for (const n of prev.slice(s, prev.length - e)) n.remove();
  for (const n of next.slice(s, next.length - e)) container.insertBefore(n, ref);
}

/**
 * ref.syncTo(line, lines, marks) прокручивает превью к тому же месту, что и редактор:
 * между соседними заголовками позиция считается пропорционально.
 */
export default function Preview({ ref, rendered, fields, section, theme, device, onOpenArticle }) {
  const frame = useRef(null);
  const [ready, setReady] = useState(false);
  const openRef = useRef(onOpenArticle);
  openRef.current = onOpenArticle;

  const doc = () => frame.current?.contentDocument;

  useImperativeHandle(ref, () => ({
    syncTo(line, lines, marks, atEnd) {
      const d = doc();
      if (!d) return;
      const win = d.defaultView;
      const max = d.documentElement.scrollHeight - win.innerHeight;
      if (atEnd) return win.scrollTo(0, max);
      const points = [{ line: 1, y: 0 }];
      for (const m of marks) {
        const el = d.getElementById(m.id);
        if (el) points.push({ line: m.line, y: el.getBoundingClientRect().top + win.scrollY - 24 });
      }
      points.push({ line: lines + 1, y: max });
      let i = 0;
      while (i < points.length - 2 && points[i + 1].line <= line) i++;
      const a = points[i];
      const b = points[i + 1];
      const k = b.line > a.line ? Math.min(1, Math.max(0, (line - a.line) / (b.line - a.line))) : 0;
      win.scrollTo(0, Math.max(0, a.y + (b.y - a.y) * k));
    },
  }));

  // Документ создаём один раз, дальше только меняем содержимое.
  useEffect(() => {
    const f = frame.current;
    const onLoad = () => {
      const d = f.contentDocument;
      d.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        const img = e.target.closest('img');
        if (a) {
          e.preventDefault();
          const href = a.getAttribute('href') || '';
          if (href.startsWith('#/')) openRef.current?.(href.slice(1));
          else if (href.startsWith('#')) d.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' });
          else if (href) window.open(a.href, '_blank', 'noopener,noreferrer');
        } else if (img) {
          window.open(img.src, '_blank', 'noopener,noreferrer');
        }
      });
      setReady(true);
    };
    f.addEventListener('load', onLoad);
    f.srcdoc = frameDoc(theme);
    return () => f.removeEventListener('load', onLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = doc();
    if (ready && d) d.documentElement.dataset.theme = theme;
  }, [theme, ready]);

  useEffect(() => {
    const d = doc();
    const root = d?.getElementById('article');
    if (!ready || !root) return;
    let head = root.querySelector(':scope > .head');
    let prose = root.querySelector(':scope > .prose');
    if (!head) {
      head = d.createElement('div');
      head.className = 'head';
      prose = d.createElement('div');
      prose.className = 'prose';
      root.append(head, prose);
    }
    head.innerHTML =
      `<div class="crumbs"><span>${escapeHtml(section.icon)}</span><span>${escapeHtml(section.title)}</span></div>` +
      `<h1 class="title">${escapeHtml(rendered.title)}</h1>` +
      (fields.description ? `<p class="lead">${escapeHtml(fields.description)}</p>` : '') +
      (fields.updated ? `<div class="meta">Обновлено ${escapeHtml(formatDate(fields.updated))}</div>` : '');
    patch(prose, rendered.html.trim() ? rendered.html : '<p class="preview-empty">Здесь появится текст статьи.</p>');
  }, [rendered, fields.description, fields.updated, section, ready]);

  return (
    <div className={`preview-frame-wrap ${device}`}>
      <iframe ref={frame} className="preview-frame" title="Превью статьи" />
    </div>
  );
}
