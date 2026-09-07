import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { GACHA_MEDIA } from '../lib/gacha-media.ts';

const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
// Keep the verifier aligned with Vite's Pages default. A local build still
// emits `/IFfanclub/` URLs, even when the environment variable is not set.
const base = (process.env.PAGES_BASE_PATH || '/IFfanclub').replace(/\/$/, '');
const ui = JSON.parse(
  await readFile(new URL('../lib/gacha-assets.json', import.meta.url), 'utf8'),
);
const cards = JSON.parse(
  await readFile(new URL('../lib/cards.json', import.meta.url), 'utf8'),
);
const explicitAssets = new Set([
  ...Object.values(GACHA_MEDIA).map((name) => 'media/' + name),
  ...Object.keys(ui).map((key) => 'gacha/' + key + '.webp'),
  ...cards
    .filter((card) => card.sourceImage)
    .flatMap((card) =>
      ['cards/', 'art/'].map(
        (folder) => folder + card.sourceImage.replace('.png', '.webp'),
      ),
    ),
]);
const allowedFile =
  /^(?:index\.html|asset-cache-sw\.js|favicon\.svg|featured\.webp|og\.png|assets\/[\w.-]+\.(?:js|css))$/;
let count = 0,
  bytes = 0;
async function walk(dir) {
  for (const entry of await readdir(dir)) {
    const filename = path.join(dir, entry),
      relative = path.relative(root, filename);
    assert(
      !/(^|[\\/])(info|backup|agentmd|node_modules|\.git|\.env|config\.py|config\.json)([\\/]|$)/i.test(
        relative,
      ),
      'Private or unnecessary file in output: ' + relative,
    );
    const stats = await lstat(filename);
    assert(!stats.isSymbolicLink(), 'Symlinks must not be published');
    if (stats.isDirectory()) {
      assert(
        ['assets', 'cards', 'art', 'gacha', 'media'].includes(relative),
        'Unexpected directory: ' + relative,
      );
      await walk(filename);
    } else {
      if (entry.endsWith('.js')) {
        const code = await readFile(filename, 'utf8');
        assert(
          !code.includes('本地画面对照') && !code.includes('gacha-review'),
          'Development review must not ship',
        );
      }
      assert(
        allowedFile.test(relative.split(path.sep).join('/')) ||
          explicitAssets.has(relative.split(path.sep).join('/')),
        'Unexpected file: ' + relative,
      );
      count++;
      bytes += stats.size;
    }
  }
}
await walk(root);
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const assetCache = await readFile(
  path.join(root, 'asset-cache-sw.js'),
  'utf8',
);
assert(
  assetCache.includes("CACHE='iffanclub-assets-v1'") &&
    assetCache.includes("url.searchParams.has('v')"),
  'Missing versioned public asset cache',
);
assert(html.includes('幻想收束'), 'Missing product content');
assert(
  !html.includes('Untitled site') && !html.includes('Building your site'),
  'Starter content remains',
);
assert(
  html.includes('og:image') &&
    html.includes('https://uccpr.github.io/IFfanclub/og.png'),
  'Missing social metadata',
);
assert(
  !/https?:\/\/[^"'\s<>]+\.(?:js|css)(?:["'\s<>])/.test(html),
  'Runtime dependency on an external CDN',
);
for (const [, raw] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (/^(?:https?:|data:|#|mailto:)/.test(raw)) continue;
  const pathname = raw.split('?')[0];
  if (pathname.startsWith('/'))
    assert(
      !base || pathname.startsWith(base + '/'),
      'Asset escaped Pages base path: ' + raw,
    );
  const local = pathname.startsWith('/')
    ? pathname.slice(base.length + 1)
    : pathname.replace(/^\.\//, '');
  if (!local) continue;
  const resolved = path.resolve(root, decodeURIComponent(local));
  assert(
    resolved.startsWith(path.resolve(root) + path.sep),
    'Asset outside output',
  );
  await lstat(resolved);
}
for (const asset of explicitAssets) await lstat(path.join(root, asset));
console.log(
  `Static output verified: ${count} files, ${(bytes / 1024 / 1024).toFixed(1)} MB; ${cards.length} card assets; base path '${base || '/'}'.`,
);
