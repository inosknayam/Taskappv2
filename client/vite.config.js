import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Public, indexable routes. Keep in sync with client/src/App.jsx and server/src/static.js.
const PUBLIC_ROUTES = ['/', '/signup', '/login', '/contact', '/privacy', '/terms'];

function seoFiles(siteUrl) {
  return {
    name: 'taskapp-seo-files',
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      const urls = PUBLIC_ROUTES.map((r) => `  <url><loc>${siteUrl}${r}</loc><lastmod>${today}</lastmod><priority>${r === '/' ? '1.0' : '0.5'}</priority></url>`).join('\n');
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /boards\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n` });
    },
  };
}

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  // Only variables prefixed VITE_PUBLIC_ are exposed to browser code. Never put secrets there.
  const env = loadEnv(mode, envDir, 'VITE_PUBLIC_');
  const siteUrl = (env.VITE_PUBLIC_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
  // Makes %VITE_PUBLIC_SITE_URL% in index.html resolve even when no .env file exists.
  process.env.VITE_PUBLIC_SITE_URL = siteUrl;
  return {
    envDir,
    envPrefix: 'VITE_PUBLIC_',
    plugins: [react(), seoFiles(siteUrl)],
    server: {
      port: 5173,
      proxy: { '/api': 'http://127.0.0.1:4000' },
      fs: { allow: ['..'] },
    },
    build: {
      sourcemap: false,
      assetsInlineLimit: 4096,
      rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'] } } },
    },
  };
});
