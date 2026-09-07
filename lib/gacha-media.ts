export const GACHA_MEDIA = {
  poolLoop: 'pool-loop.mp4',
  // Opening cat chase, including its original embedded meow/BGM audio.
  chaseNormal: 'chase-normal.mp4',
  chaseRare: 'chase-rare.mp4',
  chaseFes: 'chase-fes.mp4',
  // 6-segment intro movie chain (see assets/MEDIA.md §1.1). The 6-camera path
  // (cat → park → Tokiwadai → Index → airship → finale) is shared across all
  // three tiers: tracks 003_01 / 004_01 / 006_01 are reused, while 001 / 002 /
  // 005 each pick a tier-specific clip.
  gacha00101: 'gacha_001_01.mp4',
  gacha00102: 'gacha_001_02.mp4',
  gacha00103: 'gacha_001_03.mp4',
  gacha00101Poster: 'gacha_001_01.jpg',
  gacha00102Poster: 'gacha_001_02.jpg',
  gacha00103Poster: 'gacha_001_03.jpg',
  gacha00201: 'gacha_002_01.mp4',
  gacha00202: 'gacha_002_02.mp4',
  gacha00301: 'gacha_003_01.mp4',
  gacha00401: 'gacha_004_01.mp4',
  // gacha_005_01.mp4 captured 2026-09-06 (md5 2ac0559f...; same encode as
  // 005_02/005_03). Closes gap_video_005_01 — see
  // docs/GACHA-ASSETS-INVENTORY.md §1.1 + §7.
  gacha00501: 'gacha_005_01.mp4',
  gacha00502: 'gacha_005_02.mp4',
  gacha00503: 'gacha_005_03.mp4',
  gacha00601: 'gacha_006_01.mp4',
  blackGekota: 'gacha_black_gekota.mp4',
  revealBgm: 'reveal-bgm.m4a',
  standardSfx: 'reveal-standard.m4a',
  mutation: 'mutation.m4a',
  mutationGold: 'mutation-gold.m4a',
  rareImpact: 'rare-impact.m4a',
  introBgm: 'intro-bgm.m4a',

  // ── Original CRI audio captured from a real 10-pull session (v6.4.0).
  //    Source chain: UnityFS bundle -> .sab (TextAsset) -> HCA v2 (cipherType=0) ->
  //    WAV -> imageio-ffmpeg aac 128k. See AUDIO_ANALYSIS.md (in the original
  //    asset inventory) for measured features; semantics are intentionally
  //    NOT pre-assigned here. Listen to each clip via the local listening
  //    tool before binding.
  originalBgm: 'bgm_010050002_m.m4a',
  originalVoiceReiko: 'vc_chara_1420001231130001_m.m4a',
  originalSe0060: 'se_0101200000060_m.m4a',
  originalSe0071: 'se_0100300000071_m.m4a',
  originalSe0101: 'se_0101200000101_m.m4a',
  originalSe0102: 'se_0101200000102_m.m4a',
  originalSe0105: 'se_0101200000105_m.m4a',
  originalSe0130: 'se_0201000000130_m.m4a',
  originalSe0135: 'se_0200200000135_m.m4a',
  originalSe0780: 'se_0300200000780_m.m4a',
} as const;

export const mediaUrl = (key: keyof typeof GACHA_MEDIA) =>
  (import.meta.env?.BASE_URL || './') + 'media/' + GACHA_MEDIA[key];

export type IntroVariant = 'normal' | 'rare' | 'fes';

/** 6-segment transition map. Every variant runs the same 6-camera path through
 *  `gacha_001_XX` → `gacha_002_XX` → `gacha_003_01` → `gacha_004_01` →
 *  `gacha_005_XX` → `gacha_006_01`. Tracks 003_01 / 004_01 / 006_01 are
 *  shared across all tiers; only 001 / 002 / 005 swap per tier (表情 / 场景 /
 *  飞艇角度 respectively). Source of truth: assets/MEDIA.md §1.1.
 */
export const TRANSITION_BY: Readonly<Record<IntroVariant, readonly (keyof typeof GACHA_MEDIA)[]>> = {
  normal: ['gacha00101', 'gacha00201', 'gacha00301', 'gacha00401', 'gacha00501', 'gacha00601'],
  rare:   ['gacha00102', 'gacha00201', 'gacha00301', 'gacha00401', 'gacha00502', 'gacha00601'],
  fes:    ['gacha00103', 'gacha00202', 'gacha00301', 'gacha00401', 'gacha00503', 'gacha00601'],
};

export function introSequence(variant: IntroVariant): string[] {
  const chase = variant === 'fes'
    ? 'chaseFes'
    : variant === 'rare'
      ? 'chaseRare'
      : 'chaseNormal';
  return [chase, ...TRANSITION_BY[variant]];
}

export type PlaybackTarget = {
  muted: boolean;
  volume: number;
  playbackRate: number;
  play: () => Promise<void>;
  pause: () => void;
};

export async function syncPlayback(
  target: PlaybackTarget,
  options: { paused: boolean; muted: boolean; speed: number; volume: number },
): Promise<boolean> {
  target.muted = options.muted;
  target.volume = Math.min(1, Math.max(0, options.volume));
  target.playbackRate = options.speed === 2 ? 2 : 1;
  if (options.paused) {
    target.pause();
    return true;
  }
  try {
    await target.play();
    return true;
  } catch {
    return false;
  } // Autoplay restrictions must not block saved results.
}

let audioCtx: AudioContext | null = null;

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    audioCtx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

type SfxType = 'click' | 'confirm' | 'switch' | 'open' | 'cancel';

const SFX_PROFILES: Record<
  SfxType,
  {
    freq: number;
    dur: number;
    type: OscillatorType;
    vol: number;
    sweep?: number;
  }
> = {
  click: { freq: 880, dur: 0.05, type: 'square', vol: 0.08 },
  confirm: { freq: 660, dur: 0.12, type: 'triangle', vol: 0.1, sweep: 1320 },
  switch: { freq: 520, dur: 0.08, type: 'sine', vol: 0.07, sweep: 780 },
  open: { freq: 440, dur: 0.15, type: 'triangle', vol: 0.09, sweep: 880 },
  cancel: { freq: 300, dur: 0.08, type: 'sine', vol: 0.06, sweep: 200 },
};

// ── Semantic binding (evidence-based, see AUDIO_SEMANTICS.md) ─────────────
//
// Phase attribution (from inotify trace, EXTRACT_REPORT §3):
//   gacha_page    → pool page enter / navigation button SEs (0101/0102/0105)
//   draw_animation → OK confirm (0060), mid-show SEs (0071/0135/0130/0780), BGM
//   reveal        → per-cell voice (voice_chara/1420001231 for 润子)
//
// Feature attribution (AUDIO_ANALYSIS.md):
//   0101: 1.58s, attack 14.5 → sharpest transient (button click)
//   0060: 0.36s, peak -10.3  → shortest, lowest-peak (OK tick)
//   0135: 4.21s, peak -6.2   → heaviest impact (rare reveal impact)
//   0130: 2.19s, centroid 905 → brighter (standard reveal)
//   0071: 4.50s, centroid 492 → long atmospheric (rare prelude, provisional)

const ORIGINAL_SFX: Partial<Record<SfxType, keyof typeof GACHA_MEDIA>> = {
  click: 'originalSe0101',
  switch: 'originalSe0102',
  open: 'originalSe0105',
  confirm: 'originalSe0060',
  // cancel: no captured cancel SE — synthesizer remains the only source.
};
const originalSfxBudget = new Map<string, HTMLAudioElement>();
function tryOriginalSfx(type: SfxType): HTMLAudioElement | null {
  const key = ORIGINAL_SFX[type];
  if (!key) return null;
  if (typeof window === 'undefined') return null;
  let el = originalSfxBudget.get(key as string);
  if (!el) {
    el = ensureOriginalAudio(mediaUrl(key));
    el.volume = 0.82;
    originalSfxBudget.set(key as string, el);
  }
  el.currentTime = 0;
  // Synchronous return; play() resolves in background — autoplay was granted
  // by the page's first click handler so we keep the call.
  void el.play().catch(() => {});
  return el;
}

export function playSfx(type: SfxType = 'click') {
  // Always attempt the original audio first — succeeded call returns the
  // shared <audio> element; failure falls back to the oscillator synth so
  // muted tabs or pre-cache browser blocks still make a click.
  const original = tryOriginalSfx(type);
  if (original) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  const p = SFX_PROFILES[type];
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = p.type;
  osc.frequency.setValueAtTime(p.freq, now);
  if (p.sweep) {
    osc.frequency.exponentialRampToValueAtTime(p.sweep, now + p.dur);
  }
  gain.gain.setValueAtTime(p.vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + p.dur);
}

/** 3★ card-specific reveal voice — only known captured voice is 潤子 (id 209330001).
 *  See AUDIO_SEMANTICS.md for the per-card mapping TODO.
 */
export const ORIGINAL_VOICE_BY_CARD: Readonly<Record<string, keyof typeof GACHA_MEDIA>> = {
  '209330001': 'originalVoiceReiko',
};
export function playRevealVoice(cardId: string): boolean {
  const key = ORIGINAL_VOICE_BY_CARD[cardId];
  if (!key) return false;
  playOriginalSe(key, 0.9);
  return true;
}

// ── Original CRI audio playback ───────────────────────────────────────────
//
// `playOriginalSe` plays any of the keys declared in GACHA_MEDIA that begin with
// `original`. Audio is cached per URL so repeated triggers reuse the same
// <audio> element (currentTime reset, never re-decoded). Autoplay restrictions
// are honored silently: the first play must follow a user gesture, after which
// all calls succeed. Used as a drop-in upgrade for `playSfx` once a semantic
// label is verified through the local listening tool.

const originalAudioCache = new Map<string, HTMLAudioElement>();

function ensureOriginalAudio(url: string): HTMLAudioElement {
  let el = originalAudioCache.get(url);
  if (!el && typeof window !== 'undefined') {
    el = new Audio(url);
    el.preload = 'auto';
    originalAudioCache.set(url, el);
  }
  return el!;
}

export function preloadOriginalAudio(): void {
  for (const key of Object.keys(GACHA_MEDIA) as (keyof typeof GACHA_MEDIA)[]) {
    if (key.startsWith('original')) ensureOriginalAudio(mediaUrl(key));
  }
}

export function playOriginalSe(
  key: keyof typeof GACHA_MEDIA,
  volume = 0.8,
): void {
  if (!key.toString().startsWith('original')) {
    console.warn(`playOriginalSe: ${String(key)} is not an original key`);
    return;
  }
  const url = mediaUrl(key);
  const el = ensureOriginalAudio(url);
  if (!el) return;
  el.volume = Math.min(1, Math.max(0, volume));
  el.currentTime = 0;
  void el.play().catch(() => {});
}
