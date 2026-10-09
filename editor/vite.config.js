import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { wikiApi } from './server/api.js';

const editorRoot = path.dirname(fileURLToPath(import.meta.url));
// Сайт лежит на уровень выше: ../src/content, ../src/config.js, ../public.
const siteRoot = path.resolve(editorRoot, '..');

// Код самого редактора не отслеживаем. При публикации git может ненадолго подменять эти файлы,
// и перезапуск посреди отправки оборвал бы её. Новая версия редактора подхватится при следующем запуске.
const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
const editorCode = ['src', 'server', 'index.html', 'vite.config.js'].map((p) => norm(path.join(editorRoot, p)));
const isEditorCode = (p) => {
  const n = norm(p);
  return editorCode.some((c) => n === c || n.startsWith(c + '/'));
};

export default defineConfig({
  plugins: [react(), wikiApi({ siteRoot, dataDir: editorRoot })],
  resolve: {
    // Превью собирается тем же кодом, что и сайт: @site/lib/markdown.js и @site/styles.css.
    alias: { '@site': path.join(siteRoot, 'src') },
    dedupe: ['marked'],
  },
  server: {
    port: 5174,
    fs: { allow: [siteRoot] },
    watch: { ignored: [isEditorCode] },
  },
});
