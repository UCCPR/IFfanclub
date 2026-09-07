import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

function versionedPublicAssets() {
  const publicRoot = path.join(projectRoot, 'public');
  const versions: Record<string, string> = {};
  for (const folder of ['art', 'cards', 'gacha', 'media']) {
    const root = path.join(publicRoot, folder);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const relative = `${folder}/${entry.name}`;
      versions[relative] = createHash('sha256')
        .update(readFileSync(path.join(root, entry.name)))
        .digest('hex')
        .slice(0, 12);
    }
  }
  return versions;
}

function assetCachePlugin(versions: Record<string, string>) {
  return {
    name: 'versioned-public-asset-cache',
    closeBundle() {
      const current = JSON.stringify(versions);
      const source = `const CACHE='iffanclub-assets-v1';\nconst CURRENT=${current};\nself.addEventListener('install',()=>self.skipWaiting());\nself.addEventListener('activate',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const request of await cache.keys()){const url=new URL(request.url);const path=url.pathname.split('/').slice(-2).join('/');if(CURRENT[path]!==url.searchParams.get('v'))await cache.delete(request)}await self.clients.claim()})()));\nself.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.searchParams.has('v')||event.request.headers.has('range'))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(event.request);if(hit)return hit;const response=await fetch(event.request);if(response.ok&&response.status===200)event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));return response})())});\n`;
      writeFileSync(path.join(projectRoot, 'dist/client/asset-cache-sw.js'), source);
    },
  };
}

const assetVersions = versionedPublicAssets();

// Static export only: no bot process, Worker, or server bindings.
export default defineConfig({
  // The standalone repository is published below /IFfanclub/. Using the same base in
  // development prevents a valid-looking page from silently loading
  // HTML fallbacks in place of images and video.
  base: (process.env.PAGES_BASE_PATH || '/IFfanclub').replace(/\/$/, '') + '/',
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  define: {
    __PUBLIC_ASSET_VERSIONS__: JSON.stringify(assetVersions),
  },
  plugins: [react(), assetCachePlugin(assetVersions)],
  build: { outDir: 'dist/client', sourcemap: false },
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
});
