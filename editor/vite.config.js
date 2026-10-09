import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { wikiApi } from './server/api.js';

const editorRoot = path.dirname(fileURLToPath(import.meta.url));
// Сайт лежит на уровень выше: ../src/content, ../src/config.js, ../public.
const siteRoot = path.resolve(editorRoot, '..');

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
  },
});
