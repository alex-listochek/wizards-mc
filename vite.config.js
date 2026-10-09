import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { server } from './src/config.js';

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Заголовок страницы и превью ссылки для Telegram, VK и Discord — из src/config.js.
function siteMeta() {
  const site = (server.siteUrl || '').replace(/\/+$/, '');
  const title = `${server.name} — база знаний`;
  const meta = (attrs) => ({ tag: 'meta', attrs, injectTo: 'head' });
  return {
    name: 'site-meta',
    transformIndexHtml(html) {
      return {
        html: html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`),
        tags: [
          meta({ name: 'description', content: server.description }),
          meta({ property: 'og:type', content: 'website' }),
          meta({ property: 'og:site_name', content: server.name }),
          meta({ property: 'og:title', content: title }),
          meta({ property: 'og:description', content: server.description }),
          meta({ property: 'og:image', content: site ? `${site}/og.png` : 'og.png' }),
          meta({ property: 'og:image:width', content: '1200' }),
          meta({ property: 'og:image:height', content: '630' }),
          ...(site ? [meta({ property: 'og:url', content: `${site}/` })] : []),
          meta({ name: 'twitter:card', content: 'summary_large_image' }),
        ],
      };
    },
  };
}

export default defineConfig({
  // Относительные пути: сайт работает из любой папки (GitHub Pages, Netlify, обычный хостинг).
  base: './',
  plugins: [react(), siteMeta()],
  // Тексты всех статей встроены в сборку, чтобы поиск работал мгновенно и без сервера.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    // Разрешаем доступ через временные туннели Cloudflare.
    allowedHosts: ['.trycloudflare.com'],
  },
});
  