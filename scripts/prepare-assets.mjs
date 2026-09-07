// Build-time image optimization, restricted to explicit public source folders.
// Never copy the repository root or resolve a path from a player save.
import { readFile, mkdir, stat, readdir, unlink, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const cards = JSON.parse(
  await readFile(path.join(root, 'lib/cards.json'), 'utf8'),
);
const dest = path.join(root, 'public/cards');
await mkdir(dest, { recursive: true });
const artDest = path.join(root, 'public/art');
await mkdir(artDest, { recursive: true });
const images = [...new Set(cards.map((c) => c.sourceImage).filter(Boolean))];
for (const name of images) {
  if (!/^card_cutin_\d+\.png$/.test(name))
    throw new Error('Invalid public asset name');
}
const expected = new Set(images.map((name) => name.replace('.png', '.webp')));
for (const name of await readdir(dest)) {
  // Remove only our obsolete, generated thumbnails; never unrelated files.
  if (/^card_cutin_\d+\.webp$/.test(name) && !expected.has(name))
    await unlink(path.join(dest, name));
}
let cursor = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < images.length) {
      const name = images[cursor++];
      const webpName = name.replace('.png', '.webp');
      const source = path.join(root, 'assets/cards/thumb', webpName);
      const output = path.join(dest, name.replace('.png', '.webp'));
      const old = await stat(output).catch(() => null);
      if (!old || old.mtimeMs < (await stat(source)).mtimeMs)
        await copyFile(source, output);
      const art = path.join(artDest, name.replace('.png', '.webp'));
      const artSource = path.join(root, 'assets/cards/reveal', webpName);
      const oldArt = await stat(art).catch(() => null);
      if (!oldArt || oldArt.mtimeMs < (await stat(artSource)).mtimeMs)
        await copyFile(artSource, art);
    }
  }),
);
await copyFile(
  path.join(root, 'assets/cards/reveal/card_cutin_100430006.webp'),
  path.join(root, 'public/featured.webp'),
);
console.log(`Prepared ${images.length} public card thumbnails.`);
const ui = JSON.parse(
  await readFile(path.join(root, 'lib/gacha-assets.json'), 'utf8'),
);
const manifestTime = (await stat(path.join(root, 'lib/gacha-assets.json')))
  .mtimeMs;
const gachaDest = path.join(root, 'public/gacha');
await mkdir(gachaDest, { recursive: true });
// Drop webp files left behind after a manifest entry was removed, so the
// build pipeline (and verify-build.mjs) only ever sees the declared set.
const expectedGacha = new Set(Object.keys(ui).map((key) => key + '.webp'));
for (const name of await readdir(gachaDest)) {
  if (name.endsWith('.webp') && !expectedGacha.has(name))
    await unlink(path.join(gachaDest, name));
}
for (const [key, relative] of Object.entries(ui)) {
  if (
    !/^[a-z0-9-]+$/.test(key) ||
    !/^assets\/gacha\/[\w]+\.png$/.test(relative)
  )
    throw new Error('Invalid gacha asset manifest entry');
  const source = path.join(root, relative);
  const output = path.join(root, 'public/gacha', key + '.webp');
  const old = await stat(output).catch(() => null);
  if (
    !old ||
    old.mtimeMs < Math.max(manifestTime, (await stat(source)).mtimeMs)
  )
    await sharp(source).webp({ lossless: true }).toFile(output);
}
console.log(
  `Prepared ${Object.keys(ui).length} original UI textures and ${images.length} reveal illustrations.`,
);
