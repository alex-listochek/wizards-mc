import { Marked } from 'marked';

const CALLOUTS = { NOTE: 'Примечание', TIP: 'Совет', WARNING: 'Внимание', DANGER: 'Важно' };

export const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Цветовые коды Minecraft: &0–&f, &r — сброс. Код после латинской буквы или цифры не считается кодом,
// поэтому «R&D», «AT&T» и HTML-сущности вроде «&amp;» не трогаем.
const MC_CODE = /(?<![a-z0-9])&([0-9a-fr])(?![a-z0-9]*;)/i;
const MC_CODES = new RegExp(MC_CODE.source, 'gi');

export function slugify(text) {
  return (
    text
      .replace(MC_CODES, '')
      .replace(/\]\([^)]*\)/g, '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

// Грубое превращение markdown в обычный текст — для поиска.
export function toPlain(md) {
  return md
    .replace(MC_CODES, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[!(NOTE|TIP|WARNING|DANGER)\]/gi, ' ')
    .replace(/^\s*[-+]\s+/gm, ' ')
    .replace(/:?-{3,}:?/g, ' ')
    .replace(/[`*>#|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COPY_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/>' +
  '<path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>';

// no-referrer: многие хостинги картинок блокируют показ на чужих сайтах по заголовку Referer.
const imageTag = (href, alt, title) =>
  `<img src="${escapeHtml(href)}" alt="${escapeHtml(alt)}"` +
  (title ? ` title="${escapeHtml(title)}"` : '') +
  ' loading="lazy" referrerpolicy="no-referrer">';

// &bТекст — цвет действует до следующего кода или до конца абзаца/ячейки, как в игре.
const mcColor = {
  name: 'mccolor',
  level: 'inline',
  start(src) {
    return src.match(MC_CODE)?.index;
  },
  tokenizer(src, tokens) {
    const m = src.match(MC_CODE);
    if (!m || m.index !== 0) return;
    // marked отдаёт только остаток строки, поэтому предыдущий символ смотрим в последнем токене.
    const prev = tokens.at(-1);
    if (prev?.type === 'text' && /[a-z0-9]$/i.test(prev.raw)) return;
    // Не режем по коду, который стоит внутри незакрытого **жирного**, `кода` или ~~зачёркивания~~.
    let end = 2;
    for (;;) {
      const next = src.slice(end).search(MC_CODE);
      const stop = next === -1 ? src.length : end + next;
      const open = ['**', '`', '~~'].some((d) => src.slice(2, stop).split(d).length % 2 === 0);
      if (!open || next === -1) {
        end = stop;
        break;
      }
      end = stop + 2;
    }
    const text = src.slice(2, end);
    return { type: 'mccolor', raw: m[0] + text, code: m[1].toLowerCase(), tokens: this.lexer.inlineTokens(text) };
  },
  renderer({ code, tokens }) {
    const inner = this.parser.parseInline(tokens);
    return code === 'r' ? inner : `<span class="mc mc-${code}">${inner}</span>`;
  },
};

const md = new Marked({
  gfm: true,
  extensions: [mcColor],
  renderer: {
    heading(token) {
      const text = this.parser.parseInline(token.tokens);
      const id = token.id ?? slugify(token.text);
      const anchor = token.depth > 1 ? `<a class="anchor" href="#${escapeHtml(id)}" aria-hidden="true">#</a>` : '';
      return `<h${token.depth} id="${escapeHtml(id)}">${text}${anchor}</h${token.depth}>\n`;
    },
    code({ text }) {
      return (
        '<div class="code-block">' +
        `<button class="copy-btn" type="button" aria-label="Копировать" title="Копировать">${COPY_ICON}</button>` +
        `<pre><code>${escapeHtml(text)}</code></pre></div>\n`
      );
    },
    codespan({ text }) {
      // Инлайн-команды вида `/home` копируются по клику.
      const cls = text.startsWith('/') ? ' class="cmd" title="Нажмите, чтобы скопировать"' : '';
      // Аргументы вида <старый пароль> не разрываем: если команда длиннее строки, она переносится между аргументами.
      const html = escapeHtml(text).replace(/&lt;.*?&gt;/g, '<span class="arg">$&</span>');
      return `<code${cls}>${html}</code>`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//i.test(href);
      return (
        `<a href="${escapeHtml(href)}"` +
        (title ? ` title="${escapeHtml(title)}"` : '') +
        (external ? ' target="_blank" rel="noopener noreferrer"' : '') +
        `>${text}</a>`
      );
    },
    image({ href, title, text }) {
      return imageTag(href, text, title);
    },
    paragraph({ tokens }) {
      // Картинка отдельным абзацем — это рисунок: подпись из title, клик открывает оригинал.
      const only = tokens.filter((t) => !(t.type === 'text' && !t.text.trim()));
      if (only.length !== 1 || only[0].type !== 'image') return false;
      const { href, title, text } = only[0];
      return (
        `<figure><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${imageTag(href, text)}</a>` +
        (title ? `<figcaption>${escapeHtml(title)}</figcaption>` : '') +
        '</figure>\n'
      );
    },
    blockquote({ tokens }) {
      let body = this.parser.parse(tokens);
      const m = body.match(/^<p>\[!(NOTE|TIP|WARNING|DANGER)\][ \t]*\n?/i);
      if (!m) return `<blockquote>${body}</blockquote>\n`;
      const type = m[1].toUpperCase();
      body = body.replace(m[0], '<p>').replace(/^<p>\s*<\/p>\s*/, '');
      return (
        `<div class="callout callout-${type.toLowerCase()}">` +
        `<div class="callout-title">${CALLOUTS[type]}</div>${body}</div>\n`
      );
    },
  },
});

/**
 * Разбирает markdown один раз: проставляет id заголовкам, собирает оглавление
 * и куски текста по разделам для поиска.
 */
export function analyze(body) {
  const tokens = md.lexer(body);
  const used = new Map();
  const unique = (slug) => {
    const n = used.get(slug) || 0;
    used.set(slug, n + 1);
    return n ? `${slug}-${n}` : slug;
  };

  const headings = [];
  const chunks = [{ id: null, heading: null, text: '' }];

  for (const t of tokens) {
    if (t.type === 'heading') {
      t.id = unique(slugify(t.text));
      if (t.depth === 2 || t.depth === 3) {
        const text = toPlain(t.text);
        headings.push({ id: t.id, text, depth: t.depth });
        chunks.push({ id: t.id, heading: text, text: '' });
        continue;
      }
    }
    if (t.type !== 'space') chunks.at(-1).text += ' ' + toPlain(t.raw);
  }

  for (const c of chunks) c.text = c.text.trim();
  return { tokens, headings, chunks };
}

const cellText = (html) => html.replace(/<[^>]+>/g, '').replace(/&[#a-z0-9]+;/gi, ' ').trim();

// Широкие таблицы (длинный текст или много колонок) на телефоне показываются карточками:
// первая ячейка — заголовок, короткие значения подписываются названием колонки.
function enhanceTable(table) {
  const head = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => cellText(m[1]));
  const body = table.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!body) return `<div class="table-wrap">${table}</div>`;

  const rows = [...body[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)]);
  const stack = head.length >= 4 || rows.some((r) => r.reduce((n, c) => n + cellText(c[2]).length, 0) > 40);
  const labeled = head.map((_, i) => i > 0 && head.length >= 3 && rows.every((r) => cellText(r[i]?.[2] ?? '').length <= 20));

  const newBody = rows
    .map((r) => {
      const cells = r.map(([, attrs, html], i) => {
        const label = labeled[i] && head[i] ? ` data-label="${escapeHtml(head[i])}"` : '';
        return `<td${attrs}${label}>${html}</td>`;
      });
      return `<tr>\n${cells.join('\n')}\n</tr>`;
    })
    .join('\n');

  return `<div class="table-wrap${stack ? ' stack' : ''}">${table.replace(body[0], () => `<tbody>${newBody}</tbody>`)}</div>`;
}

export function toHtml(tokens) {
  return (
    md
      .parser(tokens)
      .replace(/<table>[\s\S]*?<\/table>/g, enhanceTable)
      // Картинка — единственное содержимое ячейки: показываем превью (центр картинки крупнее).
      .replace(/<td([^>]*)>\s*(<img [^>]*>)\s*<\/td>/g, '<td$1><span class="thumb">$2</span></td>')
  );
}
