import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { GACHA_MEDIA, mediaUrl, syncPlayback } from '../lib/gacha-media.ts';
import { byteRange } from '../scripts/byte-range.mjs';

function fakeMedia(blocked = false) {
  return {
    muted: true,
    volume: 0,
    playbackRate: 1,
    playing: false,
    async play() {
      if (blocked) throw new Error('NotAllowedError');
      this.playing = true;
    },
    pause() {
      this.playing = false;
    },
  };
}
test('playback follows mute, volume and double speed without touching game state', async () => {
  const target = fakeMedia();
  assert.equal(
    await syncPlayback(target, {
      paused: false,
      muted: true,
      speed: 2,
      volume: 0.8,
    }),
    true,
  );
  assert.equal(target.playing, true);
  assert.equal(target.muted, true);
  assert.equal(target.playbackRate, 2);
  assert.equal(target.volume, 0.8);
  await syncPlayback(target, {
    paused: true,
    muted: false,
    speed: 1,
    volume: 0.32,
  });
  assert.equal(target.playing, false);
});
test('autoplay rejection is a recoverable result, not an uncaught promise', async () => {
  assert.equal(
    await syncPlayback(fakeMedia(true), {
      paused: false,
      muted: false,
      speed: 1,
      volume: 0.4,
    }),
    false,
  );
});
test('paused/background audio does not attempt autoplay and playback values are bounded', async () => {
  const target = fakeMedia(true);
  assert.equal(
    await syncPlayback(target, {
      paused: true,
      muted: true,
      speed: 99,
      volume: 9,
    }),
    true,
  );
  assert.equal(target.volume, 1);
  assert.equal(target.playbackRate, 1);
});
test('media whitelist is portable, complete, browser-container based and small', async () => {
  const root = new URL('../public/media/', import.meta.url);
  assert.deepEqual(
    (await readdir(root)).sort(),
    Object.values(GACHA_MEDIA).sort(),
  );
  let total = 0;
  for (const [key, filename] of Object.entries(GACHA_MEDIA)) {
    assert.equal(mediaUrl(key), './media/' + filename);
    const bytes = await readFile(new URL(filename, root));
    // mp4 / m4a (ISO BMFF) have 'ftyp' at bytes 4-8. JPEG poster images
    // (gacha_001_01.jpg etc.) have the JFIF SOI marker (0xFFD8) at bytes 0-1.
    // Use 'latin1' (8-bit) — 'ascii' would truncate 0xFF to 0x7F.
    if (filename.endsWith('.mp4') || filename.endsWith('.m4a')) {
      assert.equal(bytes.toString('latin1', 4, 8), 'ftyp');
    } else if (filename.endsWith('.jpg')) {
      assert.equal(bytes.toString('latin1', 0, 2), '\xff\xd8');
    }
    total += bytes.length;
  }
  // Budget: original CRI video (chase-*, gacha_*) plus m4a audio keeps the
  // whole media folder under 48MB — still small enough for GitHub Pages.
  assert.ok(total < 48 * 1024 * 1024, `media total ${total} bytes exceeds 48MB`);
});
test('byte ranges support full, open-ended, clipped and suffix media requests', () => {
  assert.equal(byteRange(undefined, 100), null);
  assert.deepEqual(byteRange('bytes=0-1', 100), { start: 0, end: 1 });
  assert.deepEqual(byteRange('bytes=20-', 100), { start: 20, end: 99 });
  assert.deepEqual(byteRange('bytes=90-500', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=-500', 100), { start: 0, end: 99 });
});
test('invalid, unsatisfiable and multipart byte ranges fail explicitly', () => {
  for (const header of [
    'bytes=100-',
    'bytes=50-10',
    'bytes=-0',
    'bytes=-',
    'bytes=0-1,3-4',
    'items=0-1',
    'bytes=9007199254740999-',
  ])
    assert.equal(byteRange(header, 100), false, header);
  assert.equal(byteRange('bytes=0-', 0), false);
});
