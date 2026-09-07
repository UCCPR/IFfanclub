// Preview exactly the static artifact, never the repository root.
import { createServer } from 'node:http';
import { lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { byteRange } from './byte-range.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
// Match Vite's default base so `npm run preview` serves the URLs embedded by
// the default production build without requiring an extra environment value.
const base = (process.env.PAGES_BASE_PATH || '/IFfanclub').replace(/\/$/, '');
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.rsc': 'text/x-component',
};
createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    const url = new URL(req.url, 'http://localhost');
    if (base && url.pathname === base) {
      res.writeHead(308, { Location: base + '/' });
      return res.end();
    }
    if (base && !url.pathname.startsWith(base + '/'))
      throw new Error('Not found');
    const relative = decodeURIComponent(
      url.pathname.slice(base.length),
    ).replace(/^\//, '');
    const target = path.resolve(root, relative || 'index.html');
    if (!target.startsWith(path.resolve(root) + path.sep))
      throw new Error('Not found');
    const stats = await lstat(target);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Not found');
    const range = byteRange(req.headers.range, stats.size);
    if (range === false) {
      res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
      return res.end();
    }
    res.writeHead(range ? 206 : 200, {
      'Content-Type': types[path.extname(target)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
      'Content-Length': range ? range.end - range.start + 1 : stats.size,
      ...(range
        ? { 'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}` }
        : {}),
    });
    if (req.method === 'HEAD') return res.end();
    const stream = createReadStream(target, range || undefined);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Static preview: http://127.0.0.1:${port}${base}/`),
);
